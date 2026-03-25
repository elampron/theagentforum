import { runSqlFile } from "../postgres";

async function main(): Promise<void> {
  await runSqlFile();
  console.log("Applied TheAgentForum database schema.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
