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

export type RegistrationStatus =
  | "awaiting_verification"
  | "pending_webauthn_registration"
  | "verified"
  | "expired";

export type PairingStatus =
  | "waiting_for_verification"
  | "ready_to_pair"
  | "paired"
  | "expired";

export interface PairingSession {
  id: string;
  code: string;
  status: PairingStatus;
  deviceLabel?: string;
  token?: string;
  createdAt: string;
  expiresAt: string;
  redeemedAt?: string;
}

export interface RegistrationSession {
  id: string;
  handle: string;
  displayName?: string;
  status: RegistrationStatus;
  challenge: string;
  verificationMethod?: string;
  passkeyLabel?: string;
  verificationUrl?: string;
  verificationToken?: string;
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
  pairing: PairingSession;
}

export interface StartRegistrationInput {
  handle: string;
  displayName?: string;
}

export interface FinishRegistrationInput {
  registrationSessionId: string;
  attestationResponse: string;
  clientDataJson: string;
  passkeyLabel?: string;
}

export interface CompleteRegistrationVerificationInput {
  passkeyLabel: string;
}

export interface RedeemPairingInput {
  pairingCode: string;
  deviceLabel: string;
}

export interface PasskeyRegistrationOptions {
  registrationSessionId: string;
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  challenge: string;
  pubKeyCredParams: Array<{
    type: "public-key";
    alg: number;
  }>;
  timeout: number;
  attestation: "none";
  authenticatorSelection: {
    residentKey: "preferred";
    userVerification: "preferred";
  };
}

// Forum v2 model — additive to preserve v1 compatibility
export type ContentType = "question" | "article";

export interface ContentBase {
  id: string;
  type: ContentType;
  title: string;
  body: string;
  author: Actor;
  createdAt: string;
}

export interface QuestionContent extends ContentBase {
  type: "question";
  // When a question has an accepted answer/comment, this points to the comment id.
  acceptedCommentId?: string;
  // v1 compatibility status field — only meaningful for questions.
  status: QuestionStatus;
}

export interface ArticleContent extends ContentBase {
  type: "article";
}

export type Content = QuestionContent | ArticleContent;

export interface Comment {
  id: string;
  contentId: string;
  body: string;
  author: Actor;
  createdAt: string;
  // For question threads, the accepted comment is marked with acceptedAt
  acceptedAt?: string;
}

export interface CreateContentInput {
  type: ContentType;
  title: string;
  body: string;
  author: Actor;
}

export interface CreateCommentInput {
  body: string;
  author: Actor;
}

export interface ContentThread {
  content: Content;
  comments: Comment[];
}

export type ContentSearchMatchSource = "title" | "body" | "comment";

export interface ContentThreadSearchMatch {
  score: number;
  matchSources: ContentSearchMatchSource[];
  content: Content;
}

export interface ContentThreadSearchResult {
  query: string;
  strategy: "keyword_v1";
  totalMatches: number;
  returned: number;
  matches: ContentThreadSearchMatch[];
}
