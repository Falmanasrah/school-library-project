// Database selection, system settings, audit log, change versions and booking-period helpers.
import { ApiError, zoned, BOOKING_PERIOD_MS } from './util.js';
import { cacheGet, cacheSet, cacheDel } from './auth.js';

/* ---------------- database ---------------- */
let dbInstance = null;
let dbError = null;

export function setDb(db) { dbInstance = db; dbError = null; }

export async function getDb() {
  if (dbInstance) return dbInstance;
  if (dbError) throw dbError;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const { createFirestoreDb } = await import('./db-firestore.js');
      dbInstance = createFirestoreDb(process.env.FIREBASE_SERVICE_ACCOUNT);
      return dbInstance;
    } catch (e) {
      console.error('Firestore initialisation failed:', e);
      dbError = new ApiError(503, 'SERVER_NOT_CONFIGURED', 'The server could not connect to the database. Check the FIREBASE_SERVICE_ACCOUNT setting.');
      throw dbError;
    }
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    // Never fall back to a temporary in-memory database in production.
    throw new ApiError(503, 'SERVER_NOT_CONFIGURED', 'The server has no database configured yet. Set FIREBASE_SERVICE_ACCOUNT in the hosting environment.');
  }
  const { createMemoryDb } = await import('./db-memory.js');
  dbInstance = createMemoryDb({ file: process.env.DATA_FILE || undefined });
  return dbInstance;
}

/* ---------------- settings ---------------- */
export const DEFAULT_SETTINGS = {
  schoolName: 'International Independent Schools',
  schoolNameAr: 'المدارس المستقلة الدولية',
  timeZone: 'Asia/Amman',
  registrationOpen: true,
  allowedDomains: [],
  autoApproveTeachers: false,
  autoApproveSupervisors: false,
  maxActiveBookingsPerTeacher: 0,
  requireStudentId: false,
  visitsListFormCode: 'FAC-P-02-R6',
  visitorsLogFormCode: 'FAC-P-02-R5'
};

export async function getSettings(db, { fresh = false } = {}) {
  let s = fresh ? undefined : cacheGet('settings');
  if (s === undefined) {
    const doc = await db.get('settings', 'system');
    s = { ...DEFAULT_SETTINGS, ...(doc || {}) };
    delete s.id;
    cacheSet('settings', s, 5000);
  }
  return s;
}
export function forgetSettings() { cacheDel('settings'); }

/* ---------------- audit log ---------------- */
function auditEntry(ctx, action, { targetType = null, targetId = null, summary = '', details = null } = {}) {
  return {
    at: ctx.now,
    action,
    actorUid: ctx.user?.id || null,
    actorName: ctx.user?.name || ctx.actorName || 'System',
    actorEmail: ctx.user?.email || ctx.actorEmail || null,
    app: ctx.app || null,
    ip: ctx.ip || null,
    targetType, targetId,
    summary: String(summary).slice(0, 300),
    details
  };
}
export async function audit(ctx, action, info) { await ctx.db.create('auditLog', null, auditEntry(ctx, action, info)); }
export function auditTx(tx, ctx, action, info) { tx.create('auditLog', null, auditEntry(ctx, action, info)); }

/* ---------------- change versions (used by the apps' live sync) ---------------- */
export const SCOPES = ['bookings', 'slips', 'visits', 'visitors', 'periods', 'settings', 'users'];
let lastVersion = 0;
export async function bump(ctx, ...scopes) {
  let v = Date.now() * 1000;
  if (v <= lastVersion) v = lastVersion + 1;
  lastVersion = v;
  const patch = {};
  for (const s of scopes) patch[s] = v;
  await ctx.db.set('meta', 'versions', patch, { merge: true });
  cacheDel('versions');
}
export async function getVersions(db) {
  let v = cacheGet('versions');
  if (v === undefined) {
    const doc = await db.get('meta', 'versions');
    v = { ...Object.fromEntries(SCOPES.map(s => [s, 0])), ...(doc || {}) };
    delete v.id;
    cacheSet('versions', v, 1000);
  }
  return v;
}

/* ---------------- booking periods ---------------- */
export function periodState(p, now) {
  if (!p) return 'none';
  if (p.closedEarlyAt && p.closedEarlyAt <= now) return 'closed';
  if (now < p.opensAt) return 'scheduled';
  if (now >= p.closesAt) return 'closed';
  return 'open';
}

export function publicPeriod(p, now) {
  if (!p) return null;
  return {
    id: p.id, opensAt: p.opensAt, closesAt: p.closedEarlyAt && p.closedEarlyAt < p.closesAt ? p.closedEarlyAt : p.closesAt,
    scheduledClosesAt: p.closesAt, bookableFrom: p.bookableFrom, bookableTo: p.bookableTo, note: p.note || '',
    state: periodState(p, now), closedEarlyAt: p.closedEarlyAt || null,
    createdByName: p.createdByName || null, closedByName: p.closedByName || null, createdAt: p.createdAt || null
  };
}

// Summary used by every app: the period open right now (if any) and the next scheduled one.
export async function bookingWindow(db, now, tx) {
  const q = { where: [['closesAt', '>', now]], orderBy: ['closesAt', 'asc'], limit: 10 };
  const list = tx ? await tx.query('bookingPeriods', q) : await db.query('bookingPeriods', q);
  const live = list.filter(p => !(p.closedEarlyAt && p.closedEarlyAt <= now));
  const current = live.find(p => p.opensAt <= now) || null;
  const next = live.filter(p => p.opensAt > now).sort((a, b) => a.opensAt - b.opensAt)[0] || null;
  return { current, next };
}

export function schoolNow(settings, now) { return zoned(now, settings.timeZone); }
export { BOOKING_PERIOD_MS };
