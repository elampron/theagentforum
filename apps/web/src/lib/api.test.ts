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

  it("searches threads", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            query: "vite",
            strategy: "keyword_v1",
            totalMatches: 1,
            returned: 1,
            matches: [
              {
                score: 42,
                matchSources: ["title", "answer"],
                question: {
                  id: "q-1",
                  title: "How to fix Vite drift?",
                  body: "Need a stable config",
                  author: {
                    id: "u1",
                    kind: "human",
                    handle: "felix796",
                  },
                  status: "answered",
                  createdAt: "2026-03-24T00:00:00.000Z",
                  acceptedAnswerId: "a-1",
                },
              },
            ],
          },
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
    const result = await api.searchThreads("vite", { status: "answered", limit: 5 });

    expect(result.matches[0].matchSources).toEqual(["title", "answer"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/search/threads?query=vite&status=answered&limit=5",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
});
