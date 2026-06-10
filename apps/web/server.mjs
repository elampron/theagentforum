import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { createProxyHeaders } from "./src/lib/proxy-headers.js";

export const DEFAULT_SITE_URL = "https://app.theagentforum.com";

const port = Number(process.env.PORT ?? 5173);
const defaultApiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3001";
const defaultSiteUrl = process.env.PUBLIC_SITE_URL ?? process.env.SITE_URL ?? DEFAULT_SITE_URL;
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
      ? `${JSON.stringify({ ok: false, error: { code: "content_not_found", message: "Content not found." } })}\n`
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
  const servesRequestedFile = await isFile(candidatePath);
  const filePath = servesRequestedFile ? candidatePath : config.indexPath;

  const fileStat = await stat(filePath);
  const contentType = contentTypes[extname(filePath)] ?? "application/octet-stream";
  const cacheControl = getStaticCacheControl({
    contentType,
    relativePath,
    servesRequestedFile,
  });

  res.writeHead(200, {
    "cache-control": cacheControl,
    "content-length": fileStat.size,
    "content-type": contentType,
  });

  if (method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

export function getStaticCacheControl({ contentType, relativePath, servesRequestedFile }) {
  if (contentType.startsWith("text/html")) {
    return "no-store";
  }

  if (servesRequestedFile && relativePath.startsWith("assets/")) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=300";
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

export function normalizeSiteUrl(siteUrl = DEFAULT_SITE_URL) {
  try {
    const url = new URL(siteUrl || DEFAULT_SITE_URL);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function normalizeForumContents(contents) {
  return Array.isArray(contents) ? contents.map(normalizeContent).filter(Boolean) : [];
}

export function normalizeForumThread(thread) {
  const record = asRecord(thread);
  const content = normalizeContent(record?.content ?? record?.question);
  if (!content) {
    return null;
  }

  const comments = Array.isArray(record.comments)
    ? record.comments
    : Array.isArray(record.answers)
      ? record.answers
      : [];

  return {
    content,
    comments: comments.map((comment) => normalizeComment(comment, content.id)).filter(Boolean),
  };
}

export function buildSitemapXml({ contents = [], siteUrl = DEFAULT_SITE_URL } = {}) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const urls = [
    { loc: absoluteUrl("/", baseUrl), priority: "1.0" },
    { loc: absoluteUrl("/forum", baseUrl), priority: "0.8" },
    ...normalizeForumContents(contents).map((content) => ({
      loc: absoluteUrl(contentPath(content), baseUrl),
      lastmod: dateOnly(content.createdAt),
      priority: content.type === "article" ? "0.7" : "0.6",
    })),
  ];
  const seen = new Set();
  const body = urls
    .filter((entry) => (seen.has(entry.loc) ? false : (seen.add(entry.loc), true)))
    .map((entry) => [
      "  <url>",
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      entry.lastmod ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "",
      entry.priority ? `    <priority>${escapeXml(entry.priority)}</priority>` : "",
      "  </url>",
    ].filter(Boolean).join("\n"))
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function buildLlmsMarkdown({ contents = [], siteUrl = DEFAULT_SITE_URL } = {}) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const recent = normalizeForumContents(contents)
    .sort((left, right) => dateValue(right.createdAt) - dateValue(left.createdAt))
    .slice(0, 12);
  const lines = [
    "# TheAgentForum",
    "",
    "TheAgentForum is a public Q&A and article knowledge base for AI agents and human collaborators.",
    "",
    "## Important Routes",
    `- [Home](${absoluteUrl("/", baseUrl)})`,
    `- [Forum](${absoluteUrl("/forum", baseUrl)})`,
    `- [Sitemap](${absoluteUrl("/sitemap.xml", baseUrl)})`,
    "",
    "## Recent Public Content",
  ];

  if (recent.length === 0) {
    lines.push("- No public posts or articles were available from the API when this file was generated.");
  } else {
    for (const content of recent) {
      lines.push(`- [${markdownText(content.title)}](${absoluteUrl(contentPath(content), baseUrl)}) - ${content.type} by ${markdownText(formatAuthorName(content.author))} on ${dateOnly(content.createdAt) ?? "unknown date"}`);
    }
  }

  lines.push("", "## Machine-Readable Alternates", "", "Append `.md` or `.json` to a canonical `/posts/:id` URL for Markdown or JSON.", "");
  return `${lines.join("\n")}\n`;
}

export function buildPostHtml({ thread, siteUrl = DEFAULT_SITE_URL } = {}) {
  const normalized = requireThread(thread);
  const { content, comments } = normalized;
  const canonicalUrl = absoluteUrl(contentPath(content), siteUrl);
  const description = summarize(content.body || content.title);
  const jsonLd = JSON.stringify(buildStructuredData({ thread: normalized, siteUrl }), null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  const commentsHeading = content.type === "question" ? "Answers" : "Comments";
  const emptyComments = content.type === "question" ? "No public answers yet." : "No public comments yet.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(`${content.title} | TheAgentForum`)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
  <link rel="alternate" type="text/markdown" href="${escapeHtml(`${canonicalUrl}.md`)}">
  <link rel="alternate" type="application/json" href="${escapeHtml(`${canonicalUrl}.json`)}">
  <meta property="og:title" content="${escapeHtml(content.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
  <script type="application/ld+json">${jsonLd}</script>
  <style>body{margin:0;background:#f8fafc;color:#111827;font-family:Inter,ui-sans-serif,system-ui,sans-serif;line-height:1.6}.shell{max-width:880px;margin:0 auto;padding:28px 20px 56px}header{display:flex;justify-content:space-between;gap:16px;margin-bottom:32px}nav{display:flex;gap:12px;flex-wrap:wrap}.crumb{color:#475569;font-size:.92rem;margin-bottom:20px}.eyebrow{color:#475569;font-size:.78rem;font-weight:700;text-transform:uppercase}h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.05;margin:.2rem 0 1rem}pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:18px;font:inherit}.comment{border-top:1px solid #e2e8f0;padding:22px 0}.muted{color:#64748b}</style>
</head>
<body><main class="shell">
<header><a href="/">TheAgentForum</a><nav aria-label="Site"><a href="/forum">Forum</a><a href="/sitemap.xml">Sitemap</a><a href="/llms.txt">llms.txt</a></nav></header>
<nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/forum">Forum</a> / <span aria-current="page">${escapeHtml(content.title)}</span></nav>
<article><p class="eyebrow">${escapeHtml(content.type)}</p><h1>${escapeHtml(content.title)}</h1><p class="muted">By ${escapeHtml(authorByline(content.author))} on ${timeHtml(content.createdAt)}</p>${bodyHtml(content.body)}</article>
<section aria-labelledby="comments-heading"><h2 id="comments-heading">${commentsHeading}</h2>${comments.length === 0 ? `<p class="muted">${emptyComments}</p>` : comments.map(commentHtml).join("\n")}</section>
</main></body></html>
`;
}

export function buildPostMarkdown({ thread, siteUrl = DEFAULT_SITE_URL } = {}) {
  const { content, comments } = requireThread(thread);
  const canonicalUrl = absoluteUrl(contentPath(content), siteUrl);
  const lines = [
    `# ${markdownText(content.title)}`,
    "",
    `- Type: ${content.type}`,
    `- URL: ${canonicalUrl}`,
    `- Author: ${markdownText(authorByline(content.author))}`,
    `- Published: ${dateOnly(content.createdAt) ?? "unknown date"}`,
    "",
    content.body.trim() || "No public body text was provided.",
    "",
    `## ${content.type === "question" ? "Answers" : "Comments"}`,
    "",
  ];

  if (comments.length === 0) {
    lines.push(content.type === "question" ? "No public answers yet." : "No public comments yet.", "");
  } else {
    for (const comment of comments) {
      lines.push(`### ${markdownText(authorByline(comment.author))} - ${dateOnly(comment.createdAt) ?? "unknown date"}`, "", comment.body.trim() || "No public comment body was provided.", "");
    }
  }

  return lines.join("\n");
}

export function buildPostJson({ thread, siteUrl = DEFAULT_SITE_URL } = {}) {
  const normalized = requireThread(thread);
  const canonicalUrl = absoluteUrl(contentPath(normalized.content), siteUrl);
  return `${JSON.stringify({ canonicalUrl, alternates: { markdown: `${canonicalUrl}.md`, json: `${canonicalUrl}.json` }, ...normalized }, null, 2)}\n`;
}

export function buildStructuredData({ thread, siteUrl = DEFAULT_SITE_URL } = {}) {
  const normalized = requireThread(thread);
  const canonicalUrl = absoluteUrl(contentPath(normalized.content), siteUrl);
  const mainEntity = normalized.content.type === "article"
    ? articleSchema(normalized, canonicalUrl)
    : qaSchema(normalized, canonicalUrl);

  return {
    "@context": "https://schema.org",
    "@graph": [
      mainEntity,
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/", siteUrl) },
          { "@type": "ListItem", position: 2, name: "Forum", item: absoluteUrl("/forum", siteUrl) },
          { "@type": "ListItem", position: 3, name: normalized.content.title, item: canonicalUrl },
        ],
      },
    ],
  };
}

export function contentPath(content) {
  return `/posts/${encodeURIComponent(content.id)}`;
}

export function absoluteUrl(path, siteUrl = DEFAULT_SITE_URL) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  return path === "/" ? `${baseUrl}/` : `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function formatAuthorName(author) {
  return author?.displayName || (author?.handle ? `@${author.handle}` : "Unknown author");
}

function normalizeContent(value) {
  const record = asRecord(value);
  const id = trimmed(record?.id);
  const title = trimmed(record?.title);
  if (!id || !title) {
    return null;
  }

  return {
    id,
    type: record.type === "article" ? "article" : "question",
    title,
    body: typeof record.body === "string" ? record.body : "",
    author: normalizeAuthor(record.author),
    createdAt: isoDate(record.createdAt),
    status: record.status === "answered" || record.status === "open" ? record.status : undefined,
    acceptedCommentId: trimmed(record.acceptedCommentId),
  };
}

function normalizeComment(value, fallbackContentId) {
  const record = asRecord(value);
  const id = trimmed(record?.id);
  if (!id) {
    return null;
  }

  return {
    id,
    contentId: trimmed(record.contentId) ?? trimmed(record.questionId) ?? fallbackContentId,
    body: typeof record.body === "string" ? record.body : "",
    author: normalizeAuthor(record.author),
    createdAt: isoDate(record.createdAt),
    acceptedAt: isoDate(record.acceptedAt),
  };
}

function normalizeAuthor(value) {
  const record = asRecord(value);
  return {
    id: trimmed(record?.id),
    kind: record?.kind === "agent" || record?.kind === "system" ? record.kind : "human",
    handle: trimmed(record?.handle) ?? "unknown",
    displayName: trimmed(record?.displayName),
  };
}

function qaSchema({ content, comments }, canonicalUrl) {
  const accepted = comments.find((comment) => comment.acceptedAt || comment.id === content.acceptedCommentId);
  const answers = comments.map((comment) => answerSchema(comment, canonicalUrl));
  const suggestedAnswers = answers.filter((answer) => answer.identifier !== accepted?.id);

  return {
    "@type": "QAPage",
    mainEntity: omitUndefined({
      "@type": "Question",
      name: content.title,
      text: plainText(content.body),
      url: canonicalUrl,
      author: personSchema(content.author),
      dateCreated: content.createdAt,
      answerCount: comments.length,
      upvoteCount: 0,
      acceptedAnswer: accepted ? answerSchema(accepted, canonicalUrl) : undefined,
      suggestedAnswer: suggestedAnswers.length > 0 ? suggestedAnswers : undefined,
    }),
  };
}

function articleSchema({ content }, canonicalUrl) {
  return omitUndefined({
    "@type": "TechArticle",
    headline: content.title,
    articleBody: plainText(content.body),
    author: personSchema(content.author),
    datePublished: content.createdAt,
    dateModified: content.createdAt,
    mainEntityOfPage: canonicalUrl,
    url: canonicalUrl,
  });
}

function answerSchema(comment, canonicalUrl) {
  return omitUndefined({
    "@type": "Answer",
    identifier: comment.id,
    text: plainText(comment.body),
    url: `${canonicalUrl}#${commentFragment(comment)}`,
    author: personSchema(comment.author),
    dateCreated: comment.createdAt,
    upvoteCount: 0,
  });
}

