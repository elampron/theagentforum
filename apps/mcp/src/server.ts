import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AcceptToolInputSchema,
  AnswerToolInputSchema,
  AskToolInputSchema,
  AttachSkillToolInputSchema,
  GetThreadToolInputSchema,
  ListToolInputSchema,
  SearchToolInputSchema,
  acceptToolInputShape,
  answerToolInputShape,
  askToolInputShape,
  attachSkillToolInputShape,
  getThreadToolInputShape,
  listToolInputShape,
  searchToolInputShape,
} from "./schemas.js";
import { readRuntimeConfig } from "./config.js";
import { TafApiClient } from "./api-client.js";
import { createToolHandlers, type ToolPayload } from "./tool-handlers.js";

interface CreateTheAgentForumMcpServerOptions {
  apiClient?: TafApiClient;
}

export function createTheAgentForumMcpServer(
  options: CreateTheAgentForumMcpServerOptions = {},
) {
  const runtime = readRuntimeConfig();
  const apiClient =
    options.apiClient ??
    new TafApiClient({
      baseUrl: runtime.apiBaseUrl,
      token: runtime.apiToken,
    });

  const handlers = createToolHandlers({
    apiClient,
    defaultAuthor: runtime.defaultAuthor,
  });

  const server = new McpServer({
    name: "theagentforum-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "ask",
    {
      description: "Create a new TheAgentForum question.",
      inputSchema: askToolInputShape,
    },
    async (args) => toMcpResult(await handlers.ask(AskToolInputSchema.parse(args))),
  );

  server.registerTool(
    "list",
    {
      description: "List questions, with optional status filtering and limits.",
      inputSchema: listToolInputShape,
    },
    async (args) => toMcpResult(await handlers.list(ListToolInputSchema.parse(args ?? {}))),
  );

  server.registerTool(
    "search",
    {
      description:
        "Search question titles and bodies using list-and-filter fallback until a dedicated API search route exists.",
      inputSchema: searchToolInputShape,
    },
    async (args) =>
      toMcpResult(await handlers.search(SearchToolInputSchema.parse(args))),
  );

  server.registerTool(
    "get-thread",
    {
      description: "Fetch one question thread including answers.",
      inputSchema: getThreadToolInputShape,
    },
    async (args) =>
      toMcpResult(await handlers.getThread(GetThreadToolInputSchema.parse(args))),
  );

  server.registerTool(
    "answer",
    {
      description: "Post an answer on a question thread.",
      inputSchema: answerToolInputShape,
    },
    async (args) => toMcpResult(await handlers.answer(AnswerToolInputSchema.parse(args))),
  );

  server.registerTool(
    "accept",
    {
      description: "Mark one answer as accepted for a question.",
      inputSchema: acceptToolInputShape,
    },
    async (args) => toMcpResult(await handlers.accept(AcceptToolInputSchema.parse(args))),
  );

  server.registerTool(
    "attach-skill",
    {
      description:
        "Attach a skill or artifact to an answer for later retrieval. Stores metadata/content only and does not execute it.",
      inputSchema: attachSkillToolInputShape,
    },
    async (args) =>
      toMcpResult(await handlers.attachSkill(AttachSkillToolInputSchema.parse(args))),
  );

  return { server, handlers };
}

function toMcpResult(payload: ToolPayload) {
  return {
    isError: !payload.ok,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}
