import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Actor } from "@theagentforum/core";
import { TafApiClientError } from "./api-client.js";
import { createToolHandlers } from "./tool-handlers.js";

const defaultAuthor: Actor = {
  id: "mcp-agent-1",
  kind: "agent",
  handle: "taf-mcp",
  displayName: "TAF MCP",
};

describe("createToolHandlers", () => {
  it("creates a question with default author when no author is provided", async () => {
    let observedAuthor: Actor | undefined;

    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async (input) => {
          observedAuthor = input.author;

          return {
            id: "q-1",
            title: input.title,
            body: input.body,
            author: input.author,
            status: "open",
            createdAt: "2026-03-26T00:00:00.000Z",
          };
        },
        listQuestions: async () => [],
        getThread: async () => {
          throw new Error("not used");
        },
        answer: async () => {
          throw new Error("not used");
        },
        accept: async () => {
          throw new Error("not used");
        },
        attachSkill: async () => {
          throw new Error("not used");
        },
      },
    });

    const result = await handlers.ask({
      title: "How do I add MCP support?",
      body: "Need a practical rollout.",
    });

    assert.equal(result.ok, true);
    assert.equal(observedAuthor?.id, defaultAuthor.id);

    if (result.ok) {
      const payload = result as any;
      assert.equal(payload.meta.route, "POST /questions");
      assert.equal(payload.data.id, "q-1");
    }
  });

  it("searches via list-and-filter fallback", async () => {
    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => {
          throw new Error("not used");
        },
        listQuestions: async () => [
          {
            id: "q-1",
            title: "How to keep MCP tools stable",
            body: "Need typed schemas for request and response.",
            author: defaultAuthor,
            status: "open",
            createdAt: "2026-03-26T00:00:00.000Z",
          },
          {
            id: "q-2",
            title: "Deploy tips",
            body: "Docker and compose notes",
            author: defaultAuthor,
            status: "open",
            createdAt: "2026-03-25T00:00:00.000Z",
          },
        ],
        getThread: async () => {
          throw new Error("not used");
        },
        answer: async () => {
          throw new Error("not used");
        },
        accept: async () => {
          throw new Error("not used");
        },
        attachSkill: async () => {
          throw new Error("not used");
        },
      },
    });

    const result = await handlers.search({
      query: "typed schemas",
      limit: 5,
    });

    assert.equal(result.ok, true);

    if (result.ok) {
      const payload = result as any;
      assert.equal(payload.meta.fallback, "list_and_filter");
      assert.equal(payload.data.returned, 1);
      assert.equal(payload.data.matches[0].question.id, "q-1");
    }
  });

  it("maps API not-found errors to MCP not_found category", async () => {
    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => {
          throw new Error("not used");
        },
        listQuestions: async () => [],
        getThread: async () => {
          throw new Error("not used");
        },
        answer: async () => {
          throw new TafApiClientError({
            message: "Question not found.",
            statusCode: 404,
            code: "question_not_found",
          });
        },
        accept: async () => {
          throw new Error("not used");
        },
        attachSkill: async () => {
          throw new Error("not used");
        },
      },
    });

    const result = await handlers.answer({
      questionId: "q-404",
      body: "Try this approach",
    });

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.error.category, "not_found");
      assert.equal(result.error.code, "question_not_found");
      assert.equal(result.error.statusCode, 404);
    }
  });

  it("returns validation_error for invalid search input", async () => {
    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => {
          throw new Error("not used");
        },
        listQuestions: async () => [],
        getThread: async () => {
          throw new Error("not used");
        },
        answer: async () => {
          throw new Error("not used");
        },
        accept: async () => {
          throw new Error("not used");
        },
        attachSkill: async () => {
          throw new Error("not used");
        },
      },
    });

    const result = await handlers.search({
      query: "",
    });

    assert.equal(result.ok, false);

    if (!result.ok) {
      assert.equal(result.error.category, "validation_error");
      assert.equal(result.error.code, "invalid_arguments");
    }
  });

  it("attaches a skill through the API client", async () => {
    let observedInput:
      | {
          questionId: string;
          answerId: string;
          name: string;
          content?: string;
          url?: string;
          mimeType?: string;
        }
      | undefined;

    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => {
          throw new Error("not used");
        },
        listQuestions: async () => [],
        getThread: async () => {
          throw new Error("not used");
        },
        answer: async () => {
          throw new Error("not used");
        },
        accept: async () => {
          throw new Error("not used");
        },
        attachSkill: async (questionId, answerId, input) => {
          observedInput = {
            questionId,
            answerId,
            ...input,
          };

          return {
            id: "sk-1",
            questionId,
            answerId,
            name: input.name,
            content: input.content,
            url: input.url,
            mimeType: input.mimeType,
            createdAt: "2026-03-26T00:00:00.000Z",
          };
        },
      },
    });

    const result = await handlers.attachSkill({
      questionId: "q-1",
      answerId: "a-1",
      name: "memory-cleanup",
      content: "# Skill",
      mimeType: "text/markdown",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(observedInput, {
      questionId: "q-1",
      answerId: "a-1",
      name: "memory-cleanup",
      content: "# Skill",
      mimeType: "text/markdown",
    });

    if (result.ok) {
      assert.equal(result.meta.route, "POST /questions/:questionId/answers/:answerId/skills");
      assert.equal(result.data.id, "sk-1");
    }
  });
});
