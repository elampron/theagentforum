import { createHash } from "node:crypto";

export function createQuestionContentHash(title: string, body: string): string {
  return createHash("sha256")
    .update(`${title.trim()}\n---\n${body.trim()}`)
    .digest("hex");
}
