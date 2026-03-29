import { RateLimitError, Worker } from "bullmq";
import { readEnrichmentConfig } from "@theagentforum/db";
import { buildEnrichmentPrompt, getEnrichmentPromptDescriptor } from "./prompt";
import {
  createEnrichmentJobId,
  createEnrichmentQueue,
  ENRICHMENT_QUEUE_NAME,
  type EnrichmentJobData,
} from "./queue";
import { OpenRouterClient } from "./openrouter-client";
import { createQuestionContentHash } from "./content-hash";
import {
  getQuestionForEnrichment,
  listLatestFailedEnrichmentQuestionIds,
  saveCompletedEnrichment,
  saveFailedEnrichment,
  upsertPendingEnrichment,
} from "./store";
import { captureServerEvent } from "../posthog";
import { OpenRouterRateLimitError, OpenRouterRetryableError } from "./rate-limit";
import { createEnrichmentTelemetryContext } from "./telemetry";

type EnqueueQuestionEnrichmentResult = "enqueued" | "already-queued" | "requeued-failed";

export async function enqueueQuestionEnrichment(
  questionId: string,
  options: { replaceFailed?: boolean } = {},
): Promise<EnqueueQuestionEnrichmentResult> {
  const queue = createEnrichmentQueue();
  const jobId = createEnrichmentJobId(questionId);

  try {
    const existingJob = await queue.getJob(jobId);

    if (existingJob) {
      const existingState = await existingJob.getState();

      if (options.replaceFailed && existingState === "failed") {
        await existingJob.remove();
      } else {
        captureServerEvent("taf_enrichment_enqueue_skipped", `question:${questionId}`, {
          questionId,
          queue: ENRICHMENT_QUEUE_NAME,
          existingJobState: existingState,
        });
        return "already-queued";
      }
    }

    await queue.add(
      "enrich-question",
      { questionId },
      { jobId },
    );

    const event = options.replaceFailed
      ? "taf_enrichment_failed_requeued"
      : "taf_enrichment_enqueued";

    captureServerEvent(event, `question:${questionId}`, {
      questionId,
      queue: ENRICHMENT_QUEUE_NAME,
    });

    return options.replaceFailed ? "requeued-failed" : "enqueued";
  } finally {
    await queue.close();
  }
}

export function startEnrichmentWorker(): Worker<EnrichmentJobData> {
  const config = readEnrichmentConfig(process.env);

  if (!config.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required to run the enrichment worker.");
  }

  const client = new OpenRouterClient({
    apiKey: config.openRouterApiKey,
    model: config.openRouterModel,
  });

  let worker!: Worker<EnrichmentJobData>;

  worker = new Worker<EnrichmentJobData>(
    ENRICHMENT_QUEUE_NAME,
    async (job) => {
      const question = await getQuestionForEnrichment(job.data.questionId);

      if (!question) {
        return;
      }

      const contentHash = createQuestionContentHash(question.title, question.body);

      await upsertPendingEnrichment({
        questionId: question.id,
        contentHash,
        enrichmentVersion: config.enrichmentVersion,
        provider: "openrouter",
        model: config.openRouterModel,
      });

      const prompt = buildEnrichmentPrompt({ title: question.title, body: question.body });
      const promptDescriptor = getEnrichmentPromptDescriptor();
      const telemetry = createEnrichmentTelemetryContext({
        questionId: question.id,
        contentHash,
        enrichmentVersion: config.enrichmentVersion,
        titleLength: question.title.length,
        bodyLength: question.body.length,
        promptLength: prompt.length,
        provider: "openrouter",
        model: config.openRouterModel,
      });

      captureServerEvent("taf_enrichment_requested", `question:${question.id}`, {
        ...telemetry,
        ...promptDescriptor,
      });

      try {
        const result = await client.enrich(prompt, telemetry);

        await saveCompletedEnrichment({
          questionId: question.id,
          contentHash,
          enrichmentVersion: config.enrichmentVersion,
          provider: "openrouter",
          model: result.model,
          payload: result.payload,
          rawResponse: result.rawResponse,
        });

        captureServerEvent("taf_enrichment_completed", `question:${question.id}`, {
          ...telemetry,
          ...promptDescriptor,
          model: result.model,
          tags: result.payload.tags,
          entities: result.payload.entities,
          sentiment: result.payload.sentiment,
          intent: result.payload.intent,
          parsedOutput: result.payload,
          completionId: result.completion.id,
          completionCreated: result.completion.created,
          completionFinishReason: result.completion.finishReason,
          completionRefusal: result.completion.refusal,
          completionText: result.completion.text,
          completionLength: result.completion.length,
          usagePromptTokens: result.completion.usage.promptTokens,
          usageCompletionTokens: result.completion.usage.completionTokens,
          usageTotalTokens: result.completion.usage.totalTokens,
        });
      } catch (error) {
        if (error instanceof OpenRouterRateLimitError) {
          await worker.rateLimit(error.retryAfterMs);
          captureServerEvent("taf_enrichment_rate_limited", `question:${question.id}`, {
            ...telemetry,
            ...promptDescriptor,
            retryAfterMs: error.retryAfterMs,
            error: error.message,
          });
          throw new RateLimitError();
        }

        if (error instanceof OpenRouterRetryableError) {
          captureServerEvent("taf_enrichment_retry_scheduled", `question:${question.id}`, {
            ...telemetry,
            ...promptDescriptor,
            retryAfterMs: error.retryAfterMs,
            error: error.message,
          });

          const attemptsAllowed = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
          const hasAttemptsRemaining = job.attemptsMade + 1 < attemptsAllowed;

          if (hasAttemptsRemaining) {
            throw error;
          }
        }

        const message = error instanceof Error ? error.message : String(error);
        await saveFailedEnrichment({
          questionId: question.id,
          contentHash,
          enrichmentVersion: config.enrichmentVersion,
          error: message,
        });
        captureServerEvent("taf_enrichment_failed", `question:${question.id}`, {
          ...telemetry,
          ...promptDescriptor,
          error: message,
        });
        throw error;
      }
    },
    {
      connection: { url: config.redisUrl },
      concurrency: config.workerConcurrency,
      limiter: {
        max: config.queueRateLimitMax,
        duration: config.queueRateLimitDurationMs,
      },
      maximumRateLimitDelay: config.queueMaximumRateLimitDelayMs,
    },
  );

  return worker;
}

export async function requeueLatestFailedEnrichments(limit = 50): Promise<string[]> {
  const config = readEnrichmentConfig(process.env);
  const questionIds = await listLatestFailedEnrichmentQuestionIds({
    enrichmentVersion: config.enrichmentVersion,
    limit,
  });
  const requeuedQuestionIds: string[] = [];

  for (const questionId of questionIds) {
    const result = await enqueueQuestionEnrichment(questionId, { replaceFailed: true });

    if (result === "requeued-failed") {
      requeuedQuestionIds.push(questionId);
    }
  }

  return requeuedQuestionIds;
}
