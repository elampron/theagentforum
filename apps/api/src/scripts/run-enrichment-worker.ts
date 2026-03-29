import { startEnrichmentWorker } from "../enrichment/worker";
import { runAllSqlMigrations } from "../postgres";
import { shutdownPostHog } from "../posthog";

async function main(): Promise<void> {
  await runAllSqlMigrations();
  const worker = startEnrichmentWorker();
  let shuttingDown = false;

  worker.on("completed", (job) => {
    console.log(`Completed enrichment job for ${job.data.questionId}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Failed enrichment job for ${job?.data.questionId ?? "unknown"}:`, error.message);
  });

  console.log("TAF enrichment worker started.");

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Stopping enrichment worker on ${signal}...`);

    await worker.close();
    await shutdownPostHog();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
