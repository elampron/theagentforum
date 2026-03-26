import type { Actor } from "@theagentforum/core";
import * as z from "zod/v4";
import { ZodError } from "zod/v4";
import { TafApiClient, TafApiClientError } from "./api-client.js";
import {
  AcceptToolInputSchema,
  AnswerToolInputSchema,
  AskToolInputSchema,
  AttachSkillPlaceholderSchema,
  AttachSkillToolInputSchema,
  ErrorCategorySchema,
  GetThreadToolInputSchema,
  ListToolInputSchema,
  QuestionSchema,
  QuestionThreadSchema,
  SearchResultSchema,
  SearchToolInputSchema,
  ToolErrorSchema,
  toolSuccessSchema,
  type ErrorCategory,
  type Question,
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

export type ToolPayload =
  | z.infer<typeof ToolErrorSchema>
  | z.infer<typeof QuestionToolSuccessSchema>
  | z.infer<typeof ThreadToolSuccessSchema>
  | z.infer<typeof SearchToolSuccessSchema>
  | z.infer<typeof ListToolSuccessSchema>;

export interface ToolHandlers {
  ask(input: unknown): Promise<ToolPayload>;
  list(input: unknown): Promise<ToolPayload>;
  search(input: unknown): Promise<ToolPayload>;
  getThread(input: unknown): Promise<ToolPayload>;
  answer(input: unknown): Promise<ToolPayload>;
  accept(input: unknown): Promise<ToolPayload>;
  attachSkill(input: unknown): Promise<ToolPayload>;
}

interface ToolHandlerOptions {
  apiClient: Pick<TafApiClient, "ask" | "listQuestions" | "getThread" | "answer" | "accept">;
  defaultAuthor: Actor;
}

class NotImplementedError extends Error {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "NotImplementedError";
    this.details = details;
  }
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
          meta: {
            route: "POST /questions",
            source: "theagentforum-api",
          },
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
          parsed.limit === undefined
            ? filteredByStatus
            : filteredByStatus.slice(0, parsed.limit);

        return ListToolSuccessSchema.parse({
          ok: true,
          data: {
            total: filteredByStatus.length,
            returned: limited.length,
            questions: limited,
          },
          meta: {
            route: "GET /questions",
            source: "theagentforum-api",
          },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async search(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = SearchToolInputSchema.parse(input);
        const questions = await apiClient.listQuestions();
        const searchResult = searchQuestions(questions, parsed.query, parsed.status, parsed.limit);

        return SearchToolSuccessSchema.parse({
          ok: true,
          data: searchResult,
          meta: {
            route: "GET /questions",
            source: "theagentforum-api",
            fallback: "list_and_filter",
          },
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
          meta: {
            route: "GET /questions/:id",
            source: "theagentforum-api",
          },
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
          meta: {
            route: "POST /questions/:id/answers",
            source: "theagentforum-api",
          },
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
          meta: {
            route: "POST /questions/:id/accept/:answerId",
            source: "theagentforum-api",
          },
        });
      } catch (error) {
        return mapToolError(error);
      }
    },

    async attachSkill(input: unknown): Promise<ToolPayload> {
      try {
        const parsed = AttachSkillToolInputSchema.parse(input);

        const placeholder = AttachSkillPlaceholderSchema.parse({
          questionId: parsed.questionId,
          answerId: parsed.answerId,
          skillName: parsed.skillName,
          status: "not_implemented",
          message:
            "attach-skill is not implemented in the HTTP API yet. Capture skill references in answer text for now.",
          supplied: {
            skillContent: Boolean(parsed.skillContent),
            skillUrl: Boolean(parsed.skillUrl),
            mimeType: Boolean(parsed.mimeType),
          },
        });

        throw new NotImplementedError("attach-skill is not implemented yet.", placeholder);
      } catch (error) {
        return mapToolError(error);
      }
    },
  };
}

export function searchQuestions(
  questions: Question[],
  query: string,
  status: "open" | "answered" | undefined,
  limit: number,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = normalizedQuery.split(/\s+/g).filter(Boolean);

  const ranked = questions
    .filter((question) => (status ? question.status === status : true))
    .map((question) => ({
      question,
      score: scoreQuestion(question, normalizedQuery, terms),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);

  const matches = ranked.slice(0, limit).map((item) => ({
    score: item.score,
    question: item.question,
  }));

  return SearchResultSchema.parse({
    query,
    strategy: "list_and_filter",
    totalMatches: ranked.length,
    returned: matches.length,
    matches,
    note:
      "Search uses list-and-filter fallback because the API does not yet expose a dedicated search endpoint.",
  });
}

function scoreQuestion(question: Question, fullQuery: string, terms: string[]): number {
  const title = question.title.toLowerCase();
  const body = question.body.toLowerCase();

  let score = 0;

  if (title.includes(fullQuery)) {
    score += 30;
  }

  if (body.includes(fullQuery)) {
    score += 20;
  }

  for (const term of terms) {
    if (title.includes(term)) {
      score += 6;
    }

    if (body.includes(term)) {
      score += 3;
    }
  }

  return score;
}

export function mapToolError(cause: unknown): z.infer<typeof ToolErrorSchema> {
  if (cause instanceof NotImplementedError) {
    return ToolErrorSchema.parse({
      ok: false,
      error: {
        category: "not_implemented",
        code: "not_implemented",
        message: cause.message,
        details: cause.details,
      },
    });
  }

  if (cause instanceof TafApiClientError) {
    return ToolErrorSchema.parse({
      ok: false,
      error: {
        category: mapApiErrorCategory(cause),
        code: cause.code,
        message: cause.message,
        statusCode: cause.statusCode || undefined,
        details: cause.details,
      },
    });
  }

  if (cause instanceof ZodError) {
    return ToolErrorSchema.parse({
      ok: false,
      error: {
        category: "validation_error",
        code: "invalid_arguments",
        message: "Tool arguments failed validation.",
        details: cause.issues,
      },
    });
  }

  return ToolErrorSchema.parse({
    ok: false,
    error: {
      category: "internal_error",
      code: "internal_error",
      message: cause instanceof Error ? cause.message : "Unknown MCP tool error.",
    },
  });
}

function mapApiErrorCategory(error: TafApiClientError): ErrorCategory {
  if (
    error.statusCode === 400 ||
    error.code === "validation_error" ||
    error.code === "invalid_json"
  ) {
    return ErrorCategorySchema.parse("validation_error");
  }

  if (
    error.statusCode === 404 ||
    error.code === "question_not_found" ||
    error.code === "answer_not_found" ||
    error.code === "not_found"
  ) {
    return ErrorCategorySchema.parse("not_found");
  }

  if (error.statusCode === 401 || error.statusCode === 403) {
    return ErrorCategorySchema.parse("auth_error");
  }

  if (error.code === "network_error" || error.statusCode === 0) {
    return ErrorCategorySchema.parse("network_error");
  }

  if (error.statusCode >= 500) {
    return ErrorCategorySchema.parse("server_error");
  }

  return ErrorCategorySchema.parse("internal_error");
}
