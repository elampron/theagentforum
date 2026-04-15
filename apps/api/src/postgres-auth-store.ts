import { randomBytes } from "node:crypto";
import type {
  CompleteRegistrationVerificationInput,
  FinishRegistrationInput,
  PasskeyRegistrationOptions,
  RedeemPairingInput,
  RegistrationSession,
  StartRegistrationInput,
} from "@theagentforum/core";
import { runSql } from "./postgres";
import type { AuthStore } from "./auth-store";

export function createPostgresAuthStore(): AuthStore {
  return {
    startRegistration,
    getRegistrationSession,
    getPasskeyRegistrationOptions,
    finishPasskeyRegistration,
    completeRegistrationVerification,
    redeemPairing,
  };
}

async function startRegistration(input: StartRegistrationInput): Promise<RegistrationSession> {
  const registrationSession = await queryJson<RegistrationSession>(
    `
      with ensured_account as (
        insert into auth_accounts (handle, display_name)
        values (:'handle', nullif(:'display_name', ''))
        on conflict (handle)
        do update set
          display_name = coalesce(nullif(excluded.display_name, ''), auth_accounts.display_name),
          updated_at = now()
        returning id, handle, display_name
      ),
      created_registration as (
        insert into auth_registration_sessions (
          account_id,
          handle,
          display_name,
          challenge,
          verification_url
        )
        select
          ensured_account.id,
          ensured_account.handle,
          ensured_account.display_name,
          :'challenge',
          :'verification_url'
        from ensured_account
        returning *
      ),
      created_pairing as (
        insert into auth_pairing_sessions (registration_session_id, pairing_code)
        select id, :'pairing_code'
        from created_registration
        returning *
      )
      select ${registrationSessionSelect("created_registration", "created_pairing")} :: text
      from created_registration
      join created_pairing
        on created_pairing.registration_session_id = created_registration.id;
    `,
    {
      handle: input.handle,
      display_name: input.displayName ?? "",
      challenge: createChallenge(),
      verification_url: `/auth?registration=${randomBytes(6).toString("hex")}`,
      pairing_code: createPairingCode(),
    },
  );

  return registrationSession;
}

async function getRegistrationSession(
  registrationSessionId: string,
): Promise<RegistrationSession | null> {
  await expireRegistrationSession(registrationSessionId);
  const output = await selectRegistrationSession(registrationSessionId);
  return output ? (JSON.parse(output) as RegistrationSession) : null;
}

async function getPasskeyRegistrationOptions(
  registrationSessionId: string,
): Promise<PasskeyRegistrationOptions | null> {
  await expireRegistrationSession(registrationSessionId);

  const output = await runSql(
    `
      update auth_registration_sessions
      set
        status = case
          when status = 'verified' then status
          when expires_at <= now() then 'expired'
          else 'pending_webauthn_registration'
        end,
        updated_at = now()
      where id = :'registration_session_id'
      returning json_build_object(
        'registrationSessionId', id,
        'rp', json_build_object(
          'id', 'theagentforum.local',
          'name', 'TheAgentForum'
        ),
        'user', json_build_object(
          'id', id,
          'name', handle,
          'displayName', coalesce(display_name, handle)
        ),
        'challenge', challenge,
        'pubKeyCredParams', json_build_array(
          json_build_object('type', 'public-key', 'alg', -7),
          json_build_object('type', 'public-key', 'alg', -257)
        ),
        'timeout', 60000,
        'attestation', 'none',
        'authenticatorSelection', json_build_object(
          'residentKey', 'preferred',
          'userVerification', 'preferred'
        )
      ) :: text;
    `,
    { registration_session_id: registrationSessionId },
  );

  if (!output) {
    return null;
  }

  return JSON.parse(output) as PasskeyRegistrationOptions;
}

async function finishPasskeyRegistration(
  input: FinishRegistrationInput,
): Promise<RegistrationSession | null> {
  await expireRegistrationSession(input.registrationSessionId);

  const output = await runSql(
    `
      with updated_registration as (
        update auth_registration_sessions
        set
          status = case
            when expires_at <= now() then 'expired'
            else 'verified'
          end,
          verification_method = case
            when expires_at <= now() then verification_method
            else 'webauthn_simulated'
          end,
          passkey_label = case
            when expires_at <= now() then passkey_label
            else nullif(:'passkey_label', '')
          end,
          verified_at = case
            when expires_at <= now() then verified_at
            else now()
          end,
          updated_at = now()
        where id = :'registration_session_id'
        returning *
      ),
      created_credential as (
        insert into auth_passkey_credentials (
          account_id,
          registration_session_id,
          label,
          credential_id,
          public_key,
          transports
        )
        select
          updated_registration.account_id,
          updated_registration.id,
          nullif(:'passkey_label', ''),
          :'credential_id',
          :'public_key',
          cast(:'transports' as jsonb)
        from updated_registration
        where updated_registration.status = 'verified'
        on conflict (credential_id)
        do update set
          label = excluded.label,
          public_key = excluded.public_key,
          last_used_at = now()
        returning id
      ),
      updated_pairing as (
        update auth_pairing_sessions
        set
          status = case
            when status = 'paired' then status
            when expires_at <= now() then 'expired'
            when exists (select 1 from updated_registration where status = 'verified') then 'ready_to_pair'
            else status
          end,
          updated_at = now()
        where registration_session_id = :'registration_session_id'
        returning *
      )
      select ${registrationSessionSelect("updated_registration", "updated_pairing")} :: text
      from updated_registration
      join updated_pairing on updated_pairing.registration_session_id = updated_registration.id;
    `,
    {
      registration_session_id: input.registrationSessionId,
      passkey_label: input.passkeyLabel ?? "",
      credential_id: readCredentialId(input.attestationResponse),
      public_key: input.clientDataJson,
      transports: JSON.stringify(["internal", "hybrid"]),
    },
  );

  return output ? (JSON.parse(output) as RegistrationSession) : null;
}

