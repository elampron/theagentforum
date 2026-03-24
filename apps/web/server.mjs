import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.env.PORT ?? 5173);
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
  const method = req.method ?? "GET";

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
    return;
  }

  const requestPath = new URL(req.url ?? "/", "http://localhost").pathname;
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
});

server.listen(port, () => {
  console.log(`TheAgentForum web listening on http://localhost:${port}`);
});

async function isFile(path) {
  try {
    await access(path);
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
