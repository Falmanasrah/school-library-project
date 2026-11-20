// Local development server that behaves like the Vercel deployment:
// serves the static apps, applies the headers from vercel.json and runs /api/rpc
// against a local JSON-file database (never the production Firestore).
//   npm run dev            -> http://localhost:8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKED = ['/api/_lib', '/node_modules', '/.data', '/tests', '/scripts', '/.git', '/package.json', '/package-lock.json', '/.vercelignore', '/.gitignore', '/firebase.json', '/.claude', '/.env'];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

function vercelHeaders() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    return (cfg.headers || []).map(h => ({ re: new RegExp('^' + h.source.replace(/\(\.\*\)/g, '.*').replace(/\//g, '\\/') + '$'), headers: h.headers }));
  } catch { return []; }
}
function vercelRedirects() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    return cfg.redirects || [];
  } catch { return []; }
}

function applyHeaders(res, urlPath) {
  for (const rule of vercelHeaders()) {
    if (!rule.re.test(urlPath)) continue;
    for (const { key, value } of rule.headers) {
      if (key.toLowerCase() === 'strict-transport-security') continue; // http only locally
      res.setHeader(key, key.toLowerCase() === 'content-security-policy' ? value.replace(/;\s*upgrade-insecure-requests/, '') : value);
    }
  }
}

export async function startServer({ port = 8080, db } = {}) {
  const { handle } = await import(pathToFileURL(path.join(ROOT, 'api/_lib/handler.js')).href);
  const core = await import(pathToFileURL(path.join(ROOT, 'api/_lib/core.js')).href);
  if (db) core.setDb(db);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let p = decodeURIComponent(url.pathname);
    if (p === '/api/rpc') return handle(req, res);
    if (p.startsWith('/api/')) { res.writeHead(404); return res.end('Not found'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (BLOCKED.some(b => p === b || p.startsWith(b + '/'))) { res.writeHead(404); return res.end('Not found'); }
    for (const r of vercelRedirects()) if (r.source === p) { res.writeHead(r.permanent ? 308 : 307, { Location: r.destination }); return res.end(); }
    let file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    try {
      if (fs.statSync(file).isDirectory()) {
        if (!p.endsWith('/')) { res.writeHead(308, { Location: p + '/' }); return res.end(); }
        file = path.join(file, 'index.html');
      }
      const body = fs.readFileSync(file);
      applyHeaders(res, p);
      res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.writeHead(200);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  server.port = server.address().port;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.env.DATA_FILE = process.env.DATA_FILE || path.join(ROOT, '.data', 'dev-db.json');
  process.env.ADMIN_SETUP_KEY = process.env.ADMIN_SETUP_KEY || 'local-dev-setup-key';
  const port = Number(process.env.PORT || 8080);
  await startServer({ port });
  console.log(`School library system running at http://localhost:${port}`);
  console.log(`  Teachers App:          http://localhost:${port}/`);
  console.log(`  Library Teachers App:  http://localhost:${port}/library/`);
  console.log(`  Floor Supervisors App: http://localhost:${port}/supervisors/`);
  console.log(`  Download page:         http://localhost:${port}/download/`);
  console.log(`  Local data file:       ${process.env.DATA_FILE}`);
  console.log(`  First-time setup key:  ${process.env.ADMIN_SETUP_KEY}`);
}
