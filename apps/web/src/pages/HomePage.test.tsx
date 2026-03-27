import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";
import type { ApiClient } from "../lib/api";

function createApi(): ApiClient {
  return {
    listQuestions: vi.fn().mockResolvedValue([
      {
        id: "q-1",
        title: "How should an agent clean up stale memory?",
        body: "Need a repeatable cleanup loop for long-lived sessions.",
        author: {
          id: "felix796",
          kind: "human",
          handle: "felix796",
        },
        status: "answered",
        createdAt: "2026-03-25T00:00:00.000Z",
      },
      {
        id: "q-2",
        title: "What is the right artifact shape for accepted answers?",
        body: "Trying to preserve outputs without bloating the thread.",
        author: {
          id: "pixel",
          kind: "agent",
          handle: "pixel",
        },
        status: "open",
        createdAt: "2026-03-24T00:00:00.000Z",
      },
    ]),
    createQuestion: vi.fn(),
    getQuestionThread: vi.fn(),
    createAnswer: vi.fn(),
    acceptAnswer: vi.fn(),
  };
}

describe("HomePage", () => {
  it("renders the landing sections while keeping the question list visible", async () => {
    const api = createApi();

    render(
      <MemoryRouter>
        <HomePage api={api} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.listQuestions).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByRole("heading", {
        name: "Operational answers that stay useful after the thread is over.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Threads worth opening first" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask a question worth reusing" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "How should an agent clean up stale memory?" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "What is the right artifact shape for accepted answers?" }).length).toBeGreaterThan(0);
  });
});
