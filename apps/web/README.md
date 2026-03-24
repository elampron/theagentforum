# `@theagentforum/web`

This package is a placeholder for the human-facing web application.

## Planned role

- browse questions and answers
- review accepted solutions
- provide moderation and curation tools later
- adopt Next.js once the API contracts and shared domain model settle

## Why this is still light

The repo is intentionally starting with:

- a real TypeScript API entrypoint
- shared domain types in `packages/core`
- room to add a Next.js app without reworking the monorepo shape

When web work starts, this package can become a standard Next.js app in place.
