import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { createApp } from "./app";
import type { AuthStore } from "./auth-store";
import { createInMemoryAuthStore } from "./memory-auth-store";
import { createInMemoryQuestionStore } from "./memory-question-store";
import {
  createInMemoryRateLimitStore,
  createRateLimitService,
  type RateLimitExceededEvent,
} from "./rate-limit";

const fixedNow = "2026-04-30T00:00:00.000Z";

const spoofedHuman = {
  id: "user-1",
  kind: "human" as const,
  handle: "spoofed-human",
};

describe("HTTP API rate limits", () => {
  it("limits signup starts per IP and returns the launch 429 shape", async () => {
    const { app, events } = createRateLimitedTestApp();

    for (let index = 0; index < 5; index += 1) {
      const response = await requestJson(app, "/auth/registrations/start", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.10",
        },
        body: {
          handle: `signup-user-${index}`,
          displayName: `Signup User ${index}`,
        },
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.ok, true);
    }

    const limited = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      headers: {
        "x-forwarded-for": "203.0.113.10",
      },
      body: {
        handle: "signup-user-6",
        displayName: "Signup User 6",
      },
    });

    assert.equal(limited.status, 429);
    assert.equal(limited.headers["retry-after"], "3600");
    assert.equal(limited.body.ok, false);
    assert.equal(limited.body.error.code, "rate_limit_exceeded");
    assert.equal(limited.body.error.message, "Too many requests for this action. Try again later.");
    assert.equal(limited.body.error.retryAfterSeconds, 3600);
    assert.deepEqual(limited.body.error.details, {
      action: "signup_start",
      scopeType: "ip",
      ruleId: "signup_start_hour",
      limit: 5,
      windowSeconds: 3600,
    });

    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      event: "taf_rate_limit_exceeded",
      action: "signup_start",
      scopeType: "ip",
      ruleId: "signup_start_hour",
      limit: 5,
      windowSeconds: 3600,
      retryAfterSeconds: 3600,
    });
  });

  it("limits authenticated post creation per user", async () => {
    const { app, authStore } = createRateLimitedTestApp();
    const cookieHeader = await createAuthenticatedCookie(authStore, {
      handle: "felix-posts",
      displayName: "Felix Posts",
    });

    for (let index = 0; index < 5; index += 1) {
      const response = await requestJson(app, "/questions", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "x-forwarded-for": "198.51.100.15",
        },
        body: {
          title: `Question ${index}`,
          body: `Body ${index}`,
          author: spoofedHuman,
        },
      });

      assert.equal(response.status, 201);
      assert.equal(response.body.data.author.handle, "felix-posts");
    }

    const limited = await requestJson(app, "/questions", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "x-forwarded-for": "198.51.100.15",
      },
      body: {
        title: "Question 6",
        body: "Body 6",
        author: spoofedHuman,
      },
    });

    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, "rate_limit_exceeded");
    assert.equal(limited.body.error.details.action, "create_post");
    assert.equal(limited.body.error.details.scopeType, "user");
  });

  it("limits profile updates per authenticated user", async () => {
    const { app, authStore } = createRateLimitedTestApp();
    const cookieHeader = await createAuthenticatedCookie(authStore, {
      handle: "felix-profile",
      displayName: "Felix Profile",
    });

    for (let index = 0; index < 10; index += 1) {
      const response = await requestJson(app, "/profile", {
        method: "PATCH",
        headers: {
          cookie: cookieHeader,
          "x-forwarded-for": "198.51.100.20",
        },
        body: {
          displayName: `Felix Profile ${index}`,
        },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.data.displayName, `Felix Profile ${index}`);
    }

    const limited = await requestJson(app, "/profile", {
      method: "PATCH",
      headers: {
        cookie: cookieHeader,
        "x-forwarded-for": "198.51.100.20",
      },
      body: {
        displayName: "Felix Profile 11",
      },
    });

    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, "rate_limit_exceeded");
    assert.equal(limited.body.error.details.action, "profile_update");
    assert.equal(limited.body.error.details.scopeType, "user");
  });
});

function createRateLimitedTestApp(): {
  app: ReturnType<typeof createApp>;
  authStore: AuthStore;
  events: RateLimitExceededEvent[];
} {
  const authStore = createInMemoryAuthStore();
  const events: RateLimitExceededEvent[] = [];
  const rateLimiter = createRateLimitService(createInMemoryRateLimitStore(), {
    clock: {
      now: () => new Date(fixedNow),
    },
    eventSink: {
      emit(event) {
        events.push(event);
      },
    },
  });

  return {
    app: createApp(createInMemoryQuestionStore(), authStore, { rateLimiter }),
    authStore,
    events,
  };
}

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

async function requestJson(
  app: ReturnType<typeof createApp>,
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; headers: Record<string, string>; body: any }> {
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

  return {
    status: response.statusCode,
    headers: response.headers,
    body: JSON.parse(response.body),
  };
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
