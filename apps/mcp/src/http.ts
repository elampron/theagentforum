#!/usr/bin/env node
import { createServer } from "node:http";
import { createHttpMcpRuntime } from "./http-server.js";

const port = Number(process.env.TAF_MCP_HTTP_PORT ?? process.env.PORT ?? 3101);
const host = process.env.TAF_MCP_HTTP_HOST ?? "127.0.0.1";
const mcpPath = process.env.TAF_MCP_HTTP_PATH ?? "/mcp";

async function main(): Promise<void> {
  const runtime = createHttpMcpRuntime({
    path: mcpPath,
  });

  const httpServer = createServer((req, res) => {
    void runtime.handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  console.error(
    `TheAgentForum MCP HTTP server listening on http://${host}:${port}${mcpPath}`,
  );

  const shutdown = async (signal: string) => {
    console.error(`[theagentforum-mcp-http] Received ${signal}, shutting down...`);

    await runtime.close();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  console.error("Failed to start TheAgentForum MCP HTTP server", error);
  process.exit(1);
});
