// Local development server: serves dist/ + the serverless API handler.
// Used for local verification (npm run devserver). Not used in production.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 3000);

const { default: api } = await import("../api/[[...route]].ts");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    // minimal VercelResponse shim + JSON body parsing
    let body;
    if (req.method === "POST" || req.method === "PUT") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8");
      try { body = JSON.parse(raw); } catch { body = raw; }
    }
    const shim = {
      setHeader: (k, v) => res.setHeader(k, v),
      status: (c) => { res.statusCode = c; return shim; },
      json: (v) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(v)); },
      end: () => res.end(),
    };
    Object.assign(req, { body });
    try {
      await api(req, shim);
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ status: "DATA_UNAVAILABLE", reason: String(e) }));
    }
    return;
  }
  let path = url.pathname === "/" ? "/index.html" : url.pathname;
  try {
    const file = await readFile(join(DIST, path));
    res.setHeader("Content-Type", MIME[extname(path)] ?? "application/octet-stream");
    res.end(file);
  } catch {
    // SPA fallback (hash router; direct paths still resolve)
    const index = await readFile(join(DIST, "index.html"));
    res.setHeader("Content-Type", "text/html");
    res.end(index);
  }
});

server.listen(PORT, () => console.log(`sentinelx-nexus dev server: http://localhost:${PORT}`));
