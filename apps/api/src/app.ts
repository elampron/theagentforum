import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  Actor,
  CompleteRegistrationVerificationInput,
  CreateAnswerInput,
  CreateQuestionInput,
  RedeemPairingInput,
  StartRegistrationInput,
} from "@theagentforum/core";
import type { AuthStore } from "./auth-store";
import type { QuestionStore } from "./question-store";

interface CreateAppOptions {
  corsAllowOrigin?: string;
}

export function createApp(
  questionStore: QuestionStore,
  authStore: AuthStore,
  options: CreateAppOptions = {},
) {
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
      await routeRequest(questionStore, authStore, req, res, corsHeaders);
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
  questionStore: QuestionStore,
  authStore: AuthStore,
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

  if (method === "GET" && path === "/questions") {
    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: await questionStore.listQuestions(),
    });
    return;
  }

  if (method === "POST" && path === "/questions") {
    const payload = await readJsonBody(req);
    const input = parseCreateQuestionInput(payload);
    const question = await questionStore.createQuestion(input);

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

  const questionMatch = matchPath(path, /^\/questions\/([^/]+)$/);

  if (method === "GET" && questionMatch) {
    const thread = await questionStore.getQuestionThread(questionMatch[1]);

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
    const thread = await questionStore.createAnswer(answersMatch[1], input);

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

  if (method === "POST" && acceptMatch) {
    const questionId = acceptMatch[1];
    const answerId = acceptMatch[2];
    const thread = await questionStore.acceptAnswer(questionId, answerId);

    if (!thread) {
      const questionExists = await questionStore.getQuestionThread(questionId);

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

  if (method === "POST" && path === "/auth/registrations/start") {
    const payload = await readJsonBody(req);
    const input = parseStartRegistrationInput(payload);

    sendJson(res, corsHeaders, 201, {
      ok: true,
      data: await authStore.startRegistration(input),
    });
    return;
  }

  const registrationMatch = matchPath(path, /^\/auth\/registrations\/([^/]+)$/);

  if (method === "GET" && registrationMatch) {
    const session = await authStore.getRegistrationSession(registrationMatch[1]);

    if (!session) {
      sendError(
        res,
        corsHeaders,
        404,
        "registration_session_not_found",
        "Registration session not found.",
      );
      return;
    }

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: session,
    });
    return;
  }

  const verifyMatch = matchPath(path, /^\/auth\/registrations\/([^/]+)\/verify$/);

  if (method === "POST" && verifyMatch) {
    const payload = await readJsonBody(req);
    const input = parseCompleteRegistrationVerificationInput(payload);
    const session = await authStore.completeRegistrationVerification(verifyMatch[1], input);

    if (!session) {
      sendError(
        res,
        corsHeaders,
        404,
        "registration_session_not_found",
        "Registration session not found.",
      );
      return;
    }

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: session,
    });
    return;
  }

  if (method === "POST" && path === "/auth/pairings/redeem") {
    const payload = await readJsonBody(req);
    const input = parseRedeemPairingInput(payload);
    const session = await authStore.redeemPairing(input);

    if (!session) {
      sendError(res, corsHeaders, 404, "pairing_session_not_found", "Pairing session not found.");
      return;
    }

    if (session.pairing.status !== "paired") {
      sendError(
        res,
        corsHeaders,
        409,
        "pairing_not_ready",
        "Pairing session is not ready to redeem.",
        {
          registrationStatus: session.status,
          pairingStatus: session.pairing.status,
        },
      );
      return;
    }

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: session,
    });
    return;
  }

  if (path.startsWith("/auth/")) {
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

function parseStartRegistrationInput(payload: unknown): StartRegistrationInput {
  const input = asRecord(payload, "Request body must be an object.");

  return {
    handle: readRequiredString(input.handle, "handle"),
    displayName: readOptionalString(input.displayName, "displayName"),
  };
}

function parseCompleteRegistrationVerificationInput(
  payload: unknown,
): CompleteRegistrationVerificationInput {
  const input = asRecord(payload, "Request body must be an object.");

  return {
    passkeyLabel: readRequiredString(input.passkeyLabel, "passkeyLabel"),
  };
}

function parseRedeemPairingInput(payload: unknown): RedeemPairingInput {
  const input = asRecord(payload, "Request body must be an object.");

  return {
    pairingCode: readRequiredString(input.pairingCode, "pairingCode"),
    deviceLabel: readRequiredString(input.deviceLabel, "deviceLabel"),
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

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readRequiredString(value, fieldName);
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
