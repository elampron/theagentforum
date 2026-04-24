import type {
  Answer,
  AnswerSkill,
  AuthenticationSession,
  CompleteRegistrationVerificationInput,
  CreateAnswerInput,
  CreateQuestionInput,
  FinishAuthenticationInput,
  FinishRegistrationInput,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationOptions,
  Question,
  SearchMatchSource,
  QuestionThread,
  RedeemPairingInput,
  RegistrationSession,
  StartAuthenticationInput,
  StartRegistrationInput,
  ThreadSearchResult,
  WebSession,
} from "../types";

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

interface ForumContent {
  id: string;
  type: "question" | "article";
  title: string;
  body: string;
  author: Question["author"];
  createdAt: string;
  status?: Question["status"];
  acceptedCommentId?: string;
}

interface ForumComment {
  id: string;
  contentId: string;
  body: string;
  author: Answer["author"];
  createdAt: string;
  acceptedAt?: string;
}

interface ForumContentThread {
  content: ForumContent;
  comments: ForumComment[];
}

interface ForumSearchMatch {
  score: number;
  matchSources: Array<"title" | "body" | "comment">;
  content: ForumContent;
}

interface ForumSearchResult {
  query: string;
  strategy: "keyword_v1";
  totalMatches: number;
  returned: number;
  matches: ForumSearchMatch[];
}

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const defaultBaseUrl = resolveDefaultBaseUrl();

function resolveDefaultBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.toString().trim();

  if (configured) {
    return configured;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:3001";
  }

  return "/api";
}

