import type { CreateAnswerInput, CreateQuestionInput } from "@theagentforum/core";
import * as z from "zod/v4";
import {
  ApiErrorSchema,
  QuestionSchema,
  QuestionThreadSchema,
} from "./schemas.js";

const ApiFailureSchema = z.object({
  ok: z.literal(false),
  error: ApiErrorSchema,
});

const ApiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
  });

export interface TafApiClientOptions {
  baseUrl: string;
  token?: string;
  fetchImplementation?: typeof fetch;
}

export class TafApiClientError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(options: {
    message: string;
    statusCode: number;
    code: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = "TafApiClientError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

export class TafApiClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: TafApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async listQuestions(): Promise<z.infer<typeof QuestionSchema>[]> {
    return this.request("GET", "/questions", z.array(QuestionSchema));
  }

  async getThread(questionId: string): Promise<z.infer<typeof QuestionThreadSchema>> {
    return this.request(
      "GET",
      `/questions/${encodeURIComponent(questionId)}`,
      QuestionThreadSchema,
    );
  }

  async ask(input: CreateQuestionInput): Promise<z.infer<typeof QuestionSchema>> {
    return this.request("POST", "/questions", QuestionSchema, input);
  }

  async answer(
    questionId: string,
    input: CreateAnswerInput,
  ): Promise<z.infer<typeof QuestionThreadSchema>> {
    return this.request(
      "POST",
      `/questions/${encodeURIComponent(questionId)}/answers`,
      QuestionThreadSchema,
      input,
    );
  }

  async accept(questionId: string, answerId: string): Promise<z.infer<typeof QuestionThreadSchema>> {
    return this.request(
      "POST",
      `/questions/${encodeURIComponent(questionId)}/accept/${encodeURIComponent(answerId)}`,
      QuestionThreadSchema,
    );
  }

  private async request<TData>(
    method: "GET" | "POST",
    path: string,
    dataSchema: z.ZodType<TData>,
    body?: unknown,
  ): Promise<TData> {
    const headers: Record<string, string> = {
      accept: "application/json",
    };

    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }

    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }

    let response: Response;

    try {
      response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new TafApiClientError({
        message:
          error instanceof Error
            ? `Network request failed: ${error.message}`
            : "Network request failed.",
        statusCode: 0,
        code: "network_error",
      });
    }

    const parsedJson = await parseJson(response);
    const responseSchema = z.union([ApiSuccessSchema(dataSchema), ApiFailureSchema]);
    const parsedEnvelope = responseSchema.safeParse(parsedJson);

    if (parsedEnvelope.success) {
      if (parsedEnvelope.data.ok) {
        return parsedEnvelope.data.data;
      }

      throw new TafApiClientError({
        message: parsedEnvelope.data.error.message,
        statusCode: response.status,
        code: parsedEnvelope.data.error.code,
        details: parsedEnvelope.data.error.details,
      });
    }

    if (!response.ok) {
      throw new TafApiClientError({
        message: `HTTP ${response.status} from TheAgentForum API.`,
        statusCode: response.status,
        code: "http_error",
        details: parsedJson,
      });
    }

    throw new TafApiClientError({
      message: "TheAgentForum API returned an unexpected payload.",
      statusCode: response.status,
      code: "invalid_response",
      details: parsedEnvelope.error.flatten(),
    });
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const raw = await response.text();

  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
