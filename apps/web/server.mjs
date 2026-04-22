import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { createProxyHeaders } from "./src/lib/proxy-headers.js";

const port = Number(process.env.PORT ?? 5173);
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001";
const apiPrefix = "/api";

const distDir = join(process.cwd(), "dist");
const indexPath = join(distDir, "index.html");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    const method = req.method ?? "GET";
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const requestPath = requestUrl.pathname;

    if (requestPath === apiPrefix || requestPath.startsWith(`${apiPrefix}/`)) {
      await proxyApiRequest(req, res, requestUrl, method);
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }

    const normalizedPath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
    const relativePath = normalizedPath === "/" ? "index.html" : normalizedPath.slice(1);
    const candidatePath = join(distDir, relativePath);
    const filePath = (await isFile(candidatePath)) ? candidatePath : indexPath;

    const fileStat = await stat(filePath);
    const contentType = contentTypes[extname(filePath)] ?? "application/octet-stream";

    res.writeHead(200, {
      "content-length": fileStat.size,
      "content-type": contentType,
    });

    if (method === "HEAD") {
      res.end();
      return;
    }

    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }

    res.end("Bad gateway");
  }
});

server.listen(port, () => {
  console.log(`TheAgentForum web listening on http://localhost:${port}`);
});

async function proxyApiRequest(req, res, requestUrl, method) {
  const upstreamPath = requestUrl.pathname.slice(apiPrefix.length) || "/";
  const upstreamUrl = new URL(`${upstreamPath}${requestUrl.search}`, apiProxyTarget);

  const headers = createProxyHeaders(req.headers);
  const body =
    method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);

  const upstreamResponse = await fetch(upstreamUrl, {
    method,
    headers,
    body,
  });

  const responseHeaders = {};

  upstreamResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "connection") {
      return;
    }

    responseHeaders[key] = value;
  });

  res.writeHead(upstreamResponse.status, responseHeaders);

  if (method === "HEAD" || upstreamResponse.body === null) {
    res.end();
    return;
  }

  Readable.fromWeb(upstreamResponse.body).pipe(res);
}

async function readRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

async function isFile(path) {
  try {
    await access(path);
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
