import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createTheAgentForumMcpServer } from "./server.js";

interface HttpMcpRuntimeOptions {
  path?: string;
  sessionIdGenerator?: () => string;
}

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  closeServer: () => Promise<void>;
}

export interface HttpMcpRuntime {
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
  close(): Promise<void>;
  getSessionCount(): number;
}

export function createHttpMcpRuntime(options: HttpMcpRuntimeOptions = {}): HttpMcpRuntime {
  const mcpPath = normalizePath(options.path ?? "/mcp");
  const sessionIdGenerator = options.sessionIdGenerator ?? randomUUID;
  const sessions = new Map<string, SessionEntry>();

  return {
    async handleRequest(req, res) {
      try {
        const requestUrl = new URL(req.url ?? "/", "http://localhost");

        if (requestUrl.pathname !== mcpPath) {
          sendJsonRpcError(res, 404, -32601, "Route not found.");
          return;
        }

        const method = (req.method ?? "GET").toUpperCase();

        if (method === "POST") {
          const body = await tryReadJson(req, res);

          if (body === undefined && !res.writableEnded) {
            sendJsonRpcError(res, 400, -32700, "Invalid JSON body.");
          }

          if (!res.writableEnded) {
            await handlePostRequest({
              req,
              res,
              sessions,
              body,
              sessionIdGenerator,
            });
          }

          return;
        }

        if (method === "GET" || method === "DELETE") {
          const sessionId = readSessionId(req);

          if (!sessionId || !sessions.has(sessionId)) {
            sendJsonRpcError(res, 400, -32000, "Invalid or missing MCP session id.");
            return;
          }

          const existing = sessions.get(sessionId)!;
          await existing.transport.handleRequest(req, res);
          return;
        }

        sendJsonRpcError(res, 405, -32000, "Method not allowed.");
      } catch (error) {
        console.error("[theagentforum-mcp-http] Request handling failed", error);

        if (!res.headersSent) {
          sendJsonRpcError(res, 500, -32603, "Internal server error.");
        }
      }
    },

    async close() {
      const sessionIds = Array.from(sessions.keys());

      for (const sessionId of sessionIds) {
        const entry = sessions.get(sessionId);

        if (!entry) {
          continue;
        }

        try {
          await entry.transport.close();
        } catch (error) {
          console.error(`[theagentforum-mcp-http] Failed to close transport ${sessionId}`, error);
        }

        try {
          await entry.closeServer();
        } catch (error) {
          console.error(`[theagentforum-mcp-http] Failed to close server ${sessionId}`, error);
        }

        sessions.delete(sessionId);
      }
    },

    getSessionCount() {
      return sessions.size;
    },
  };
}

async function handlePostRequest(input: {
  req: IncomingMessage;
  res: ServerResponse;
  sessions: Map<string, SessionEntry>;
  body: unknown;
  sessionIdGenerator: () => string;
}): Promise<void> {
  const { req, res, sessions, body, sessionIdGenerator } = input;
  const sessionId = readSessionId(req);

  if (sessionId) {
    const existing = sessions.get(sessionId);

    if (!existing) {
      sendJsonRpcError(res, 404, -32001, "MCP session not found.");
      return;
    }

    await existing.transport.handleRequest(req, res, body);
    return;
  }

  if (!isInitializeRequest(body)) {
    sendJsonRpcError(
      res,
      400,
      -32000,
      "Initialization request required when no MCP session id is provided.",
    );
    return;
  }

  const { server } = createTheAgentForumMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator,
    onsessioninitialized(initializedSessionId) {
      sessions.set(initializedSessionId, {
        transport,
        closeServer: () => server.close(),
      });
    },
  });

  transport.onclose = () => {
    const sid = transport.sessionId;

    if (!sid) {
      return;
    }

    const existing = sessions.get(sid);

    if (!existing) {
      return;
    }

    sessions.delete(sid);
    void existing.closeServer();
  };

  await server.connect(transport);

  try {
    await transport.handleRequest(req, res, body);
  } catch (error) {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    throw error;
  }
}

async function tryReadJson(req: IncomingMessage, res: ServerResponse): Promise<unknown | undefined> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    sendJsonRpcError(res, 400, -32700, "Invalid JSON body.");
    return undefined;
  }
}

function readSessionId(req: IncomingMessage): string | undefined {
  const value = req.headers["mcp-session-id"];

  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function normalizePath(path: string): string {
  if (!path.startsWith("/")) {
    return `/${path}`;
  }

  return path;
}

function sendJsonRpcError(
  res: ServerResponse,
  httpStatus: number,
  code: number,
  message: string,
): void {
  if (res.writableEnded) {
    return;
  }

  res.writeHead(httpStatus, {
    "content-type": "application/json; charset=utf-8",
  });

  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code,
        message,
      },
      id: null,
    }),
  );
}
