/**
 * GHOSTNAME WORLDWIDE — zero-dependency static file server.
 *
 * Replaces the previous Express server so the project has no runtime
 * dependencies and stays a pure static deployable.
 *
 * Run:  node server.js   (respects PORT, binds 0.0.0.0)
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = resolve(fileURLToPath(new URL(".", import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);

    // Pretty URLs: /legal/privacy -> legal/privacy.html
    if (!extname(pathname) && pathname !== "/") {
      const pretty = join(__dirname, `${pathname.replace(/\/+$/, "")}.html`);
      try {
        await stat(pretty);
        pathname = `${pathname.replace(/\/+$/, "")}.html`;
      } catch {
        /* fall through to normal resolution */
      }
    }

    const safe = normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
    let filePath = join(__dirname, safe);
    if (!filePath.startsWith(__dirname + sep) && filePath !== __dirname) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    let body;
    try {
      body = await readFile(filePath);
    } catch {
      filePath = join(__dirname, "index.html"); // SPA-style fallback
      body = await readFile(filePath);
    }

    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal server error");
    console.error(err);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`GHOSTNAME server listening on http://0.0.0.0:${PORT}`);
});
