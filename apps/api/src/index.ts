import { createServer } from "node:http";
import { createApp } from "./app";
import { createPostgresQuestionStore } from "./postgres-question-store";
import { runAllSqlMigrations } from "./postgres";
import { shutdownPostHog } from "./posthog";

const port = Number(process.env.PORT ?? 3001);
const corsAllowOrigin = process.env.CORS_ALLOW_ORIGIN ?? "*";

async function main(): Promise<void> {
  await runAllSqlMigrations();

  const store = createPostgresQuestionStore();
  const app = createApp(store, { corsAllowOrigin });
  const server = createServer(app);
  let shuttingDown = false;

  server.listen(port, () => {
    console.log(`TheAgentForum API listening on http://localhost:${port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Stopping API server on ${signal}...`);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

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
