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

  it("creates, lists, fetches, and searches native articles", async () => {
    const authStore = createInMemoryAuthStore();
    const app = createApp(createInMemoryQuestionStore(), authStore);
    const cookieHeader = await createAuthenticatedCookie(authStore, {
      handle: "article-author",
      displayName: "Article Author",
    });

    const question = await requestJson(app, "/v2/contents", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      body: { type: "question", title: "Question title", body: "Question body", author: spoofedHuman },
    });
    assert.equal(question.status, 201);

    const article = await requestJson(app, "/v2/contents", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      body: {
        type: "article",
        title: "Native Article Title",
        body: "Durable article body for search",
        author: spoofedAgent,
      },
    });

    assert.equal(article.status, 201);
    assert.equal(article.body.data.type, "article");
    assert.match(article.body.data.id, /^art-/);
    assert.equal(article.body.data.author.handle, "article-author");

    const articles = await requestJson(app, "/v2/contents?type=article");
    assert.equal(articles.status, 200);
    assert.deepEqual(
      articles.body.data.map((item: any) => item.type),
      ["article"],
    );

    const allContents = await requestJson(app, "/v2/contents");
    assert.equal(allContents.status, 200);
    assert.deepEqual(
      allContents.body.data.map((item: any) => item.type).sort(),
      ["article", "question"],
    );

    const thread = await requestJson(app, `/v2/contents/${article.body.data.id}`);
    assert.equal(thread.status, 200);
    assert.equal(thread.body.data.content.id, article.body.data.id);
    assert.equal(thread.body.data.content.type, "article");
    assert.deepEqual(thread.body.data.comments, []);

    const search = await requestJson(app, "/v2/search/threads?query=durable&type=article");
    assert.equal(search.status, 200);
    assert.equal(search.body.data.totalMatches, 1);
    assert.equal(search.body.data.matches[0].content.id, article.body.data.id);
    assert.deepEqual(search.body.data.matches[0].matchSources, ["body"]);
  });

  it("lets authenticated users comment on articles, react, and poll content events", async () => {
    const authStore = createInMemoryAuthStore();
    const app = createApp(createInMemoryQuestionStore(), authStore);
    const cookieHeader = await createAuthenticatedCookie(authStore, {
      handle: "article-reader",
      displayName: "Article Reader",
    });

    const article = await requestJson(app, "/v2/contents", {
      method: "POST",
      headers: { cookie: cookieHeader },
      body: {
        type: "article",
        title: "Commentable article",
        body: "A durable article body.",
        author: spoofedAgent,
      },
    });
    assert.equal(article.status, 201);

    const anonymousComment = await requestJson(app, `/v2/contents/${article.body.data.id}/comments`, {
      method: "POST",
      body: { body: "Anonymous comment", author: spoofedHuman },
    });
    assert.equal(anonymousComment.status, 401);

    const commented = await requestJson(app, `/v2/contents/${article.body.data.id}/comments`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      body: { body: "This article should allow comments.", author: spoofedHuman },
    });
    assert.equal(commented.status, 201);
    assert.equal(commented.body.data.content.type, "article");
    assert.equal(commented.body.data.comments.length, 1);
    assert.match(commented.body.data.comments[0].id, /^ac-/);
    assert.equal(commented.body.data.comments[0].author.handle, "article-reader");

    const liked = await requestJson(app, `/v2/contents/${article.body.data.id}/reactions/like`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    assert.equal(liked.status, 200);
    assert.deepEqual(liked.body.data.reactions, [{ type: "like", count: 1 }]);
    assert.deepEqual(liked.body.data.myReactions, ["like"]);

    const listedReactions = await requestJson(app, `/v2/contents/${article.body.data.id}/reactions`, {
      headers: { cookie: cookieHeader },
    });
    assert.equal(listedReactions.status, 200);
    assert.deepEqual(listedReactions.body.data.myReactions, ["like"]);

    const events = await requestJson(app, `/v2/events?contentId=${article.body.data.id}&limit=10`);
    assert.equal(events.status, 200);
    assert.deepEqual(
      events.body.data.map((event: any) => event.type),
      ["content_reaction_added", "content_comment_created"],
    );
    assert.equal(events.body.data[1].commentId, commented.body.data.comments[0].id);

    const unliked = await requestJson(app, `/v2/contents/${article.body.data.id}/reactions/like`, {
      method: "DELETE",
      headers: { cookie: cookieHeader },
    });
    assert.equal(unliked.status, 200);
    assert.deepEqual(unliked.body.data.reactions, []);
    assert.deepEqual(unliked.body.data.myReactions, []);
  });

  it("creates, lists, and evaluates research notes for content", async () => {
    const authStore = createInMemoryAuthStore();
    const app = createApp(createInMemoryQuestionStore(), authStore);
    const cookieHeader = await createAuthenticatedCookie(authStore, {
      handle: "researcher",
      displayName: "Researcher",
    });

    const article = await requestJson(app, "/v2/contents", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      body: {
        type: "article",
        title: "Verification target",
        body: "A research artifact that needs notes.",
        author: spoofedAgent,
      },
    });
    assert.equal(article.status, 201);

    const anonymousCreate = await requestJson(app, `/v2/contents/${article.body.data.id}/notes`, {
      method: "POST",
      body: {
        type: "missing_context",
        body: "This needs a source.",
        author: spoofedAgent,
      },
    });
    assert.equal(anonymousCreate.status, 401);

    const createdNote = await requestJson(app, `/v2/contents/${article.body.data.id}/notes`, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      body: {
        type: "missing_context",
        body: "The article needs the primary benchmark source.",
        sources: ["https://example.com/source"],
        author: spoofedAgent,
      },
    });
    assert.equal(createdNote.status, 201);
    assert.equal(createdNote.body.data.contentId, article.body.data.id);
    assert.equal(createdNote.body.data.author.handle, "researcher");
    assert.equal(createdNote.body.data.status, "needs_review");
    assert.deepEqual(createdNote.body.data.evaluationCounts, {
      helpful: 0,
      notHelpful: 0,
      wellSourced: 0,
      poorlySourced: 0,
      resolvesIssue: 0,
      addsNoise: 0,
      independentVerification: 0,
      opinionOnly: 0,
    });

    const listedNotes = await requestJson(app, `/v2/contents/${article.body.data.id}/notes`);
    assert.equal(listedNotes.status, 200);
    assert.equal(listedNotes.body.data.length, 1);
    assert.equal(listedNotes.body.data[0].id, createdNote.body.data.id);

    const firstEvaluation = await requestJson(app, `/v2/notes/${createdNote.body.data.id}/evaluations`, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      body: {
        helpful: true,
        wellSourced: true,
        resolvesIssue: true,
        independentVerification: true,
        comment: "Source checks out.",
        author: spoofedHuman,
      },
    });
    assert.equal(firstEvaluation.status, 201);
    assert.equal(firstEvaluation.body.data.status, "needs_more_ratings");
    assert.equal(firstEvaluation.body.data.evaluationCounts.helpful, 1);

    const secondEvaluation = await requestJson(app, `/v2/notes/${createdNote.body.data.id}/evaluations`, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
      },
      body: {
        helpful: true,
        wellSourced: true,
        resolvesIssue: true,
        independentVerification: false,
        author: spoofedHuman,
      },
    });
    assert.equal(secondEvaluation.status, 201);
    assert.equal(secondEvaluation.body.data.status, "accepted_context");
    assert.equal(secondEvaluation.body.data.evaluationCounts.helpful, 2);

    const evaluations = await requestJson(app, `/v2/notes/${createdNote.body.data.id}/evaluations`);
    assert.equal(evaluations.status, 200);
    assert.equal(evaluations.body.data.length, 2);
    assert.equal(evaluations.body.data[0].author.handle, "researcher");
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
