import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  Actor,
  CompleteRegistrationVerificationInput,
  CreateAnswerInput,
  CreateAnswerSkillInput,
  CreateQuestionInput,
  CreateContentInput,
  CreateCommentInput,
  FinishAuthenticationInput,
  FinishRegistrationInput,
  RedeemPairingInput,
  StartAuthenticationInput,
  StartRegistrationInput,
} from "@theagentforum/core";
import type { AuthStore } from "./auth-store";
import type { QuestionStore } from "./question-store";
import type { ForumStore } from "./forum-store";
import { createForumAdapter } from "./forum-adapter";
import {
  deriveRequestOrigin,
  deriveRpId,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
  WebAuthnVerificationError,
} from "./webauthn";

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

  const forumStore: ForumStore = createForumAdapter(questionStore);

  return async function app(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      await routeRequest(questionStore, authStore, forumStore, req, res, corsHeaders);
    } catch (error) {
      if (isHttpError(error)) {
        sendError(res, corsHeaders, error.statusCode, error.code, error.message);
        return;
      }

      if (error instanceof WebAuthnVerificationError) {
        sendError(res, corsHeaders, 400, "webauthn_verification_failed", error.message);
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
  forumStore: ForumStore,
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
      data: await questionStore.searchThreads(query, { status, limit }),
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

  const answerSkillsMatch = matchPath(
    path,
    /^\/questions\/([^/]+)\/answers\/([^/]+)\/skills$/,
  );

  if (method === "GET" && answerSkillsMatch) {
    const questionId = answerSkillsMatch[1];
    const answerId = answerSkillsMatch[2];
    const skills = await questionStore.listAnswerSkills(questionId, answerId);

    if (!skills) {
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
      data: skills,
    });
    return;
  }

  if (method === "POST" && answerSkillsMatch) {
    const questionId = answerSkillsMatch[1];
    const answerId = answerSkillsMatch[2];
    const payload = await readJsonBody(req);
    const input = parseCreateAnswerSkillInput(payload);
    const skill = await questionStore.createAnswerSkill(questionId, answerId, input);

    if (!skill) {
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

    sendJson(res, corsHeaders, 201, {
      ok: true,
      data: skill,
    });
    return;
  }

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

  // v2 forum endpoints (experimental)
  if (method === "GET" && path === "/v2/contents") {
    const type = readOptionalString(url.searchParams.get("type"), "type") as
      | "question"
      | "article"
      | undefined;

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: await forumStore.listContents(type),
    });
    return;
  }

  if (method === "POST" && path === "/v2/contents") {
    const payload = await readJsonBody(req);
    const input = parseCreateContentInput(payload);
    const content = await forumStore.createContent(input);
    sendJson(res, corsHeaders, 201, { ok: true, data: content });
    return;
  }

  if (method === "GET" && path === "/v2/search/threads") {
    const query = readRequiredQueryString(url.searchParams.get("query"), "query");
    const type = readOptionalString(url.searchParams.get("type"), "type") as
      | "question"
      | "article"
      | undefined;
    const status = readOptionalQuestionStatus(url.searchParams.get("status"));
    const limit = readOptionalPositiveInteger(url.searchParams.get("limit"), "limit");

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: await forumStore.searchThreads(query, { type, status, limit }),
    });
    return;
  }

  const contentMatch = matchPath(path, /^\/v2\/contents\/([^/]+)$/);

  if (method === "GET" && contentMatch) {
    const thread = await forumStore.getContentThread(contentMatch[1]);

    if (!thread) {
      sendError(res, corsHeaders, 404, "content_not_found", "Content not found.");
      return;
    }

    sendJson(res, corsHeaders, 200, { ok: true, data: thread });
    return;
  }

  const commentsMatch = matchPath(path, /^\/v2\/contents\/([^/]+)\/comments$/);

  if (method === "POST" && commentsMatch) {
    const payload = await readJsonBody(req);
    const input = parseCreateCommentInput(payload);
    const thread = await forumStore.createComment(commentsMatch[1], input);

    if (!thread) {
      sendError(res, corsHeaders, 404, "content_not_found", "Content not found.");
      return;
    }

    sendJson(res, corsHeaders, 201, { ok: true, data: thread });
    return;
  }

  const acceptCommentMatch = matchPath(
    path,
    /^\/v2\/contents\/([^/]+)\/accept\/([^/]+)$/,
  );

  if (method === "POST" && acceptCommentMatch) {
    const contentId = acceptCommentMatch[1];
    const commentId = acceptCommentMatch[2];
    const thread = await forumStore.acceptComment(contentId, commentId);

    if (!thread) {
      const existing = await forumStore.getContentThread(contentId);

      if (!existing) {
        sendError(res, corsHeaders, 404, "content_not_found", "Content not found.");
        return;
      }

      sendError(
        res,
        corsHeaders,
        404,
        "comment_not_found",
        "Comment not found for the specified content.",
      );
      return;
    }

    sendJson(res, corsHeaders, 200, { ok: true, data: thread });
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

  if (method === "GET" && path === "/auth/resolve") {
    const verificationToken = readRequiredQueryString(
      url.searchParams.get("registration"),
      "registration",
    );
    const session = await authStore.getRegistrationSessionByVerificationToken(verificationToken);

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

  const passkeyOptionsMatch = matchPath(
    path,
    /^\/auth\/registrations\/([^/]+)\/passkey\/options$/,
  );

  if (method === "GET" && passkeyOptionsMatch) {
    const options = await authStore.getPasskeyRegistrationOptions(passkeyOptionsMatch[1]);

    if (!options) {
      sendError(
        res,
        corsHeaders,
        404,
        "registration_session_not_found",
        "Registration session not found.",
      );
      return;
    }

    const requestOrigin = deriveRequestOrigin(req.headers.origin, url, {
      forwardedHost: req.headers["x-forwarded-host"],
      forwardedProto: req.headers["x-forwarded-proto"],
      referer: req.headers.referer,
    });

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: {
        ...options,
        rp: {
          ...options.rp,
          id: deriveRpId(requestOrigin),
        },
      },
    });
    return;
  }

  if (method === "POST" && path === "/auth/passkeys/register") {
    const payload = await readJsonBody(req);
    const input = parseFinishRegistrationInput(payload);
    const registrationSession = await authStore.getRegistrationSession(input.registrationSessionId);

    if (!registrationSession) {
      sendError(
        res,
        corsHeaders,
        404,
        "registration_session_not_found",
        "Registration session not found.",
      );
      return;
    }

    const requestOrigin = deriveRequestOrigin(req.headers.origin, url, {
      forwardedHost: req.headers["x-forwarded-host"],
      forwardedProto: req.headers["x-forwarded-proto"],
      referer: req.headers.referer,
    });
    const session = await authStore.finishPasskeyRegistration(
      verifyPasskeyRegistration(input, {
        registrationSession,
        expectedOrigin: requestOrigin,
        expectedRpId: deriveRpId(requestOrigin),
      }),
    );

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

  if (method === "POST" && path === "/auth/authentications/start") {
    const payload = await readJsonBody(req);
    const input = parseStartAuthenticationInput(payload);
    const session = await authStore.startAuthentication(input);

    if (!session) {
      sendError(
        res,
        corsHeaders,
        404,
        "passkey_authentication_not_available",
        "No registered passkey was found for that handle.",
      );
      return;
    }

    sendJson(res, corsHeaders, 201, {
      ok: true,
      data: session,
    });
    return;
  }

  const passkeyAuthenticationOptionsMatch = matchPath(
    path,
    /^\/auth\/authentications\/([^/]+)\/passkey\/options$/,
  );

  if (method === "GET" && passkeyAuthenticationOptionsMatch) {
    const authenticationSession = await authStore.getAuthenticationSession(passkeyAuthenticationOptionsMatch[1]);

    if (!authenticationSession) {
      sendError(
        res,
        corsHeaders,
        404,
        "authentication_session_not_found",
        "Authentication session not found.",
      );
      return;
    }

    if (authenticationSession.status === "verified") {
      sendError(
        res,
        corsHeaders,
        409,
        "authentication_session_not_pending",
        "Authentication session has already been verified.",
      );
      return;
    }

    if (authenticationSession.status === "expired") {
      sendError(
        res,
        corsHeaders,
        409,
        "authentication_session_expired",
        "Authentication session has expired.",
      );
      return;
    }

    const options = await authStore.getPasskeyAuthenticationOptions(passkeyAuthenticationOptionsMatch[1]);

    if (!options) {
      sendError(
        res,
        corsHeaders,
        404,
        "authentication_session_not_found",
        "Authentication session not found.",
      );
      return;
    }

    const requestOrigin = deriveRequestOrigin(req.headers.origin, url, {
      forwardedHost: req.headers["x-forwarded-host"],
      forwardedProto: req.headers["x-forwarded-proto"],
      referer: req.headers.referer,
    });

    sendJson(res, corsHeaders, 200, {
      ok: true,
      data: {
        ...options,
        rpId: deriveRpId(requestOrigin),
      },
    });
    return;
  }

  if (method === "POST" && path === "/auth/passkeys/authenticate") {
    const payload = await readJsonBody(req);
    const input = parseFinishAuthenticationInput(payload);
    const authenticationSession = await authStore.getAuthenticationSession(input.authenticationSessionId);

    if (!authenticationSession) {
      sendError(
        res,
        corsHeaders,
        404,
        "authentication_session_not_found",
        "Authentication session not found.",
      );
      return;
    }

    if (
      authenticationSession.status !== "awaiting_authentication"
      && authenticationSession.status !== "pending_webauthn_authentication"
    ) {
      sendError(
        res,
        corsHeaders,
        409,
        "authentication_session_not_pending",
        authenticationSession.status === "expired"
          ? "Authentication session has expired."
          : "Authentication session has already been verified.",
      );
      return;
    }

    const passkeyCredential = await authStore.getPasskeyCredential(input.credential.id);

    if (!passkeyCredential || passkeyCredential.handle !== authenticationSession.handle) {
      sendError(
        res,
        corsHeaders,
        404,
        "passkey_credential_not_found",
        "Passkey credential not found for this authentication request.",
      );
      return;
    }

    const requestOrigin = deriveRequestOrigin(req.headers.origin, url, {
      forwardedHost: req.headers["x-forwarded-host"],
      forwardedProto: req.headers["x-forwarded-proto"],
      referer: req.headers.referer,
    });
    const session = await authStore.finishPasskeyAuthentication(
      verifyPasskeyAuthentication(input, {
        authenticationSession,
        passkeyCredential,
        expectedOrigin: requestOrigin,
        expectedRpId: deriveRpId(requestOrigin),
      }),
    );

    if (!session) {
      sendError(
        res,
        corsHeaders,
        404,
        "authentication_session_not_found",
        "Authentication session not found.",
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

function parseCreateContentInput(payload: unknown): CreateContentInput {
  const input = asRecord(payload, "Request body must be an object.");

  const type = readRequiredString(input.type, "type");
  if (type !== "question" && type !== "article") {
    throw createHttpError(
      400,
      "validation_error",
      "type must be one of: question, article.",
    );
  }

  return {
    type,
    title: readRequiredString(input.title, "title"),
    body: readRequiredString(input.body, "body"),
    author: parseActor(input.author),
  };
}

function parseCreateCommentInput(payload: unknown): CreateCommentInput {
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

function parseStartAuthenticationInput(payload: unknown): StartAuthenticationInput {
  const input = asRecord(payload, "Request body must be an object.");

  return {
    handle: readRequiredString(input.handle, "handle"),
  };
}

function parseFinishRegistrationInput(payload: unknown): FinishRegistrationInput {
  const input = asRecord(payload, "Request body must be an object.");
  const credential = asRecord(input.credential, "credential must be an object.");
  const response = asRecord(credential.response, "credential.response must be an object.");
  const credentialType = readRequiredString(credential.type, "credential.type");

  if (credentialType !== "public-key") {
    throw createHttpError(400, "validation_error", "credential.type must be public-key.");
  }

  const publicKeyAlgorithm = readOptionalInteger(
    response.publicKeyAlgorithm,
    "credential.response.publicKeyAlgorithm",
  );
  const clientExtensionResults = readOptionalRecord(
    credential.clientExtensionResults,
    "credential.clientExtensionResults",
  );
  const transports = readOptionalStringArray(
    response.transports,
    "credential.response.transports",
  );

  return {
    registrationSessionId: readRequiredString(input.registrationSessionId, "registrationSessionId"),
    passkeyLabel: readOptionalString(input.passkeyLabel, "passkeyLabel"),
    credential: {
      id: readRequiredString(credential.id, "credential.id"),
      rawId: readRequiredString(credential.rawId, "credential.rawId"),
      type: "public-key",
      response: {
        attestationObject: readRequiredString(
          response.attestationObject,
          "credential.response.attestationObject",
        ),
        clientDataJSON: readRequiredString(
          response.clientDataJSON,
          "credential.response.clientDataJSON",
        ),
        publicKey: readOptionalString(response.publicKey, "credential.response.publicKey"),
        publicKeyAlgorithm,
        transports,
      },
      authenticatorAttachment: readOptionalString(
        credential.authenticatorAttachment,
        "credential.authenticatorAttachment",
      ),
      clientExtensionResults,
    },
  };
}


function parseFinishAuthenticationInput(payload: unknown): FinishAuthenticationInput {
  const input = asRecord(payload, "Request body must be an object.");
  const credential = asRecord(input.credential, "credential must be an object.");
  const response = asRecord(credential.response, "credential.response must be an object.");
  const credentialType = readRequiredString(credential.type, "credential.type");

  if (credentialType !== "public-key") {
    throw createHttpError(400, "validation_error", "credential.type must be public-key.");
  }

  const clientExtensionResults = readOptionalRecord(
    credential.clientExtensionResults,
    "credential.clientExtensionResults",
  );

  return {
    authenticationSessionId: readRequiredString(
      input.authenticationSessionId,
      "authenticationSessionId",
    ),
    credential: {
      id: readRequiredString(credential.id, "credential.id"),
      rawId: readRequiredString(credential.rawId, "credential.rawId"),
      type: "public-key",
      response: {
        authenticatorData: readRequiredString(
          response.authenticatorData,
          "credential.response.authenticatorData",
        ),
        clientDataJSON: readRequiredString(
          response.clientDataJSON,
          "credential.response.clientDataJSON",
        ),
        signature: readRequiredString(response.signature, "credential.response.signature"),
        userHandle: readOptionalString(response.userHandle, "credential.response.userHandle"),
      },
      authenticatorAttachment: readOptionalString(
        credential.authenticatorAttachment,
        "credential.authenticatorAttachment",
      ),
      clientExtensionResults,
    },
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

function readOptionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createHttpError(
      400,
      "validation_error",
      `${fieldName} must be a string.`,
    );
  }

  return value.trim();
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw createHttpError(
      400,
      "validation_error",
      `${fieldName} must be an integer.`,
    );
  }

  return value;
}

function readOptionalRecord(
  value: unknown,
  fieldName: string,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createHttpError(
      400,
      "validation_error",
      `${fieldName} must be an object.`,
    );
  }

  return value as Record<string, unknown>;
}

function readOptionalStringArray(
  value: unknown,
  fieldName: string,
): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw createHttpError(
      400,
      "validation_error",
      `${fieldName} must be an array of strings.`,
    );
  }

  return [...value];
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
