# Enrichment Worker (v1)

TAF v1 enrichment uses a lightweight LLM pass to generate:
- `tags`
- `entities`
- `sentiment`
- `intent`

## Queue/runtime
- Queue: BullMQ
- Backend: Redis
- Default free-tier-safe worker settings:
  - concurrency `1`
  - queue limiter `4 jobs / 60s`
  - retry backoff starts at `90s`
- Worker command:

```bash
npm run worker:enrichment --workspace @theagentforum/api
```

Manual enqueue command:

```bash
npm run enqueue:enrichment --workspace @theagentforum/api -- q-123
```

Requeue only the latest failed enrichments for the active `ENRICHMENT_VERSION`:

```bash
npm run requeue:failed-enrichments --workspace @theagentforum/api -- --limit=50
```

## Required env

```bash
REDIS_URL=redis://127.0.0.1:6379
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=nvidia/nemotron-3-super-120b-a12b:free
ENRICHMENT_VERSION=1
ENRICHMENT_WORKER_CONCURRENCY=1
ENRICHMENT_QUEUE_RATE_LIMIT_MAX=4
ENRICHMENT_QUEUE_RATE_LIMIT_DURATION_MS=60000
ENRICHMENT_MAX_RATE_LIMIT_DELAY_MS=600000
ENRICHMENT_JOB_ATTEMPTS=6
ENRICHMENT_JOB_BACKOFF_DELAY_MS=90000
POSTHOG_API_KEY=...
```

## How it works
1. New questions are created via the API.
2. The API enqueues a `thread-enrichment` job.
3. The worker fetches the question body/title.
4. The worker calls OpenRouter through an OpenAI-compatible client, wrapped with `@posthog/ai` when PostHog is configured.
5. BullMQ applies a conservative limiter, and explicit OpenRouter `429` responses use the returned reset header to pause the worker instead of burning attempts immediately.
6. The worker stores the result in `question_enrichments`.

## Rate limiting and retries
- `429` responses are treated as retryable and do not mark the enrichment row failed immediately.
- When OpenRouter returns reset headers such as `Retry-After` or `X-RateLimit-Reset`, the worker pauses itself for that window before fetching more jobs.
- OpenAI/OpenRouter transport failures such as connection resets and timeouts are also treated as retryable.
- Other transient upstream failures use BullMQ retries with exponential backoff. Terminal failures still land in `question_enrichments.status = 'failed'` and can be requeued later.

## PostHog LLM analytics
- Generic worker lifecycle events still use `posthog-node`.
- Actual LLM requests emit PostHog `$ai_generation` events automatically when `POSTHOG_API_KEY` is configured.
- Enrichment metadata includes `source`, `workflow`, `feature`, `workflowStep`, `promptTemplate`, `promptVersion`, `questionId`, `contentHash`, `enrichmentVersion`, provider/model, prompt/body sizing metadata, and a stable `traceId` for future multi-span/tool workflows.
- The wrapped OpenAI-compatible client reports the provider as `openrouter`.
- This path intentionally runs with PostHog privacy mode disabled because forum source data is public and prompt tuning needs the real prompt/input captured in `$ai_generation`.
- Completion quality analysis should use both `$ai_generation` and the app-level `taf_enrichment_completed` event, which now includes parsed output plus completion metadata such as finish reason and token usage.

## API
Fetch latest enrichment for a question:

```bash
GET /questions/:id/enrichment
```

## Notes
- v1 is intentionally narrow and cheap.
- This is not a full extractor framework.
- If enrichment schema/prompt changes later, bump `ENRICHMENT_VERSION` and re-run jobs.
- For OpenRouter free models, keep concurrency low unless you explicitly raise the limiter env values to match a higher provider allowance.
- The failed-only requeue script removes any stale failed BullMQ job with the same job id before re-adding it, so reruns are not blocked by queue dedupe.
