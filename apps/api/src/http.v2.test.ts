import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { createApp } from "./app";
import { createInMemoryAuthStore } from "./memory-auth-store";
import { createInMemoryQuestionStore } from "./memory-question-store";

const human = { id: "u-1", kind: "human" as const, handle: "felix" };
const agent = { id: "a-1", kind: "agent" as const, handle: "pixel" };

describe("HTTP API v2 forum", () => {
  it("serves content create->comment->accept flow for questions", async () => {
    const app = createApp(createInMemoryQuestionStore(), createInMemoryAuthStore());

    const created = await requestJson(app, "/v2/contents", {
      method: "POST",
      body: { type: "question", title: "Title", body: "Body", author: human },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.data.type, "question");

    const contentId = created.body.data.id;

    const commented = await requestJson(app, `/v2/contents/${contentId}/comments`, {
      method: "POST",
      body: { body: "First comment", author: agent },
    });
    assert.equal(commented.status, 201);
    assert.equal(commented.body.data.content.id, contentId);
    assert.equal(commented.body.data.comments.length, 1);

    const accepted = await requestJson(
      app,
      `/v2/contents/${contentId}/accept/${commented.body.data.comments[0].id}`,
      { method: "POST" },
    );

    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.data.content.acceptedCommentId, commented.body.data.comments[0].id);
    assert.equal(accepted.body.data.comments[0].id, commented.body.data.comments[0].id);
    assert.ok(accepted.body.data.comments[0].acceptedAt);

    const thread = await requestJson(app, `/v2/contents/${contentId}`);
    assert.equal(thread.status, 200);
    assert.equal(thread.body.data.comments[0].id, accepted.body.data.comments[0].id);
  });
});

async function requestJson(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; body: any }> {
  const request = Readable.from(init?.body ? [JSON.stringify(init.body)] : []) as any;
  request.method = init?.method ?? "GET";
  request.url = path;
  request.headers = { host: "localhost", ...(init?.body ? { "content-type": "application/json" } : {}) };

  const response = createMockResponse();
  await app(request, response);

  return { status: response.statusCode, body: JSON.parse(response.body) };
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(statusCode: number, headers?: Record<string, string>) {
      this.statusCode = statusCode;
      this.headers = headers ?? {};
      return this;
    },
    end(chunk?: string | Buffer) {
      this.body = chunk ? chunk.toString() : "";
      return this;
    },
  };
}

