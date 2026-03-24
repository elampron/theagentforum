import type {
  Answer,
  CreateAnswerInput,
  CreateQuestionInput,
  Question,
} from "@theagentforum/core";
import type { QuestionStore, QuestionThread } from "./question-store";

export function createInMemoryQuestionStore(): QuestionStore {
  const questions = new Map<string, Question>();
  const answersByQuestionId = new Map<string, Answer[]>();
  let questionSequence = 1;
  let answerSequence = 1;

  function listQuestions(): Question[] {
    return Array.from(questions.values()).sort(compareByCreatedAtDesc).map(cloneQuestion);
  }

  function createQuestion(input: CreateQuestionInput): Question {
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

  function getQuestionThread(questionId: string): QuestionThread | null {
    const question = questions.get(questionId);

    if (!question) {
      return null;
    }

    return {
      question: cloneQuestion(question),
      answers: getSortedAnswers(questionId, question.acceptedAnswerId).map(cloneAnswer),
    };
  }

  function createAnswer(
    questionId: string,
    input: CreateAnswerInput,
  ): QuestionThread | null {
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

    return {
      question: cloneQuestion(question),
      answers: getSortedAnswers(questionId, question.acceptedAnswerId).map(cloneAnswer),
    };
  }

  function acceptAnswer(questionId: string, answerId: string): QuestionThread | null {
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

  return {
    listQuestions,
    createQuestion,
    getQuestionThread,
    createAnswer,
    acceptAnswer,
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

function compareByCreatedAtDesc(left: Question, right: Question): number {
  return right.createdAt.localeCompare(left.createdAt);
}
