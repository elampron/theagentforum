import type { QuestionEnrichmentPayload } from "./types";
import { classifyOpenRouterError } from "./rate-limit";
import { getPostHogClient } from "../posthog";
import type { EnrichmentTelemetryContext } from "./telemetry";

interface OpenRouterClientOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

interface OpenAIChatCompletionResponse {
  id?: string;
  created?: number;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      refusal?: string | null;
    };
  }>;
}

type OpenAICompatibleClient = {
  chat: {
    completions: {
      create(body: Record<string, unknown>): Promise<OpenAIChatCompletionResponse>;
    };
  };
};

export class OpenRouterClient {
  private readonly client: OpenAICompatibleClient;
  private readonly model: string;

  constructor(options: OpenRouterClientOptions) {
    this.model = options.model;
    this.client = createOpenAICompatibleClient(options);
  }

  async enrich(
    prompt: string,
    metadata: EnrichmentTelemetryContext,
  ): Promise<{
    payload: QuestionEnrichmentPayload;
    rawResponse: unknown;
    model: string;
    completion: {
      id?: string;
      created?: number;
      finishReason?: string | null;
      refusal?: string | null;
      text: string;
      length: number;
      usage: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
      };
    };
  }> {
    try {
      const rawResponse = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "question_enrichment",
            strict: true,
            schema: {
              type: "object",
              properties: {
                tags: {
                  type: "array",
                  description: "3 to 8 short kebab-case topical tags for the thread starter.",
                  items: { type: "string" },
                  maxItems: 8,
                },
                entities: {
                  type: "array",
                  description: "Canonical product, tool, or system names explicitly present in the thread starter.",
                  items: { type: "string" },
                  maxItems: 8,
                },
                sentiment: {
                  type: "string",
                  description: "Overall tone of the thread starter.",
                  enum: ["positive", "neutral", "negative", "mixed"],
                },
                intent: {
                  type: "string",
                  description: "Single best intent label for the thread starter.",
                  enum: [
                    "question",
                    "bug",
                    "feature-request",
                    "design",
                    "troubleshooting",
                    "benchmark",
                    "feedback",
                    "other",
                  ],
                },
              },
              required: ["tags", "entities", "sentiment", "intent"],
              additionalProperties: false,
            },
          },
        },
        provider: {
          require_parameters: true,
        },
        temperature: 0.1,
        max_tokens: 250,
        posthogDistinctId: `question:${metadata.questionId}`,
        posthogTraceId: metadata.traceId,
        posthogProperties: {
          ...metadata,
          llmOperation: "chat.completions.create",
          responseFormat: "json_schema",
          responseSchemaName: "question_enrichment",
          temperature: 0.1,
          maxTokens: 250,
        },
        posthogProviderOverride: "openrouter",
        posthogModelOverride: this.model,
        // This enrichment path handles public forum content, so we explicitly
        // allow PostHog to capture prompt/input text for prompt tuning.
        posthogPrivacyMode: false,
      });

      const choice = rawResponse.choices?.[0];
      const messageContent = choice?.message?.content;
      const refusal = choice?.message?.refusal;
      const content = typeof messageContent === "string"
        ? messageContent
        : Array.isArray(messageContent)
          ? messageContent.map((item) => item.text ?? "").join("")
          : typeof refusal === "string" && refusal.trim()
            ? refusal
            : undefined;

      if (!content) {
        throw new Error("OpenRouter returned no completion text.");
      }

      const payload = normalizePayload(JSON.parse(extractJsonObject(content)) as Partial<QuestionEnrichmentPayload>);
      return {
        payload,
        rawResponse,
        model: rawResponse.model ?? this.model,
        completion: {
          id: rawResponse.id,
          created: rawResponse.created,
          finishReason: choice?.finish_reason,
          refusal,
          text: content,
          length: content.length,
          usage: {
            promptTokens: rawResponse.usage?.prompt_tokens,
            completionTokens: rawResponse.usage?.completion_tokens,
            totalTokens: rawResponse.usage?.total_tokens,
          },
        },
      };
    } catch (error) {
      throw classifyOpenRouterError(error);
    }
  }
}

function createOpenAICompatibleClient(options: OpenRouterClientOptions): OpenAICompatibleClient {
  const posthog = getPostHogClient();

  if (!posthog) {
    const OpenAIModule = require("openai") as {
      default?: new (config: Record<string, unknown>) => OpenAICompatibleClient;
    } & (new (config: Record<string, unknown>) => OpenAICompatibleClient);
    const OpenAI = OpenAIModule.default ?? OpenAIModule;

    return new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? "https://openrouter.ai/api/v1",
    });
  }

  const OpenAIModule = require("@posthog/ai/openai") as {
    OpenAI?: new (config: Record<string, unknown>) => OpenAICompatibleClient;
    default?: new (config: Record<string, unknown>) => OpenAICompatibleClient;
  };
  const OpenAI = OpenAIModule.OpenAI ?? OpenAIModule.default;

  if (!OpenAI) {
    throw new Error("Could not load @posthog/ai OpenAI client.");
  }

  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl ?? "https://openrouter.ai/api/v1",
    posthog,
  });
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not find JSON object in model response.");
  }

  return trimmed.slice(start, end + 1);
}

function normalizePayload(payload: Partial<QuestionEnrichmentPayload>): QuestionEnrichmentPayload {
  const tags = normalizeStringArray(payload.tags, 8);
  const entities = normalizeStringArray(payload.entities, 8);
  const sentiment = normalizeSentiment(payload.sentiment);
  const intent = normalizeIntent(payload.intent);

  return { tags, entities, sentiment, intent };
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const output: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim().toLowerCase();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    output.push(normalized);

    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

function normalizeSentiment(value: unknown): QuestionEnrichmentPayload["sentiment"] {
  return value === "positive" || value === "negative" || value === "mixed" ? value : "neutral";
}

function normalizeIntent(value: unknown): QuestionEnrichmentPayload["intent"] {
  switch (value) {
    case "question":
    case "bug":
    case "feature-request":
    case "design":
    case "troubleshooting":
    case "benchmark":
    case "feedback":
      return value;
    default:
      return "other";
  }
}
