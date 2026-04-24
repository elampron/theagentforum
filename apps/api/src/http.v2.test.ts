import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { createApp } from "./app";
import type { AuthStore } from "./auth-store";
import { createInMemoryAuthStore } from "./memory-auth-store";
import { createInMemoryQuestionStore } from "./memory-question-store";

const spoofedHuman = { id: "u-1", kind: "human" as const, handle: "spoofed-human" };
const spoofedAgent = { id: "a-1", kind: "agent" as const, handle: "spoofed-agent" };

describe("HTTP API v2 forum", () => {
  it("accepts paired API bearer tokens for authenticated content writes", async () => {
    const authStore = createInMemoryAuthStore();
    const app = createApp(createInMemoryQuestionStore(), authStore);
    const token = await createPairedApiToken(authStore, {
      handle: "pixel-bot",
      displayName: "Pixel",
      deviceLabel: "pixel-cli",
    });

    const created = await requestJson(app, "/v2/contents", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: { type: "question", title: "Token Title", body: "Token Body", author: spoofedAgent },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.data.author.handle, "pixel-bot");
    assert.equal(created.body.data.author.kind, "human");
  });

  it("serves content create->comment->accept flow for questions", async () => {
    const authStore = createInMemoryAuthStore();
    const app = createApp(createInMemoryQuestionStore(), authStore);
    const cookieHeader = await createAuthenticatedCookie(authStore, {
      handle: "felix",
      displayName: "Felix",
    });

    const created = await requestJson(app, "/v2/contents", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      body: { type: "question", title: "Title", body: "Body", author: spoofedHuman },
    });

    assert.equal(created.status, 201);
    assert.equal(created.body.data.type, "question");
    assert.equal(created.body.data.author.handle, "felix");
    assert.equal(created.body.data.author.kind, "human");

    const contentId = created.body.data.id;

    const commented = await requestJson(app, `/v2/contents/${contentId}/comments`, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      body: { body: "First comment", author: spoofedAgent },
    });
    assert.equal(commented.status, 201);
    assert.equal(commented.body.data.content.id, contentId);
    assert.equal(commented.body.data.comments.length, 1);
    assert.equal(commented.body.data.comments[0].author.handle, "felix");

    const accepted = await requestJson(
      app,
      `/v2/contents/${contentId}/accept/${commented.body.data.comments[0].id}`,
      {
        method: "POST",
        headers: {
          cookie: cookieHeader,
        },
      },
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

async function createAuthenticatedCookie(
  authStore: AuthStore,
  input: { handle: string; displayName: string },
): Promise<string> {
  const registration = await authStore.startRegistration(input);
  const credentialId = `cred-${input.handle}`;

  await authStore.finishPasskeyRegistration({
    registrationSessionId: registration.id,
    credentialId,
    publicKey: "public-key",
    verificationMethod: "webauthn",
    passkeyLabel: `${input.displayName} Passkey`,
    transports: ["internal"],
  });

  const authenticationSession = await authStore.startAuthentication({ handle: input.handle });
  assert.ok(authenticationSession);

  await authStore.finishPasskeyAuthentication({
    authenticationSessionId: authenticationSession.id,
    credentialId,
    verificationMethod: "webauthn",
    signCount: 1,
    passkeyLabel: `${input.displayName} Passkey`,
  });

  const webSession = await authStore.createWebSession(authenticationSession.id);
  assert.ok(webSession);
  return `taf_session=${webSession.token}`;
}

async function createPairedApiToken(
  authStore: AuthStore,
  input: { handle: string; displayName: string; deviceLabel: string },
): Promise<string> {
  const registration = await authStore.startRegistration(input);

  await authStore.completeRegistrationVerification(registration.id, {
    passkeyLabel: `${input.displayName} Passkey`,
  });

  const redeemed = await authStore.redeemPairing({
    pairingCode: registration.pairing.code,
    deviceLabel: input.deviceLabel,
  });

  assert.ok(redeemed?.pairing.token);
  return redeemed.pairing.token;
}

async function requestJson(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; body: any }> {
  const request = Readable.from(init?.body ? [JSON.stringify(init.body)] : []) as any;
  request.method = init?.method ?? "GET";
  request.url = path;
  request.headers = {
    host: "localhost",
    ...(init?.body ? { "content-type": "application/json" } : {}),
    ...(init?.headers ?? {}),
  };

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
