# TheAgentForum — Bootstrap Context (2026-03-25)

Purpose: this file is a **post-compaction recovery document** for continuing work on TheAgentForum without needing the full chat history.

This is a **workspace bootstrap note**, not a polished public repo document. It captures the most important context, decisions, operational details, and next steps as of 2026-03-25.

---

## 1. What TheAgentForum is

TheAgentForum (TAF) is an **agent-native Q&A system**.

Core idea:
- agents and humans can ask questions
- agents and humans can answer
- one answer can be marked as the **accepted/correct answer**
- later, answers may optionally lead to reusable artifacts/skills

Current product philosophy:
- **Q&A first**
- skills later
- accepted-answer model first (StackExchange-style), not Reddit voting
- CLI/MCP/agent interfaces matter a lot
- simple boring infrastructure first, then more ambitious agent features later

---

## 2. Important product decisions already made

### Core product scope
Locked-in direction:
- MVP is **questions + answers + accepted answer + basic listing/searching**
- skills are **not core MVP**
- skills may later be optional attachments, and should be validated/reviewed before becoming reusable/installable

### Data/storage
Chosen direction:
- **Postgres** is the source of truth
- not MongoDB
- not graph-first
- graph/vector/search layers can be added later if needed

### Identity model
Chosen direction in the model:
- **Actor** is the shared abstraction
- an actor may represent a human user or an agent identity

### Accepted-answer model
Chosen direction:
- **accepted/correct answer first**
- not Reddit-style up/downvote as the primary resolution model

### CLI direction
Chosen direction:
- CLI language is **Rust**
- binary name is **`taf`**
- command family should be simple and close to current API

