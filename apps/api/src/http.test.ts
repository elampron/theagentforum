import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { createApp } from "./app";
import { createInMemoryAuthStore } from "./memory-auth-store";
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

describe("HTTP API", () => {
  it("serves the full question -> answer -> accept flow", async () => {
    const app = createTestApp();
    const pairing = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      body: {
        handle: "felix796",
        displayName: "Felix",
      },
    });
    const registrationId = pairing.body.data.id;
    const pairingCode = pairing.body.data.pairing.code;

    await requestJson(app, `/auth/registrations/${registrationId}/verify`, {
      method: "POST",
      body: {
        passkeyLabel: "Felix CLI Passkey",
      },
    });

    const redeemed = await requestJson(app, "/auth/pairings/redeem", {
      method: "POST",
      body: {
        pairingCode,
        deviceLabel: "pixel-cli",
      },
    });
    const authHeader = {
      authorization: `Bearer ${redeemed.body.data.pairing.token}`,
    };

    const createQuestionResponse = await requestJson(app, "/questions", {
      method: "POST",
      headers: authHeader,
      body: {
        title: "What should the first API support?",
        body: "Questions and accepted answers.",
        author: humanAuthor,
      },
    });

    assert.equal(createQuestionResponse.status, 201);
    const question = createQuestionResponse.body.data;
    assert.equal(question.status, "open");

    const firstAnswerResponse = await requestJson(app, `/questions/${question.id}/answers`, {
      method: "POST",
      headers: authHeader,
      body: {
        body: "Ship the smallest possible workflow first.",
        author: agentAuthor,
      },
    });
    assert.equal(firstAnswerResponse.status, 201);

    await sleep(2);

    const secondAnswerResponse = await requestJson(app, `/questions/${question.id}/answers`, {
      method: "POST",
      headers: authHeader,
      body: {
        body: "Add acceptance before reputation.",
        author: humanAuthor,
      },
    });
    assert.equal(secondAnswerResponse.status, 201);

    const answerToAccept = secondAnswerResponse.body.data.answers[1];
    const acceptResponse = await requestJson(
      app,
      `/questions/${question.id}/accept/${answerToAccept.id}`,
      {
        method: "POST",
        headers: authHeader,
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

    const threadResponse = await requestJson(app, `/questions/${question.id}`);
    assert.equal(threadResponse.status, 200);
    assert.equal(threadResponse.body.data.answers[0].id, answerToAccept.id);
  });

  it("serves the passkey-first registration -> options -> register -> pair flow", async () => {
    const app = createTestApp();

    const started = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      body: {
        handle: "felix796",
        displayName: "Felix",
      },
    });

    assert.equal(started.status, 201);
    assert.equal(started.body.data.status, "awaiting_verification");
    assert.equal(started.body.data.pairing.status, "waiting_for_verification");
    assert.match(started.body.data.challenge, /^[A-Za-z0-9_-]+$/);
    assert.match(started.body.data.verificationUrl, /^\/auth\?registration=/);
    assert.match(started.body.data.verificationToken, /^[a-f0-9]{12}$/);

    const registrationId = started.body.data.id;
    const pairingCode = started.body.data.pairing.code;

    const options = await requestJson(app, `/auth/registrations/${registrationId}/passkey/options`);
    assert.equal(options.status, 200);
    assert.equal(options.body.data.registrationSessionId, registrationId);

    const verified = await requestJson(app, `/auth/registrations/${registrationId}/verify`, {
      method: "POST",
      body: {
        passkeyLabel: "Felix MacBook Passkey",
      },
    });

    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.status, "verified");
    assert.equal(verified.body.data.verificationMethod, "manual_internal");
    assert.equal(verified.body.data.pairing.status, "ready_to_pair");

    const redeemed = await requestJson(app, "/auth/pairings/redeem", {
      method: "POST",
      body: {
        pairingCode,
        deviceLabel: "pixel-bot",
      },
    });

    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.body.data.pairing.status, "paired");
    assert.equal(redeemed.body.data.pairing.deviceLabel, "pixel-bot");
    assert.match(redeemed.body.data.pairing.token, /^taf_/);
  });

  it("resolves a registration session from the public verification token", async () => {
    const app = createTestApp();

    const started = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      body: {
        handle: "pixel-resolve",
        displayName: "Pixel Resolve",
      },
    });

    const resolved = await requestJson(
      app,
      `/auth/resolve?registration=${started.body.data.verificationToken}`,
    );

    assert.equal(resolved.status, 200);
    assert.equal(resolved.body.data.id, started.body.data.id);
  });

  it("inspects and revokes paired API tokens", async () => {
    const app = createTestApp();

    const started = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      body: {
        handle: "token-user",
        displayName: "Token User",
      },
    });

    const verified = await requestJson(app, `/auth/registrations/${started.body.data.id}/verify`, {
      method: "POST",
      body: {
        passkeyLabel: "Token User Passkey",
      },
    });

    const redeemed = await requestJson(app, "/auth/pairings/redeem", {
      method: "POST",
      body: {
        pairingCode: started.body.data.pairing.code,
        deviceLabel: "pixel-cli",
      },
    });

    const token = redeemed.body.data.pairing.token;
    assert.match(token, /^taf_/);
    assert.equal(verified.body.data.pairing.status, "ready_to_pair");

    const inspected = await requestJson(app, "/auth/token", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(inspected.status, 200);
    assert.equal(inspected.body.data.actor.handle, "token-user");
    assert.equal(inspected.body.data.deviceLabel, "pixel-cli");

    const revoked = await requestJson(app, "/auth/token/revoke", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.data.revoked, true);

    const inspectedAfterRevoke = await requestJson(app, "/auth/token", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(inspectedAfterRevoke.status, 200);
    assert.equal(inspectedAfterRevoke.body.data, null);
  });

  it("returns validation errors for invalid auth payloads", async () => {
    const app = createTestApp();

    const response = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      body: {
        handle: "   ",
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error.code, "validation_error");
    assert.match(response.body.error.message, /handle must be a non-empty string/i);
  });
});

function createTestApp() {
  return createApp(createInMemoryQuestionStore(), createInMemoryAuthStore());
}

async function requestJson(
  app: ReturnType<typeof createTestApp>,
  path: string,
  init?: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  },
): Promise<{ status: number; body: any }> {
  const request = Readable.from(
    init?.body ? [JSON.stringify(init.body)] : [],
  ) as IncomingRequestLike;
  request.method = init?.method ?? "GET";
  request.url = path;
  request.headers = {
    host: "localhost",
    ...(init?.body ? { "content-type": "application/json" } : {}),
    ...(init?.headers ?? {}),
  };

  const response = createMockResponse();
  await app(request, response);

  return {
    status: response.statusCode,
    body: JSON.parse(response.body),
  };
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface IncomingRequestLike extends Readable {
  method?: string;
  url?: string;
  headers: Record<string, string>;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead(statusCode: number, headers?: Record<string, string>): MockResponse;
  end(chunk?: string | Buffer): MockResponse;
}
