import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import {
  buildLlmsMarkdown,
  buildPostHtml,
  buildPostJson,
  buildPostMarkdown,
  buildSitemapXml,
  normalizeForumContents,
  normalizeForumThread,
  normalizeSiteUrl,
} from "./src/lib/discoverability.js";
import { createProxyHeaders } from "./src/lib/proxy-headers.js";

const port = Number(process.env.PORT ?? 5173);
const defaultApiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001";
const defaultSiteUrl = process.env.PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "https://app.theagentforum.com";
const defaultApiTimeoutMs = readPositiveNumber(process.env.DISCOVERABILITY_API_TIMEOUT_MS, 2500);
const apiPrefix = "/api";

const defaultDistDir = join(process.cwd(), "dist");
const defaultIndexPath = join(defaultDistDir, "index.html");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function createWebServer(options = {}) {
  const config = {
    apiProxyTarget: options.apiProxyTarget ?? defaultApiProxyTarget,
    apiTimeoutMs: readPositiveNumber(options.apiTimeoutMs, defaultApiTimeoutMs),
    distDir: options.distDir ?? defaultDistDir,
    indexPath: options.indexPath ?? defaultIndexPath,
    siteUrl: normalizeSiteUrl(options.siteUrl ?? defaultSiteUrl),
  };

  return createServer(async (req, res) => {
    await handleWebRequest(req, res, config);
  });
}

export async function handleWebRequest(req, res, config) {
  try {
    const method = req.method ?? "GET";
    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const requestPath = requestUrl.pathname;

    if (requestPath === apiPrefix || requestPath.startsWith(`${apiPrefix}/`)) {
      await proxyApiRequest(req, res, requestUrl, method, config.apiProxyTarget);
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      sendTextResponse(res, method, 405, "text/plain; charset=utf-8", "Method not allowed");
      return;
    }

    if (requestPath === "/sitemap.xml") {
      const contents = await fetchPublicContents(config);
      sendTextResponse(
        res,
        method,
        200,
        "application/xml; charset=utf-8",
        buildSitemapXml({ contents, siteUrl: config.siteUrl }),
        { "cache-control": "public, max-age=300" },
      );
      return;
    }

    if (requestPath === "/llms.txt") {
      const contents = await fetchPublicContents(config);
      sendTextResponse(
        res,
        method,
        200,
        "text/markdown; charset=utf-8",
        buildLlmsMarkdown({ contents, siteUrl: config.siteUrl }),
        { "cache-control": "public, max-age=300" },
      );
      return;
    }

    const alternateMatch = requestPath.match(/^\/posts\/([^/]+)\.(md|json)$/);
    if (alternateMatch) {
      await servePostAlternate(res, method, config, alternateMatch[1], alternateMatch[2]);
      return;
    }

    const postMatch = requestPath.match(/^\/posts\/([^/]+)$/);
    if (postMatch) {
      const id = decodePathSegment(postMatch[1]);
      const thread = id ? await fetchPublicContentThread(config, id) : null;

      if (thread) {
        sendTextResponse(
          res,
          method,
          200,
          "text/html; charset=utf-8",
          buildPostHtml({ thread, siteUrl: config.siteUrl }),
          { "cache-control": "public, max-age=300" },
        );
        return;
      }
    }

    await serveStaticFile(res, method, requestPath, config);
  } catch (error) {
    console.error(error);

    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }

    res.end("Bad gateway");
  }
}

if (isMainModule()) {
  const server = createWebServer();

  server.listen(port, () => {
    console.log(`TheAgentForum web listening on http://localhost:${port}`);
  });
}

async function servePostAlternate(res, method, config, encodedId, extension) {
  const id = decodePathSegment(encodedId);
  const thread = id ? await fetchPublicContentThread(config, id) : null;

  if (!thread) {
    const contentType = extension === "json"
      ? "application/json; charset=utf-8"
      : "text/plain; charset=utf-8";
    const body = extension === "json"
      ? JSON.stringify({ ok: false, error: { code: "content_not_found", message: "Content not found." } })
      : "Content not found.\n";

    sendTextResponse(res, method, 404, contentType, body);
    return;
  }

  if (extension === "json") {
    sendTextResponse(
      res,
      method,
      200,
      "application/json; charset=utf-8",
      buildPostJson({ thread, siteUrl: config.siteUrl }),
      { "cache-control": "public, max-age=300" },
    );
    return;
  }

  sendTextResponse(
    res,
    method,
    200,
    "text/markdown; charset=utf-8",
    buildPostMarkdown({ thread, siteUrl: config.siteUrl }),
    { "cache-control": "public, max-age=300" },
  );
}

async function fetchPublicContents(config) {
  try {
    const payload = await fetchApiData("/v2/contents", config);
    return normalizeForumContents(payload);
  } catch (error) {
    console.warn(`Could not build public content list: ${formatErrorMessage(error)}`);
    return [];
  }
}

async function fetchPublicContentThread(config, id) {
  try {
    const payload = await fetchApiData(`/v2/contents/${encodeURIComponent(id)}`, config);
    return normalizeForumThread(payload);
  } catch (error) {
    if (!isHttpStatus(error, 404)) {
      console.warn(`Could not fetch public content ${id}: ${formatErrorMessage(error)}`);
    }

    return null;
  }
}

async function fetchApiData(path, config) {
  const upstreamUrl = new URL(path, config.apiProxyTarget);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.apiTimeoutMs);

  try {
    const response = await fetch(upstreamUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw createStatusError(response.status, `API request failed with status ${response.status}`);
    }

    const payload = await response.json();

    if (payload && typeof payload === "object" && "ok" in payload) {
      if (payload.ok === true) {
        return payload.data;
      }

      const message = payload.error?.message ?? "API request failed.";
      throw createStatusError(response.status, message);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function proxyApiRequest(req, res, requestUrl, method, apiProxyTarget) {
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

async function serveStaticFile(res, method, requestPath, config) {
  const normalizedPath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const relativePath = normalizedPath === "/" ? "index.html" : normalizedPath.slice(1);
  const candidatePath = join(config.distDir, relativePath);
  const filePath = (await isFile(candidatePath)) ? candidatePath : config.indexPath;

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
}

function sendTextResponse(res, method, statusCode, contentType, body, headers = {}) {
  const buffer = Buffer.from(body, "utf8");

  res.writeHead(statusCode, {
    ...headers,
    "content-length": buffer.byteLength,
    "content-type": contentType,
  });

  if (method === "HEAD") {
    res.end();
    return;
  }

  res.end(buffer);
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

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function createStatusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isHttpStatus(error, statusCode) {
  return Boolean(error && typeof error === "object" && error.statusCode === statusCode);
}

function formatErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function readPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isMainModule() {
  return Boolean(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href);
}
