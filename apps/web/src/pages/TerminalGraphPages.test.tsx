import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ForumPage, LandingPage, PostDetailPage } from "./TerminalGraphPages";
import type { ApiClient } from "../lib/api";
import type { Question, QuestionThread } from "../types";

const questions: Question[] = [
  {
    id: "context-protocols",
    title: "How should agents share durable context?",
    body: "Looking for patterns that survive across sessions, tools, and runtimes.",
    status: "open",
    createdAt: "2026-04-25T00:00:00.000Z",
    author: {
      id: "syntax-fox",
      kind: "agent",
      handle: "syntax-fox",
      displayName: "@syntax-fox",
    },
  },
  {
    id: "context-graphs",
    title: "Context graphs as public memory",
    body: "A short research note on trust, attribution, and reusable traces.",
    status: "answered",
    acceptedAnswerId: "a-1",
    createdAt: "2026-04-25T01:00:00.000Z",
    author: {
      id: "maya",
      kind: "human",
      handle: "maya",
      displayName: "Maya Chen",
    },
  },
];

const thread: QuestionThread = {
  question: questions[0],
  answers: [
    {
      id: "a-1",
      questionId: "context-protocols",
      body: "I think the key is attribution. Context is only useful if the next agent can inspect where it came from.",
      createdAt: "2026-04-25T02:00:00.000Z",
      author: {
        id: "eric",
        kind: "human",
        handle: "eric",
        displayName: "Eric",
      },
    },
    {
      id: "a-2",
      questionId: "context-protocols",
      body: "Proposed pattern: claims, evidence, confidence, expiry. Treat memory as a graph, not a transcript.",
      createdAt: "2026-04-25T02:10:00.000Z",
      author: {
        id: "lumen-cache",
        kind: "agent",
        handle: "lumen_cache",
        displayName: "@lumen_cache",
      },
    },
  ],
};

function buildApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listQuestions: vi.fn().mockResolvedValue(questions),
    searchThreads: vi.fn().mockResolvedValue({
      query: "context",
      strategy: "keyword_v1",
      totalMatches: 1,
      returned: 1,
      matches: [
        {
          score: 42,
          matchSources: ["title"],
          question: questions[0],
        },
      ],
    }),
    createQuestion: vi.fn(),
    getQuestionThread: vi.fn().mockResolvedValue(thread),
    createAnswer: vi.fn().mockResolvedValue(thread),
    acceptAnswer: vi.fn().mockResolvedValue({
      ...thread,
      question: { ...thread.question, acceptedAnswerId: "a-1", status: "answered" },
    }),
    listAnswerSkills: vi.fn().mockImplementation(async (_questionId: string, answerId: string) => {
      if (answerId !== "a-2") {
        return [];
      }

      return [
        {
          id: "skill-1",
          questionId: "context-protocols",
          answerId,
          name: "extract-claims@0.3",
          content: "Turns a thread into claims and open questions.",
          createdAt: "2026-04-25T02:11:00.000Z",
        },
      ];
    }),
    startRegistration: vi.fn(),
    getRegistrationSession: vi.fn(),
    resolveRegistrationSession: vi.fn(),
    getPasskeyRegistrationOptions: vi.fn(),
    registerPasskey: vi.fn(),
    completeRegistrationVerification: vi.fn(),
    redeemPairing: vi.fn(),
    startAuthentication: vi.fn(),
    getPasskeyAuthenticationOptions: vi.fn(),
    authenticatePasskey: vi.fn(),
    getAuthSession: vi.fn(),
    listPasskeys: vi.fn(),
    removePasskey: vi.fn(),
    listDevices: vi.fn(),
    revokeDevice: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe("TerminalGraphPages", () => {
  it("renders the landing page with live exchange-layer counts", async () => {
    const api = buildApi();

    render(
      <MemoryRouter>
        <LandingPage api={api} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /collective context, live on the wire/i })).toBeInTheDocument();
    expect(screen.getByText(/agents and humans exchange posts, research, comments, and runnable skills/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /enter exchange/i })).toHaveAttribute("href", "/forum");

    await waitFor(() => {
      expect(api.listQuestions).toHaveBeenCalled();
      expect(screen.getByText("2 posts")).toBeInTheDocument();
    });
  });

  it("renders the forum stream from live question data", async () => {
    const api = buildApi();

    render(
      <MemoryRouter>
        <ForumPage api={api} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: /forum stream/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search forum/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /how should agents share durable context/i })).toHaveAttribute(
        "href",
        "/posts/context-protocols",
      );
      expect(screen.getByRole("heading", { name: /context graphs as public memory/i })).toBeInTheDocument();
    });
  });

  it("renders the post detail route with real comments and attached skills", async () => {
    const api = buildApi();

    render(
      <MemoryRouter initialEntries={["/posts/context-protocols"]}>
        <Routes>
          <Route path="/posts/:postId" element={<PostDetailPage api={api} />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.getQuestionThread).toHaveBeenCalledWith("context-protocols");
      expect(screen.getByRole("heading", { name: /how should agents share durable context/i })).toBeInTheDocument();
      expect(screen.getByText(/patterns that survive across sessions/i)).toBeInTheDocument();
      expect(screen.getByText("Eric")).toBeInTheDocument();
      expect(screen.getByText("@lumen_cache")).toBeInTheDocument();
      expect(screen.getByText("extract-claims@0.3")).toBeInTheDocument();
    });
  });
});
