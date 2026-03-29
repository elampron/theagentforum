import type {
  Answer,
  AnswerSkill,
  CreateAnswerInput,
  CreateAnswerSkillInput,
  CreateQuestionInput,
  Question,
} from "@theagentforum/core";
import type { QuestionStore, QuestionThread } from "./question-store";
import type { StoredQuestionEnrichment } from "./enrichment/types";
import { rankThreads } from "./search";

export function createInMemoryQuestionStore(): QuestionStore {
  const questions = new Map<string, Question>();
  const answersByQuestionId = new Map<string, Answer[]>();
  const skillsByAnswerKey = new Map<string, AnswerSkill[]>();
  let questionSequence = 1;
  let answerSequence = 1;
  let answerSkillSequence = 1;

  async function listQuestions(): Promise<Question[]> {
    return Array.from(questions.values()).sort(compareByCreatedAtDesc).map(cloneQuestion);
  }

  async function createQuestion(input: CreateQuestionInput): Promise<Question> {
    const question: Question = {
      id: `q-${questionSequence++}`,
      title: input.title,
      body: input.body,
      author: input.author,
      status: "open",
      createdAt: new Date().toISOString(),
    };

    questions.set(question.id, question);
    answersByQuestionId.set(question.id, []);

    return cloneQuestion(question);
  }

  async function searchThreads(
    query: string,
    options: { status?: Question["status"]; limit?: number } = {},
  ) {
    return rankThreads(
      Array.from(questions.values()).map((question) => ({
        question,
        answers: (answersByQuestionId.get(question.id) ?? []).map((answer) => ({
          body: answer.body,
        })),
      })),
      query,
      options,
    );
  }

  async function getQuestionThread(questionId: string): Promise<QuestionThread | null> {
    const question = questions.get(questionId);

    if (!question) {
      return null;
    }

    return {
      question: cloneQuestion(question),
      answers: getSortedAnswers(questionId, question.acceptedAnswerId).map(cloneAnswer),
    };
  }

  async function getQuestionEnrichment(_questionId: string): Promise<StoredQuestionEnrichment | null> {
    return null;
  }

  async function createAnswer(
    questionId: string,
    input: CreateAnswerInput,
  ): Promise<QuestionThread | null> {
    const question = questions.get(questionId);

    if (!question) {
      return null;
    }

    const answer: Answer = {
      id: `a-${answerSequence++}`,
      questionId,
      body: input.body,
      author: input.author,
      createdAt: new Date().toISOString(),
    };

    const answers = answersByQuestionId.get(questionId) ?? [];
    answers.push(answer);
    answersByQuestionId.set(questionId, answers);
    skillsByAnswerKey.set(createAnswerKey(questionId, answer.id), []);

    return {
      question: cloneQuestion(question),
      answers: getSortedAnswers(questionId, question.acceptedAnswerId).map(cloneAnswer),
    };
  }

  async function acceptAnswer(questionId: string, answerId: string): Promise<QuestionThread | null> {
    const question = questions.get(questionId);

    if (!question) {
      return null;
    }

    const answers = answersByQuestionId.get(questionId) ?? [];
    const acceptedAnswer = answers.find((answer) => answer.id === answerId);

    if (!acceptedAnswer) {
      return null;
    }

    const acceptedAt = new Date().toISOString();

    for (const answer of answers) {
      if (answer.id === answerId) {
        answer.acceptedAt = acceptedAt;
      } else {
        delete answer.acceptedAt;
      }
    }

    question.acceptedAnswerId = answerId;
    question.status = "answered";

    return {
      question: cloneQuestion(question),
      answers: getSortedAnswers(questionId, question.acceptedAnswerId).map(cloneAnswer),
    };
  }

  async function listAnswerSkills(
    questionId: string,
    answerId: string,
  ): Promise<AnswerSkill[] | null> {
    if (!questions.has(questionId)) {
      return null;
    }

    if (!hasAnswer(questionId, answerId)) {
      return null;
    }

    const skills = skillsByAnswerKey.get(createAnswerKey(questionId, answerId)) ?? [];
    return skills.map(cloneAnswerSkill);
  }

  async function createAnswerSkill(
    questionId: string,
    answerId: string,
    input: CreateAnswerSkillInput,
  ): Promise<AnswerSkill | null> {
    if (!questions.has(questionId)) {
      return null;
    }

    if (!hasAnswer(questionId, answerId)) {
      return null;
    }

    const skill: AnswerSkill = {
      id: `sk-${answerSkillSequence++}`,
      questionId,
      answerId,
      name: input.name,
      content: input.content,
      url: input.url,
      mimeType: input.mimeType,
      createdAt: new Date().toISOString(),
    };

    const answerKey = createAnswerKey(questionId, answerId);
    const skills = skillsByAnswerKey.get(answerKey) ?? [];
    skills.push(skill);
    skillsByAnswerKey.set(answerKey, skills);

    return cloneAnswerSkill(skill);
  }

  function getSortedAnswers(questionId: string, acceptedAnswerId?: string): Answer[] {
    const answers = answersByQuestionId.get(questionId) ?? [];

    return [...answers].sort((left, right) => {
      const leftAccepted = left.id === acceptedAnswerId ? 1 : 0;
      const rightAccepted = right.id === acceptedAnswerId ? 1 : 0;

      if (leftAccepted !== rightAccepted) {
        return rightAccepted - leftAccepted;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
  }

  function hasAnswer(questionId: string, answerId: string): boolean {
    const answers = answersByQuestionId.get(questionId) ?? [];
    return answers.some((answer) => answer.id === answerId);
  }

  return {
    listQuestions,
    searchThreads,
    createQuestion,
    getQuestionThread,
    getQuestionEnrichment,
    createAnswer,
    acceptAnswer,
    listAnswerSkills,
    createAnswerSkill,
  };
}

function cloneQuestion(question: Question): Question {
  return {
    ...question,
    author: { ...question.author },
  };
}

function cloneAnswer(answer: Answer): Answer {
  return {
    ...answer,
    author: { ...answer.author },
  };
}

function cloneAnswerSkill(answerSkill: AnswerSkill): AnswerSkill {
  return { ...answerSkill };
}

function compareByCreatedAtDesc(left: Question, right: Question): number {
  return right.createdAt.localeCompare(left.createdAt);
}

function createAnswerKey(questionId: string, answerId: string): string {
  return `${questionId}:${answerId}`;
}
