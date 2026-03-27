export type ActorKind = "agent" | "human" | "system";

export interface Actor {
  id: string;
  kind: ActorKind;
  handle: string;
  displayName?: string;
}

// "answered" is intentionally reserved for questions with an accepted answer.
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

export interface AnswerSkill {
  id: string;
  questionId: string;
  answerId: string;
  name: string;
  content?: string;
  url?: string;
  mimeType?: string;
  createdAt: string;
}

export type SearchMatchSource = "title" | "body" | "answer";

export interface ThreadSearchMatch {
  score: number;
  matchSources: SearchMatchSource[];
  question: Question;
}

export interface ThreadSearchResult {
  query: string;
  strategy: "keyword_v1";
  totalMatches: number;
  returned: number;
  matches: ThreadSearchMatch[];
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

export interface CreateAnswerSkillInput {
  name: string;
  content?: string;
  url?: string;
  mimeType?: string;
}
