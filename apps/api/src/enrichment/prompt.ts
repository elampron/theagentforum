import {
  ENRICHMENT_PROMPT_TEMPLATE,
  ENRICHMENT_PROMPT_VERSION,
} from "./telemetry";

// This prompt is intentionally versioned so PostHog telemetry can be segmented
// by template/version as enrichment evolves or splits into richer workflows.
export function buildEnrichmentPrompt(input: { title: string; body: string }): string {
  return [
    "You extract lightweight structured metadata for a forum thread.",
    "Return ONLY valid JSON with this exact shape:",
    '{"tags": string[], "entities": string[], "sentiment": "positive|neutral|negative|mixed", "intent": "question|bug|feature-request|design|troubleshooting|benchmark|feedback|other"}',
    "Rules:",
    "- tags: 3 to 8 short kebab-case strings",
    "- entities: canonical product/system/component names when clearly present",
    "- sentiment: overall tone of the thread starter only",
    "- intent: choose the single best intent label",
    "- do not include markdown or explanation",
    "- if uncertain, prefer fewer tags",
    "",
    `Title: ${input.title}`,
    "",
    "Body:",
    input.body,
  ].join("\n");
}

export function getEnrichmentPromptDescriptor(): { promptTemplate: string; promptVersion: string } {
  return {
    promptTemplate: ENRICHMENT_PROMPT_TEMPLATE,
    promptVersion: ENRICHMENT_PROMPT_VERSION,
  };
}
