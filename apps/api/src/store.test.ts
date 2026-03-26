import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryQuestionStore } from "./memory-question-store";

const humanAuthor = {
  id: "user-1",
  kind: "human" as const,
  handle: "felix796",
};

const agentAuthor = {
  id: "agent-1",
  kind: "agent" as const,
  handle: "pixel",
};

describe("createQuestionStore", () => {
  it("creates questions and lists newest first", async () => {
    const store = createInMemoryQuestionStore();

    const first = await store.createQuestion({
      title: "First question",
      body: "Body 1",
      author: humanAuthor,
    });

    await sleep(2);

    const second = await store.createQuestion({
      title: "Second question",
      body: "Body 2",
      author: humanAuthor,
    });

    const listed = await store.listQuestions();

    assert.equal(listed.length, 2);
    assert.equal(listed[0].id, second.id);
    assert.equal(listed[1].id, first.id);
  });

  it("creates answers and returns thread with answers sorted by createdAt", async () => {
    const store = createInMemoryQuestionStore();

    const question = await store.createQuestion({
      title: "How to test?",
      body: "Need examples",
      author: humanAuthor,
    });

    const threadAfterFirstAnswer = await store.createAnswer(question.id, {
      body: "Answer A",
      author: agentAuthor,
    });

    assert.ok(threadAfterFirstAnswer);
    assert.equal(threadAfterFirstAnswer.question.id, question.id);
    assert.equal(threadAfterFirstAnswer.answers.length, 1);

    await sleep(2);

    const threadAfterSecondAnswer = await store.createAnswer(question.id, {
      body: "Answer B",
      author: agentAuthor,
    });

    assert.ok(threadAfterSecondAnswer);
    assert.equal(threadAfterSecondAnswer.answers.length, 2);
    assert.equal(threadAfterSecondAnswer.answers[0].body, "Answer A");
    assert.equal(threadAfterSecondAnswer.answers[1].body, "Answer B");
  });

  it("accepts an answer and marks question as answered", async () => {
    const store = createInMemoryQuestionStore();

    const question = await store.createQuestion({
      title: "Pick best answer",
      body: "Which one is right?",
      author: humanAuthor,
    });

    const firstThread = await store.createAnswer(question.id, {
      body: "First candidate",
      author: agentAuthor,
    });
    assert.ok(firstThread);

    await sleep(2);

    const secondThread = await store.createAnswer(question.id, {
      body: "Second candidate",
      author: humanAuthor,
    });
    assert.ok(secondThread);

    const answerToAccept = secondThread.answers[1];

    const acceptedThread = await store.acceptAnswer(question.id, answerToAccept.id);
    assert.ok(acceptedThread);

    assert.equal(acceptedThread.question.status, "answered");
    assert.equal(acceptedThread.question.acceptedAnswerId, answerToAccept.id);

    assert.equal(acceptedThread.answers[0].id, answerToAccept.id);
    assert.ok(acceptedThread.answers[0].acceptedAt);

    const otherAnswer = acceptedThread.answers[1];
    assert.equal(otherAnswer.acceptedAt, undefined);
  });

  it("returns null when question is missing for read/write operations", async () => {
    const store = createInMemoryQuestionStore();

    assert.equal(await store.getQuestionThread("q-404"), null);
    assert.equal(
      await store.createAnswer("q-404", {
        body: "No question",
        author: humanAuthor,
      }),
      null,
    );
    assert.equal(await store.acceptAnswer("q-404", "a-1"), null);
  });

  it("returns null when accepting an answer not in the question", async () => {
    const store = createInMemoryQuestionStore();

    const question = await store.createQuestion({
      title: "Accept flow",
      body: "Find missing answer",
      author: humanAuthor,
    });

    const accepted = await store.acceptAnswer(question.id, "a-999");
    assert.equal(accepted, null);
  });

  it("stores and lists answer-attached skills", async () => {
    const store = createInMemoryQuestionStore();

    const question = await store.createQuestion({
      title: "How should reusable artifacts attach?",
      body: "Need a minimal storage model",
      author: humanAuthor,
    });

    const thread = await store.createAnswer(question.id, {
      body: "Store them on answers without executing anything.",
      author: agentAuthor,
    });
    assert.ok(thread);

    const answerId = thread.answers[0].id;
    const created = await store.createAnswerSkill(question.id, answerId, {
      name: "cleanup-skill",
      content: "# skill contents",
      mimeType: "text/markdown",
    });

    assert.ok(created);
    assert.equal(created.name, "cleanup-skill");
    assert.equal(created.answerId, answerId);

    const listed = await store.listAnswerSkills(question.id, answerId);
    assert.deepEqual(listed, [created]);
  });

  it("returns cloned answer skill data so callers cannot mutate store state", async () => {
    const store = createInMemoryQuestionStore();

    const question = await store.createQuestion({
      title: "Protect stored skill metadata",
      body: "Need immutable reads",
      author: humanAuthor,
    });

    const thread = await store.createAnswer(question.id, {
      body: "Attach a skill after answering.",
      author: agentAuthor,
    });
    assert.ok(thread);

    const skill = await store.createAnswerSkill(question.id, thread.answers[0].id, {
      name: "immutable-skill",
      url: "https://example.com/skill.json",
    });
    assert.ok(skill);

    skill.name = "changed-outside-store";

    const listed = await store.listAnswerSkills(question.id, thread.answers[0].id);
    assert.equal(listed?.[0]?.name, "immutable-skill");
  });

  it("returns null for answer skill operations when question or answer is missing", async () => {
    const store = createInMemoryQuestionStore();

    assert.equal(await store.listAnswerSkills("q-404", "a-1"), null);
    assert.equal(
      await store.createAnswerSkill("q-404", "a-1", {
        name: "missing-question",
        content: "data",
      }),
      null,
    );

    const question = await store.createQuestion({
      title: "Existing question",
      body: "But no such answer",
      author: humanAuthor,
    });

    assert.equal(await store.listAnswerSkills(question.id, "a-404"), null);
    assert.equal(
      await store.createAnswerSkill(question.id, "a-404", {
        name: "missing-answer",
        url: "https://example.com/missing.json",
      }),
      null,
    );
  });

  it("returns cloned data so callers cannot mutate in-memory state directly", async () => {
    const store = createInMemoryQuestionStore();

    const question = await store.createQuestion({
      title: "Mutation safety",
      body: "Protect in-memory state",
      author: humanAuthor,
    });

    question.title = "Changed outside the store";

    const listed = await store.listQuestions();
    assert.equal(listed[0].title, "Mutation safety");
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
