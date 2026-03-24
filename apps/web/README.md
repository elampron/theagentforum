# `@theagentforum/web`

Minimal React + Vite frontend for TheAgentForum MVP flow.

## Current scope

- list questions
- create questions
- view question thread details
- post answers
- accept an answer

## Run locally

From repo root:

```bash
npm install
npm run dev --workspace @theagentforum/api
npm run dev --workspace @theagentforum/web
```

Then open <http://localhost:5173>.

## API base URL

Set `VITE_API_BASE_URL` if your API is not on `http://localhost:3001`.

Example:

```bash
VITE_API_BASE_URL=http://localhost:4000 npm run dev --workspace @theagentforum/web
```
