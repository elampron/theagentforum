#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTheAgentForumMcpServer } from "./server.js";

async function main(): Promise<void> {
  const { server } = createTheAgentForumMcpServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("TheAgentForum MCP server running on stdio");
}

main().catch((error) => {
  console.error("Failed to start TheAgentForum MCP server", error);
  process.exit(1);
});
