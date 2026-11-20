// Password hashing, sessions, login lockout and rate limiting.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError, sha256, randomId } from './util.js';

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw.normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// A fixed hash used when the account does not exist, so response time does not reveal which emails are registered.
let dummyHash = null;
export async function verifyPassword(pw, stored) {
  if (!stored) {
    dummyHash = dummyHash || await hashPassword('dummy-password-0');
    stored = dummyHash;
    pw = 'not-the-password';
  }
  const [alg, N, r, p, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(String(pw).normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/* ---------------- small per-instance cache ---------------- */
const cache = new Map();
const CACHE_MS = 8000;
export function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  cache.delete(key);
  return undefined;
}
export function cacheSet(key, value, ms = CACHE_MS) {
  if (cache.size > 2000) cache.clear();
  cache.set(key, { value, exp: Date.now() + ms });
}
export function cacheDel(key) { cache.delete(key); }
export function cacheClearPrefix(prefix) { for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k); }

/* ---------------- sessions ---------------- */
export const SESSION_SHORT_MS = 12 * 60 * 60 * 1000;          // not "keep me signed in": 12 hours
export const SESSION_LONG_MS = 30 * 24 * 60 * 60 * 1000;      // "keep me signed in": 30 days of inactivity
const SLIDE_EVERY_MS = 60 * 60 * 1000;

export async function createSession(db, { uid, app, remember, ua, now }) {
  const token = randomId(32);
  const id = sha256(token);
  const expiresAt = now + (remember ? SESSION_LONG_MS : SESSION_SHORT_MS);
  await db.create('sessions', id, { uid, app, remember: !!remember, createdAt: now, lastSeenAt: now, expiresAt, ua: String(ua || '').slice(0, 160) });
  return { token, expiresAt };
}

export async function loadSession(db, token, now) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const id = sha256(token);
  let s = cacheGet('s:' + id);
  if (s === undefined) {
    s = await db.get('sessions', id);
    cacheSet('s:' + id, s);
  }
  if (!s) return null;
  if (s.expiresAt <= now) {
    await db.delete('sessions', id).catch(() => {});
    cacheDel('s:' + id);
    return null;
  }
  if (s.remember && now - s.lastSeenAt > SLIDE_EVERY_MS) {
    const patch = { lastSeenAt: now, expiresAt: now + SESSION_LONG_MS };
    await db.update('sessions', id, patch).catch(() => {});
    Object.assign(s, patch);
    cacheSet('s:' + id, s);
  }
  return s;
}

export async function deleteSession(db, token) {
  const id = sha256(token);
  await db.delete('sessions', id);
  cacheDel('s:' + id);
}

export async function revokeUserSessions(db, uid, { exceptToken } = {}) {
  const keep = exceptToken ? sha256(exceptToken) : null;
  const sessions = await db.query('sessions', { where: [['uid', '==', uid]] });
  let n = 0;
  for (const s of sessions) {
    if (s.id === keep) continue;
    await db.delete('sessions', s.id);
    cacheDel('s:' + s.id);
    n++;
  }
  cacheDel('u:' + uid);
  return n;
}

export async function loadUser(db, uid, { fresh = false } = {}) {
  let u = fresh ? undefined : cacheGet('u:' + uid);
  if (u === undefined) {
    u = await db.get('users', uid);
    cacheSet('u:' + uid, u);
  }
  return u;
}
export function forgetUser(uid) { cacheDel('u:' + uid); }

/* ---------------- login lockout ---------------- */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/* ---------------- rate limiting (per client IP, stored in the database) ---------------- */
export async function rateLimit(db, { ip, bucket, limit, windowMs, now }) {
  const id = sha256(`${bucket}|${ip || 'unknown'}`).slice(0, 40);
  await db.runTransaction(async (tx) => {
    const doc = await tx.get('rateLimits', id);
    if (!doc || now - doc.windowStart >= windowMs) {
      tx.set('rateLimits', id, { bucket, windowStart: now, count: 1 });
      return;
    }
    if (doc.count >= limit) {
      throw new ApiError(429, 'RATE_LIMITED', 'Too many attempts from this network. Please wait a few minutes and try again.', { retryAfterMs: doc.windowStart + windowMs - now });
    }
    tx.update('rateLimits', id, { count: doc.count + 1 });
  });
}
