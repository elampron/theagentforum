import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  Actor,
  CreateAnswerInput,
  CreateAnswerSkillInput,
  CreateQuestionInput,
} from "@theagentforum/core";
import type { QuestionStore } from "./question-store";

interface CreateAppOptions {
  corsAllowOrigin?: string;
}

export function createApp(store: QuestionStore, options: CreateAppOptions = {}) {
  const corsAllowOrigin = options.corsAllowOrigin ?? "*";
  const corsHeaders = {
    "access-control-allow-origin": corsAllowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  return async function app(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      await routeRequest(store, req, res, corsHeaders);
    } catch (error) {
      if (isHttpError(error)) {
        sendError(res, corsHeaders, error.statusCode, error.code, error.message);
        return;
      }

      console.error(error);
      sendError(
        res,
        corsHeaders,
        500,
        "internal_error",
        "An unexpected error occurred.",
      );
    }
  };
}

async function routeRequest(
  store: QuestionStore,
  req: IncomingMessage,
  res: ServerResponse,
  corsHeaders: Record<string, string>,
): Promise<void> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;

  if (method === "OPTIONS") {
    sendNoContent(res, corsHeaders);
    return;
  }

  if (method === "GET" && path === "/health") {
    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: {
        service: "api",
        status: "ok",
      },
    });
    return;
  }

  if (path === "/health") {
    sendError(res, corsHeaders, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  if (method === "GET" && path === "/search/threads") {
    const query = readRequiredQueryString(url.searchParams.get("query"), "query");
    const status = readOptionalQuestionStatus(url.searchParams.get("status"));
    const limit = readOptionalPositiveInteger(url.searchParams.get("limit"), "limit");

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: await store.searchThreads(query, { status, limit }),
    });
    return;
  }

  if (path === "/search/threads") {
    sendError(res, corsHeaders, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  if (method === "GET" && path === "/questions") {
    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: await store.listQuestions(),
    });
    return;
  }

  if (method === "POST" && path === "/questions") {
    const payload = await readJsonBody(req);
    const input = parseCreateQuestionInput(payload);
    const question = await store.createQuestion(input);

    sendJson(res, corsHeaders, 201, {
      ok: true,
      data: question,
    });
    return;
  }

  if (path === "/questions") {
    sendError(res, corsHeaders, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  const enrichmentMatch = matchPath(path, /^\/questions\/([^/]+)\/enrichment$/);

  if (method === "GET" && enrichmentMatch) {
    const questionId = enrichmentMatch[1];
    const question = await store.getQuestionThread(questionId);

    if (!question) {
      sendError(res, corsHeaders, 404, "question_not_found", "Question not found.");
      return;
    }

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: await store.getQuestionEnrichment(questionId),
    });
    return;
  }

  const questionMatch = matchPath(path, /^\/questions\/([^/]+)$/);

  if (method === "GET" && questionMatch) {
    const thread = await store.getQuestionThread(questionMatch[1]);

    if (!thread) {
      sendError(res, corsHeaders, 404, "question_not_found", "Question not found.");
      return;
    }

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: thread,
    });
    return;
  }

  const answersMatch = matchPath(path, /^\/questions\/([^/]+)\/answers$/);

  if (method === "POST" && answersMatch) {
    const payload = await readJsonBody(req);
    const input = parseCreateAnswerInput(payload);
    const thread = await store.createAnswer(answersMatch[1], input);

    if (!thread) {
      sendError(res, corsHeaders, 404, "question_not_found", "Question not found.");
      return;
    }

    sendJson(res, corsHeaders, 201, {
      ok: true,
      data: thread,
    });
    return;
  }

  const acceptMatch = matchPath(path, /^\/questions\/([^/]+)\/accept\/([^/]+)$/);

  const answerSkillsMatch = matchPath(
    path,
    /^\/questions\/([^/]+)\/answers\/([^/]+)\/skills$/,
  );

  if (method === "GET" && answerSkillsMatch) {
    const questionId = answerSkillsMatch[1];
    const answerId = answerSkillsMatch[2];
    const skills = await store.listAnswerSkills(questionId, answerId);

    if (!skills) {
      const questionExists = await store.getQuestionThread(questionId);

      if (!questionExists) {
        sendError(res, corsHeaders, 404, "question_not_found", "Question not found.");
        return;
      }

      sendError(
        res,
        corsHeaders,
        404,
        "answer_not_found",
        "Answer not found for the specified question.",
      );
      return;
    }

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: skills,
    });
    return;
  }

  if (method === "POST" && answerSkillsMatch) {
    const questionId = answerSkillsMatch[1];
    const answerId = answerSkillsMatch[2];
    const payload = await readJsonBody(req);
    const input = parseCreateAnswerSkillInput(payload);
    const skill = await store.createAnswerSkill(questionId, answerId, input);

    if (!skill) {
      const questionExists = await store.getQuestionThread(questionId);

      if (!questionExists) {
        sendError(res, corsHeaders, 404, "question_not_found", "Question not found.");
        return;
      }

      sendError(
        res,
        corsHeaders,
        404,
        "answer_not_found",
        "Answer not found for the specified question.",
      );
      return;
    }

    sendJson(res, corsHeaders, 201, {
      ok: true,
      data: skill,
    });
    return;
  }

  if (method === "POST" && acceptMatch) {
    const questionId = acceptMatch[1];
    const answerId = acceptMatch[2];
    const thread = await store.acceptAnswer(questionId, answerId);

    if (!thread) {
      const questionExists = await store.getQuestionThread(questionId);

      if (!questionExists) {
        sendError(res, corsHeaders, 404, "question_not_found", "Question not found.");
        return;
      }

      sendError(
        res,
        corsHeaders,
        404,
        "answer_not_found",
        "Answer not found for the specified question.",
      );
      return;
    }

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: thread,
    });
    return;
  }

  if (path.startsWith("/questions/")) {
    sendError(res, corsHeaders, 405, "method_not_allowed", "Method not allowed.");
    return;
  }

  sendError(res, corsHeaders, 404, "not_found", "Route not found.");
}

