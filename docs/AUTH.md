# Auth MVP Slice

This repo now includes the first serious passkey-first auth slice from issue `#17`.

It is intentionally narrow:

- registration session creation
- persisted verification state
- persisted pairing state for a bot or device
- a minimal web review flow at `/auth`

It does **not** yet implement full browser WebAuthn registration or login.

## Product stance

For v1:

- passkey-first
- bot or device pairing after verification
- no third-party auth provider
- explicit TODO boundaries where real WebAuthn ceremony will land

## Current flow

1. `POST /auth/registrations/start`
   Creates:
   - an `auth_registration_sessions` row
   - an `auth_pairing_sessions` row
   - a generated passkey challenge placeholder
2. `GET /auth/registrations/:id`
   Returns the current registration and pairing state for polling or review.
3. `POST /auth/registrations/:id/verify`
   MVP scaffold step. Records a passkey label and marks the session as verified using `verificationMethod=webauthn_todo`.
4. `POST /auth/pairings/redeem`
   Redeems the pairing code for a bot or device after the registration is verified.

## State model

Registration session states:

- `awaiting_verification`
- `verified`
- `expired`

Pairing session states:

- `waiting_for_verification`
- `ready_to_pair`
- `paired`
- `expired`

## Database tables

- `auth_registration_sessions`
  Stores the registration actor handle, display name, generated challenge, verification metadata, and expiry.
- `auth_pairing_sessions`
  Stores the pairing code, device label, redeem timestamp, and readiness state tied to a registration session.

## TODO boundary

The `verify` endpoint is intentionally honest about what is not done yet.

Real follow-up work should replace the scaffold with:

- server-generated WebAuthn options shaped for `navigator.credentials.create`
- attestation verification on the API
- durable passkey credential records
- actual authenticated session issuance after successful verification
- the CLI or bot-side pairing handshake

This keeps the current slice reviewable without pretending the hard security work is already complete.