### Auth direction
Latest decision:
- issue #10 originally framed auth around QR + phone + **third-party provider** verification
- after discussion, the preferred direction became **passkey-first auth**, with QR/phone handoff and bot pairing
- third-party auth is **not required for v1** and is intentionally deferred
- a new PRD was created for this updated direction (issue #17)

### ID strategy
Discussion happened about GUID vs short ids.
Current best recommendation:
- **UUID/GUID internally**
- **human-friendly short IDs publicly** (`q-123`, `a-456`)

A Discord poll was created about this.

---

## 3. Current live deployment state

### Public URLs
- App: https://app.theagentforum.com/
- API health: https://api.theagentforum.com/health

Health check observed:
- API returns healthy JSON
- app returns HTTP 200 through Cloudflare

### Runtime topology
Current deployed shape:
- Cloudflare / tunnel ingress
- `cloudflared-projects` container forwards to local router
- `projects-router` (Caddy) routes by Host header
- TheAgentForum services are behind that router

### Local routing details
Current local reverse-proxy routing expectation:
- `theagentforum.com` → web
- `www.theagentforum.com` → web
- `app.theagentforum.com` → web
- `api.theagentforum.com` → API

The router listens on:
- `localhost:8080`

Current service ports behind router:
- web → `127.0.0.1:5173`
- api → `127.0.0.1:3001`

### Docker runtime
Current Dockerized services observed:
- `theagentforum-web`
- `theagentforum-api`
- `theagentforum-postgres`
- plus infra containers `projects-router` and `cloudflared-projects`

Current DB host mapping:
- Postgres host port is **55432**, not 5432
- reason: 5432 was already occupied by another local Postgres

Observed container status snapshot:
- web up
- api up
- postgres healthy
- router up
- cloudflared up

---

## 4. Current backend/API shape

Current live API routes:
- `GET /health`
- `GET /questions`
- `POST /questions`
- `GET /questions/:id`
- `POST /questions/:id/answers`
- `POST /questions/:id/accept/:answerId`

Behavior notes:
- JSON only
- Postgres-backed now
- question detail returns thread-style view with answers
- accepted answer should appear first in presentation

---

## 5. Current CLI state

### Status
The Rust CLI exists and was compiled/tested locally.

Local testing outcome:
- Rust toolchain installed locally on pixelcore
- CLI branch compiled successfully
- tests passed (`5 passed` during local run)
- smoke tests against live/local API succeeded

Verified examples during testing:
- `taf health` worked
- `taf list` worked
- `taf ask` created a real question (`q-6` during one smoke test)
- `taf answer` successfully answered an existing thread (`q-2` during one smoke test)

### Command direction discussed
Intended early command family:
- `taf health`
- `taf ask`
- `taf list`
- `taf question <id>`
- `taf answer <question-id>`
- `taf accept <question-id> <answer-id>`

Key CLI decisions from discussion:
- `taf ask`: **title required**, body optional
- identity/kind should eventually come from auth/session context, not permanent CLI flags
- `taf list` should support filters like:
  - `--status`
  - `--limit`
  - `--sort newest|oldest|answers`
  - `--unanswered`
  - `--json`
- `taf question <id>` is preferred over `taf view <id>`
- search should probably become its own command later rather than overloading `list`

### Known CLI gap from testing
When testing the merged CLI, one note came up:
- the API override behavior (`--api`) was not yet behaving the way earlier design discussion expected
- default/local path worked for testing, but this should be reviewed

---

## 6. GitHub status snapshot

### Merged PRs (important recent ones)
Merged and important:
- PR #1 — developer docker compose setup
- PR #2 — API MVP endpoints
- PR #3 — MVP Q&A frontend
- PR #4 — refactor API store boundary + HTTP tests
- PR #5 — Postgres-backed API + production-safe web/api deployment
- PR #6 — landing page / UI redesign
- PR #7 — AI agent instruction files
- PR #9 — initial Rust CLI for V1 API surface
- PR #12 — markdown support for questions and answers
- PR #16 — CLI binary build workflow (IMPORTANT: see blocker below)

### Open issues observed
Currently important open issues:
- #17 — PRD: passkey-first auth and bot pairing
- #15 — agent skill pack / skill.md / heartbeat/messaging docs
- #14 — OpenClaw integration + docs
- #13 — MCP v1 with CLI-parity functions
- #10 — earlier QR + third-party-auth issue (conceptually superseded by #17 for v1 direction)

### Important workflow/blocker note
A critical subtlety:
- PR #16 (CLI binary GitHub Action) was merged
- the Actions run failed because CI used `cargo build --locked` but **`cli/Cargo.lock` was not tracked on `main`**
- local diagnosis showed that the repo had a bad `.gitignore` rule ignoring `Cargo.lock`
- a fix was prepared on branch `feat/cli-release-action`:
  - remove the ignore rule
  - commit `cli/Cargo.lock`
- **that fix has NOT been merged to main yet**

This is one of the most important current blockers.

In plain language:
- the binary build workflow is merged
- but the workflow is still broken on `main`
- because `cli/Cargo.lock` is missing from the repo

Future work should either:
- create a new PR with that fix
- or otherwise land the lockfile + `.gitignore` correction into main quickly

---

## 7. Auth direction (current best understanding)

### Old issue framing
Issue #10 framed auth as:
- register
- get QR / one-time link
- open on phone
- authenticate using a third-party provider
- pair local bot/CLI afterward

### Updated preferred direction
After later discussion, the more preferred product direction became:
- **passkey-first**
- QR/phone handoff still useful
- human verifies using passkey/device
- local bot/CLI pairs afterward
- third-party auth provider is optional later, not a v1 requirement

### Current recommended auth product stance
For v1:
- passkey-first
- QR or one-time link handoff from CLI/web to phone/device
- bot pairing after verification
- third-party auth deferred unless abuse proves it necessary

This is now captured in issue #17.

---

## 8. Agent / automation / notification experiments

### Codex
Codex is heavily used on this project.
Important operational note discovered on pixelcore:
- non-PTY Codex runs were failing with a Linux sandbox/bwrap loopback error
- local fix applied in `~/.codex/config.toml`:

```toml
[features]
use_legacy_landlock = true
```

This made Codex non-PTY execution viable again.

Codex version was also updated to a newer release during this session history.

### Completion notifications experiment
Experiment findings:
- sending messages to the same Discord channel via OpenClaw **does not wake Pixel from her own outbound messages**
- this is likely due to OpenClaw self/bot-authored message filtering by design
- a separate webhook/bot sender can still be useful for visible theater/notifications
- **best reliable pattern** discussed:
  1. `openclaw system event` wakes Pixel reliably
  2. a Discord notification message is posted for human visibility

### Discord mentions / webhook nuance
Important discovery:
- raw Discord webhook mentions require `allowed_mentions`
- for role mention via webhook, explicit role allowlist form was needed

Example shape that worked better conceptually:
```json
{
  "content": "<@&ROLE_ID> codex here, I am done with my task.",
  "allowed_mentions": {
    "roles": ["ROLE_ID"]
  }
}
```

But even if the room sees the message, that alone does not mean Pixel will self-wake from it.

### OpenClaw Discord config experiment
A config change was made locally to try bot-message intake by mentions:
- `channels.discord.allowBots = "mentions"`

However, gateway restart flow encountered some config/plugin annoyance (`acpx` stale plugin warning), so treat this as an experimental config note, not a fully validated solution.

---

## 9. Device pairing / operator notes

There was a device repair/pairing event for Eric’s MacBook Pro.
Notes:
- pending repair request was found and approved via OpenClaw device commands
- repair/pairing used `openclaw devices approve --latest` successfully after direct ID approval proved flaky because the request ID refreshed

This is mostly operational context, not core TAF product context, but useful if pairing comes up again.

---

## 10. UI and content direction

Recent UI direction:
- the UI was refreshed significantly by Felix
- markdown support landed for questions/answers
- landing page direction is still evolving
- likely future landing page should help people understand:
  - what TAF is
  - how to get started
  - CLI
  - auth / pairing
  - maybe later skills / agent setup

There was also discussion about making the landing/UI feel less generic and possibly more distinct / animated later.

---

## 11. Most important immediate next steps

If continuing right after compaction, the best sequence is probably:

### Immediate blockers / cleanup
1. **Fix the merged CLI binary workflow on main**
   - land the `cli/Cargo.lock` + `.gitignore` correction
   - rerun the action
2. confirm artifact generation works for:
   - Linux
   - macOS Apple Silicon
   - Windows

### Product-facing next work
3. continue refining/reviewing the merged Rust CLI behavior
4. discuss and then implement **passkey-first auth / pairing** from issue #17
5. build MCP / OpenClaw / skill-pack support from issues #13/#14/#15

### Secondary improvement tracks
6. notification/watch/subscription model for question answers
7. ID strategy decision (internal UUID + public short IDs is the best current recommendation)
8. richer CLI UX (search command, better config handling, cleaner API override behavior)

---

## 12. Quick links

### Live product
- App: https://app.theagentforum.com/
- API health: https://api.theagentforum.com/health

### Important repo links
- Repo: https://github.com/elampron/theagentforum
- CLI issue: https://github.com/elampron/theagentforum/issues/8
- Auth old issue: https://github.com/elampron/theagentforum/issues/10
- MCP issue: https://github.com/elampron/theagentforum/issues/13
- OpenClaw issue: https://github.com/elampron/theagentforum/issues/14
- Skill pack issue: https://github.com/elampron/theagentforum/issues/15
- Passkey auth PRD: https://github.com/elampron/theagentforum/issues/17

### Important merged PRs
- CLI PR: https://github.com/elampron/theagentforum/pull/9
- Markdown PR: https://github.com/elampron/theagentforum/pull/12
- CLI binary workflow PR (merged but needs follow-up fix): https://github.com/elampron/theagentforum/pull/16

---

## 13. TL;DR for future-me

If you only remember five things, remember these:

1. **TAF is real now** — live app, live API, Dockerized runtime, Postgres-backed.
2. **Core product is Q&A first** — accepted answer model, not skills-first.
3. **Rust CLI exists and works**, but the binary build workflow on main is currently broken because `cli/Cargo.lock` is missing.
4. **Auth direction changed** — passkey-first is now preferred over third-party-provider-first.
5. **Next serious work** = fix the CLI binary workflow on main, then auth/pairing, then MCP/OpenClaw/skill integrations.
