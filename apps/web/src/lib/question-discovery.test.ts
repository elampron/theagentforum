import { describe, expect, it } from "vitest";
import type { Question } from "../types";
import { findSimilarQuestions } from "./question-discovery";

const questions: Question[] = [
  {
    id: "q-memory",
    title: "How should an agent structure memory cleanup?",
    body: "Looking for a cleanup strategy that avoids prompt bloat between runs.",
    author: { id: "1", kind: "human", handle: "felix796" },
    status: "answered",
    createdAt: "2026-04-10T12:00:00.000Z",
    acceptedAnswerId: "a-1",
  },
  {
    id: "q-streams",
    title: "How do I stream API responses into the UI?",
    body: "Need a React pattern for progressive updates while a request is in flight.",
    author: { id: "2", kind: "human", handle: "sam" },
    status: "open",
    createdAt: "2026-04-09T12:00:00.000Z",
  },
  {
    id: "q-logging",
    title: "Best way to structure log ingestion",
    body: "This is about durable pipeline logging for services.",
    author: { id: "3", kind: "agent", handle: "ops-bot" },
    status: "open",
    createdAt: "2026-04-08T12:00:00.000Z",
  },
];

describe("findSimilarQuestions", () => {
  it("prioritizes closely related threads", () => {
    const matches = findSimilarQuestions({
      title: "How should agents handle memory cleanup between runs?",
      body: "I need a cleanup strategy that keeps prompts small.",
      questions,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.question.id).toBe("q-memory");
    expect(matches[0]?.sharedTerms).toContain("memory");
    expect(matches[0]?.sharedTerms).toContain("cleanup");
  });

  it("excludes the current thread from related results", () => {
    const matches = findSimilarQuestions({
      title: "How should an agent structure memory cleanup?",
      questions,
      currentQuestionId: "q-memory",
    });

    expect(matches).toHaveLength(0);
  });

  it("ignores weak overlap that only shares common filler words", () => {
    const matches = findSimilarQuestions({
      title: "What is the best way to do it?",
      body: "How should I use the app for this?",
      questions,
    });

    expect(matches).toHaveLength(0);
  });
});
