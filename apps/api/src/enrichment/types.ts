export type EnrichmentSentiment = "positive" | "neutral" | "negative" | "mixed";
export type EnrichmentIntent =
  | "question"
  | "bug"
  | "feature-request"
  | "design"
  | "troubleshooting"
  | "benchmark"
  | "feedback"
  | "other";

export interface QuestionEnrichmentPayload {
  tags: string[];
  entities: string[];
  sentiment: EnrichmentSentiment;
  intent: EnrichmentIntent;
}

export interface StoredQuestionEnrichment extends QuestionEnrichmentPayload {
  id: string;
  questionId: string;
  contentHash: string;
  enrichmentVersion: number;
  provider: string;
  model: string;
  status: "pending" | "completed" | "failed";
  rawResponse?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
