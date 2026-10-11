// Локальный сервер для разработки и сборки библиотеки (в деплой не входит):
//   node tools/serve.mjs [port] [srcDir]
//   GET  /...            — статика сайта (корень репозитория)
//   GET  /__src/<path>   — исходные JPG ambientCG из srcDir (для конвертации)
//   PUT  /__save/<path>  — запись файла в репозиторий, только в textures/ и img/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = +(process.argv[2] || 5173);
const src = process.argv[3] ? path.resolve(process.argv[3]) : null;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" };
const inside = (base, p) => p === base || p.startsWith(base + path.sep);

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = decodeURIComponent(url.pathname);
  if (req.method === "PUT" && p.startsWith("/__save/")) {
    const rel = p.slice("/__save/".length), f = path.resolve(root, rel);
    if (!/^(textures|img)\//.test(rel) || !inside(root, f)) { res.writeHead(403); return res.end("forbidden"); }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, Buffer.concat(chunks));
      res.writeHead(200); res.end("ok");
    });
    return;
  }
  let base = root;
  if (p.startsWith("/__src/")) { if (!src) { res.writeHead(404); return res.end(); } base = src; p = p.slice("/__src".length); }
  if (p.endsWith("/")) p += "index.html";
  const f = path.resolve(base, "." + p);
  if (!inside(base, f)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://localhost:${port}` + (src ? `, /__src → ${src}` : "")));
