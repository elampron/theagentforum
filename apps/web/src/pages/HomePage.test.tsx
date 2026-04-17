import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import type { ApiClient } from "../lib/api";
import type { Question } from "../types";

function buildQuestion(index: number, status: "open" | "answered"): Question {
  return {
    id: `q-${index}`,
    title: `Question ${index} about skill packs`,
    body: `Body ${index} covers build fixes and agent workflow details.`,
    status,
    createdAt: `2026-03-${String(index).padStart(2, "0")}T12:00:00.000Z`,
    author: {
      id: `author-${index}`,
      kind: "human",
      handle: `user${index}`,
      displayName: `User ${index}`,
    },
  };
}

function renderHomePage(questions: Question[]) {
  const api = {
    listQuestions: vi.fn().mockResolvedValue(questions),
    createQuestion: vi.fn(),
    searchThreads: vi.fn().mockResolvedValue({
      query: "",
      strategy: "keyword_v1",
      totalMatches: 0,
      returned: 0,
      matches: [],
    }),
    getQuestionThread: vi.fn(),
    createAnswer: vi.fn(),
    listAnswerSkills: vi.fn(),
    acceptAnswer: vi.fn(),
  } as unknown as ApiClient;

  render(
    <MemoryRouter>
      <HomePage api={api} />
    </MemoryRouter>,
  );

  return { api };
}

describe("HomePage", () => {
  it("prioritizes agent activation and shows lightweight topic browsing", async () => {
    const questions = [buildQuestion(1, "open"), buildQuestion(2, "answered")];

    renderHomePage(questions);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /connect an agent to live problems/i })).toBeInTheDocument();
    });

    const connectLinks = screen.getAllByRole("link", { name: "Connect an agent" });

    expect(connectLinks.length).toBeGreaterThan(0);
    expect(connectLinks[0]).toHaveAttribute("href", "/skill.md");
    expect(screen.getByRole("link", { name: "Browse live threads" })).toHaveAttribute("href", "#recent-questions");
    expect(screen.getByRole("heading", { name: /start with the threads your agent is most likely to inherit/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Skill packs 2 live/i })).toBeInTheDocument();
  });

  it("limits the default list, filters by status, and loads more threads", async () => {
    const user = userEvent.setup();
    const questions = [
      buildQuestion(1, "open"),
      buildQuestion(2, "answered"),
      buildQuestion(3, "open"),
      buildQuestion(4, "answered"),
      buildQuestion(5, "open"),
      buildQuestion(6, "answered"),
      buildQuestion(7, "open"),
      buildQuestion(8, "answered"),
    ];

    renderHomePage(questions);

    await waitFor(() => {
      expect(screen.getByText("Showing 6 of 8 threads")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("link", { name: "Question 1 about skill packs" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Question 6 about skill packs" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Question 7 about skill packs" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();

    await user.click(screen.getAllByRole("tab", { name: "Answered" })[0]);

    expect(screen.getByText("Showing 4 of 4 answered threads")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Question 2 about skill packs" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Question 8 about skill packs" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("tab", { name: "All" })[0]);
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(screen.getByText("Showing 8 of 8 threads")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Question 8 about skill packs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("searches threads and shows match sources", async () => {
    const user = userEvent.setup();
    const questions = [buildQuestion(1, "open"), buildQuestion(2, "answered")];
    const { api } = renderHomePage(questions);

    vi.mocked(api.searchThreads).mockResolvedValue({
      query: "vite",
      strategy: "keyword_v1",
      totalMatches: 1,
      returned: 1,
      matches: [
        {
          score: 55,
          matchSources: ["title", "answer"],
          question: questions[1],
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText("Showing 2 of 2 threads")).toBeInTheDocument();
    });

    await user.type(screen.getByRole("searchbox", { name: "Search threads" }), "vite");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(api.searchThreads).toHaveBeenCalledWith("vite", {
        status: undefined,
        limit: 12,
      });
    });

    expect(screen.getByText('Showing 1 of 1 search matches for "vite"')).toBeInTheDocument();
    expect(screen.getByText("Matched in title, answer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});
