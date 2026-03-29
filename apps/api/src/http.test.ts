import assert from "node:assert/strict";
import { createServer } from "node:http";
import { afterEach, describe, it } from "node:test";
import { createApp } from "./app";
import { createInMemoryQuestionStore } from "./memory-question-store";

const humanAuthor = {
  id: "user-1",
  kind: "human" as const,
  handle: "felix796",
};

const agentAuthor = {
  id: "agent-1",
  kind: "agent" as const,
  handle: "pixel",
};

const servers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    Array.from(servers, (server) => closeServer(server)),
  );
  servers.clear();
});

describe("HTTP API", () => {
  it("serves the full question -> answer -> accept flow", async () => {
    const baseUrl = await startTestServer();

    const createQuestionResponse = await requestJson(baseUrl, "/questions", {
      method: "POST",
      body: {
        title: "What should the first API support?",
        body: "Questions and accepted answers.",
        author: humanAuthor,
      },
    });

    assert.equal(createQuestionResponse.status, 201);
    const question = createQuestionResponse.body.data;
    assert.equal(question.status, "open");

    const firstAnswerResponse = await requestJson(
      baseUrl,
      `/questions/${question.id}/answers`,
      {
        method: "POST",
        body: {
          body: "Ship the smallest possible workflow first.",
          author: agentAuthor,
        },
      },
    );
    assert.equal(firstAnswerResponse.status, 201);

    await sleep(2);

    const secondAnswerResponse = await requestJson(
      baseUrl,
      `/questions/${question.id}/answers`,
      {
        method: "POST",
        body: {
          body: "Add acceptance before reputation.",
          author: humanAuthor,
        },
      },
    );
    assert.equal(secondAnswerResponse.status, 201);

    const answerToAccept = secondAnswerResponse.body.data.answers[1];
    const acceptResponse = await requestJson(
      baseUrl,
      `/questions/${question.id}/accept/${answerToAccept.id}`,
      {
        method: "POST",
      },
    );

    assert.equal(acceptResponse.status, 200);
    assert.equal(acceptResponse.body.data.question.status, "answered");
    assert.equal(
      acceptResponse.body.data.question.acceptedAnswerId,
      answerToAccept.id,
    );
    assert.equal(acceptResponse.body.data.answers[0].id, answerToAccept.id);
    assert.ok(acceptResponse.body.data.answers[0].acceptedAt);

    const threadResponse = await requestJson(baseUrl, `/questions/${question.id}`);
    assert.equal(threadResponse.status, 200);
    assert.equal(threadResponse.body.data.answers[0].id, answerToAccept.id);

    const enrichmentResponse = await requestJson(baseUrl, `/questions/${question.id}/enrichment`);
    assert.equal(enrichmentResponse.status, 200);
    assert.equal(enrichmentResponse.body.data, null);
  });

  it("returns validation errors for invalid question payloads", async () => {
    const baseUrl = await startTestServer();

    const response = await requestJson(baseUrl, "/questions", {
      method: "POST",
      body: {
        title: "",
        body: "Still has a body",
        author: humanAuthor,
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error.code, "validation_error");
    assert.match(response.body.error.message, /title must be a non-empty string/i);
  });

  it("returns answer_not_found when accepting an answer outside the question", async () => {
    const baseUrl = await startTestServer();

    const createQuestionResponse = await requestJson(baseUrl, "/questions", {
      method: "POST",
      body: {
        title: "Where should acceptance live?",
        body: "Need route behavior",
        author: humanAuthor,
      },
    });

    const questionId = createQuestionResponse.body.data.id;
    const response = await requestJson(
      baseUrl,
      `/questions/${questionId}/accept/a-404`,
      {
        method: "POST",
      },
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error.code, "answer_not_found");
  });

  it("searches threads through the dedicated route", async () => {
    const baseUrl = await startTestServer();

    const answeredQuestion = await requestJson(baseUrl, "/questions", {
      method: "POST",
      body: {
        title: "Need frontend config help",
        body: "Vite aliases keep drifting between apps.",
        author: humanAuthor,
      },
    });
    const fuzzyQuestion = await requestJson(baseUrl, "/questions", {
      method: "POST",
      body: {
        title: "How do I fix Vitte dev startup?",
        body: "The local dev server is inconsistent.",
        author: humanAuthor,
      },
    });

    const answeredQuestionId = answeredQuestion.body.data.id;
    const answerResponse = await requestJson(baseUrl, `/questions/${answeredQuestionId}/answers`, {
      method: "POST",
      body: {
        body: "Normalize the Vite alias configuration and rebuild the package.",
        author: agentAuthor,
      },
    });
    await requestJson(baseUrl, `/questions/${answeredQuestionId}/accept/${answerResponse.body.data.answers[0].id}`, {
      method: "POST",
    });

    const response = await requestJson(
      baseUrl,
      "/search/threads?query=vite&limit=5&status=answered",
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.data.strategy, "keyword_v1");
    assert.equal(response.body.data.totalMatches, 1);
    assert.equal(response.body.data.matches[0].question.id, answeredQuestionId);
    assert.deepEqual(response.body.data.matches[0].matchSources.sort(), ["answer", "body"]);

    const fuzzyResponse = await requestJson(
      baseUrl,
      `/search/threads?query=vitte&limit=5`,
    );
    assert.equal(fuzzyResponse.status, 200);
    assert.equal(fuzzyResponse.body.data.matches[0].question.id, fuzzyQuestion.body.data.id);
    assert.ok(fuzzyResponse.body.data.matches[0].matchSources.includes("title"));
  });

  it("validates search query parameters", async () => {
    const baseUrl = await startTestServer();

    const response = await requestJson(baseUrl, "/search/threads?query=&limit=0&status=closed");

    assert.equal(response.status, 400);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error.code, "validation_error");
  });

  it("creates and lists answer-attached skills", async () => {
    const baseUrl = await startTestServer();

    const createQuestionResponse = await requestJson(baseUrl, "/questions", {
      method: "POST",
      body: {
        title: "How should skills attach to answers?",
        body: "Need storage only.",
        author: humanAuthor,
      },
    });

    const questionId = createQuestionResponse.body.data.id;
    const createAnswerResponse = await requestJson(
      baseUrl,
      `/questions/${questionId}/answers`,
      {
        method: "POST",
        body: {
          body: "Store a name plus content or URL.",
          author: agentAuthor,
        },
      },
    );

    const answerId = createAnswerResponse.body.data.answers[0].id;
    const createSkillResponse = await requestJson(
      baseUrl,
      `/questions/${questionId}/answers/${answerId}/skills`,
      {
        method: "POST",
        body: {
          name: "answer-skill",
          content: "{\"kind\":\"skill\"}",
          mimeType: "application/json",
        },
      },
    );

    assert.equal(createSkillResponse.status, 201);
    assert.equal(createSkillResponse.body.data.questionId, questionId);
    assert.equal(createSkillResponse.body.data.answerId, answerId);
    assert.equal(createSkillResponse.body.data.name, "answer-skill");

    const listSkillsResponse = await requestJson(
      baseUrl,
      `/questions/${questionId}/answers/${answerId}/skills`,
    );

    assert.equal(listSkillsResponse.status, 200);
    assert.equal(listSkillsResponse.body.data.length, 1);
    assert.equal(listSkillsResponse.body.data[0].id, createSkillResponse.body.data.id);
  });

  it("validates answer skill payloads", async () => {
    const baseUrl = await startTestServer();

    const createQuestionResponse = await requestJson(baseUrl, "/questions", {
      method: "POST",
      body: {
        title: "Validate answer skills",
        body: "Need clear failures",
        author: humanAuthor,
      },
    });

    const questionId = createQuestionResponse.body.data.id;
    const createAnswerResponse = await requestJson(
      baseUrl,
      `/questions/${questionId}/answers`,
      {
        method: "POST",
        body: {
          body: "Attach later",
          author: agentAuthor,
        },
      },
    );

    const answerId = createAnswerResponse.body.data.answers[0].id;
    const response = await requestJson(
      baseUrl,
      `/questions/${questionId}/answers/${answerId}/skills`,
      {
        method: "POST",
        body: {
          name: "",
          mimeType: "text/plain",
        },
      },
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error.code, "validation_error");
  });

  it("returns answer_not_found for missing answer skill attachments", async () => {
    const baseUrl = await startTestServer();

    const createQuestionResponse = await requestJson(baseUrl, "/questions", {
      method: "POST",
      body: {
        title: "Missing answer check",
        body: "Need skill route errors",
        author: humanAuthor,
      },
    });

    const questionId = createQuestionResponse.body.data.id;
    const response = await requestJson(
      baseUrl,
      `/questions/${questionId}/answers/a-404/skills`,
      {
        method: "GET",
      },
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error.code, "answer_not_found");
  });
});

async function startTestServer(): Promise<string> {
  const server = createServer(createApp(createInMemoryQuestionStore()));
  servers.add(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Expected an address with a numeric port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function requestJson(
  baseUrl: string,
  path: string,
  init?: {
    method?: string;
    body?: unknown;
  },
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
