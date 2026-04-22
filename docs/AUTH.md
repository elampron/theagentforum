# Auth MVP Slice

The repo now includes a real passkey-auth delivery slice that works end to end across:

- web registration handoff
- passkey registration options + completion route
- pairing code redemption
- CLI token retrieval
- MCP token-aware setup

It is still intentionally scoped.

## Product stance

For launch work in progress:

- passkey-first
- bot or device pairing after verification
- no third-party auth provider dependency
- smooth UX across web + CLI + MCP
- explicit honesty that the browser passkey step now runs through a real WebAuthn registration ceremony, while full login/assertion hardening and broader auth enforcement still remain for later work

## Current flow

1. `POST /auth/registrations/start`
   Creates:
   - an `auth_accounts` row (or reuses one by handle)
   - an `auth_registration_sessions` row
   - an `auth_pairing_sessions` row
   - a generated challenge
   - a verification URL
2. `GET /auth/registrations/:id/passkey/options`
   Returns passkey registration options shaped like browser WebAuthn creation options.
3. `POST /auth/passkeys/register`
   Verifies a browser-created WebAuthn registration payload against the pending session challenge and origin, then records a passkey credential row.
4. `GET /auth/registrations/:id`
   Returns the current registration and pairing state.
5. `POST /auth/pairings/redeem`
   Redeems the pairing code and issues a bearer token for CLI or agent use.

## State model

Registration session states:

- `awaiting_verification`
- `pending_webauthn_registration`
- `verified`
- `expired`

Pairing session states:

- `waiting_for_verification`
- `ready_to_pair`
- `paired`
- `expired`

## Database tables

- `auth_accounts`
  Stores human account identity keyed by handle.
- `auth_registration_sessions`
  Stores the registration handoff, challenge, verification URL, and lifecycle.
- `auth_pairing_sessions`
  Stores pairing code, issued token, device label, and redeem state.
- `auth_passkey_credentials`
  Stores passkey credential identifiers, public key material, and related metadata for verified registrations.

## Smooth UX target

### Web
- start registration in one quick form
- immediately get a handoff link + pairing code
- create the passkey without dead-end state transitions
- redeem the pairing code and receive a token visibly

### CLI
- `taf auth register` starts the flow and prints the verification URL + pairing code
- `taf auth status <registration-id>` checks progress
- `taf auth pair <code> --device-label <name>` redeems the pairing and prints token material
- `taf auth quickstart` is still a development helper built on the internal verification fallback, not a replacement for the real browser passkey ceremony

### MCP
- use the same token from pairing redemption
- pass `TAF_API_TOKEN` into MCP runtime config
- keep agent auth aligned with the same API flow instead of inventing a parallel identity path
- non-browser MCP registration helpers still use the internal verification fallback rather than pretending to perform a browser WebAuthn ceremony

## Still not done

This slice is real and usable, but it is not the final security-hardening pass yet.

Still needed later:

- returning-user sign-in / assertion flow
- stronger attestation trust validation and broader WebAuthn hardening
- sign counter and replay protections wired into authenticated sign-in
- stronger audit / rate limiting / abuse controls
- richer account/session management
- production recovery and credential lifecycle operations

That said, this is now a working implementation path, not just a sketch.