async function completeRegistrationVerification(
  registrationSessionId: string,
  input: CompleteRegistrationVerificationInput,
): Promise<RegistrationSession | null> {
  return finishPasskeyRegistration({
    registrationSessionId,
    attestationResponse: `manual-${registrationSessionId}`,
    clientDataJson: JSON.stringify({ source: "manual" }),
    passkeyLabel: input.passkeyLabel,
  });
}

async function redeemPairing(input: RedeemPairingInput): Promise<RegistrationSession | null> {
  await expireRegistrationByPairingCode(input.pairingCode);

  const output = await runSql(
    `
      with updated_pairing as (
        update auth_pairing_sessions
        set
          status = case
            when status = 'paired' then status
            when status = 'ready_to_pair' and expires_at > now() then 'paired'
            when expires_at <= now() then 'expired'
            else status
          end,
          device_label = case
            when status = 'ready_to_pair' and expires_at > now() then :'device_label'
            else device_label
          end,
          token = case
            when status = 'ready_to_pair' and expires_at > now() then :'token'
            else token
          end,
          redeemed_at = case
            when status = 'ready_to_pair' and expires_at > now() then now()
            else redeemed_at
          end,
          updated_at = now()
        where pairing_code = :'pairing_code'
        returning *
      ),
      selected_registration as (
        select r.*
        from auth_registration_sessions r
        join updated_pairing p on p.registration_session_id = r.id
      )
      select ${registrationSessionSelect("selected_registration", "updated_pairing")} :: text
      from selected_registration
      join updated_pairing on updated_pairing.registration_session_id = selected_registration.id;
    `,
    {
      pairing_code: input.pairingCode,
      device_label: input.deviceLabel,
      token: createToken(),
    },
  );

  return output ? (JSON.parse(output) as RegistrationSession) : null;
}

async function expireRegistrationSession(registrationSessionId: string): Promise<void> {
  await runSql(
    `
      update auth_registration_sessions
      set
        status = 'expired',
        updated_at = now()
      where id = :'registration_session_id'
        and status <> 'verified'
        and expires_at <= now();

      update auth_pairing_sessions
      set
        status = 'expired',
        updated_at = now()
      where registration_session_id = :'registration_session_id'
        and status <> 'paired'
        and expires_at <= now();
    `,
    { registration_session_id: registrationSessionId },
  );
}

async function expireRegistrationByPairingCode(pairingCode: string): Promise<void> {
  await runSql(
    `
      update auth_pairing_sessions
      set
        status = 'expired',
        updated_at = now()
      where pairing_code = :'pairing_code'
        and status <> 'paired'
        and expires_at <= now();
    `,
    { pairing_code: pairingCode },
  );
}

async function selectRegistrationSession(registrationSessionId: string): Promise<string> {
  return runSql(
    `
      select ${registrationSessionSelect("r", "p")} :: text
      from auth_registration_sessions r
      join auth_pairing_sessions p
        on p.registration_session_id = r.id
      where r.id = :'registration_session_id';
    `,
    { registration_session_id: registrationSessionId },
  );
}

function registrationSessionSelect(
  registrationAlias: string,
  pairingAlias: string,
): string {
  return `json_build_object(
    'id', ${registrationAlias}.id,
    'handle', ${registrationAlias}.handle,
    'displayName', ${registrationAlias}.display_name,
    'status', ${registrationAlias}.status,
    'challenge', ${registrationAlias}.challenge,
    'verificationMethod', ${registrationAlias}.verification_method,
    'passkeyLabel', ${registrationAlias}.passkey_label,
    'verificationUrl', ${registrationAlias}.verification_url,
    'createdAt', to_char(${registrationAlias}.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(${registrationAlias}.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'verifiedAt', case
      when ${registrationAlias}.verified_at is null then null
      else to_char(${registrationAlias}.verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    end,
    'pairing', json_strip_nulls(json_build_object(
      'id', ${pairingAlias}.id,
      'code', ${pairingAlias}.pairing_code,
      'token', ${pairingAlias}.token,
      'status', ${pairingAlias}.status,
      'deviceLabel', ${pairingAlias}.device_label,
      'createdAt', to_char(${pairingAlias}.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'expiresAt', to_char(${pairingAlias}.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'redeemedAt', case
        when ${pairingAlias}.redeemed_at is null then null
        else to_char(${pairingAlias}.redeemed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      end
    ))
  )`;
}

async function queryJson<T>(sql: string, variables?: Record<string, string>): Promise<T> {
  const output = await runSql(sql, variables);
  return JSON.parse(output) as T;
}

function createChallenge(): string {
  return randomBytes(18).toString("base64url");
}

function createPairingCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

function createToken(): string {
  return `taf_${randomBytes(18).toString("base64url")}`;
}

function readCredentialId(attestationResponse: string): string {
  return attestationResponse.trim() || `cred_${randomBytes(8).toString("hex")}`;
}
