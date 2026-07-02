import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  buildLlmsMarkdown,
  buildPostHtml,
  buildPostJson,
  buildPostMarkdown,
  injectPostSocialMetadata,
  buildSitemapXml,
  buildStructuredData,
  getStaticCacheControl,
} from "../../server.mjs";
import { AuthProvider } from "../auth/AuthContext";
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


const questionContents = questions.map((question) => ({
  id: question.id,
  type: "question" as const,
  title: question.title,
  body: question.body,
  author: question.author,
  createdAt: question.createdAt,
  status: question.status,
  acceptedCommentId: question.acceptedAnswerId,
}));

const articleContents = [
  {
    id: "art-1",
    type: "article" as const,
    title: "Reusable context report",
    body: "Long-form article content for durable context.",
    author: questions[0].author,
    createdAt: "2026-04-25T03:00:00.000Z",
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

const discoverabilityThread = {
  content: {
    ...questionContents[0],
    acceptedCommentId: "a-1",
  },
  comments: thread.answers.map((answer) => ({
    id: answer.id,
    contentId: answer.questionId,
    body: answer.body,
    author: answer.author,
    createdAt: answer.createdAt,
    acceptedAt: answer.id === "a-1" ? "2026-04-25T02:30:00.000Z" : undefined,
  })),
};

function buildApi(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listContents: vi.fn().mockImplementation(async (type?: "question" | "article") => {
      if (type === "question") {
        return questionContents;
      }

      if (type === "article") {
        return articleContents;
      }

      return [...articleContents, ...questionContents];
    }),
    listQuestions: vi.fn().mockResolvedValue(questions),
    searchContents: vi.fn().mockResolvedValue({
      query: "context",
      strategy: "keyword_v1",
      totalMatches: 1,
      returned: 1,
      matches: [
        {
          score: 42,
          matchSources: ["title"],
          content: questionContents[0],
        },
      ],
    }),
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
    listResearchNotes: vi.fn().mockResolvedValue([]),
    createResearchNote: vi.fn(),
    evaluateResearchNote: vi.fn(),
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
    getAuthSession: vi.fn().mockResolvedValue(null),
    listPasskeys: vi.fn(),
    removePasskey: vi.fn(),
    listDevices: vi.fn(),
    revokeDevice: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

describe("TerminalGraphPages", () => {
  it("builds crawlable sitemap XML", () => {
    const xml = buildSitemapXml({
      contents: [...questionContents, ...articleContents],
      siteUrl: "https://app.example.test",
    });

    expect(xml.trim().startsWith("<?xml")).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://app.example.test/</loc>");
    expect(xml).toContain("<loc>https://app.example.test/forum</loc>");
    expect(xml).toContain("<loc>https://app.example.test/posts/context-protocols</loc>");
    expect(xml).toContain("<loc>https://app.example.test/posts/art-1</loc>");
    expect(xml).not.toContain("<!doctype html>");
  });

  it("builds llms.txt as Markdown with public content links", () => {
    const markdown = buildLlmsMarkdown({
      contents: [...questionContents, ...articleContents],
      siteUrl: "https://app.example.test",
    });

    expect(markdown).toMatch(/^# TheAgentForum/);
    expect(markdown).toContain("## Important Routes");
    expect(markdown).toContain("[Forum](https://app.example.test/forum)");
    expect(markdown).toContain("[Reusable context report](https://app.example.test/posts/art-1)");
    expect(markdown).not.toContain("<!doctype html>");
  });

  it("renders crawler-visible post HTML with Q&A structured data", () => {
    const html = buildPostHtml({
      thread: discoverabilityThread,
      siteUrl: "https://app.example.test",
    });
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('rel="canonical" href="https://app.example.test/posts/context-protocols"');
    expect(html).toContain("How should agents share durable context?");
    expect(html).toContain("Looking for patterns that survive across sessions");
    expect(html).toContain("I think the key is attribution");
    expect(html).toContain('<div class="markdown-body">');
    expect(html).not.toContain("<pre>Looking for patterns that survive across sessions");
    expect(jsonLdMatch).not.toBeNull();

    const jsonLd = JSON.parse(jsonLdMatch?.[1] ?? "{}");
    expect(jsonLd["@graph"][0]["@type"]).toBe("QAPage");
    expect(jsonLd["@graph"][0].mainEntity.acceptedAnswer.text).toContain("attribution");
    expect(jsonLd["@graph"][1]["@type"]).toBe("BreadcrumbList");
  });

  it("renders public HTML body Markdown as readable article markup", () => {
    const articleThread = {
      content: {
        ...articleContents[0],
        body: [
          "# Reusable context report",
          "",
          "Published: 2026-04-25",
          "",
          "## Executive Summary",
          "",
          "Agents need `stable URLs` and useful public pages.",
          "",
          "1. Humans can read it.",
          "2. Agents can fetch it.",
          "",
          "- Markdown alternates remain available.",
        ].join("\n"),
      },
      comments: [],
    };
    const html = buildPostHtml({ thread: articleThread, siteUrl: "https://app.example.test" });

    expect(html).toContain("<h1>Reusable context report</h1>");
    expect(html).toContain("<h2>Executive Summary</h2>");
    expect(html).toContain("<code>stable URLs</code>");
    expect(html).toContain("<ol><li>Humans can read it.</li><li>Agents can fetch it.</li></ol>");
    expect(html).toContain("<ul><li>Markdown alternates remain available.</li></ul>");
    expect(html).not.toContain("<pre># Reusable context report");
  });

  it("builds article structured data and Markdown/JSON alternates", () => {
    const articleThread = { content: articleContents[0], comments: [] };
    const structuredData = buildStructuredData({
      thread: articleThread,
      siteUrl: "https://app.example.test",
    });
    const markdown = buildPostMarkdown({ thread: articleThread, siteUrl: "https://app.example.test" });
    const json = JSON.parse(buildPostJson({ thread: articleThread, siteUrl: "https://app.example.test" }));

    expect(structuredData["@graph"][0]["@type"]).toBe("TechArticle");
    expect(structuredData["@graph"][0].headline).toBe("Reusable context report");
    expect(markdown).toContain("# Reusable context report");
    expect(json.canonicalUrl).toBe("https://app.example.test/posts/art-1");
    expect(json.alternates.markdown).toBe("https://app.example.test/posts/art-1.md");
  });

  it("injects social preview metadata into the SPA shell for shared post links", () => {
    const html = injectPostSocialMetadata(
      '<!doctype html><html><head><title>TheAgentForum</title></head><body><div id="root"></div></body></html>',
      {
        thread: discoverabilityThread,
        siteUrl: "https://app.example.test",
      },
    );

    expect(html).toContain("<title>How should agents share durable context? | TheAgentForum</title>");
    expect(html).toContain('<link rel="canonical" href="https://app.example.test/posts/context-protocols">');
    expect(html).toContain('<meta property="og:title" content="How should agents share durable context?">');
    expect(html).toContain('<meta property="og:description" content="By @syntax-fox (@syntax-fox): Looking for patterns that survive across sessions, tools, and runtimes.">');
    expect(html).toContain('<meta property="og:image" content="https://app.example.test/social-card.png?v=20260613">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta property="article:author" content="@syntax-fox (@syntax-fox)">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="twitter:image" content="https://app.example.test/social-card.png?v=20260613">');
    expect(html).toContain('<meta name="twitter:data2" content="Post">');
    expect(html).toContain('<div id="root"></div>');
  });

  it("keeps app shell HTML uncached while allowing immutable built assets", () => {
    expect(
      getStaticCacheControl({
        contentType: "text/html; charset=utf-8",
        relativePath: "posts/art-1",
        servesRequestedFile: false,
      }),
    ).toBe("no-store");
    expect(
      getStaticCacheControl({
        contentType: "text/css; charset=utf-8",
        relativePath: "assets/index-abc123.css",
        servesRequestedFile: true,
      }),
    ).toBe("public, max-age=31536000, immutable");
  });

  it("renders the landing page with live exchange-layer counts", async () => {
    const user = userEvent.setup();
    const api = buildApi();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(
      <MemoryRouter>
        <LandingPage api={api} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /ask better questions with agents/i })).toBeInTheDocument();
    expect(screen.getByText(/browse questions, read articles, and sign in/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse questions/i })).toHaveAttribute("href", "/forum?type=question");
    expect(screen.getByRole("link", { name: /read articles/i })).toHaveAttribute("href", "/forum?type=article");
    expect(screen.queryByRole("link", { name: /read docs/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy agent prompt/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Connect this agent to TheAgentForum."));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/skill.md"));
    expect(screen.getByRole("button", { name: /prompt copied/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(api.listQuestions).toHaveBeenCalled();
      expect(screen.getByText("2 posts")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /posts live questions and discussions 2/i })).toHaveAttribute("href", "/forum?type=question");
      expect(screen.getByRole("link", { name: /articles research artifacts and long-form context 1/i })).toHaveAttribute("href", "/forum?type=article");
    });
  });

  it("renders the forum stream from live question data", async () => {
    const api = buildApi();

    render(
      <MemoryRouter>
        <ForumPage api={api} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: /^forum$/i })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: /search forum/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all/i })).toHaveAttribute("aria-pressed", "true");

    await waitFor(() => {
      expect(screen.getByText(/showing 3 items/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /how should agents share durable context/i })).toHaveAttribute(
        "href",
        "/posts/context-protocols",
      );
      expect(screen.getByRole("link", { name: /read article/i })).toHaveAttribute("href", "/posts/art-1");
      expect(screen.getByRole("heading", { name: /context graphs as public memory/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /sign in to start a post/i })).toBeInTheDocument();
    });
  });

  it("renders locked reply affordances for anonymous readers", async () => {
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
      const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
      expect(breadcrumb).toBeInTheDocument();
      expect(within(breadcrumb).getByRole("link", { name: "forum" })).toHaveAttribute("href", "/forum");
      expect(within(breadcrumb).getByRole("link", { name: "posts" })).toHaveAttribute("href", "/forum?type=question");
      expect(screen.getByText("extract-claims@0.3")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /sign in to reply/i })).toBeInTheDocument();
    });
  });

  it("links article breadcrumbs back to the article stream", async () => {
    const articleThread: QuestionThread = {
      question: {
        id: "art-1",
        title: "Reusable context report",
        body: [
          "Abstract",
          "",
          "Short summary.",
          "",
          "Introduction",
          "",
          "Context setup.",
          "",
          "## Results",
          "",
          "Useful findings.",
          "",
          "| Signal | Weight |",
          "| --- | ---: |",
          "| citation graph | 0.91 |",
          "",
          "$$confidence = evidence \\times freshness$$",
          "",
          "Conclusion",
          "",
          "Final note.",
          "",
          "References",
          "",
          "- Source",
        ].join("\n"),
        status: "open",
        createdAt: "2026-04-25T03:00:00.000Z",
        author: questions[0].author,
      },
      answers: [],
    };
    const api = buildApi({ getQuestionThread: vi.fn().mockResolvedValue(articleThread) });

    const { container } = render(
      <MemoryRouter initialEntries={["/posts/art-1"]}>
        <Routes>
          <Route path="/posts/:postId" element={<PostDetailPage api={api} />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.getQuestionThread).toHaveBeenCalledWith("art-1");
      const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i });
      expect(within(breadcrumb).getByRole("link", { name: "forum" })).toHaveAttribute("href", "/forum");
      expect(within(breadcrumb).getByRole("link", { name: "articles" })).toHaveAttribute("href", "/forum?type=article");
      expect(within(breadcrumb).getByText("Reusable context report")).toHaveAttribute("aria-current", "page");
      expect(container.querySelector(".terminal-main--reader")).toBeInTheDocument();
      expect(container.querySelector(".terminal-layout--article-reader")).toBeInTheDocument();
      expect(container.querySelector(".terminal-article-body")).toBeInTheDocument();
      expect(screen.getByRole("table").closest(".markdown-table-scroll")).toBeInTheDocument();
      expect(container.querySelector(".katex")).toBeInTheDocument();
      expect(screen.getByRole("complementary", { name: /article tools/i })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /post an answer/i })).not.toBeInTheDocument();
      const toc = screen.getByRole("complementary", { name: /article table of contents/i });
      expect(within(toc).getByRole("link", { name: "Abstract" })).toHaveAttribute("href", "#abstract");
      expect(within(toc).getByRole("link", { name: "Introduction" })).toHaveAttribute("href", "#introduction");
      expect(within(toc).getByRole("link", { name: "Results" })).toHaveAttribute("href", "#results");
      expect(within(toc).getByRole("link", { name: "Conclusion" })).toHaveAttribute("href", "#conclusion");
      expect(within(toc).getByRole("link", { name: "References" })).toHaveAttribute("href", "#references");
      expect(screen.getByRole("heading", { name: "Abstract" })).toHaveAttribute("id", "abstract");
    });
  });

  it("shows the authenticated composer without a handle field", async () => {
    const api = buildApi({
      getAuthSession: vi.fn().mockResolvedValue({
        actor: {
          id: "acct-1",
          kind: "human",
          handle: "eric@example.com",
          displayName: "Eric",
        },
        createdAt: "2026-04-25T00:00:00.000Z",
        expiresAt: "2026-05-02T00:00:00.000Z",
      }),
    });

    render(
      <MemoryRouter>
        <AuthProvider api={api}>
          <ForumPage api={api} />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Posting as Eric")).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/your handle/i)).not.toBeInTheDocument();
  });
});
