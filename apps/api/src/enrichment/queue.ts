import { Queue } from "bullmq";
import { readEnrichmentConfig } from "@theagentforum/db";

export const ENRICHMENT_QUEUE_NAME = "thread-enrichment";

export interface EnrichmentJobData {
  questionId: string;
}

export function createEnrichmentJobId(questionId: string): string {
  return `question-${questionId}`;
}

export function createEnrichmentQueue(): Queue<EnrichmentJobData> {
  const config = readEnrichmentConfig(process.env);

  return new Queue<EnrichmentJobData>(ENRICHMENT_QUEUE_NAME, {
    connection: { url: config.redisUrl },
    defaultJobOptions: {
      attempts: config.jobAttempts,
      backoff: {
        type: "exponential",
        delay: config.jobBackoffDelayMs,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}
