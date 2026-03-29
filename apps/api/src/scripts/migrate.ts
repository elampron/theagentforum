import { runAllSqlMigrations } from "../postgres";

void runAllSqlMigrations().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
