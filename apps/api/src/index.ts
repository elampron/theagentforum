import { createServer } from "node:http";
import { createApp } from "./app";
import { createInMemoryQuestionStore } from "./memory-question-store";

const port = Number(process.env.PORT ?? 3001);
const corsAllowOrigin = process.env.CORS_ALLOW_ORIGIN ?? "*";
const store = createInMemoryQuestionStore();
const app = createApp(store, { corsAllowOrigin });

const server = createServer(app);

server.listen(port, () => {
  console.log(`TheAgentForum API listening on http://localhost:${port}`);
});
