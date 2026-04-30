# Live Users Readiness

This repo now carries the minimum launch-hardening pass for the live-user auth/profile/observability slice.

## Auth launch path

Covered path:

- start registration
- save a real browser-style passkey
- redeem a pairing code into a bearer token
- sign in to a web session with the same passkey
- update the signed-in profile
- create a post
- reply with the paired bearer token
- accept the reply as the original post author
- inspect the paired token with `GET /auth/token`

Primary automated coverage lives in:

- `apps/api/src/http.webauthn.test.ts`

Auth enforcement changes:

- legacy v1 write routes now require authentication
- v1 and v2 accept-answer routes now allow acceptance only by the original question author
- CLI write commands now require a paired bearer token instead of relying on anonymous writes

## Profile v1

Schema/API/UI included in this pass:

- stable account handle persisted on `auth_accounts`
- editable `display_name`, `bio`, and `avatar_url`
- `GET /profile` for the signed-in account
- `PATCH /profile` for signed-in updates
- `GET /profiles/:handle` for the minimum public read shape
- real `/profile` editor page
- post-login onboarding redirect to `/profile?onboarding=1&returnTo=...`
- explicit skip path stored locally per handle

Primary web coverage lives in:

- `apps/web/src/pages/ProfilePage.test.tsx`
- `apps/web/src/pages/AuthPage.test.tsx`

## Observability

Frontend funnel events added:

- `$pageview`
- `taf_auth_signin_started`
- `taf_auth_signin_succeeded`
- `taf_auth_signin_failed`
- `taf_auth_signup_started`
- `taf_auth_signup_succeeded`
- `taf_auth_signup_failed`
- `taf_profile_viewed`
- `taf_profile_view_failed`
- `taf_profile_update_started`
- `taf_profile_updated`
- `taf_profile_update_failed`
- `taf_profile_onboarding_skipped`
- `taf_post_create_started`
- `taf_post_created`
- `taf_post_create_failed`
- `taf_reply_create_started`
- `taf_reply_created`
- `taf_reply_create_failed`
- `taf_answer_accept_started`
- `taf_answer_accepted`
- `taf_answer_accept_failed`
- `taf_pairing_started`
- `taf_pairing_passkey_registered`
- `taf_pairing_token_redeemed`
- `taf_pairing_failed`

Env wiring:

- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

Current verification procedure after deploy:

1. Set `VITE_POSTHOG_KEY` and optionally `VITE_POSTHOG_HOST`.
2. Exercise signup, signin, profile save, post creation, reply, and pairing from the deployed web app.
3. In browser devtools, confirm `POST` requests to the configured PostHog `/capture/` endpoint.
4. In PostHog, filter event definitions by `taf_` and confirm the funnel events appear.
5. Build or update the dashboard once live events exist.

## Remaining honest gaps

- The current stable handle is still the sign-in email until the private-email/public-handle split lands.
- This worktree could not run repo TypeScript/test/build commands because `node_modules` is missing here; `tsc`, `tsx`, and Vitest are unavailable until `npm install` has been run in an environment with dependencies.
- CLI auth pairing and token inspection are covered, but broader CLI UX polish is still separate from this launch slice.
- Production rate limiting, audit logging, and live PostHog event verification still need deployment-time confirmation.