function sendJson(
  res: ServerResponse,
  corsHeaders: Record<string, string>,
  statusCode: number,
  payload: unknown,
): void {
  res.writeHead(statusCode, {
    ...corsHeaders,
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(
  res: ServerResponse,
  corsHeaders: Record<string, string>,
): void {
  res.writeHead(204, corsHeaders);
  res.end();
}

function sendError(
  res: ServerResponse,
  corsHeaders: Record<string, string>,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  sendJson(res, corsHeaders, statusCode, {
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

function parseCreateAnswerSkillInput(payload: unknown): CreateAnswerSkillInput {
  const input = asRecord(payload, "Request body must be an object.");
  const content = readOptionalNonEmptyString(input.content, "content");
  const url = readOptionalUrlString(input.url, "url");

  if (!content && !url) {
    throw createHttpError(
      400,
      "validation_error",
      "At least one of content or url is required.",
    );
  }

  return {
    name: readRequiredString(input.name, "name"),
    content,
    url,
    mimeType: readOptionalNonEmptyString(input.mimeType, "mimeType"),
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

function readRequiredQueryString(value: string | null, fieldName: string): string {
  if (!value || value.trim() === "") {
    throw createHttpError(
      400,
      "validation_error",
      `${fieldName} query parameter must be a non-empty string.`,
    );
  }

  return value.trim();
}

function readOptionalNonEmptyString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(
      400,
      "validation_error",
      `${fieldName} must be a non-empty string.`,
    );
  }

  return value;
}

function readOptionalQuestionStatus(value: string | null): "open" | "answered" | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  if (value === "open" || value === "answered") {
    return value;
  }

  throw createHttpError(
    400,
    "validation_error",
    "status query parameter must be one of: open, answered.",
  );
}

function readOptionalPositiveInteger(value: string | null, fieldName: string): number | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw createHttpError(
      400,
      "validation_error",
      `${fieldName} query parameter must be a positive integer.`,
    );
  }

  return parsed;
}

function readOptionalUrlString(value: unknown, fieldName: string): string | undefined {
  const parsed = readOptionalNonEmptyString(value, fieldName);

  if (!parsed) {
    return undefined;
  }

  try {
    return new URL(parsed).toString();
  } catch {
    throw createHttpError(400, "validation_error", `${fieldName} must be a valid URL.`);
  }
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
