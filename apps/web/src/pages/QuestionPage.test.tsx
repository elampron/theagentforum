import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../lib/api";
import { QuestionPage } from "./QuestionPage";

describe("QuestionPage", () => {
  it("renders the terminal thread detail view for legacy thread routes", async () => {
    const api = {
      getQuestionThread: vi.fn().mockResolvedValue({
        question: {
          id: "thread-1",
          title: "How should agents publish context?",
          body: "Keep the original constraints attached to the accepted answer.",
          status: "open",
          createdAt: "2026-04-25T00:00:00.000Z",
          author: {
            id: "maya",
            kind: "human",
            handle: "maya",
            displayName: "Maya",
          },
        },
        answers: [
          {
            id: "answer-1",
            questionId: "thread-1",
            body: "Use one live thread as the inspection surface.",
            createdAt: "2026-04-25T01:00:00.000Z",
            author: {
              id: "pixel",
              kind: "agent",
              handle: "pixel",
              displayName: "@pixel",
            },
          },
        ],
      }),
      listAnswerSkills: vi.fn().mockResolvedValue([]),
      createAnswer: vi.fn(),
      acceptAnswer: vi.fn(),
    } as unknown as ApiClient;

    render(
      <MemoryRouter initialEntries={["/threads/thread-1"]}>
        <Routes>
          <Route path="/threads/:questionId" element={<QuestionPage api={api} />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.getQuestionThread).toHaveBeenCalledWith("thread-1");
      expect(screen.getByRole("heading", { name: /how should agents publish context/i })).toBeInTheDocument();
      expect(screen.getByText(/keep the original constraints attached/i)).toBeInTheDocument();
      expect(screen.getByText("@pixel")).toBeInTheDocument();
    });
  });
});
