// Tests the free second address: cloudflare/worker.js forwarding to the server.
// The Worker runs here in Node behind a small HTTP bridge that plays Cloudflare's part
// (it adds CF-Connecting-IP, the visitor's real IP), in front of the local copy of the site.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startServer } from '../scripts/dev-server.mjs';
import { createMemoryDb } from '../api/_lib/db-memory.js';
import worker from '../cloudflare/worker.js';

const SECRET = 'test-proxy-secret-0123456789';
const VISITOR_IP = '203.0.113.7';
process.env.ADMIN_SETUP_KEY = 'test-setup-key-123';
process.env.PROXY_SECRET = SECRET;

let site, bridge, siteBase, proxyBase, db, workerEnv;

function startBridge() {
  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers, 'cf-connecting-ip': VISITOR_IP };
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });
    const out = await worker.fetch(request, workerEnv);
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

before(async () => {
  db = createMemoryDb();
  site = await startServer({ port: 0, db });
  siteBase = `http://127.0.0.1:${site.port}`;
  workerEnv = { PROXY_SECRET: SECRET, TARGET: siteBase };
  bridge = await startBridge();
  proxyBase = `http://127.0.0.1:${bridge.address().port}`;
});
after(() => { site?.close(); bridge?.close(); });

async function rpc(base, action, data = {}, headers = {}) {
  const r = await fetch(`${base}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App': 'library', ...headers },
    body: JSON.stringify({ action, data })
  });
  return { status: r.status, ...(await r.json()) };
}

test('second address forwards the apps and the server', async (t) => {
  await t.test('pages, files and security headers come through', async () => {
    const r = await fetch(`${proxyBase}/library/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await r.text(), /<html/i);
    const v = await (await fetch(`${proxyBase}/version.json`)).json();
    assert.ok(v.version);
  });

  await t.test('redirects stay on the second address', async () => {
    const r = await fetch(`${proxyBase}/library`, { redirect: 'manual' });
    assert.equal(r.status, 308);
    assert.equal(r.headers.get('location'), `${proxyBase}/library/`);
  });

  await t.test('a path cannot send the Worker to another website', async () => {
    const r = await fetch(`${proxyBase}//example.com/x`);
    assert.equal(r.status, 404);
    assert.equal(await r.text(), 'Not found');
  });

  await t.test('the server confirms the shared secret matches', async () => {
    const j = await (await fetch(`${proxyBase}/api/rpc`)).json();
    assert.equal(j.data.secondAddress, 'ok');
  });

  await t.test('sign-up and sign-in work through the second address', async () => {
    const origin = { Origin: proxyBase };
    const info = await rpc(proxyBase, 'system.info', {}, origin);
    assert.equal(info.ok, true, JSON.stringify(info.error));
    const setup = await rpc(proxyBase, 'system.setup', { setupKey: 'test-setup-key-123', name: 'Head Librarian', username: 'admin', password: 'Admin-pass-1', timeZone: 'Asia/Amman' }, { ...origin, 'X-SLS-Client-IP': '6.6.6.6' });
    assert.equal(setup.ok, true, JSON.stringify(setup.error));
    const login = await rpc(proxyBase, 'auth.login', { login: 'admin', password: 'Admin-pass-1' }, origin);
    assert.equal(login.ok, true, JSON.stringify(login.error));
    assert.ok(login.data.token);
  });

  await t.test("the visitor's own IP is recorded, not Cloudflare's and not a faked one", async () => {
    const entries = await db.query('auditLog', {});
    assert.ok(entries.length > 0);
    for (const e of entries) assert.equal(e.ip, VISITOR_IP);
  });

  await t.test('other websites still cannot call the server directly', async () => {
    const r = await rpc(siteBase, 'system.info', {}, { Origin: proxyBase });
    assert.equal(r.status, 403);
    assert.equal(r.error.code, 'BAD_ORIGIN');
  });

  await t.test('a wrong secret is refused with a clear message', async () => {
    const r = await rpc(siteBase, 'system.info', {}, { Origin: proxyBase, 'X-SLS-Proxy-Key': 'wrong-secret-0123456789', 'X-SLS-Public-Host': new URL(proxyBase).host, 'X-SLS-Client-IP': '6.6.6.6' });
    assert.equal(r.status, 403);
    assert.equal(r.error.code, 'PROXY_NOT_TRUSTED');
    workerEnv.PROXY_SECRET = 'not-the-same-secret-0123';
    const j = await (await fetch(`${proxyBase}/api/rpc`)).json();
    assert.match(j.data.secondAddress, /not the same/);
    workerEnv.PROXY_SECRET = SECRET;
  });

  await t.test('a Worker without its secret says what is missing', async () => {
    const saved = workerEnv.PROXY_SECRET;
    delete workerEnv.PROXY_SECRET;
    const r = await fetch(`${proxyBase}/`);
    assert.equal(r.status, 500);
    assert.match(await r.text(), /PROXY_SECRET/);
    workerEnv.PROXY_SECRET = saved;
  });
});