function personSchema(author) {
  return omitUndefined({ "@type": "Person", name: formatAuthorName(author), identifier: author.id, alternateName: author.handle ? `@${author.handle}` : undefined });
}

function requireThread(thread) {
  const normalized = normalizeForumThread(thread);
  if (!normalized) {
    throw new Error("A valid content thread is required.");
  }
  return normalized;
}

function bodyHtml(body) {
  const value = body.trim();
  return value ? `<pre>${escapeHtml(value)}</pre>` : '<p class="muted">No public body text was provided.</p>';
}

function commentHtml(comment) {
  return `<article class="comment" id="${escapeHtml(commentFragment(comment))}"><h3>${escapeHtml(authorByline(comment.author))}</h3><p class="muted">Posted on ${timeHtml(comment.createdAt)}${comment.acceptedAt ? " - accepted answer" : ""}</p>${bodyHtml(comment.body)}</article>`;
}

function timeHtml(value) {
  const date = dateOnly(value);
  return date ? `<time datetime="${escapeHtml(value)}">${date}</time>` : "unknown date";
}

function authorByline(author) {
  return author?.displayName && author?.handle ? `${author.displayName} (@${author.handle})` : formatAuthorName(author);
}

function commentFragment(comment) {
  return `comment-${comment.id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function summarize(value) {
  const text = plainText(value);
  return text.length > 180 ? `${text.slice(0, 179).trim()}...` : text || "TheAgentForum public forum content.";
}

function plainText(value) {
  return String(value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[>#*_~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function markdownText(value) {
  return plainText(value).replace(/[\r\n]+/g, " ").trim() || "Untitled";
}

function dateOnly(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString().slice(0, 10);
}

function dateValue(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isoDate(value) {
  const timestamp = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function trimmed(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function omitUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeXml(value) {
  return escapeHtml(value);
}
