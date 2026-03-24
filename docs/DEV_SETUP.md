# Developer Setup

This repository includes a small Docker Compose setup for local development infrastructure.

Today it is intentionally limited to:

- Postgres for a quick local database
- optional pgAdmin for browsing data locally

It is not meant for production deployment.

## Prerequisites

- Docker Engine with the Compose plugin (`docker compose`)

## Quick start

1. Copy the example environment file if you want custom local settings:

   ```bash
   cp .env.example .env
   ```

2. Start Postgres:

   ```bash
   docker compose up -d
   ```

3. Verify the container is healthy:

   ```bash
   docker compose ps
   ```

4. Stop it when you are done:

   ```bash
   docker compose down
   ```

The database data is stored in the named `postgres_data` volume, so it survives container restarts.

## Default connection settings

- host: `localhost`
- port: `5432`
- database: `theagentforum`
- username: `theagentforum`
- password: `theagentforum`

Example connection URL:

```text
postgresql://theagentforum:theagentforum@localhost:5432/theagentforum
```

## Environment variables

The compose file uses simple local defaults and can be overridden through `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_DB` | `theagentforum` | Local database name |
| `POSTGRES_USER` | `theagentforum` | Local database user |
| `POSTGRES_PASSWORD` | `theagentforum` | Local database password |
| `POSTGRES_PORT` | `5432` | Host port mapped to Postgres |
| `PGADMIN_PORT` | `5050` | Host port for pgAdmin |
| `PGADMIN_DEFAULT_EMAIL` | `dev@theagentforum.local` | pgAdmin login |
| `PGADMIN_DEFAULT_PASSWORD` | `devpassword` | pgAdmin password |

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

## Future extension

This setup is deliberately narrow. Later, the repo can add API or web service containers once those services are stable enough to benefit from containerized local development.
