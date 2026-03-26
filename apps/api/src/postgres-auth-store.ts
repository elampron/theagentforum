import { randomBytes } from "node:crypto";
import type {
  CompleteRegistrationVerificationInput,
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
    completeRegistrationVerification,
    redeemPairing,
  };
}

async function startRegistration(input: StartRegistrationInput): Promise<RegistrationSession> {
  const registrationSession = await queryJson<RegistrationSession>(
    `
      with created_registration as (
        insert into auth_registration_sessions (handle, display_name, challenge)
        values (:'handle', nullif(:'display_name', ''), :'challenge')
        returning *
      ),
      created_pairing as (
        insert into auth_pairing_sessions (registration_session_id, pairing_code)
        select id, :'pairing_code'
        from created_registration
        returning *
      )
      select json_build_object(
        'id', created_registration.id,
        'handle', created_registration.handle,
        'displayName', created_registration.display_name,
        'status', created_registration.status,
        'challenge', created_registration.challenge,
        'verificationMethod', created_registration.verification_method,
        'passkeyLabel', created_registration.passkey_label,
        'createdAt', to_char(created_registration.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', to_char(created_registration.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'verifiedAt', case
          when created_registration.verified_at is null then null
          else to_char(created_registration.verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end,
        'pairing', json_strip_nulls(json_build_object(
          'id', created_pairing.id,
          'code', created_pairing.pairing_code,
          'status', created_pairing.status,
          'deviceLabel', created_pairing.device_label,
          'createdAt', to_char(created_pairing.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'expiresAt', to_char(created_pairing.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'redeemedAt', case
            when created_pairing.redeemed_at is null then null
            else to_char(created_pairing.redeemed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          end
        ))
      ) :: text
      from created_registration
      join created_pairing
        on created_pairing.registration_session_id = created_registration.id;
    `,
    {
      handle: input.handle,
      display_name: input.displayName ?? "",
      challenge: createChallenge(),
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

  if (!output) {
    return null;
  }

  return JSON.parse(output) as RegistrationSession;
}

async function completeRegistrationVerification(
  registrationSessionId: string,
  input: CompleteRegistrationVerificationInput,
): Promise<RegistrationSession | null> {
  await expireRegistrationSession(registrationSessionId);

  const registrationExists = await runSql(
    `
      select id
      from auth_registration_sessions
      where id = :'registration_session_id';
    `,
    { registration_session_id: registrationSessionId },
  );

  if (!registrationExists) {
    return null;
  }

  await runSql(
    `
      update auth_registration_sessions
      set
        status = case
          when expires_at <= now() then 'expired'
          else 'verified'
        end,
        verification_method = case
          when expires_at <= now() then verification_method
          else 'webauthn_todo'
        end,
        passkey_label = case
          when expires_at <= now() then passkey_label
          else :'passkey_label'
        end,
        verified_at = case
          when expires_at <= now() then verified_at
          else now()
        end,
        updated_at = now()
      where id = :'registration_session_id';

      update auth_pairing_sessions
      set
        status = case
          when status = 'paired' then status
          when expires_at <= now() then 'expired'
          when exists (
            select 1
            from auth_registration_sessions
            where id = :'registration_session_id'
              and status = 'verified'
          ) then 'ready_to_pair'
          else status
        end,
        updated_at = now()
      where registration_session_id = :'registration_session_id';
    `,
    {
      registration_session_id: registrationSessionId,
      passkey_label: input.passkeyLabel,
    },
  );

  const output = await selectRegistrationSession(registrationSessionId);
  return output ? (JSON.parse(output) as RegistrationSession) : null;
}

async function redeemPairing(input: RedeemPairingInput): Promise<RegistrationSession | null> {
  await expireRegistrationByPairingCode(input.pairingCode);

  const registrationSessionId = await runSql(
    `
      select registration_session_id
      from auth_pairing_sessions
      where pairing_code = :'pairing_code';
    `,
    { pairing_code: input.pairingCode },
  );

  if (!registrationSessionId) {
    return null;
  }

  await runSql(
    `
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
        redeemed_at = case
          when status = 'ready_to_pair' and expires_at > now() then now()
          else redeemed_at
        end,
        updated_at = now()
      where pairing_code = :'pairing_code';
    `,
    {
      pairing_code: input.pairingCode,
      device_label: input.deviceLabel,
    },
  );

  const output = await selectRegistrationSession(registrationSessionId);
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

      update auth_registration_sessions
      set
        status = 'expired',
        updated_at = now()
      where id in (
        select registration_session_id
        from auth_pairing_sessions
        where pairing_code = :'pairing_code'
      )
        and status <> 'verified'
        and expires_at <= now();
    `,
    { pairing_code: pairingCode },
  );
}

async function selectRegistrationSession(registrationSessionId: string): Promise<string> {
  return runSql(
    `
      select json_strip_nulls(json_build_object(
        'id', r.id,
        'handle', r.handle,
        'displayName', r.display_name,
        'status', r.status,
        'challenge', r.challenge,
        'verificationMethod', r.verification_method,
        'passkeyLabel', r.passkey_label,
        'createdAt', to_char(r.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', to_char(r.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'verifiedAt', case
          when r.verified_at is null then null
          else to_char(r.verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end,
        'pairing', json_strip_nulls(json_build_object(
          'id', p.id,
          'code', p.pairing_code,
          'status', p.status,
          'deviceLabel', p.device_label,
          'createdAt', to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'expiresAt', to_char(p.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'redeemedAt', case
            when p.redeemed_at is null then null
            else to_char(p.redeemed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          end
        ))
      )) :: text
      from auth_registration_sessions r
      join auth_pairing_sessions p
        on p.registration_session_id = r.id
      where r.id = :'registration_session_id';
    `,
    { registration_session_id: registrationSessionId },
  );
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