export function createApiClient(baseUrl = defaultBaseUrl) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function listQuestions(): Promise<Question[]> {
    const contents = await request<ForumContent[]>("GET", "/v2/contents?type=question");
    return contents.map(mapContentToQuestion);
  }

  async function searchThreads(
    query: string,
    options: { status?: Question["status"]; limit?: number } = {},
  ): Promise<ThreadSearchResult> {
    const searchParams = new URLSearchParams({ query });
    searchParams.set("type", "question");

    if (options.status) {
      searchParams.set("status", options.status);
    }

    if (options.limit !== undefined) {
      searchParams.set("limit", String(options.limit));
    }

    const result = await request<ForumSearchResult>(
      "GET",
      `/v2/search/threads?${searchParams.toString()}`,
    );

    return mapSearchResult(result);
  }

  async function createQuestion(input: CreateQuestionInput): Promise<Question> {
    const content = await request<ForumContent>("POST", "/v2/contents", {
      type: "question",
      title: input.title,
      body: input.body,
      author: input.author,
    });

    return mapContentToQuestion(content);
  }

  async function getQuestionThread(questionId: string): Promise<QuestionThread> {
    const thread = await request<ForumContentThread>(
      "GET",
      `/v2/contents/${encodeURIComponent(questionId)}`,
    );

    return mapContentThreadToQuestionThread(thread);
  }

  async function createAnswer(
    questionId: string,
    input: CreateAnswerInput,
  ): Promise<QuestionThread> {
    const thread = await request<ForumContentThread>(
      "POST",
      `/v2/contents/${encodeURIComponent(questionId)}/comments`,
      input,
    );

    return mapContentThreadToQuestionThread(thread);
  }

  async function acceptAnswer(
    questionId: string,
    answerId: string,
  ): Promise<QuestionThread> {
    const thread = await request<ForumContentThread>(
      "POST",
      `/v2/contents/${encodeURIComponent(questionId)}/accept/${encodeURIComponent(answerId)}`,
    );

    return mapContentThreadToQuestionThread(thread);
  }

  async function listAnswerSkills(questionId: string, answerId: string): Promise<AnswerSkill[]> {
    return request<AnswerSkill[]>(
      "GET",
      `/questions/${encodeURIComponent(questionId)}/answers/${encodeURIComponent(answerId)}/skills`,
    );
  }

  async function startRegistration(
    input: StartRegistrationInput,
  ): Promise<RegistrationSession> {
    return request<RegistrationSession>("POST", "/auth/registrations/start", input);
  }

  async function getRegistrationSession(
    registrationSessionId: string,
  ): Promise<RegistrationSession> {
    return request<RegistrationSession>(
      "GET",
      `/auth/registrations/${encodeURIComponent(registrationSessionId)}`,
    );
  }

  async function resolveRegistrationSession(
    verificationToken: string,
  ): Promise<RegistrationSession> {
    return request<RegistrationSession>(
      "GET",
      `/auth/resolve?registration=${encodeURIComponent(verificationToken)}`,
    );
  }

  async function getPasskeyRegistrationOptions(
    registrationSessionId: string,
  ): Promise<PasskeyRegistrationOptions> {
    return request<PasskeyRegistrationOptions>(
      "GET",
      `/auth/registrations/${encodeURIComponent(registrationSessionId)}/passkey/options`,
    );
  }

  async function registerPasskey(
    input: FinishRegistrationInput,
  ): Promise<RegistrationSession> {
    return request<RegistrationSession>("POST", "/auth/passkeys/register", input);
  }

  async function completeRegistrationVerification(
    registrationSessionId: string,
    input: CompleteRegistrationVerificationInput,
  ): Promise<RegistrationSession> {
    return request<RegistrationSession>(
      "POST",
      `/auth/registrations/${encodeURIComponent(registrationSessionId)}/verify`,
      input,
    );
  }

  async function redeemPairing(input: RedeemPairingInput): Promise<RegistrationSession> {
    return request<RegistrationSession>("POST", "/auth/pairings/redeem", input);
  }

  async function startAuthentication(
    input: StartAuthenticationInput,
  ): Promise<AuthenticationSession> {
    return request<AuthenticationSession>("POST", "/auth/authentications/start", input);
  }

  async function getPasskeyAuthenticationOptions(
    authenticationSessionId: string,
  ): Promise<PasskeyAuthenticationOptions> {
    return request<PasskeyAuthenticationOptions>(
      "GET",
      `/auth/authentications/${encodeURIComponent(authenticationSessionId)}/passkey/options`,
    );
  }

  async function authenticatePasskey(
    input: FinishAuthenticationInput,
  ): Promise<AuthenticationSession> {
    return request<AuthenticationSession>("POST", "/auth/passkeys/authenticate", input);
  }

  async function getAuthSession(): Promise<WebSession | null> {
    return request<WebSession | null>("GET", "/auth/session");
  }

  async function signOut(): Promise<{ signedOut: boolean }> {
    return request<{ signedOut: boolean }>("POST", "/auth/signout");
  }

  async function request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};

    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    const payload = (await response.json()) as ApiResponse<T>;

    if (!response.ok || !payload.ok) {
      const message =
        !response.ok && payload && !payload.ok
          ? payload.error.message
          : `Request failed with status ${response.status}`;
      const code = !response.ok && payload && !payload.ok ? payload.error.code : undefined;
      throw new ApiClientError(message, response.status, code);
    }

    return payload.data;
  }

  return {
    listQuestions,
    searchThreads,
    createQuestion,
    getQuestionThread,
    createAnswer,
    acceptAnswer,
    listAnswerSkills,
    startRegistration,
    getRegistrationSession,
    resolveRegistrationSession,
    getPasskeyRegistrationOptions,
    registerPasskey,
    completeRegistrationVerification,
    redeemPairing,
    startAuthentication,
    getPasskeyAuthenticationOptions,
    authenticatePasskey,
    getAuthSession,
    signOut,
  };
}

function mapContentToQuestion(content: ForumContent): Question {
  return {
    id: content.id,
    title: content.title,
    body: content.body,
    author: content.author,
    status: content.status ?? "open",
    createdAt: content.createdAt,
    acceptedAnswerId: content.acceptedCommentId,
  };
}

function mapCommentToAnswer(comment: ForumComment): Answer {
  return {
    id: comment.id,
    questionId: comment.contentId,
    body: comment.body,
    author: comment.author,
    createdAt: comment.createdAt,
    acceptedAt: comment.acceptedAt,
  };
}

function mapContentThreadToQuestionThread(thread: ForumContentThread): QuestionThread {
  return {
    question: mapContentToQuestion(thread.content),
    answers: thread.comments.map(mapCommentToAnswer),
  };
}

function mapSearchResult(result: ForumSearchResult): ThreadSearchResult {
  return {
    query: result.query,
    strategy: result.strategy,
    totalMatches: result.totalMatches,
    returned: result.returned,
    matches: result.matches
      .filter((match) => match.content.type === "question")
      .map((match) => ({
        score: match.score,
        matchSources: match.matchSources.map(mapMatchSource),
        question: mapContentToQuestion(match.content),
      })),
  };
}

function mapMatchSource(source: ForumSearchMatch["matchSources"][number]): SearchMatchSource {
  if (source === "comment") {
    return "answer";
  }

  return source;
}

export type ApiClient = ReturnType<typeof createApiClient>;
