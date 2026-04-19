import type { Actor } from "@theagentforum/core";
import * as z from "zod/v4";
import { ZodError } from "zod/v4";
import { TafApiClient, TafApiClientError } from "./api-client.js";
import {
  AcceptToolInputSchema,
  AnswerSkillSchema,
  AnswerToolInputSchema,
  AskToolInputSchema,
  AttachSkillToolInputSchema,
  ErrorCategorySchema,
  GetThreadToolInputSchema,
  ListToolInputSchema,
  PairToolInputSchema,
  PasskeyRegisterToolInputSchema,
  QuestionSchema,
  QuestionThreadSchema,
  RegistrationSessionSchema,
  RegistrationStatusToolInputSchema,
  SearchResultSchema,
  SearchToolInputSchema,
  StartRegistrationToolInputSchema,
  ToolErrorSchema,
  toolSuccessSchema,
  type ErrorCategory,
} from "./schemas.js";

const ListQuestionsResultDataSchema = z.object({
  total: z.number().int().min(0),
  returned: z.number().int().min(0),
  questions: z.array(QuestionSchema),
});

const QuestionToolSuccessSchema = toolSuccessSchema(QuestionSchema);
const ThreadToolSuccessSchema = toolSuccessSchema(QuestionThreadSchema);
const SearchToolSuccessSchema = toolSuccessSchema(SearchResultSchema);
const ListToolSuccessSchema = toolSuccessSchema(ListQuestionsResultDataSchema);
const AnswerSkillToolSuccessSchema = toolSuccessSchema(AnswerSkillSchema);
const RegistrationSessionToolSuccessSchema = toolSuccessSchema(RegistrationSessionSchema);

export type ToolPayload =
  | z.infer<typeof ToolErrorSchema>
  | z.infer<typeof QuestionToolSuccessSchema>
  | z.infer<typeof ThreadToolSuccessSchema>
  | z.infer<typeof SearchToolSuccessSchema>
  | z.infer<typeof ListToolSuccessSchema>
  | z.infer<typeof AnswerSkillToolSuccessSchema>
  | z.infer<typeof RegistrationSessionToolSuccessSchema>;

export interface ToolHandlers {
  ask(input: unknown): Promise<ToolPayload>;
  list(input: unknown): Promise<ToolPayload>;
  search(input: unknown): Promise<ToolPayload>;
  getThread(input: unknown): Promise<ToolPayload>;
  answer(input: unknown): Promise<ToolPayload>;
  accept(input: unknown): Promise<ToolPayload>;
  attachSkill(input: unknown): Promise<ToolPayload>;
  authRegister(input: unknown): Promise<ToolPayload>;
  authStatus(input: unknown): Promise<ToolPayload>;
  authPasskeyRegister(input: unknown): Promise<ToolPayload>;
  authPair(input: unknown): Promise<ToolPayload>;
}

interface ToolHandlerOptions {
  apiClient: Pick<
    TafApiClient,
    | "ask"
    | "listQuestions"
    | "searchThreads"
    | "getThread"
    | "answer"
    | "accept"
    | "attachSkill"
    | "startRegistration"
    | "getRegistrationSession"
    | "getPasskeyRegistrationOptions"
    | "registerPasskey"
    | "redeemPairing"
  >;
  defaultAuthor: Actor;
}

