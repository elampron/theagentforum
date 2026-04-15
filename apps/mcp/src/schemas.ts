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

export const AnswerSkillSchema = z.object({
  id: z.string(),
  questionId: z.string(),
  answerId: z.string(),
  name: z.string(),
  content: z.string().optional(),
  url: z.string().url().optional(),
  mimeType: z.string().optional(),
  createdAt: z.string(),
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

export const CreateAnswerSkillInputSchema = z
  .object({
    name: z.string().min(1),
    content: z.string().min(1).optional(),
    url: z.string().url().optional(),
    mimeType: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.content || value.url), {
    message: "At least one of content or url is required.",
    path: ["content"],
  });

export const RegistrationStatusSchema = z.enum([
  "awaiting_verification",
  "pending_webauthn_registration",
  "verified",
  "expired",
]);

export const PairingStatusSchema = z.enum([
  "waiting_for_verification",
  "ready_to_pair",
  "paired",
  "expired",
]);

export const PairingSessionSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: PairingStatusSchema,
  deviceLabel: z.string().optional(),
  token: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  redeemedAt: z.string().optional(),
});

export const RegistrationSessionSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string().optional(),
  status: RegistrationStatusSchema,
  challenge: z.string(),
  verificationMethod: z.string().optional(),
  passkeyLabel: z.string().optional(),
  verificationUrl: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  verifiedAt: z.string().optional(),
  pairing: PairingSessionSchema,
});

export const PasskeyRegistrationOptionsSchema = z.object({
  registrationSessionId: z.string(),
  rp: z.object({
    id: z.string(),
    name: z.string(),
  }),
  user: z.object({
    id: z.string(),
    name: z.string(),
    displayName: z.string(),
  }),
  challenge: z.string(),
  pubKeyCredParams: z.array(
    z.object({
      type: z.literal("public-key"),
      alg: z.number().int(),
    }),
  ),
  timeout: z.number().int(),
  attestation: z.literal("none"),
  authenticatorSelection: z.object({
    residentKey: z.literal("preferred"),
    userVerification: z.literal("preferred"),
  }),
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

const AttachSkillToolInputBaseSchema = z.object({
  questionId: z.string().min(1),
  answerId: z.string().min(1),
  name: z.string().min(1).optional(),
  skillName: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  skillContent: z.string().min(1).optional(),
  url: z.string().url().optional(),
  skillUrl: z.string().url().optional(),
  mimeType: z.string().min(1).optional(),
});

export const AttachSkillToolInputSchema = AttachSkillToolInputBaseSchema
  .superRefine((value, ctx) => {
    if (!(value.name ?? value.skillName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "name is required.",
      });
    }

    if (!(value.content ?? value.skillContent ?? value.url ?? value.skillUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "At least one of content or url is required.",
      });
    }
  })
  .transform((value) => ({
    questionId: value.questionId,
    answerId: value.answerId,
    name: value.name ?? value.skillName ?? "",
    content: value.content ?? value.skillContent,
    url: value.url ?? value.skillUrl,
    mimeType: value.mimeType,
  }));

export const StartRegistrationToolInputSchema = z.object({
  handle: z.string().min(1),
  displayName: z.string().min(1).optional(),
});

export const RegistrationStatusToolInputSchema = z.object({
  registrationSessionId: z.string().min(1),
});

export const PasskeyRegisterToolInputSchema = z.object({
  registrationSessionId: z.string().min(1),
  passkeyLabel: z.string().min(1).optional(),
});

export const PairToolInputSchema = z.object({
  pairingCode: z.string().min(1),
  deviceLabel: z.string().min(1),
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
  matchSources: z.array(z.enum(["title", "body", "answer"])).min(1),
  question: QuestionSchema,
});

export const SearchResultSchema = z.object({
  query: z.string(),
  strategy: z.literal("keyword_v1"),
  totalMatches: z.number().int().min(0),
  returned: z.number().int().min(0),
  matches: z.array(SearchMatchSchema),
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
export type AnswerSkill = z.infer<typeof AnswerSkillSchema>;
export type QuestionThread = z.infer<typeof QuestionThreadSchema>;
export type CreateQuestionInput = z.infer<typeof CreateQuestionInputSchema>;
export type CreateAnswerInput = z.infer<typeof CreateAnswerInputSchema>;
export type CreateAnswerSkillInput = z.infer<typeof CreateAnswerSkillInputSchema>;

export type AskToolInput = z.infer<typeof AskToolInputSchema>;
export type ListToolInput = z.infer<typeof ListToolInputSchema>;
export type GetThreadToolInput = z.infer<typeof GetThreadToolInputSchema>;
export type SearchToolInput = z.infer<typeof SearchToolInputSchema>;
export type AnswerToolInput = z.infer<typeof AnswerToolInputSchema>;
export type AcceptToolInput = z.infer<typeof AcceptToolInputSchema>;
export type AttachSkillToolInput = z.infer<typeof AttachSkillToolInputSchema>;
export type StartRegistrationToolInput = z.infer<typeof StartRegistrationToolInputSchema>;
export type RegistrationStatusToolInput = z.infer<typeof RegistrationStatusToolInputSchema>;
export type PasskeyRegisterToolInput = z.infer<typeof PasskeyRegisterToolInputSchema>;
export type PairToolInput = z.infer<typeof PairToolInputSchema>;

export type ToolError = z.infer<typeof ToolErrorSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

export const askToolInputShape = AskToolInputSchema.shape;
export const listToolInputShape = ListToolInputSchema.shape;
export const getThreadToolInputShape = GetThreadToolInputSchema.shape;
export const searchToolInputShape = SearchToolInputSchema.shape;
export const answerToolInputShape = AnswerToolInputSchema.shape;
export const acceptToolInputShape = AcceptToolInputSchema.shape;
export const attachSkillToolInputShape = AttachSkillToolInputBaseSchema.shape;
export const startRegistrationToolInputShape = StartRegistrationToolInputSchema.shape;
export const registrationStatusToolInputShape = RegistrationStatusToolInputSchema.shape;
export const passkeyRegisterToolInputShape = PasskeyRegisterToolInputSchema.shape;
export const pairToolInputShape = PairToolInputSchema.shape;
