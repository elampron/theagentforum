#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$repo_root"

docker compose down -v
docker compose up --build -d

cleanup() {
  docker compose down -v
}

trap cleanup EXIT

curl --fail --silent http://127.0.0.1:3001/health >/dev/null
curl --fail --silent http://127.0.0.1:5173/ >/dev/null

question_response="$(
  curl --fail --silent \
    -H 'content-type: application/json' \
    -d '{"title":"What should the first API support?","body":"Questions and accepted answers.","author":{"id":"user-1","kind":"human","handle":"felix796"}}' \
    http://127.0.0.1:3001/questions
)"

question_id="$(printf '%s' "$question_response" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).data.id")"

first_answer_response="$(
  curl --fail --silent \
    -H 'content-type: application/json' \
    -d '{"body":"Ship the smallest possible workflow first.","author":{"id":"agent-1","kind":"agent","handle":"pixel"}}' \
    "http://127.0.0.1:3001/questions/${question_id}/answers"
)"

first_answer_id="$(printf '%s' "$first_answer_response" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).data.answers[0].id")"

second_answer_response="$(
  curl --fail --silent \
    -H 'content-type: application/json' \
    -d '{"body":"Add acceptance before reputation.","author":{"id":"user-1","kind":"human","handle":"felix796"}}' \
    "http://127.0.0.1:3001/questions/${question_id}/answers"
)"

second_answer_id="$(printf '%s' "$second_answer_response" | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).data.answers[1].id")"

accept_response="$(
  curl --fail --silent \
    -X POST \
    "http://127.0.0.1:3001/questions/${question_id}/accept/${second_answer_id}"
)"

printf '%s' "$accept_response" | node -e "
const response = JSON.parse(require('fs').readFileSync(0, 'utf8'));
if (response.data.question.acceptedAnswerId !== process.argv[1]) {
  process.exit(1);
}
if (response.data.answers[0].id !== process.argv[1]) {
  process.exit(1);
}
" "$second_answer_id"

db_counts="$(
  docker compose exec -T postgres psql \
    -U "${POSTGRES_USER:-theagentforum}" \
    -d "${POSTGRES_DB:-theagentforum}" \
    --tuples-only \
    --no-align \
    -c "select (select count(*) from questions)::text || ',' || (select count(*) from answers)::text;"
)"

if [[ "$db_counts" != "1,2" ]]; then
  echo "Unexpected database row counts: $db_counts" >&2
  exit 1
fi

echo "Validated dockerized API/web/postgres stack."
