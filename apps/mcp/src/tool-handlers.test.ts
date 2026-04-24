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
        searchThreads: async () => { throw new Error("not used"); },
        getThread: async () => { throw new Error("not used"); },
        answer: async () => { throw new Error("not used"); },
        accept: async () => { throw new Error("not used"); },
        attachSkill: async () => { throw new Error("not used"); },
        startRegistration: async () => { throw new Error("not used"); },
        getRegistrationSession: async () => { throw new Error("not used"); },
        getPasskeyRegistrationOptions: async () => { throw new Error("not used"); },
        registerPasskey: async () => { throw new Error("not used"); },
        redeemPairing: async () => { throw new Error("not used"); },
        inspectApiToken: async () => { throw new Error("not used"); },
        revokeApiToken: async () => { throw new Error("not used"); },
      },
    });

    const result = await handlers.ask({ title: "How do I add MCP support?", body: "Need a practical rollout." });
    assert.equal(result.ok, true);
    assert.equal(observedAuthor?.id, defaultAuthor.id);
  });

  it("starts auth registration and returns pairing details", async () => {
    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => { throw new Error("not used"); },
        listQuestions: async () => [],
        searchThreads: async () => { throw new Error("not used"); },
        getThread: async () => { throw new Error("not used"); },
        answer: async () => { throw new Error("not used"); },
        accept: async () => { throw new Error("not used"); },
        attachSkill: async () => { throw new Error("not used"); },
        startRegistration: async () => ({
          id: "ars-1",
          handle: "felix796",
          status: "awaiting_verification",
          challenge: "abc",
          verificationUrl: "/auth?registration=ars-1",
          createdAt: "2026-03-26T00:00:00.000Z",
          expiresAt: "2026-03-26T00:15:00.000Z",
          pairing: {
            id: "aps-1",
            code: "PAIR1234",
            status: "waiting_for_verification",
            createdAt: "2026-03-26T00:00:00.000Z",
            expiresAt: "2026-03-26T00:30:00.000Z",
          },
        }),
        getRegistrationSession: async () => { throw new Error("not used"); },
        getPasskeyRegistrationOptions: async () => { throw new Error("not used"); },
        registerPasskey: async () => { throw new Error("not used"); },
        redeemPairing: async () => { throw new Error("not used"); },
        inspectApiToken: async () => { throw new Error("not used"); },
        revokeApiToken: async () => { throw new Error("not used"); },
      },
    });

    const result = await handlers.authRegister({ handle: "felix796", displayName: "Felix" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.pairing.code, "PAIR1234");
    }
  });

  it("completes passkey registration via MCP helper flow", async () => {
    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => { throw new Error("not used"); },
        listQuestions: async () => [],
        searchThreads: async () => { throw new Error("not used"); },
        getThread: async () => { throw new Error("not used"); },
        answer: async () => { throw new Error("not used"); },
        accept: async () => { throw new Error("not used"); },
        attachSkill: async () => { throw new Error("not used"); },
        startRegistration: async () => { throw new Error("not used"); },
        getRegistrationSession: async () => { throw new Error("not used"); },
        getPasskeyRegistrationOptions: async () => ({
          registrationSessionId: "ars-1",
          rp: { id: "theagentforum.local", name: "TheAgentForum" },
          user: { id: "ars-1", name: "felix796", displayName: "Felix" },
          challenge: "abc123",
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          timeout: 60000,
          attestation: "none",
          authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
        }),
        registerPasskey: async () => ({
          id: "ars-1",
          handle: "felix796",
          status: "verified",
          challenge: "abc123",
          verificationMethod: "webauthn_simulated",
          passkeyLabel: "Felix passkey",
          createdAt: "2026-03-26T00:00:00.000Z",
          expiresAt: "2026-03-26T00:15:00.000Z",
          verifiedAt: "2026-03-26T00:01:00.000Z",
          pairing: {
            id: "aps-1",
            code: "PAIR1234",
            status: "ready_to_pair",
            createdAt: "2026-03-26T00:00:00.000Z",
            expiresAt: "2026-03-26T00:30:00.000Z",
          },
        }),
        redeemPairing: async () => { throw new Error("not used"); },
        inspectApiToken: async () => { throw new Error("not used"); },
        revokeApiToken: async () => { throw new Error("not used"); },
      },
    });

    const result = await handlers.authPasskeyRegister({
      registrationSessionId: "ars-1",
      passkeyLabel: "Felix passkey",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.data.status, "verified");
    }
  });

  it("maps API not-found errors to MCP not_found category", async () => {
    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => { throw new Error("not used"); },
        listQuestions: async () => [],
        searchThreads: async () => { throw new Error("not used"); },
        getThread: async () => { throw new Error("not used"); },
        answer: async () => {
          throw new TafApiClientError({ message: "Question not found.", statusCode: 404, code: "question_not_found" });
        },
        accept: async () => { throw new Error("not used"); },
        attachSkill: async () => { throw new Error("not used"); },
        startRegistration: async () => { throw new Error("not used"); },
        getRegistrationSession: async () => { throw new Error("not used"); },
        getPasskeyRegistrationOptions: async () => { throw new Error("not used"); },
        registerPasskey: async () => { throw new Error("not used"); },
        redeemPairing: async () => { throw new Error("not used"); },
        inspectApiToken: async () => { throw new Error("not used"); },
        revokeApiToken: async () => { throw new Error("not used"); },
      },
    });

    const result = await handlers.answer({ questionId: "q-404", body: "Try this approach" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.category, "not_found");
      assert.equal(result.error.code, "question_not_found");
    }
  });

  it("accepts contentId/commentId aliases during the v2 migration", async () => {
    let observedQuestionId: string | undefined;
    let observedAnswerId: string | undefined;

    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => { throw new Error("not used"); },
        listQuestions: async () => [],
        searchThreads: async () => { throw new Error("not used"); },
        getThread: async () => { throw new Error("not used"); },
        answer: async (questionId) => {
          observedQuestionId = questionId;
          return {
            question: {
              id: questionId,
              title: "Migrated thread",
              body: "Body",
              author: defaultAuthor,
              status: "open",
              createdAt: "2026-03-26T00:00:00.000Z",
            },
            answers: [],
          };
        },
        accept: async (questionId, answerId) => {
          observedQuestionId = questionId;
          observedAnswerId = answerId;
          return {
            question: {
              id: questionId,
              title: "Migrated thread",
              body: "Body",
              author: defaultAuthor,
              status: "answered",
              createdAt: "2026-03-26T00:00:00.000Z",
              acceptedAnswerId: answerId,
            },
            answers: [
              {
                id: answerId,
                questionId,
                body: "Resolved",
                author: defaultAuthor,
                createdAt: "2026-03-26T00:01:00.000Z",
                acceptedAt: "2026-03-26T00:02:00.000Z",
              },
            ],
          };
        },
        attachSkill: async () => { throw new Error("not used"); },
        startRegistration: async () => { throw new Error("not used"); },
        getRegistrationSession: async () => { throw new Error("not used"); },
        getPasskeyRegistrationOptions: async () => { throw new Error("not used"); },
        registerPasskey: async () => { throw new Error("not used"); },
        redeemPairing: async () => { throw new Error("not used"); },
        inspectApiToken: async () => { throw new Error("not used"); },
        revokeApiToken: async () => { throw new Error("not used"); },
      },
    });

    const answerResult = await handlers.answer({ contentId: "q-77", body: "Test response" });
    assert.equal(answerResult.ok, true);
    assert.equal(observedQuestionId, "q-77");

    const acceptResult = await handlers.accept({ contentId: "q-77", commentId: "a-12" });
    assert.equal(acceptResult.ok, true);
    assert.equal(observedQuestionId, "q-77");
    assert.equal(observedAnswerId, "a-12");
  });

  it("inspects and revokes the current API token session", async () => {
    let revoked = false;

    const handlers = createToolHandlers({
      defaultAuthor,
      apiClient: {
        ask: async () => { throw new Error("not used"); },
        listQuestions: async () => [],
        searchThreads: async () => { throw new Error("not used"); },
        getThread: async () => { throw new Error("not used"); },
        answer: async () => { throw new Error("not used"); },
        accept: async () => { throw new Error("not used"); },
        attachSkill: async () => { throw new Error("not used"); },
        startRegistration: async () => { throw new Error("not used"); },
        getRegistrationSession: async () => { throw new Error("not used"); },
        getPasskeyRegistrationOptions: async () => { throw new Error("not used"); },
        registerPasskey: async () => { throw new Error("not used"); },
        redeemPairing: async () => { throw new Error("not used"); },
        inspectApiToken: async () => ({
          actor: defaultAuthor,
          deviceLabel: "taf-mcp",
          createdAt: "2026-03-26T00:00:00.000Z",
          expiresAt: "2026-03-26T01:00:00.000Z",
        }),
        revokeApiToken: async () => {
          revoked = true;
          return { revoked: true };
        },
      },
    });

    const whoami = await handlers.authWhoami({});
    assert.equal(whoami.ok, true);
    if (whoami.ok) {
      assert.equal(whoami.data?.actor.handle, "taf-mcp");
      assert.equal(whoami.data?.deviceLabel, "taf-mcp");
    }

    const logout = await handlers.authLogout({});
    assert.equal(logout.ok, true);
    assert.equal(revoked, true);
    if (logout.ok) {
      assert.equal(logout.data.revoked, true);
    }
  });
});
