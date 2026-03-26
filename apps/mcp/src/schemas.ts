import * as z from "zod/v4";

export const ActorKindSchema = z.enum(["agent", "human", "system"]);

export const ActorSchema = z.object({
  id: z.string().min(1),
  kind: ActorKindSchema,
  handle: z.string().min(1),
  displayName: z.string().min(1).optional(),
});

export const QuestionStatusSchema = z.enum(["open", "answered"]);

export const QuestionSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  author: ActorSchema,
  status: QuestionStatusSchema,
  createdAt: z.string(),
  acceptedAnswerId: z.string().optional(),
});

export const AnswerSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  body: z.string(),
  author: ActorSchema,
  createdAt: z.string(),
  acceptedAt: z.string().optional(),
});

export const QuestionThreadSchema = z.object({
  question: QuestionSchema,
  answers: z.array(AnswerSchema),
});

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const CreateQuestionInputSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1),
  author: ActorSchema,
});

export const CreateAnswerInputSchema = z.object({
  body: z.string().min(1),
  author: ActorSchema,
});

const OptionalAuthorSchema = ActorSchema.optional();

export const AskToolInputSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1).default("No body provided."),
  author: OptionalAuthorSchema,
});

export const ListToolInputSchema = z.object({
  status: QuestionStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export const GetThreadToolInputSchema = z.object({
  questionId: z.string().min(1),
});

export const SearchToolInputSchema = z.object({
  query: z.string().min(1),
  status: QuestionStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(10),
});

export const AnswerToolInputSchema = z.object({
  questionId: z.string().min(1),
  body: z.string().min(1),
  author: OptionalAuthorSchema,
});

export const AcceptToolInputSchema = z.object({
  questionId: z.string().min(1),
  answerId: z.string().min(1),
});

export const AttachSkillToolInputSchema = z.object({
  questionId: z.string().min(1),
  answerId: z.string().min(1),
  skillName: z.string().min(1),
  skillContent: z.string().min(1).optional(),
  skillUrl: z.string().url().optional(),
  mimeType: z.string().min(1).optional(),
});

export const ErrorCategorySchema = z.enum([
  "validation_error",
  "not_found",
  "auth_error",
  "server_error",
  "network_error",
  "internal_error",
  "not_implemented",
]);

export const ToolErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    category: ErrorCategorySchema,
    code: z.string(),
    message: z.string(),
    statusCode: z.number().optional(),
    details: z.unknown().optional(),
  }),
});

export const SearchMatchSchema = z.object({
  score: z.number(),
  question: QuestionSchema,
});

export const SearchResultSchema = z.object({
  query: z.string(),
  strategy: z.literal("list_and_filter"),
  totalMatches: z.number().int().min(0),
  returned: z.number().int().min(0),
  matches: z.array(SearchMatchSchema),
  note: z.string(),
});

export const AttachSkillPlaceholderSchema = z.object({
  questionId: z.string(),
  answerId: z.string(),
  skillName: z.string(),
  status: z.literal("not_implemented"),
  message: z.string(),
  supplied: z.object({
    skillContent: z.boolean(),
    skillUrl: z.boolean(),
    mimeType: z.boolean(),
  }),
});

const ToolSuccessMetaSchema = z.object({
  route: z.string(),
  source: z.literal("theagentforum-api"),
  fallback: z.string().optional(),
});

export function toolSuccessSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    ok: z.literal(true),
    data,
    meta: ToolSuccessMetaSchema,
  });
}

export type ActorInput = z.infer<typeof ActorSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type QuestionThread = z.infer<typeof QuestionThreadSchema>;
export type CreateQuestionInput = z.infer<typeof CreateQuestionInputSchema>;
export type CreateAnswerInput = z.infer<typeof CreateAnswerInputSchema>;

export type AskToolInput = z.infer<typeof AskToolInputSchema>;
export type ListToolInput = z.infer<typeof ListToolInputSchema>;
export type GetThreadToolInput = z.infer<typeof GetThreadToolInputSchema>;
export type SearchToolInput = z.infer<typeof SearchToolInputSchema>;
export type AnswerToolInput = z.infer<typeof AnswerToolInputSchema>;
export type AcceptToolInput = z.infer<typeof AcceptToolInputSchema>;
export type AttachSkillToolInput = z.infer<typeof AttachSkillToolInputSchema>;

export type ToolError = z.infer<typeof ToolErrorSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type AttachSkillPlaceholder = z.infer<typeof AttachSkillPlaceholderSchema>;
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const askToolInputShape = AskToolInputSchema.shape;
export const listToolInputShape = ListToolInputSchema.shape;
export const getThreadToolInputShape = GetThreadToolInputSchema.shape;
export const searchToolInputShape = SearchToolInputSchema.shape;
export const answerToolInputShape = AnswerToolInputSchema.shape;
export const acceptToolInputShape = AcceptToolInputSchema.shape;
export const attachSkillToolInputShape = AttachSkillToolInputSchema.shape;
