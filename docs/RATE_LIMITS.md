# Rate Limits

The launch API now enforces fixed-window Postgres-backed rate limits for the highest-risk write and auth-sensitive routes.

Implementation notes:

- Counters live in `rate_limit_counters`.
- Subject keys are stored as SHA-256 hashes, not raw user IDs, handles, or IP addresses.
- Exceeded requests emit a server event named `taf_rate_limit_exceeded`.
- Exceeded responses return `HTTP 429`, a `Retry-After` header, and `error.retryAfterSeconds`.

## Default limits

Authenticated write routes use both:

- a per-user bucket keyed by action + authenticated account id
- a companion per-IP bucket keyed by action + client IP

Launch companion IP buckets are set to `3x` the user bucket to catch hot-IP abuse without making shared-network collisions as aggressive as a same-value mirror.

| Action | Routes | User limit | Companion IP limit |
| --- | --- | --- | --- |
| `create_post` | `POST /questions`, `POST /v2/contents` | `5/hour`, `20/day` | `15/hour`, `60/day` |
| `create_reply` | `POST /questions/:id/answers`, `POST /v2/contents/:id/comments` | `20/hour`, `100/day` | `60/hour`, `300/day` |
| `accept_answer` | `POST /questions/:id/accept/:answerId`, `POST /v2/contents/:id/accept/:commentId` | `30/day` | `90/day` |
| `profile_update` | `PATCH /profile` | `10/hour` | `30/hour` |
| `api_token_lifecycle` | `POST /auth/token/revoke`, `DELETE /auth/devices/:id` | `5/day` | `15/day` |

Unauthenticated or pre-auth flows use these buckets:

| Action | Routes | Limit |
| --- | --- | --- |
| `signup_start` | `POST /auth/registrations/start` | `5/hour/IP` |
| `passkey_login_attempt` | `POST /auth/authentications/start` | `10/15min` per normalized handle or IP |
| `pairing_redeem` | `POST /auth/pairings/redeem` | `10/15min/IP` |

## 429 shape

Example:

```json
{
  "ok": false,
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests for this action. Try again later.",
    "retryAfterSeconds": 3600,
    "details": {
      "action": "signup_start",
      "scopeType": "ip",
      "ruleId": "signup_start_hour",
      "limit": 5,
      "windowSeconds": 3600
    }
  }
}
```

## Telemetry

Exceeded requests emit:

```json
{
  "event": "taf_rate_limit_exceeded",
  "action": "create_post",
  "scopeType": "user",
  "ruleId": "create_post_hour",
  "limit": 5,
  "windowSeconds": 3600,
  "retryAfterSeconds": 3600
}
```

The event intentionally omits raw IPs, handles, account ids, tokens, and other request secrets.

## Deferred or manual follow-up

- Read/search routes are not rate-limited yet. `GET /search/threads` and `GET /v2/search/threads` stay open for launch to avoid degrading normal UX before real traffic data exists.
- First-24-hour new-account throttles are only scaffolded as a helper/test today. The repo now has an account-age helper, but tighter launch values still need product tuning before enforcement is turned on for content writes.
- There is no separate authenticated pairing-code creation route in the current MVP. The only pairing-code creation path is registration start, so that path is covered by `signup_start`.
- `rate_limit_counters` is append-only by window. Operators should add a periodic cleanup job after launch, for example deleting rows whose `window_started_at` is older than the longest retained operational horizon.
- There is no admin bypass or manual unblock endpoint yet. Operational overrides still require direct database access or a deploy-time code change.
