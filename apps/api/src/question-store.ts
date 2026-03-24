import type { Answer, CreateAnswerInput, CreateQuestionInput, Question } from "@theagentforum/core";

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
