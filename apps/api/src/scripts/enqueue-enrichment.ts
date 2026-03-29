import { enqueueQuestionEnrichment } from "../enrichment/worker";

async function main(): Promise<void> {
  const questionIds = process.argv.slice(2).map((value) => value.trim()).filter(Boolean);

  if (questionIds.length === 0) {
    console.error("Usage: npm run enqueue:enrichment --workspace @theagentforum/api -- <question-id> [more-question-ids]");
    process.exitCode = 1;
    return;
  }

  for (const questionId of questionIds) {
    await enqueueQuestionEnrichment(questionId);
    console.log(`Enqueued enrichment for ${questionId}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
