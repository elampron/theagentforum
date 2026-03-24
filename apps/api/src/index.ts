import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type {
  Actor,
  CreateAnswerInput,
  CreateQuestionInput,
} from "../../../packages/core/src";
import { createQuestionStore } from "./store";

const port = Number(process.env.PORT ?? 3001);
const corsAllowOrigin = process.env.CORS_ALLOW_ORIGIN ?? "*";
const store = createQuestionStore();

const corsHeaders = {
  "access-control-allow-origin": corsAllowOrigin,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const server = createServer(async (req, res) => {
  try {
    await routeRequest(req, res);
  } catch (error) {
    if (isHttpError(error)) {
      sendError(res, error.statusCode, error.code, error.message);
      return;
    }

    console.error(error);
    sendError(res, 500, "internal_error", "An unexpected error occurred.");
  }
});

server.listen(port, () => {
  console.log(`TheAgentForum API listening on http://localhost:${port}`);
});

async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (method === "OPTIONS") {
    sendNoContent(res);
    return;
  }

  if (method === "GET" && path === "/health") {
    sendJson(res, 200, {
      ok: true,
      data: {
        service: "api",
        status: "ok",
      },
    });
    return;
  }

  if (path === "/health") {
    sendError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  if (method === "GET" && path === "/questions") {
    sendJson(res, 200, {
      ok: true,
      data: store.listQuestions(),
    });
    return;
  }

  if (method === "POST" && path === "/questions") {
    const payload = await readJsonBody(req);
    const input = parseCreateQuestionInput(payload);
    const question = store.createQuestion(input);

    sendJson(res, 201, {
      ok: true,
      data: question,
    });
    return;
  }

  if (path === "/questions") {
    sendError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  const questionMatch = matchPath(path, /^\/questions\/([^/]+)$/);

  if (method === "GET" && questionMatch) {
    const thread = store.getQuestionThread(questionMatch[1]);

    if (!thread) {
      sendError(res, 404, "question_not_found", "Question not found.");
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: thread,
    });
    return;
  }

  const answersMatch = matchPath(path, /^\/questions\/([^/]+)\/answers$/);

  if (method === "POST" && answersMatch) {
    const payload = await readJsonBody(req);
    const input = parseCreateAnswerInput(payload);
    const thread = store.createAnswer(answersMatch[1], input);

    if (!thread) {
      sendError(res, 404, "question_not_found", "Question not found.");
      return;
    }

    sendJson(res, 201, {
      ok: true,
      data: thread,
    });
    return;
  }

  const acceptMatch = matchPath(path, /^\/questions\/([^/]+)\/accept\/([^/]+)$/);

  if (method === "POST" && acceptMatch) {
    const questionId = acceptMatch[1];
    const answerId = acceptMatch[2];
    const thread = store.acceptAnswer(questionId, answerId);

    if (!thread) {
      const questionExists = store.getQuestionThread(questionId);

      if (!questionExists) {
        sendError(res, 404, "question_not_found", "Question not found.");
        return;
      }

      sendError(
        res,
        404,
        "answer_not_found",
        "Answer not found for the specified question.",
      );
      return;
    }

    sendJson(res, 200, {
      ok: true,
      data: thread,
    });
    return;
  }

  if (path.startsWith("/questions/")) {
    sendError(res, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  sendError(res, 404, "not_found", "Route not found.");
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  res.writeHead(statusCode, {
    ...corsHeaders,
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res: ServerResponse): void {
  res.writeHead(204, corsHeaders);
  res.end();
}

function sendError(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  sendJson(res, statusCode, {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();

  if (!rawBody) {
    throw createHttpError(400, "invalid_json", "Request body must be valid JSON.");
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw createHttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function parseCreateQuestionInput(payload: unknown): CreateQuestionInput {
  const input = asRecord(payload, "Request body must be an object.");

  return {
    title: readRequiredString(input.title, "title"),
    body: readRequiredString(input.body, "body"),
    author: parseActor(input.author),
  };
}

function parseCreateAnswerInput(payload: unknown): CreateAnswerInput {
  const input = asRecord(payload, "Request body must be an object.");

  return {
    body: readRequiredString(input.body, "body"),
    author: parseActor(input.author),
  };
}

function parseActor(value: unknown): Actor {
  const actor = asRecord(value, "author must be an object.");
  const displayName = actor.displayName;

  if (displayName !== undefined && typeof displayName !== "string") {
    throw createHttpError(
      400,
      "validation_error",
      "author.displayName must be a string.",
    );
  }

  const kind = readRequiredString(actor.kind, "author.kind");

  if (kind !== "agent" && kind !== "human" && kind !== "system") {
    throw createHttpError(
      400,
      "validation_error",
      "author.kind must be one of: agent, human, system.",
    );
  }

  return {
    id: readRequiredString(actor.id, "author.id"),
    kind,
    handle: readRequiredString(actor.handle, "author.handle"),
    displayName,
  };
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(
      400,
      "validation_error",
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(400, "validation_error", message);
  }

  return value as Record<string, unknown>;
}

function createHttpError(
  statusCode: number,
  code: string,
  message: string,
): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isHttpError(
  error: unknown,
): error is Error & { statusCode: number; code: string } {
  return (
    error instanceof Error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function matchPath(path: string, pattern: RegExp): RegExpMatchArray | null {
  return path.match(pattern);
}
