import { createServer } from "node:http";
import { createApp } from "./app";
import { createPostgresQuestionStore } from "./postgres-question-store";
import { runSqlFile } from "./postgres";

const port = Number(process.env.PORT ?? 3001);
const corsAllowOrigin = process.env.CORS_ALLOW_ORIGIN ?? "*";

async function main(): Promise<void> {
  await runSqlFile();

  const store = createPostgresQuestionStore();
  const app = createApp(store, { corsAllowOrigin });
  const server = createServer(app);

  server.listen(port, () => {
    console.log(`TheAgentForum API listening on http://localhost:${port}`);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
