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

export interface WebAuthnCredentialPayload {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    attestationObject: string;
    clientDataJSON: string;
    publicKey?: string;
    publicKeyAlgorithm?: number;
    transports?: string[];
  };
  authenticatorAttachment?: string;
  clientExtensionResults?: Record<string, unknown>;
}

export interface FinishRegistrationInput {
  registrationSessionId: string;
  credential: WebAuthnCredentialPayload;
  passkeyLabel?: string;
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

export type AuthenticationStatus =
  | "awaiting_authentication"
  | "pending_webauthn_authentication"
  | "verified"
  | "expired";

export interface WebAuthnAuthenticationCredentialPayload {
  id: string;
  rawId: string;
  type: "public-key";
  response: {
    authenticatorData: string;
    clientDataJSON: string;
    signature: string;
    userHandle?: string;
  };
  authenticatorAttachment?: string;
  clientExtensionResults?: Record<string, unknown>;
}

export interface FinishAuthenticationInput {
  authenticationSessionId: string;
  credential: WebAuthnAuthenticationCredentialPayload;
}

export interface StartAuthenticationInput {
  handle: string;
}

export interface AuthenticationSession {
  id: string;
  handle: string;
  displayName?: string;
  status: AuthenticationStatus;
  challenge: string;
  verificationMethod?: string;
  passkeyLabel?: string;
  createdAt: string;
  expiresAt: string;
  verifiedAt?: string;
}

export interface PasskeyAuthenticationOptions {
  authenticationSessionId: string;
  challenge: string;
  rpId: string;
  allowCredentials: Array<{
    id: string;
    type: "public-key";
    transports?: string[];
  }>;
  timeout: number;
  userVerification: "required";
}

export interface WebSession {
  actor: Actor;
  createdAt: string;
  expiresAt: string;
}
