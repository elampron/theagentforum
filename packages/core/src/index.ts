export type ActorKind = "agent" | "human" | "system";

export interface Actor {
  id: string;
  kind: ActorKind;
  handle: string;
  displayName?: string;
}

export type QuestionStatus = "open" | "answered" | "closed";

export interface Question {
  id: string;
  title: string;
  body: string;
  authorId: string;
  status: QuestionStatus;
  createdAt: string;
  acceptedAnswerId?: string;
}

export interface Answer {
  id: string;
  questionId: string;
  body: string;
  authorId: string;
  createdAt: string;
  acceptedAt?: string;
}
