import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { createApp } from "./app";
import { createInMemoryAuthStore } from "./memory-auth-store";
import { createInMemoryQuestionStore } from "./memory-question-store";

describe("HTTP API - WebAuthn registration", () => {
  it("verifies a browser-style WebAuthn credential response and pairs", async () => {
    const app = createTestApp();

    const started = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      body: {
        handle: "felix796",
        displayName: "Felix",
      },
    });

    assert.equal(started.status, 201);
    const registrationId = started.body.data.id as string;
    const pairingCode = started.body.data.pairing.code as string;

    const options = await requestJson(app, `/auth/registrations/${registrationId}/passkey/options`, {
      headers: {
        origin: "http://localhost:5173",
      },
    });
    assert.equal(options.status, 200);
    assert.equal(options.body.data.rp.id, "localhost");

    const credential = createRegistrationCredential({
      challenge: options.body.data.challenge,
      origin: "http://localhost:5173",
      rpId: "localhost",
    });

    const verified = await requestJson(app, "/auth/passkeys/register", {
      method: "POST",
      headers: {
        origin: "http://localhost:5173",
      },
      body: {
        registrationSessionId: registrationId,
        credential,
        passkeyLabel: "Felix MacBook Passkey",
      },
    });

    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.status, "verified");
    assert.equal(verified.body.data.verificationMethod, "webauthn");
    assert.equal(verified.body.data.pairing.status, "ready_to_pair");
    assert.equal(verified.body.data.passkeyLabel, "Felix MacBook Passkey");

    const redeemed = await requestJson(app, "/auth/pairings/redeem", {
      method: "POST",
      body: {
        pairingCode,
        deviceLabel: "pixel-bot",
      },
    });

    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.body.data.pairing.status, "paired");
  });

  it("rejects fabricated legacy registration payloads on the real browser route", async () => {
    const app = createTestApp();

    const started = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      body: {
        handle: "legacy-helper",
      },
    });

    const rejected = await requestJson(app, "/auth/passkeys/register", {
      method: "POST",
      headers: {
        origin: "http://localhost:5173",
      },
      body: {
        registrationSessionId: started.body.data.id,
        attestationResponse: "cred-legacy-1",
        clientDataJson: '{"type":"webauthn.create"}',
      },
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.ok, false);
    assert.equal(rejected.body.error.code, "validation_error");
    assert.match(rejected.body.error.message, /credential/i);
  });

  it("rejects a credential whose challenge does not match the pending registration", async () => {
    const app = createTestApp();

    const started = await requestJson(app, "/auth/registrations/start", {
      method: "POST",
      body: {
        handle: "felix-mismatch",
      },
    });

    const registrationId = started.body.data.id as string;

    const options = await requestJson(app, `/auth/registrations/${registrationId}/passkey/options`, {
      headers: {
        origin: "http://localhost:5173",
      },
    });

    const rejected = await requestJson(app, "/auth/passkeys/register", {
      method: "POST",
      headers: {
        origin: "http://localhost:5173",
      },
      body: {
        registrationSessionId: registrationId,
        credential: createRegistrationCredential({
          challenge: `${options.body.data.challenge}-wrong`,
          origin: "http://localhost:5173",
          rpId: "localhost",
        }),
      },
    });

    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.ok, false);
    assert.equal(rejected.body.error.code, "webauthn_verification_failed");
    assert.match(rejected.body.error.message, /challenge/i);
  });
});

function createRegistrationCredential(input: {
  challenge: string;
  origin: string;
  rpId: string;
}) {
  const credentialId = Buffer.from("cred-felix-1", "utf8");
  const credentialPublicKey = encodeCbor(
    new Map<unknown, unknown>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.alloc(32, 1)],
      [-3, Buffer.alloc(32, 2)],
    ]),
  );
  const authData = Buffer.concat([
    sha256(input.rpId),
    Buffer.from([0x41]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    Buffer.from([0x00, credentialId.length]),
    credentialId,
    credentialPublicKey,
  ]);
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: "webauthn.create",
      challenge: input.challenge,
      origin: input.origin,
    }),
    "utf8",
  );
  const attestationObject = encodeCbor(
    new Map<unknown, unknown>([
      ["fmt", "none"],
      ["attStmt", new Map()],
      ["authData", authData],
    ]),
  );

  return {
    id: toBase64Url(credentialId),
    rawId: toBase64Url(credentialId),
    type: "public-key",
    response: {
      clientDataJSON: toBase64Url(clientDataJSON),
      attestationObject: toBase64Url(attestationObject),
      transports: ["internal"],
    },
  };
}

function encodeCbor(value: unknown): Buffer {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error("Only integer CBOR values are supported in test fixtures.");
    }

    if (value >= 0) {
      return encodeCborHeader(0, value);
    }

    return encodeCborHeader(1, -1 - value);
  }

  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([encodeCborHeader(3, bytes.length), bytes]);
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    const bytes = Buffer.from(value);
    return Buffer.concat([encodeCborHeader(2, bytes.length), bytes]);
  }

  if (Array.isArray(value)) {
    return Buffer.concat([encodeCborHeader(4, value.length), ...value.map((item) => encodeCbor(item))]);
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries()).flatMap(([key, entryValue]) => [
      encodeCbor(key),
      encodeCbor(entryValue),
    ]);

    return Buffer.concat([encodeCborHeader(5, value.size), ...entries]);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, entryValue]) => [
      encodeCbor(key),
      encodeCbor(entryValue),
    ]);

    return Buffer.concat([
      encodeCborHeader(5, Object.keys(value as Record<string, unknown>).length),
      ...entries,
    ]);
  }

  throw new Error(`Unsupported CBOR fixture value: ${String(value)}`);
}

function encodeCborHeader(majorType: number, value: number): Buffer {
  if (value < 24) {
    return Buffer.from([(majorType << 5) | value]);
  }

  if (value < 0x100) {
    return Buffer.from([(majorType << 5) | 24, value]);
  }

  if (value < 0x10000) {
    const bytes = Buffer.alloc(3);
    bytes[0] = (majorType << 5) | 25;
    bytes.writeUInt16BE(value, 1);
    return bytes;
  }

  const bytes = Buffer.alloc(5);
  bytes[0] = (majorType << 5) | 26;
  bytes.writeUInt32BE(value, 1);
  return bytes;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

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
  const request = Readable.from(init?.body ? [JSON.stringify(init.body)] : []) as IncomingRequestLike;
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
