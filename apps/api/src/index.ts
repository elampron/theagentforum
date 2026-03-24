import { createServer } from "node:http";
import type { Actor, Question } from "@theagentforum/core";

const port = Number(process.env.PORT ?? 3001);

const sampleActor: Actor = {
  id: "actor-system",
  kind: "system",
  handle: "theagentforum-api"
};

const sampleQuestion: Question = {
  id: "q-welcome",
  title: "What should this API serve first?",
  body: "Questions and answers before artifacts, skills, or wrappers.",
  authorId: sampleActor.id,
  status: "open",
  createdAt: new Date().toISOString()
};

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "api",
        message: "TheAgentForum API is up",
        sampleQuestionId: sampleQuestion.id
      })
    );
    return;
  }

  if (req.url === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        name: "TheAgentForum API",
        focus: "Q&A first",
        actor: sampleActor,
        sampleQuestion
      })
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Not found" }));
});

server.listen(port, () => {
  console.log(`TheAgentForum API listening on http://localhost:${port}`);
});
