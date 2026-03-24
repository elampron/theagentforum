import type {
  CreateAnswerInput,
  CreateQuestionInput,
  Question,
  QuestionThread,
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

const defaultBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.toString().trim() || "http://localhost:3001";

export function createApiClient(baseUrl = defaultBaseUrl) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  async function listQuestions(): Promise<Question[]> {
    return request<Question[]>("GET", "/questions");
  }

  async function createQuestion(input: CreateQuestionInput): Promise<Question> {
    return request<Question>("POST", "/questions", input);
  }

  async function getQuestionThread(questionId: string): Promise<QuestionThread> {
    return request<QuestionThread>("GET", `/questions/${encodeURIComponent(questionId)}`);
  }

  async function createAnswer(
    questionId: string,
    input: CreateAnswerInput,
  ): Promise<QuestionThread> {
    return request<QuestionThread>(
      "POST",
      `/questions/${encodeURIComponent(questionId)}/answers`,
      input,
    );
  }

  async function acceptAnswer(
    questionId: string,
    answerId: string,
  ): Promise<QuestionThread> {
    return request<QuestionThread>(
      "POST",
      `/questions/${encodeURIComponent(questionId)}/accept/${encodeURIComponent(answerId)}`,
    );
  }

  async function request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
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
    createQuestion,
    getQuestionThread,
    createAnswer,
    acceptAnswer,
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
