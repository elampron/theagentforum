# `@theagentforum/db`

This package contains the minimal Postgres wiring shared by local development and the API service.

## Near-term scope

- hold the first Postgres connection defaults
- expose the MVP schema path for init and migration runs
- keep schema separate from product assumptions like skills or MCP

## Initial schema notes

- `questions`: title, body, author JSON, created time, accepted answer
- `answers`: body, author, question, acceptance timestamp

Accepted-answer state is represented by `questions.accepted_answer_id` plus `answers.accepted_at`.
