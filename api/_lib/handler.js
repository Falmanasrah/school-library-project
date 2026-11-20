// HTTP entry point for every app: POST /api/rpc  { action, data }
// Headers: X-App (teachers | library | supervisors), Authorization: Bearer <session token>
import { ApiError, APPS, hasAppAccess, effectiveStatus } from './util.js';
import { getDb, getSettings, audit } from './core.js';
import { loadSession, loadUser, deleteSession, forgetUser } from './auth.js';
import { ACTIONS } from './actions/index.js';
import { VERSION } from './version.js';

const MAX_BODY = 200 * 1024;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}');
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new ApiError(413, 'TOO_LARGE', 'Request is too large.');
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

async function authenticate(ctx, spec) {
  const h = ctx.req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : null;
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in.');
  const session = await loadSession(ctx.db, token, ctx.now);
  if (!session) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has ended. Please sign in again.');
  if (session.app !== ctx.app) throw new ApiError(401, 'SESSION_WRONG_APP', 'This session belongs to a different app. Please sign in again.');
  let user = await loadUser(ctx.db, session.uid);
  if (!user) {
    await deleteSession(ctx.db, token).catch(() => {});
    throw new ApiError(401, 'ACCOUNT_DELETED', 'This account no longer exists.');
  }
  // A suspension with an end date lifts itself automatically.
  if (user.status === 'suspended' && effectiveStatus(user, ctx.now) === 'active') {
    await ctx.db.update('users', user.id, { status: 'active', statusReason: '', suspendedUntil: null, updatedAt: ctx.now });
    forgetUser(user.id);
    user = { ...user, status: 'active', statusReason: '', suspendedUntil: null };
    await audit({ ...ctx, user }, 'user.suspension_ended', { targetType: 'user', targetId: user.id, summary: `Suspension of ${user.name} ended automatically` });
  }
  ctx.token = token;
  ctx.session = session;
  ctx.user = user;
  if (user.status === 'banned' || user.status === 'suspended' || user.status === 'pending' || user.status === 'rejected') {
    await deleteSession(ctx.db, token).catch(() => {});
    const code = { banned: 'ACCOUNT_BANNED', suspended: 'ACCOUNT_SUSPENDED', pending: 'ACCOUNT_PENDING', rejected: 'ACCOUNT_REJECTED' }[user.status];
    throw new ApiError(403, code, 'This account cannot be used right now.', { reason: user.statusReason || '', until: user.suspendedUntil || null });
  }
  if (spec.auth === 'active') {
    if (user.mustChangePassword) throw new ApiError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must set a new password first.');
    if (!hasAppAccess(user, ctx.app)) throw new ApiError(403, 'NO_APP_ACCESS', 'Your account does not have access to this app.');
    if (spec.roles && !spec.roles.some(r => user.roles.includes(r))) throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to do that.');
  }
}

export async function handle(req, res) {
  const now = Date.now();
  try {
    if (req.method === 'GET') return send(res, 200, { ok: true, data: { status: 'ok', version: VERSION }, serverTime: now });
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });

    // Only pages served from this same site may call the API.
    const origin = req.headers.origin;
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { /* invalid */ }
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (!originHost || originHost !== host) throw new ApiError(403, 'BAD_ORIGIN', 'Requests from other websites are not allowed.');
    }

    let body;
    try { body = await readBody(req); } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(400, 'BAD_JSON', 'Request body must be JSON.'); }
    const action = body?.action;
    const spec = typeof action === 'string' && Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
    if (!spec) throw new ApiError(404, 'UNKNOWN_ACTION', 'Unknown action.');

    const app = String(req.headers['x-app'] || '');
    if (!APPS[app]) throw new ApiError(400, 'UNKNOWN_APP', 'Missing or unknown app.');
    if (spec.apps && !spec.apps.includes(app)) throw new ApiError(403, 'WRONG_APP', 'This action is not available in this app.');

    const db = await getDb();
    const ctx = { req, db, app, now, ip: clientIp(req), ua: req.headers['user-agent'] || '' };
    ctx.settings = await getSettings(db);
    if (spec.auth !== 'public') await authenticate(ctx, spec);

    const data = body.data && typeof body.data === 'object' ? body.data : {};
    const result = await spec.handler(ctx, data);
    return send(res, 200, { ok: true, data: result ?? null, serverTime: now });
  } catch (e) {
    if (e instanceof ApiError) {
      return send(res, e.status, { ok: false, error: { code: e.code, message: e.message, details: e.details ?? null }, serverTime: now });
    }
    console.error('API error:', e);
    return send(res, 500, { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong on the server. Please try again.' }, serverTime: now });
  }
}
