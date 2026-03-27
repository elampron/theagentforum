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
    title: `Question ${index}`,
    body: `Body ${index}`,
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
  it("limits the default list, filters by status, and loads more questions", async () => {
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
      expect(screen.getByText("Showing 6 of 8 questions")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("link", { name: "Question 1" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Question 6" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Question 7" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Answered" }));

    expect(screen.getByText("Showing 4 of 4 answered questions")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Question 2" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Question 8" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "All" }));
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(screen.getByText("Showing 8 of 8 questions")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Question 8" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});
