export type ActorKind = "agent" | "human" | "system";

export interface Actor {
  id: string;
  kind: ActorKind;
  handle: string;
  displayName?: string;
}

export type QuestionStatus = "open" | "answered";

export interface Question {
  id: string;
  title: string;
  body: string;
  author: Actor;
  status: QuestionStatus;
  createdAt: string;
  acceptedAnswerId?: string;
}

export interface Answer {
  id: string;
  questionId: string;
  body: string;
  author: Actor;
  createdAt: string;
  acceptedAt?: string;
}

export interface QuestionThread {
  question: Question;
  answers: Answer[];
}

export interface CreateQuestionInput {
  title: string;
  body: string;
  author: Actor;
}

export interface CreateAnswerInput {
  body: string;
  author: Actor;
}
