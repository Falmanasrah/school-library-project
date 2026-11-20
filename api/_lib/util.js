// Shared server helpers: errors, validation, time-zone aware dates, ids.
import crypto from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const bad = (code, message, details) => new ApiError(400, code, message, details);
export const forbidden = (code = 'FORBIDDEN', message = 'You do not have permission to do that.') => new ApiError(403, code, message);
export const notFound = (what = 'Record') => new ApiError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (code, message) => new ApiError(409, code, message);

/* ---------------- constants ---------------- */
export const LIBRARIES = ['junior', 'senior'];
export const ROLES = ['teacher', 'librarian', 'supervisor', 'admin'];
export const APPS = {
  teachers: { roles: ['teacher'], registerRole: 'teacher' },
  library: { roles: ['librarian', 'admin'], registerRole: 'librarian' },
  supervisors: { roles: ['supervisor'], registerRole: 'supervisor' }
};
export const SCHOOL_DAYS = [0, 1, 2, 3, 4]; // Sunday..Thursday
export const PERIODS = [1, 2, 3, 4, 5, 6, 7];
export const BOOKING_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
export const ACTIVE_BOOKING_STATUSES = ['pending', 'approved'];

/* ---------------- validation ---------------- */
export function str(v, field, { min = 0, max = 200, required = true } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw bad('INVALID_INPUT', `${field} must be text.`, { field });
  const s = v.trim().replace(/\s+/g, ' ');
  if (required && s.length === 0) throw bad('INVALID_INPUT', `${field} is required.`, { field });
  if (s.length < min) throw bad('INVALID_INPUT', `${field} is too short.`, { field });
  if (s.length > max) throw bad('INVALID_INPUT', `${field} is too long (max ${max}).`, { field });
  return s;
}

export function multiline(v, field, max = 1000) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw bad('INVALID_INPUT', `${field} must be text.`, { field });
  const s = v.replace(/\r\n/g, '\n').trim();
  if (s.length > max) throw bad('INVALID_INPUT', `${field} is too long (max ${max}).`, { field });
  return s;
}

export function int(v, field, { min = -Infinity, max = Infinity, required = true } = {}) {
  if ((v === undefined || v === null || v === '') && !required) return null;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (!Number.isInteger(n)) throw bad('INVALID_INPUT', `${field} must be a whole number.`, { field });
  if (n < min || n > max) throw bad('INVALID_INPUT', `${field} must be between ${min} and ${max}.`, { field });
  return n;
}

export function oneOf(v, field, list) {
  if (!list.includes(v)) throw bad('INVALID_INPUT', `${field} is not valid.`, { field });
  return v;
}

export function bool(v) { return v === true || v === 'true' || v === 1; }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function email(v, field = 'Email') {
  const s = str(v, field, { max: 200 }).toLowerCase();
  if (!EMAIL_RE.test(s)) throw bad('INVALID_EMAIL', 'Enter a valid email address.', { field });
  return s;
}

export function password(v, field = 'Password') {
  if (typeof v !== 'string') throw bad('INVALID_INPUT', `${field} is required.`, { field });
  if (v.length < 8) throw bad('WEAK_PASSWORD', 'Password must be at least 8 characters.', { field });
  if (v.length > 200) throw bad('INVALID_INPUT', 'Password is too long.', { field });
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) throw bad('WEAK_PASSWORD', 'Password must contain letters and numbers.', { field });
  return v;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function dateKey(v, field = 'Date') {
  if (typeof v !== 'string' || !DATE_RE.test(v)) throw bad('INVALID_DATE', `${field} must be a date (YYYY-MM-DD).`, { field });
  const [, y, m, d] = v.match(DATE_RE).map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw bad('INVALID_DATE', `${field} is not a real date.`, { field });
  return v;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function timeHM(v, field = 'Time', { required = true } = {}) {
  if ((v === undefined || v === null || v === '') && !required) return null;
  if (typeof v !== 'string' || !TIME_RE.test(v)) throw bad('INVALID_TIME', `${field} must be a time (HH:MM).`, { field });
  return v;
}

export function weekdayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}

/* ---------------- time zone ---------------- */
const fmtCache = new Map();
export function isValidTimeZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// Returns the local date and time at the school for a given instant.
export function zoned(ms, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${hour}:${p.minute}`, minutes: Number(hour) * 60 + Number(p.minute), weekday: weekdayOf(date) };
}

/* ---------------- ids & codes ---------------- */
export function randomId(bytes = 16) { return crypto.randomBytes(bytes).toString('base64url'); }
export function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function shortCode(len = 4) {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function textMatch(q, ...fields) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some(f => f != null && String(f).toLowerCase().includes(needle));
}

/* ---------------- account access ---------------- */
export function hasAppAccess(user, app) {
  return !!user && Array.isArray(user.roles) && APPS[app].roles.some(r => user.roles.includes(r));
}

export function effectiveStatus(user, now) {
  if (user.status === 'suspended' && user.suspendedUntil && user.suspendedUntil <= now) return 'active';
  return user.status;
}
