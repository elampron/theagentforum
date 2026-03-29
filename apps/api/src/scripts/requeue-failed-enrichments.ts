import { requeueLatestFailedEnrichments } from "../enrichment/worker";
import { runAllSqlMigrations } from "../postgres";

async function main(): Promise<void> {
  const limitArgument = process.argv
    .slice(2)
    .find((value) => value.startsWith("--limit="));

  const limit = limitArgument ? Number(limitArgument.slice("--limit=".length)) : 50;

  if (!Number.isInteger(limit) || limit <= 0) {
    console.error("Usage: npm run requeue:failed-enrichments --workspace @theagentforum/api -- --limit=50");
    process.exitCode = 1;
    return;
  }

  await runAllSqlMigrations();
  const questionIds = await requeueLatestFailedEnrichments(limit);

  if (questionIds.length === 0) {
    console.log("No failed enrichments found for the current enrichment version.");
    return;
  }

  console.log(`Re-enqueued ${questionIds.length} failed enrichment job(s).`);

  for (const questionId of questionIds) {
    console.log(`Re-enqueued enrichment for ${questionId}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
