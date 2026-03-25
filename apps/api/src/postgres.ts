import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readDatabaseConfig,
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

export async function runSql(sql: string, variables: QueryVariableMap = {}): Promise<string> {
  const args: string[] = [];

  for (const [key, value] of Object.entries(variables)) {
    args.push("-v", `${key}=${value}`);
  }

  args.push("-c", sql);

  const { stdout } = await execPsql(args);
  return stdout.trim();
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
    process.env.DATABASE_URL ?? readDatabaseUrl(),
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--quiet",
    "--pset",
    "pager=off",
  ];
}
