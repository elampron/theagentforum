import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const sourceDir = join(repoRoot, "docs", "skills", "theagentforum");
const targetDir = join(repoRoot, "apps", "web", "public");

await mkdir(targetDir, { recursive: true });

for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile()) {
    continue;
  }

  await copyFile(join(sourceDir, entry.name), join(targetDir, entry.name));
}

console.log(`Synced TheAgentForum skill pack to ${targetDir}`);
