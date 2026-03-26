import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api";

describe("createApiClient", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("lists questions", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: [
            {
              id: "q-1",
              title: "How to test?",
              body: "Need examples",
              author: {
                id: "u1",
                kind: "human",
                handle: "felix796",
              },
              status: "open",
              createdAt: "2026-03-24T00:00:00.000Z",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const api = createApiClient("http://localhost:3001");
    const questions = await api.listQuestions();

    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe("q-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/questions",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("throws ApiClientError for API failures", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "question_not_found",
            message: "Question not found.",
          },
        }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const api = createApiClient("http://localhost:3001");

    await expect(api.getQuestionThread("q-404")).rejects.toMatchObject({
      name: "ApiClientError",
      statusCode: 404,
      code: "question_not_found",
      message: "Question not found.",
    });
  });

  it("starts a registration session", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            id: "ars-1",
            handle: "felix796",
            status: "awaiting_verification",
            challenge: "challenge-1",
            createdAt: "2026-03-26T00:00:00.000Z",
            expiresAt: "2026-03-26T00:15:00.000Z",
            pairing: {
              id: "aps-1",
              code: "ABCD1234",
              status: "waiting_for_verification",
              createdAt: "2026-03-26T00:00:00.000Z",
              expiresAt: "2026-03-26T00:30:00.000Z",
            },
          },
        }),
        {
          status: 201,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const api = createApiClient("http://localhost:3001");
    const session = await api.startRegistration({
      handle: "felix796",
      displayName: "Felix",
    });

    expect(session.id).toBe("ars-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/auth/registrations/start",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