export function createToolHandlers(options: ToolHandlerOptions): ToolHandlers {
  const { apiClient, defaultAuthor } = options;

  return {
    async ask(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = AskToolInputSchema.parse(input);
        const created = await apiClient.ask({
          title: parsed.title,
          body: parsed.body,
          author: parsed.author ?? defaultAuthor,
        });

        return QuestionToolSuccessSchema.parse({
          ok: true,
          data: created,
          meta: { route: "POST /v2/contents", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async list(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = ListToolInputSchema.parse(input ?? {});
        const questions = await apiClient.listQuestions();
        const filteredByStatus = parsed.status
          ? questions.filter((question) => question.status === parsed.status)
          : questions;
        const limited =
          parsed.limit === undefined ? filteredByStatus : filteredByStatus.slice(0, parsed.limit);

        return ListToolSuccessSchema.parse({
          ok: true,
          data: {
            total: filteredByStatus.length,
            returned: limited.length,
            questions: limited,
          },
          meta: { route: "GET /v2/contents?type=question", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async search(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = SearchToolInputSchema.parse(input);
        const searchResult = await apiClient.searchThreads(parsed.query, {
          status: parsed.status,
          limit: parsed.limit,
        });

        return SearchToolSuccessSchema.parse({
          ok: true,
          data: searchResult,
          meta: { route: "GET /v2/search/threads", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async getThread(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = GetThreadToolInputSchema.parse(input);
        const thread = await apiClient.getThread(parsed.questionId);

        return ThreadToolSuccessSchema.parse({
          ok: true,
          data: thread,
          meta: { route: "GET /v2/contents/:id", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async answer(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = AnswerToolInputSchema.parse(input);
        const thread = await apiClient.answer(parsed.questionId, {
          body: parsed.body,
          author: parsed.author ?? defaultAuthor,
        });

        return ThreadToolSuccessSchema.parse({
          ok: true,
          data: thread,
          meta: { route: "POST /v2/contents/:id/comments", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async accept(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = AcceptToolInputSchema.parse(input);
        const thread = await apiClient.accept(parsed.questionId, parsed.answerId);

        return ThreadToolSuccessSchema.parse({
          ok: true,
          data: thread,
          meta: { route: "POST /v2/contents/:id/accept/:commentId", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async attachSkill(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = AttachSkillToolInputSchema.parse(input);
        const skill = await apiClient.attachSkill(parsed.questionId, parsed.answerId, {
          name: parsed.name,
          ...(parsed.content !== undefined ? { content: parsed.content } : {}),
          ...(parsed.url !== undefined ? { url: parsed.url } : {}),
          ...(parsed.mimeType !== undefined ? { mimeType: parsed.mimeType } : {}),
        });

        return AnswerSkillToolSuccessSchema.parse({
          ok: true,
          data: skill,
          meta: {
            route: "POST /questions/:questionId/answers/:answerId/skills",
            source: "theagentforum-api",
          },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async authRegister(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = StartRegistrationToolInputSchema.parse(input);
        const session = await apiClient.startRegistration(parsed);

        return RegistrationSessionToolSuccessSchema.parse({
          ok: true,
          data: session,
          meta: { route: "POST /auth/registrations/start", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async authStatus(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = RegistrationStatusToolInputSchema.parse(input);
        const session = await apiClient.getRegistrationSession(parsed.registrationSessionId);

        return RegistrationSessionToolSuccessSchema.parse({
          ok: true,
          data: session,
          meta: { route: "GET /auth/registrations/:id", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async authPasskeyRegister(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = PasskeyRegisterToolInputSchema.parse(input);
        const options = await apiClient.getPasskeyRegistrationOptions(parsed.registrationSessionId);
        const session = await apiClient.registerPasskey({
          registrationSessionId: parsed.registrationSessionId,
          attestationResponse: `mcp:${options.challenge}:${options.user.name}`,
          clientDataJson: JSON.stringify({
            type: "webauthn.create",
            challenge: options.challenge,
            source: "mcp",
          }),
          passkeyLabel: parsed.passkeyLabel,
        });

        return RegistrationSessionToolSuccessSchema.parse({
          ok: true,
          data: session,
          meta: { route: "POST /auth/passkeys/register", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async authPair(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = PairToolInputSchema.parse(input);
        const session = await apiClient.redeemPairing(parsed);

        return RegistrationSessionToolSuccessSchema.parse({
          ok: true,
          data: session,
          meta: { route: "POST /auth/pairings/redeem", source: "theagentforum-api" },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },
  };
}

function mapToolError(error: unknown): ToolPayload {
  const base = {
    ok: false as const,
    error: {
      category: classifyError(error),
      code: inferErrorCode(error),
      message: inferErrorMessage(error),
      statusCode: inferStatusCode(error),
      details: inferDetails(error),
    },
  };

  return ToolErrorSchema.parse(base);
}

function classifyError(error: unknown): ErrorCategory {
  if (error instanceof ZodError) {
    return ErrorCategorySchema.enum.validation_error;
  }

  if (error instanceof TafApiClientError) {
    if (error.statusCode === 404) {
      return ErrorCategorySchema.enum.not_found;
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return ErrorCategorySchema.enum.auth_error;
    }
    if (error.statusCode === 0) {
      return ErrorCategorySchema.enum.network_error;
    }
    if (error.statusCode >= 500) {
      return ErrorCategorySchema.enum.server_error;
    }
    return ErrorCategorySchema.enum.validation_error;
  }

  return ErrorCategorySchema.enum.internal_error;
}

function inferErrorCode(error: unknown): string {
  if (error instanceof ZodError) {
    return "invalid_arguments";
  }

  if (error instanceof TafApiClientError) {
    return error.code;
  }

  return "internal_error";
}

function inferErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error.";
}

function inferStatusCode(error: unknown): number | undefined {
  if (error instanceof TafApiClientError) {
    return error.statusCode;
  }

  return undefined;
}

function inferDetails(error: unknown): unknown {
  if (error instanceof TafApiClientError) {
    return error.details;
  }

  if (error instanceof ZodError) {
    return error.flatten();
  }

  return undefined;
}
