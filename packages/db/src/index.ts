import path from "node:path";

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface TableNote {
  name: string;
  purpose: string;
}

export interface EnrichmentConfig {
  redisUrl: string;
  openRouterApiKey: string;
  openRouterModel: string;
  enrichmentVersion: number;
  workerConcurrency: number;
  queueRateLimitMax: number;
  queueRateLimitDurationMs: number;
  queueMaximumRateLimitDelayMs: number;
  jobAttempts: number;
  jobBackoffDelayMs: number;
}

export const plannedTables: TableNote[] = [
  {
    name: "questions",
    purpose: "Stores forum questions and accepted-answer linkage."
  },
  {
    name: "answers",
    purpose: "Stores answers for each question."
  },
  {
    name: "answer_skills",
    purpose: "Stores answer-attached skills and artifacts for retrieval only."
  },
  {
    name: "question_enrichments",
    purpose: "Stores LLM-generated enrichment payloads for questions."
  }
];

export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return {
    host: env.POSTGRES_HOST ?? (env.NODE_ENV === "production" ? "postgres" : "127.0.0.1"),
    port: parsePositiveInteger(env.POSTGRES_PORT, 5432, "POSTGRES_PORT"),
    database: env.POSTGRES_DB ?? "theagentforum",
    user: env.POSTGRES_USER ?? "theagentforum",
    password: env.POSTGRES_PASSWORD ?? "theagentforum",
  };
}

export function toConnectionString(config: DatabaseConfig): string {
  const user = encodeURIComponent(config.user);
  const password = encodeURIComponent(config.password);
  const host = config.host;
  const port = config.port;
  const database = encodeURIComponent(config.database);

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export function resolveSchemaPath(): string {
  return path.resolve(__dirname, "../sql/001-init.sql");
}

export function resolveAdditionalSchemaPaths(): string[] {
  return [path.resolve(__dirname, "../sql/002-enrichment.sql")];
}

export function readEnrichmentConfig(env: NodeJS.ProcessEnv = process.env): EnrichmentConfig {
  return {
    redisUrl: env.REDIS_URL ?? "redis://127.0.0.1:6379",
    openRouterApiKey: env.OPENROUTER_API_KEY ?? "",
    openRouterModel: env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
    enrichmentVersion: parsePositiveInteger(env.ENRICHMENT_VERSION, 1, "ENRICHMENT_VERSION"),
    workerConcurrency: parsePositiveInteger(env.ENRICHMENT_WORKER_CONCURRENCY, 1, "ENRICHMENT_WORKER_CONCURRENCY"),
    queueRateLimitMax: parsePositiveInteger(env.ENRICHMENT_QUEUE_RATE_LIMIT_MAX, 4, "ENRICHMENT_QUEUE_RATE_LIMIT_MAX"),
    queueRateLimitDurationMs: parsePositiveInteger(
      env.ENRICHMENT_QUEUE_RATE_LIMIT_DURATION_MS,
      60_000,
      "ENRICHMENT_QUEUE_RATE_LIMIT_DURATION_MS",
    ),
    queueMaximumRateLimitDelayMs: parsePositiveInteger(
      env.ENRICHMENT_MAX_RATE_LIMIT_DELAY_MS,
      600_000,
      "ENRICHMENT_MAX_RATE_LIMIT_DELAY_MS",
    ),
    jobAttempts: parsePositiveInteger(env.ENRICHMENT_JOB_ATTEMPTS, 6, "ENRICHMENT_JOB_ATTEMPTS"),
    jobBackoffDelayMs: parsePositiveInteger(
      env.ENRICHMENT_JOB_BACKOFF_DELAY_MS,
      90_000,
      "ENRICHMENT_JOB_BACKOFF_DELAY_MS",
    ),
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number, envName: string): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer. Received: ${value}`);
  }

  return parsed;
}
