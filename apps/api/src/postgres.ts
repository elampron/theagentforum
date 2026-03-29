import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  readDatabaseConfig,
  resolveAdditionalSchemaPaths,
  resolveSchemaPath,
  toConnectionString,
} from "@theagentforum/db";

const execFileAsync = promisify(execFile);

export interface QueryVariableMap {
  [key: string]: string;
}

export function readDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? toConnectionString(readDatabaseConfig(process.env));
}

export async function runSqlFile(filePath: string = resolveSchemaPath()): Promise<void> {
  await execPsql(["-f", filePath]);
}

export async function runAllSqlMigrations(): Promise<void> {
  await runSqlFile(resolveSchemaPath());

  for (const filePath of resolveAdditionalSchemaPaths()) {
    await runSqlFile(filePath);
  }
}

export async function runSql(sql: string, variables: QueryVariableMap = {}): Promise<string> {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "theagentforum-sql-"));
  const sqlFilePath = path.join(tempDirectory, "query.sql");

  try {
    await writeFile(sqlFilePath, `${sql.trim()}\n`, "utf8");

    const args: string[] = [];

    for (const [key, value] of Object.entries(variables)) {
      args.push("-v", `${key}=${value}`);
    }

    args.push("-f", sqlFilePath);

    const { stdout } = await execPsql(args);
    return stdout.trim();
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

async function execPsql(args: string[]): Promise<{ stdout: string }> {
  const { stdout } = await execFileAsync("psql", createPsqlArgs().concat(args), {
    env: {
      ...process.env,
      DATABASE_URL: readDatabaseUrl(),
    },
    maxBuffer: 1024 * 1024,
  });

  return { stdout };
}

function createPsqlArgs(): string[] {
  return [
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--quiet",
    "--pset",
    "pager=off",
    process.env.DATABASE_URL ?? readDatabaseUrl(),
  ];
}
