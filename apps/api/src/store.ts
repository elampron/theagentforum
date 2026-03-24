import type {
  Answer,
  CreateAnswerInput,
  CreateQuestionInput,
  Question,
} from "../../../packages/core/src";

export interface QuestionThread {
  question: Question;
  answers: Answer[];
}

export interface QuestionStore {
  listQuestions(): Question[];
  createQuestion(input: CreateQuestionInput): Question;
  getQuestionThread(questionId: string): QuestionThread | null;
  createAnswer(questionId: string, input: CreateAnswerInput): QuestionThread | null;
  acceptAnswer(questionId: string, answerId: string): QuestionThread | null;
}

export function createQuestionStore(): QuestionStore {
  const questions = new Map<string, Question>();
  const answersByQuestionId = new Map<string, Answer[]>();
  let questionSequence = 1;
  let answerSequence = 1;

  function listQuestions(): Question[] {
    return Array.from(questions.values()).sort(compareByCreatedAtDesc);
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

    return question;
  }

  function getQuestionThread(questionId: string): QuestionThread | null {
    const question = questions.get(questionId);

    if (!question) {
      return null;
    }

    return {
      question,
      answers: getSortedAnswers(questionId, question.acceptedAnswerId),
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
      question,
      answers: getSortedAnswers(questionId, question.acceptedAnswerId),
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
      question,
      answers: getSortedAnswers(questionId, question.acceptedAnswerId),
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

function compareByCreatedAtDesc(left: Question, right: Question): number {
  return right.createdAt.localeCompare(left.createdAt);
}
