import { randomBytes } from "node:crypto";
import type {
  AccountProfile,
  AuthenticationSession,
  AuthDevice,
  AuthPasskey,
  CompleteRegistrationVerificationInput,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationOptions,
  PublicProfile,
  RedeemPairingInput,
  RegistrationSession,
  StartAuthenticationInput,
  StartRegistrationInput,
  UpdateAccountProfileInput,
  WebSession,
} from "@theagentforum/core";
import { runSql } from "./postgres";
import type {
  AuthStore,
  ApiTokenSession,
  IssuedWebSession,
  RemovePasskeyResult,
  RevokeDeviceResult,
  StoredPasskeyCredential,
  VerifiedPasskeyAuthentication,
  VerifiedPasskeyRegistration,
} from "./auth-store";

export function createPostgresAuthStore(): AuthStore {
  return {
    startRegistration,
    getRegistrationSession,
    getRegistrationSessionByVerificationToken,
    getPasskeyRegistrationOptions,
    finishPasskeyRegistration,
    completeRegistrationVerification,
    redeemPairing,
    startAuthentication,
    getAuthenticationSession,
    getPasskeyAuthenticationOptions,
    getPasskeyCredential,
    finishPasskeyAuthentication,
    createWebSession,
    getWebSession,
    revokeWebSession,
    getApiTokenSession,
    revokeApiToken,
    getAccountProfile,
    updateAccountProfile,
    getPublicProfileByHandle,
    listAccountPasskeys,
    removeAccountPasskey,
    listAccountDevices,
    revokeAccountDevice,
  };
}

