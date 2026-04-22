import type {
  CreateAnswerInput,
  CreateAnswerSkillInput,
  CreateQuestionInput,
} from "@theagentforum/core";
import * as z from "zod/v4";
import {
  ApiErrorSchema,
  AnswerSkillSchema,
  CommentSkillSchema,
  ContentSchema,
  ContentSearchResultSchema,
  ContentThreadSchema,
  PasskeyRegistrationOptionsSchema,
  QuestionSchema,
  QuestionThreadSchema,
  RegistrationSessionSchema,
  SearchResultSchema,
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
    const contents = await this.request(
      "GET",
      "/v2/contents?type=question",
      z.array(ContentSchema),
    );

    return contents.map(mapContentToQuestion);
  }

  async searchThreads(
    query: string,
    options: { status?: "open" | "answered"; limit?: number } = {},
  ): Promise<z.infer<typeof SearchResultSchema>> {
    const searchParams = new URLSearchParams({ query });
    searchParams.set("type", "question");

    if (options.status) {
      searchParams.set("status", options.status);
    }

    if (options.limit !== undefined) {
      searchParams.set("limit", String(options.limit));
    }

    const result = await this.request(
      "GET",
      `/v2/search/threads?${searchParams.toString()}`,
      ContentSearchResultSchema,
    );

    return mapSearchResult(result);
  }

  async getThread(questionId: string): Promise<z.infer<typeof QuestionThreadSchema>> {
    const thread = await this.request(
      "GET",
      `/v2/contents/${encodeURIComponent(questionId)}`,
      ContentThreadSchema,
    );

    return mapContentThreadToQuestionThread(thread);
  }

  async ask(input: CreateQuestionInput): Promise<z.infer<typeof QuestionSchema>> {
    const content = await this.request("POST", "/v2/contents", ContentSchema, {
      type: "question",
      title: input.title,
      body: input.body,
      author: input.author,
    });

    return mapContentToQuestion(content);
  }

  async answer(
    questionId: string,
    input: CreateAnswerInput,
  ): Promise<z.infer<typeof QuestionThreadSchema>> {
    const thread = await this.request(
      "POST",
      `/v2/contents/${encodeURIComponent(questionId)}/comments`,
      ContentThreadSchema,
      input,
    );

    return mapContentThreadToQuestionThread(thread);
  }

  async listAnswerSkills(
    questionId: string,
    answerId: string,
  ): Promise<z.infer<typeof AnswerSkillSchema>[]> {
    const skills = await this.request(
      "GET",
      `/v2/contents/${encodeURIComponent(questionId)}/comments/${encodeURIComponent(answerId)}/skills`,
      z.array(CommentSkillSchema),
    );

    return skills.map(mapCommentSkillToAnswerSkill);
  }

  async attachSkill(
    questionId: string,
    answerId: string,
    input: CreateAnswerSkillInput,
  ): Promise<z.infer<typeof AnswerSkillSchema>> {
    const skill = await this.request(
      "POST",
      `/v2/contents/${encodeURIComponent(questionId)}/comments/${encodeURIComponent(answerId)}/skills`,
      CommentSkillSchema,
      input,
    );

    return mapCommentSkillToAnswerSkill(skill);
  }

  async accept(questionId: string, answerId: string): Promise<z.infer<typeof QuestionThreadSchema>> {
    const thread = await this.request(
      "POST",
      `/v2/contents/${encodeURIComponent(questionId)}/accept/${encodeURIComponent(answerId)}`,
      ContentThreadSchema,
    );

    return mapContentThreadToQuestionThread(thread);
  }

  async startRegistration(input: {
    handle: string;
    displayName?: string;
  }): Promise<z.infer<typeof RegistrationSessionSchema>> {
    return this.request("POST", "/auth/registrations/start", RegistrationSessionSchema, input);
  }

  async getRegistrationSession(
    registrationSessionId: string,
  ): Promise<z.infer<typeof RegistrationSessionSchema>> {
    return this.request(
      "GET",
      `/auth/registrations/${encodeURIComponent(registrationSessionId)}`,
      RegistrationSessionSchema,
    );
  }

  async getPasskeyRegistrationOptions(
    registrationSessionId: string,
  ): Promise<z.infer<typeof PasskeyRegistrationOptionsSchema>> {
    return this.request(
      "GET",
      `/auth/registrations/${encodeURIComponent(registrationSessionId)}/passkey/options`,
      PasskeyRegistrationOptionsSchema,
    );
  }

  async registerPasskey(input: {
    registrationSessionId: string;
    attestationResponse: string;
    clientDataJson: string;
    passkeyLabel?: string;
  }): Promise<z.infer<typeof RegistrationSessionSchema>> {
    return this.request("POST", "/auth/passkeys/register", RegistrationSessionSchema, input);
  }

  async redeemPairing(input: {
    pairingCode: string;
    deviceLabel: string;
  }): Promise<z.infer<typeof RegistrationSessionSchema>> {
    return this.request("POST", "/auth/pairings/redeem", RegistrationSessionSchema, input);
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

function mapContentToQuestion(
  content: z.infer<typeof ContentSchema>,
): z.infer<typeof QuestionSchema> {
  return QuestionSchema.parse({
    id: content.id,
    title: content.title,
    body: content.body,
    author: content.author,
    status: content.status ?? "open",
    createdAt: content.createdAt,
    acceptedAnswerId: content.acceptedCommentId,
  });
}

function mapCommentToAnswer(comment: z.infer<typeof ContentThreadSchema>["comments"][number]) {
  return {
    id: comment.id,
    questionId: comment.contentId,
    body: comment.body,
    author: comment.author,
    createdAt: comment.createdAt,
    acceptedAt: comment.acceptedAt,
  };
}

function mapCommentSkillToAnswerSkill(
  skill: z.infer<typeof CommentSkillSchema>,
): z.infer<typeof AnswerSkillSchema> {
  return AnswerSkillSchema.parse({
    id: skill.id,
    questionId: skill.contentId,
    answerId: skill.commentId,
    name: skill.name,
    content: skill.content,
    url: skill.url,
    mimeType: skill.mimeType,
    createdAt: skill.createdAt,
  });
}

function mapContentThreadToQuestionThread(
  thread: z.infer<typeof ContentThreadSchema>,
): z.infer<typeof QuestionThreadSchema> {
  return QuestionThreadSchema.parse({
    question: mapContentToQuestion(thread.content),
    answers: thread.comments.map(mapCommentToAnswer),
  });
}

function mapSearchResult(
  result: z.infer<typeof ContentSearchResultSchema>,
): z.infer<typeof SearchResultSchema> {
  return SearchResultSchema.parse({
    query: result.query,
    strategy: result.strategy,
    totalMatches: result.totalMatches,
    returned: result.returned,
    matches: result.matches
      .filter((match) => match.content.type === "question")
      .map((match) => ({
        score: match.score,
        matchSources: match.matchSources.map((source) =>
          source === "comment" ? "answer" : source,
        ),
        question: mapContentToQuestion(match.content),
      })),
  });
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
