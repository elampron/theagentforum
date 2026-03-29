export const ENRICHMENT_TELEMETRY_SOURCE = "taf_enrichment_worker";
export const ENRICHMENT_WORKFLOW = "question_enrichment";
export const ENRICHMENT_WORKFLOW_FEATURE = "thread_metadata_enrichment";
export const ENRICHMENT_WORKFLOW_STEP = "extract_thread_metadata";
export const ENRICHMENT_PROMPT_TEMPLATE = "question_enrichment_v1";
export const ENRICHMENT_PROMPT_VERSION = "v1";
export const ENRICHMENT_TELEMETRY_SCHEMA_VERSION = 1;
export const ENRICHMENT_TELEMETRY_SPAN_NAMESPACE = "taf.enrichment";
export const ENRICHMENT_TELEMETRY_SPAN_NAME = "taf.enrichment.llm.enrich_question";

export interface EnrichmentTelemetryContext {
  source: string;
  workflow: string;
  feature: string;
  workflowStep: string;
  promptTemplate: string;
  promptVersion: string;
  questionId: string;
  contentHash: string;
  enrichmentVersion: number;
  titleLength: number;
  bodyLength: number;
  promptLength: number;
  provider: string;
  model: string;
  traceId: string;
  spanNamespace: string;
  spanName: string;
  telemetrySchemaVersion: number;
  toolsPlanned: boolean;
  toolCallCount: number;
  toolTelemetryStatus: "ready_for_future_tools";
}

export function createEnrichmentTraceId(questionId: string, contentHash: string): string {
  return `taf-enrichment:${questionId}:${contentHash.slice(0, 12)}`;
}

export function createEnrichmentTelemetryContext(input: {
  questionId: string;
  contentHash: string;
  enrichmentVersion: number;
  titleLength: number;
  bodyLength: number;
  promptLength: number;
  provider: string;
  model: string;
}): EnrichmentTelemetryContext {
  return {
    source: ENRICHMENT_TELEMETRY_SOURCE,
    workflow: ENRICHMENT_WORKFLOW,
    feature: ENRICHMENT_WORKFLOW_FEATURE,
    workflowStep: ENRICHMENT_WORKFLOW_STEP,
    promptTemplate: ENRICHMENT_PROMPT_TEMPLATE,
    promptVersion: ENRICHMENT_PROMPT_VERSION,
    questionId: input.questionId,
    contentHash: input.contentHash,
    enrichmentVersion: input.enrichmentVersion,
    titleLength: input.titleLength,
    bodyLength: input.bodyLength,
    promptLength: input.promptLength,
    provider: input.provider,
    model: input.model,
    traceId: createEnrichmentTraceId(input.questionId, input.contentHash),
    spanNamespace: ENRICHMENT_TELEMETRY_SPAN_NAMESPACE,
    spanName: ENRICHMENT_TELEMETRY_SPAN_NAME,
    telemetrySchemaVersion: ENRICHMENT_TELEMETRY_SCHEMA_VERSION,
    toolsPlanned: true,
    toolCallCount: 0,
    toolTelemetryStatus: "ready_for_future_tools",
  };
}
