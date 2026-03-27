import type {
  Answer,
  AnswerSkill,
  CreateAnswerInput,
  CreateAnswerSkillInput,
  CreateQuestionInput,
  Question,
  ThreadSearchResult,
} from "@theagentforum/core";

export interface QuestionThread {
  question: Question;
  answers: Answer[];
}

export interface QuestionStore {
  listQuestions(): Promise<Question[]>;
  searchThreads(query: string, options?: { status?: Question["status"]; limit?: number }): Promise<ThreadSearchResult>;
  createQuestion(input: CreateQuestionInput): Promise<Question>;
  getQuestionThread(questionId: string): Promise<QuestionThread | null>;
  createAnswer(questionId: string, input: CreateAnswerInput): Promise<QuestionThread | null>;
  acceptAnswer(questionId: string, answerId: string): Promise<QuestionThread | null>;
  listAnswerSkills(questionId: string, answerId: string): Promise<AnswerSkill[] | null>;
  createAnswerSkill(
    questionId: string,
    answerId: string,
    input: CreateAnswerSkillInput,
  ): Promise<AnswerSkill | null>;
}
