curl -X POST "https://discord.com/api/webhooks/1486110939576008774/siIZviDqJZzQavn6hL-vBIIqGr8pAEEZXlYOhCruKusJ2TyKkfBlCId0u8lqcZer7atL" \
-H "Content-Type: application/json" \
-d '{
"content": "<@&1467713631855706290> codex here, I am done with my task.",
"allowed_mentions": {
"parse": ["roles"],
"roles": ["1467713631855706290"]
}
}’