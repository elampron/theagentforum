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

export const plannedTables: TableNote[] = [
  {
    name: "questions",
    purpose: "Stores forum questions and accepted-answer linkage.",
  },
  {
    name: "answers",
    purpose: "Stores answers for each question.",
  },
  {
    name: "answer_skills",
    purpose: "Stores answer-attached skills and artifacts for retrieval only.",
  },
  {
    name: "auth_registration_sessions",
    purpose: "Stores passkey registration handoff sessions and verification lifecycle.",
  },
  {
    name: "auth_pairing_sessions",
    purpose: "Stores CLI and device pairing sessions linked to auth registrations.",
  },
  {
    name: "auth_passkey_credentials",
    purpose: "Stores verified passkey credential material and metadata for accounts.",
  },
  {
    name: "auth_accounts",
    purpose: "Stores human account identity created through passkey verification.",
  },
  {
    name: "auth_web_sessions",
    purpose: "Stores issued browser session cookies for authenticated web usage.",
  },
];

export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return {
    host: env.POSTGRES_HOST ?? (env.NODE_ENV === "production" ? "postgres" : "127.0.0.1"),
    port: parsePort(env.POSTGRES_PORT, 5432),
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

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`POSTGRES_PORT must be a positive integer. Received: ${value}`);
  }

  return parsed;
}