async function startRegistration(input: StartRegistrationInput): Promise<RegistrationSession> {
  const verificationToken = randomBytes(6).toString("hex");
  const registrationSession = await queryJson<RegistrationSession>(
    `
      with ensured_account as (
        insert into auth_accounts (handle, display_name)
        values (:'handle', nullif(:'display_name', ''))
        on conflict (handle)
        do update set
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
      verification_url: `/auth?registration=${verificationToken}`,
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

async function getRegistrationSessionByVerificationToken(
  verificationToken: string,
): Promise<RegistrationSession | null> {
  await expireRegistrationSessionByVerificationToken(verificationToken);

  const output = await runSql(
    `
      select ${registrationSessionSelect("r", "p", ":'verification_token'")} :: text
      from auth_registration_sessions r
      join auth_pairing_sessions p
        on p.registration_session_id = r.id
      where r.verification_url = concat('/auth?registration=', :'verification_token');
    `,
    { verification_token: verificationToken },
  );

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
  input: VerifiedPasskeyRegistration,
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
            else :'verification_method'
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
      verification_method: input.verificationMethod,
      credential_id: input.credentialId,
      public_key: input.publicKey,
      transports: JSON.stringify(input.transports ?? []),
    },
  );

  return output ? (JSON.parse(output) as RegistrationSession) : null;
}

async function completeRegistrationVerification(
  registrationSessionId: string,
  input: CompleteRegistrationVerificationInput,
): Promise<RegistrationSession | null> {
  await expireRegistrationSession(registrationSessionId);

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
            else 'manual_internal'
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
        where id = :'registration_session_id'
        returning *
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
      registration_session_id: registrationSessionId,
      passkey_label: input.passkeyLabel,
    },
  );

  return output ? (JSON.parse(output) as RegistrationSession) : null;
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

async function startAuthentication(
  input: StartAuthenticationInput,
): Promise<AuthenticationSession | null> {
  const output = await runSql(
    `
      with matched_account as (
        select a.id, a.handle, a.display_name
        from auth_accounts a
        where a.handle = :'handle'
          and exists (
            select 1
            from auth_passkey_credentials c
            where c.account_id = a.id
              and c.credential_id not like 'manual-%'
          )
      ),
      created_authentication as (
        insert into auth_authentication_sessions (
          account_id,
          handle,
          display_name,
          challenge
        )
        select
          matched_account.id,
          matched_account.handle,
          matched_account.display_name,
          :'challenge'
        from matched_account
        returning *
      )
      select ${authenticationSessionSelect("created_authentication")} :: text
      from created_authentication;
    `,
    {
      handle: input.handle,
      challenge: createChallenge(),
    },
  );

  return output ? (JSON.parse(output) as AuthenticationSession) : null;
}

async function getAuthenticationSession(
  authenticationSessionId: string,
): Promise<AuthenticationSession | null> {
  await expireAuthenticationSession(authenticationSessionId);
  const output = await selectAuthenticationSession(authenticationSessionId);
  return output ? (JSON.parse(output) as AuthenticationSession) : null;
}

async function getPasskeyAuthenticationOptions(
  authenticationSessionId: string,
): Promise<PasskeyAuthenticationOptions | null> {
  await expireAuthenticationSession(authenticationSessionId);

  const output = await runSql(
    `
      with updated_authentication as (
        update auth_authentication_sessions
        set
          status = case
            when status = 'verified' then status
            when expires_at <= now() then 'expired'
            else 'pending_webauthn_authentication'
          end,
          updated_at = now()
        where id = :'authentication_session_id'
        returning *
      )
      select json_build_object(
        'authenticationSessionId', updated_authentication.id,
        'challenge', updated_authentication.challenge,
        'rpId', 'theagentforum.local',
        'allowCredentials', coalesce(
          json_agg(
            json_strip_nulls(json_build_object(
              'id', c.credential_id,
              'type', 'public-key',
              'transports', c.transports
            ))
          ) filter (where c.id is not null),
          '[]'::json
        ),
        'timeout', 60000,
        'userVerification', 'required'
      ) :: text
      from updated_authentication
      left join auth_passkey_credentials c
        on c.account_id = updated_authentication.account_id
       and c.credential_id not like 'manual-%'
      where updated_authentication.status <> 'expired'
      group by updated_authentication.id, updated_authentication.challenge;
    `,
    {
      authentication_session_id: authenticationSessionId,
    },
  );

  return output ? (JSON.parse(output) as PasskeyAuthenticationOptions) : null;
}

async function getPasskeyCredential(
  credentialId: string,
): Promise<StoredPasskeyCredential | null> {
  const output = await runSql(
    `
      select json_build_object(
        'handle', a.handle,
        'credentialId', c.credential_id,
        'publicKey', c.public_key,
        'signCount', c.sign_count,
        'label', c.label,
        'transports', c.transports
      ) :: text
      from auth_passkey_credentials c
      join auth_accounts a on a.id = c.account_id
      where c.credential_id = :'credential_id'
        and c.credential_id not like 'manual-%';
    `,
    {
      credential_id: credentialId,
    },
  );

  return output ? (JSON.parse(output) as StoredPasskeyCredential) : null;
}

async function finishPasskeyAuthentication(
  input: VerifiedPasskeyAuthentication,
): Promise<AuthenticationSession | null> {
  await expireAuthenticationSession(input.authenticationSessionId);

  const output = await runSql(
    `
      with updated_credential as (
        update auth_passkey_credentials
        set
          sign_count = greatest(sign_count, :'sign_count'::bigint),
          last_used_at = now()
        where credential_id = :'credential_id'
        returning id
      ),
      updated_authentication as (
        update auth_authentication_sessions
        set
          status = case
            when expires_at <= now() then 'expired'
            else 'verified'
          end,
          verification_method = case
            when expires_at <= now() then verification_method
            else :'verification_method'
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
        where id = :'authentication_session_id'
        returning *
      )
      select ${authenticationSessionSelect("updated_authentication")} :: text
      from updated_authentication
      where exists (select 1 from updated_credential);
    `,
    {
      authentication_session_id: input.authenticationSessionId,
      credential_id: input.credentialId,
      sign_count: String(input.signCount),
      verification_method: input.verificationMethod,
      passkey_label: input.passkeyLabel ?? "",
    },
  );

  return output ? (JSON.parse(output) as AuthenticationSession) : null;
}

async function createWebSession(authenticationSessionId: string): Promise<IssuedWebSession | null> {
  await expireAuthenticationSession(authenticationSessionId);

  const output = await runSql(
    `
      with created_web_session as (
        insert into auth_web_sessions (account_id, authentication_session_id, token)
        select a.account_id, a.id, :'token'
        from auth_authentication_sessions a
        where a.id = :'authentication_session_id'
          and a.status = 'verified'
          and a.expires_at > now()
        returning *
      )
      select ${issuedWebSessionSelect("created_web_session", "acct")} :: text
      from created_web_session
      join auth_accounts acct on acct.id = created_web_session.account_id;
    `,
    {
      authentication_session_id: authenticationSessionId,
      token: createWebSessionToken(),
    },
  );

  return output ? (JSON.parse(output) as IssuedWebSession) : null;
}

async function getWebSession(token: string): Promise<WebSession | null> {
  const output = await runSql(
    `
      select ${webSessionSelect("ws", "acct")} :: text
      from auth_web_sessions ws
      join auth_accounts acct on acct.id = ws.account_id
      where ws.token = :'token'
        and ws.revoked_at is null
        and ws.expires_at > now();
    `,
    { token },
  );

  return output ? (JSON.parse(output) as WebSession) : null;
}

async function revokeWebSession(token: string): Promise<void> {
  await runSql(
    `
      update auth_web_sessions
      set revoked_at = coalesce(revoked_at, now())
      where token = :'token';
    `,
    { token },
  );
}

async function getApiTokenSession(token: string): Promise<ApiTokenSession | null> {
  await expireApiTokenSession(token);

  const output = await runSql(
    `
      select ${apiTokenSessionSelect("p", "acct")} :: text
      from auth_pairing_sessions p
      join auth_registration_sessions r on r.id = p.registration_session_id
      join auth_accounts acct on acct.id = r.account_id
      where p.token = :'token'
        and p.status = 'paired'
        and p.expires_at > now();
    `,
    { token },
  );

  return output ? (JSON.parse(output) as ApiTokenSession) : null;
}

async function revokeApiToken(token: string): Promise<void> {
  await runSql(
    `
      update auth_pairing_sessions
      set
        token = null,
        status = case when status = 'paired' then 'expired' else status end,
        updated_at = now()
      where token = :'token';
    `,
    { token },
  );
}

async function getAccountProfile(accountId: string): Promise<AccountProfile | null> {
  const output = await runSql(
    `
      select json_strip_nulls(json_build_object(
        'id', id,
        'handle', handle,
        'displayName', display_name,
        'bio', bio,
        'avatarUrl', avatar_url,
        'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )) :: text
      from auth_accounts
      where id = :'account_id';
    `,
    { account_id: accountId },
  );

  return output ? (JSON.parse(output) as AccountProfile) : null;
}

async function updateAccountProfile(
  accountId: string,
  input: UpdateAccountProfileInput,
): Promise<AccountProfile | null> {
  const output = await runSql(
    `
      update auth_accounts
      set
        display_name = nullif(:'display_name', ''),
        bio = nullif(:'bio', ''),
        avatar_url = nullif(:'avatar_url', ''),
        updated_at = now()
      where id = :'account_id'
      returning json_strip_nulls(json_build_object(
        'id', id,
        'handle', handle,
        'displayName', display_name,
        'bio', bio,
        'avatarUrl', avatar_url,
        'createdAt', to_char(created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(updated_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )) :: text;
    `,
    {
      account_id: accountId,
      display_name: input.displayName ?? "",
      bio: input.bio ?? "",
      avatar_url: input.avatarUrl ?? "",
    },
  );

  return output ? (JSON.parse(output) as AccountProfile) : null;
}

async function getPublicProfileByHandle(handle: string): Promise<PublicProfile | null> {
  const output = await runSql(
    `
      select json_strip_nulls(json_build_object(
        'handle', handle,
        'displayName', display_name,
        'bio', bio,
        'avatarUrl', avatar_url
      )) :: text
      from auth_accounts
      where handle = :'handle';
    `,
    { handle },
  );

  return output ? (JSON.parse(output) as PublicProfile) : null;
}

async function listAccountPasskeys(accountId: string): Promise<AuthPasskey[]> {
  return queryJson<AuthPasskey[]>(
    `
      select coalesce(json_agg(json_strip_nulls(json_build_object(
        'credentialId', c.credential_id,
        'label', c.label,
        'createdAt', to_char(c.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'lastUsedAt', case
          when c.last_used_at is null then null
          else to_char(c.last_used_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end,
        'transports', c.transports
      )) order by c.created_at asc), '[]'::json) :: text
      from auth_passkey_credentials c
      where c.account_id = :'account_id'
        and c.credential_id not like 'manual-%';
    `,
    { account_id: accountId },
  );
}

async function removeAccountPasskey(
  accountId: string,
  credentialId: string,
): Promise<RemovePasskeyResult> {
  const output = await runSql(
    `
      with matched_credential as (
        select c.id
        from auth_passkey_credentials c
        where c.account_id = :'account_id'
          and c.credential_id = :'credential_id'
          and c.credential_id not like 'manual-%'
      ),
      credential_count as (
        select count(*)::int as total
        from auth_passkey_credentials c
        where c.account_id = :'account_id'
          and c.credential_id not like 'manual-%'
      ),
      deleted as (
        delete from auth_passkey_credentials c
        where c.account_id = :'account_id'
          and c.credential_id = :'credential_id'
          and c.credential_id not like 'manual-%'
          and (select total from credential_count) > 1
        returning c.id
      )
      select case
        when exists (select 1 from deleted) then 'removed'
        when not exists (select 1 from matched_credential) then 'not_found'
        else 'last_passkey'
      end :: text;
    `,
    {
      account_id: accountId,
      credential_id: credentialId,
    },
  );

  return (output as RemovePasskeyResult | null) ?? "not_found";
}

async function listAccountDevices(accountId: string): Promise<AuthDevice[]> {
  return queryJson<AuthDevice[]>(
    `
      select coalesce(json_agg(json_strip_nulls(json_build_object(
        'id', p.id,
        'deviceLabel', p.device_label,
        'status', p.status,
        'createdAt', to_char(p.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'expiresAt', to_char(p.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'redeemedAt', case
          when p.redeemed_at is null then null
          else to_char(p.redeemed_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end
      )) order by p.created_at desc), '[]'::json) :: text
      from auth_pairing_sessions p
      join auth_registration_sessions r on r.id = p.registration_session_id
      where r.account_id = :'account_id'
        and p.device_label is not null;
    `,
    { account_id: accountId },
  );
}

async function revokeAccountDevice(
  accountId: string,
  deviceId: string,
): Promise<RevokeDeviceResult> {
  const output = await runSql(
    `
      with updated_pairing as (
        update auth_pairing_sessions p
        set
          token = null,
          status = 'expired'
        where p.id = :'device_id'
          and exists (
            select 1
            from auth_registration_sessions r
            where r.id = p.registration_session_id
              and r.account_id = :'account_id'
          )
          and p.device_label is not null
        returning p.id
      )
      select case
        when exists (select 1 from updated_pairing) then 'revoked'
        else 'not_found'
      end :: text;
    `,
    {
      account_id: accountId,
      device_id: deviceId,
    },
  );

  return (output as RevokeDeviceResult | null) ?? "not_found";
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

async function expireApiTokenSession(token: string): Promise<void> {
  await runSql(
    `
      update auth_pairing_sessions
      set
        status = 'expired',
        token = null,
        updated_at = now()
      where token = :'token'
        and status = 'paired'
        and expires_at <= now();
    `,
    { token },
  );
}

async function expireRegistrationSessionByVerificationToken(
  verificationToken: string,
): Promise<void> {
  await runSql(
    `
      update auth_registration_sessions
      set
        status = 'expired',
        updated_at = now()
      where verification_url = concat('/auth?registration=', :'verification_token')
        and status <> 'verified'
        and expires_at <= now();
    `,
    { verification_token: verificationToken },
  );
}

async function expireAuthenticationSession(authenticationSessionId: string): Promise<void> {
  await runSql(
    `
      update auth_authentication_sessions
      set
        status = 'expired',
        updated_at = now()
      where id = :'authentication_session_id'
        and status <> 'verified'
        and expires_at <= now();
    `,
    { authentication_session_id: authenticationSessionId },
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

async function selectAuthenticationSession(authenticationSessionId: string): Promise<string> {
  return runSql(
    `
      select ${authenticationSessionSelect("a")} :: text
      from auth_authentication_sessions a
      where a.id = :'authentication_session_id';
    `,
    { authentication_session_id: authenticationSessionId },
  );
}

function registrationSessionSelect(
  registrationAlias: string,
  pairingAlias: string,
  verificationTokenExpression = `regexp_replace(${registrationAlias}.verification_url, '^/auth\\?registration=', '')`,
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
    'verificationToken', ${verificationTokenExpression},
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

function authenticationSessionSelect(authenticationAlias: string): string {
  return `json_build_object(
    'id', ${authenticationAlias}.id,
    'handle', ${authenticationAlias}.handle,
    'displayName', ${authenticationAlias}.display_name,
    'status', ${authenticationAlias}.status,
    'challenge', ${authenticationAlias}.challenge,
    'verificationMethod', ${authenticationAlias}.verification_method,
    'passkeyLabel', ${authenticationAlias}.passkey_label,
    'createdAt', to_char(${authenticationAlias}.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(${authenticationAlias}.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'verifiedAt', case
      when ${authenticationAlias}.verified_at is null then null
      else to_char(${authenticationAlias}.verified_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    end
  )`;
}

function webSessionSelect(webSessionAlias: string, accountAlias: string): string {
  return `json_build_object(
    'actor', json_strip_nulls(json_build_object(
      'id', ${accountAlias}.id,
      'kind', 'human',
      'handle', ${accountAlias}.handle,
      'displayName', ${accountAlias}.display_name
    )),
    'createdAt', to_char(${webSessionAlias}.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(${webSessionAlias}.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )`;
}

function apiTokenSessionSelect(pairingAlias: string, accountAlias: string): string {
  return `json_build_object(
    'actor', json_strip_nulls(json_build_object(
      'id', ${accountAlias}.id,
      'kind', 'human',
      'handle', ${accountAlias}.handle,
      'displayName', ${accountAlias}.display_name
    )),
    'deviceLabel', ${pairingAlias}.device_label,
    'createdAt', to_char(${pairingAlias}.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(${pairingAlias}.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )`;
}

function issuedWebSessionSelect(webSessionAlias: string, accountAlias: string): string {
  return `json_build_object(
    'token', ${webSessionAlias}.token,
    'actor', json_strip_nulls(json_build_object(
      'id', ${accountAlias}.id,
      'kind', 'human',
      'handle', ${accountAlias}.handle,
      'displayName', ${accountAlias}.display_name
    )),
    'createdAt', to_char(${webSessionAlias}.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(${webSessionAlias}.expires_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
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

function createWebSessionToken(): string {
  return `taf_ws_${randomBytes(24).toString("base64url")}`;
}
