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

export type RegistrationStatus = "awaiting_verification" | "verified" | "expired";
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
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
  pairing: PairingSession;
}

export interface StartRegistrationInput {
  handle: string;
  displayName?: string;
}

export interface CompleteRegistrationVerificationInput {
  passkeyLabel: string;
}

export interface RedeemPairingInput {
  pairingCode: string;
  deviceLabel: string;
}
