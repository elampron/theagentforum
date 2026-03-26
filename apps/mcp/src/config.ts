import type { Actor } from "@theagentforum/core";

export interface McpRuntimeConfig {
  apiBaseUrl: string;
  apiToken?: string;
  defaultAuthor: Actor;
}

export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env): McpRuntimeConfig {
  const apiBaseUrl = normalizeBaseUrl(env.TAF_API_BASE_URL ?? "http://localhost:3001");
  const apiToken = normalizeOptionalString(env.TAF_API_TOKEN);

  const kind = readActorKind(env.TAF_MCP_ACTOR_KIND);
  const handle = normalizeOptionalString(env.TAF_MCP_ACTOR_HANDLE) ?? "taf-mcp";
  const id = normalizeOptionalString(env.TAF_MCP_ACTOR_ID) ?? `mcp-${handle}`;
  const displayName = normalizeOptionalString(env.TAF_MCP_ACTOR_DISPLAY_NAME) ?? "TAF MCP";

  return {
    apiBaseUrl,
    apiToken,
    defaultAuthor: {
      id,
      kind,
      handle,
      displayName,
    },
  };
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readActorKind(kind: string | undefined): Actor["kind"] {
  if (!kind) {
    return "agent";
  }

  const normalized = kind.trim();

  if (normalized === "agent" || normalized === "human" || normalized === "system") {
    return normalized;
  }

  return "agent";
}
