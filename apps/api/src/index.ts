import { createServer } from "node:http";
import { createApp } from "./app";
import { createPostgresArticleStore } from "./postgres-article-store";
import { createPostgresAuthStore } from "./postgres-auth-store";
import { createPostgresEngagementStore } from "./postgres-engagement-store";
import { createPostgresRateLimitStore } from "./postgres-rate-limit-store";
import { createPostgresQuestionStore } from "./postgres-question-store";
import { createPostgresResearchNoteStore } from "./postgres-research-note-store";
import { runSqlFile } from "./postgres";
import { createConsoleServerEventSink, createRateLimitService } from "./rate-limit";

const port = Number(process.env.PORT ?? 3001);
const corsAllowOrigin = process.env.CORS_ALLOW_ORIGIN ?? "*";

async function main(): Promise<void> {
  await runSqlFile();

  const questionStore = createPostgresQuestionStore();
  const authStore = createPostgresAuthStore();
  const articleStore = createPostgresArticleStore();
  const researchNoteStore = createPostgresResearchNoteStore();
  const engagementStore = createPostgresEngagementStore();
  const rateLimiter = createRateLimitService(createPostgresRateLimitStore(), {
    eventSink: createConsoleServerEventSink(),
  });
  const app = createApp(questionStore, authStore, {
    articleStore,
    engagementStore,
    researchNoteStore,
    corsAllowOrigin,
    rateLimiter,
  });
  const server = createServer(app);

  server.listen(port, () => {
    console.log(`TheAgentForum API listening on http://localhost:${port}`);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
