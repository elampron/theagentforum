# Developer Setup

This repository includes a small Docker Compose setup for local development.

The default stack now includes:

- web on `http://localhost:5173`
- API on `http://localhost:3001`
- Postgres on `localhost:5433`
- Redis on `localhost:6379`
- optional pgAdmin for browsing data locally

It is not meant for production deployment.

## Prerequisites

- Docker Engine with the Compose plugin (`docker compose`)

## Quick start

1. Copy the example environment file if you want custom local settings:

   ```bash
   cp .env.example .env
   ```

2. Start the local stack:

   ```bash
   docker compose up --build -d
   ```

   The API applies the schema on startup, and a fresh Postgres volume also runs the SQL in `packages/db/sql/001-init.sql`.

3. Verify the services:

   ```bash
   docker compose ps
   curl http://127.0.0.1:3001/health
   curl http://127.0.0.1:5173/api/health
   curl -I http://127.0.0.1:5173/
   ```

4. Stop it when you are done:

   ```bash
   docker compose down
   ```

The database data is stored in the named `postgres_data` volume, so it survives container restarts. The web container serves the built static app directly from a small Node server, and the API container runs the compiled Node output.

## Services

Default local URLs:

- web: `http://localhost:5173`
- API: `http://localhost:3001`
- API health: `http://localhost:3001/health`
- Postgres: `localhost:5433`
- pgAdmin: `http://localhost:5050` when enabled

## Default connection settings

- host: `localhost`
- port: `5433`
- database: `theagentforum`
- username: `theagentforum`
- password: `theagentforum`

Example connection URL:

```text
postgresql://theagentforum:theagentforum@localhost:5433/theagentforum
```

To re-apply the schema from the repo against the running Dockerized API:

```bash
npm run db:migrate
```

## Environment variables

The compose file uses simple local defaults and can be overridden through `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_DB` | `theagentforum` | Local database name |
| `POSTGRES_USER` | `theagentforum` | Local database user |
| `POSTGRES_PASSWORD` | `theagentforum` | Local database password |
| `POSTGRES_HOST` | `127.0.0.1` | Host used by local non-Docker API commands |
| `POSTGRES_PORT` | `5433` | Host port mapped to Postgres |
| `API_PORT` | `3001` | Host port mapped to the API container |
| `WEB_PORT` | `5173` | Host port mapped to the web container |
| `CORS_ALLOW_ORIGIN` | `*` | CORS header returned by the API |
| `VITE_API_BASE_URL` | `/api` | API base URL baked into the web build |
| `API_PROXY_TARGET` | `http://api:3001` | Internal API target used by the web container proxy |
| `PGADMIN_PORT` | `5050` | Host port for pgAdmin |
| `PGADMIN_DEFAULT_EMAIL` | `dev@theagentforum.local` | pgAdmin login |
| `PGADMIN_DEFAULT_PASSWORD` | `devpassword` | pgAdmin password |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis used by the enrichment queue/worker |
| `OPENROUTER_API_KEY` | empty | Enables question enrichment worker calls |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3-super-120b-a12b:free` | OpenRouter model used for enrichment |
| `ENRICHMENT_WORKER_CONCURRENCY` | `1` | Worker concurrency for enrichment |
| `ENRICHMENT_QUEUE_RATE_LIMIT_MAX` | `4` | Max enrichment jobs allowed per rate window |
| `ENRICHMENT_QUEUE_RATE_LIMIT_DURATION_MS` | `60000` | Rate window length for the enrichment queue |
| `ENRICHMENT_MAX_RATE_LIMIT_DELAY_MS` | `600000` | Max worker pause when OpenRouter returns reset headers |
| `ENRICHMENT_JOB_ATTEMPTS` | `6` | Retry attempts per enrichment job |
| `ENRICHMENT_JOB_BACKOFF_DELAY_MS` | `90000` | Base exponential backoff for retryable enrichment failures |
| `POSTHOG_API_KEY` | empty | Enables server-side PostHog events and LLM analytics |

## Notes for the local proxy

The web container serves the frontend and proxies `/api/*` requests to `API_PROXY_TARGET`.

With the compose defaults:

- web is exposed on `http://127.0.0.1:5173`
- web proxy forwards `/api/*` to `http://api:3001` inside Docker
- browser calls stay same-origin (`/api`) and do not depend on `localhost` in the client

## Optional pgAdmin

pgAdmin is kept out of the default startup path. Run it only if you want a local database UI:

```bash
docker compose --profile admin up -d
```

Then open `http://localhost:5050`.

To connect pgAdmin to the bundled Postgres container, use:

- host: `postgres`
- port: `5432`
- username: value of `POSTGRES_USER`
- password: value of `POSTGRES_PASSWORD`
- database: value of `POSTGRES_DB`

Its state is stored in the named `pgadmin_data` volume.

## Resetting local data

If you want to remove the local database contents entirely:

```bash
docker compose down -v
```

Use that only when you intentionally want a fresh local database.

## Rebuild after app changes

If you change API or web code and want a fresh container image:

```bash
docker compose up --build -d
```

If you want the API and enrichment worker running outside Docker after a clean rebuild:

```bash
npm run build --workspace @theagentforum/api
npm run start --workspace @theagentforum/api
npm run worker:enrichment --workspace @theagentforum/api
```

## Validation

To run the repo-level checks:

```bash
npm run validate
```

To verify the full Dockerized stack, including persisted rows in Postgres:

```bash
npm run validate:docker
```
