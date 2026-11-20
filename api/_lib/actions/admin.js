// Administration: accounts, booking periods, system settings, audit log, health check.
import {
  ApiError, bad, conflict, forbidden, notFound, str, multiline, int, bool, dateKey, email as vEmail, password as vPassword,
  isValidTimeZone, daysBetween, zoned, ROLES, BOOKING_PERIOD_MS, textMatch
} from '../util.js';
import { hashPassword, revokeUserSessions, forgetUser } from '../auth.js';
import { audit, auditTx, bump, getSettings, forgetSettings, publicPeriod, bookingWindow, schoolNow, DEFAULT_SETTINGS } from '../core.js';
import { createUserTx, userView, needsAttention } from './auth.js';
import { VERSION } from '../version.js';

const ADMIN = { auth: 'active', apps: ['library'], roles: ['admin'] };

function validRoles(list) {
  if (!Array.isArray(list)) throw bad('INVALID_INPUT', 'Roles must be a list.');
  const roles = Array.from(new Set(list));
  for (const r of roles) if (!ROLES.includes(r)) throw bad('INVALID_ROLE', `Unknown role: ${r}`);
  return roles;
}

async function getTarget(ctx, uid) {
  if (typeof uid !== 'string' || !uid) throw bad('INVALID_INPUT', 'Account id is required.');
  const u = await ctx.db.get('users', uid);
  if (!u) throw notFound('Account');
  return u;
}

async function assertNotLastAdmin(ctx, target, { removingAdmin }) {
  if (!removingAdmin || !(target.roles || []).includes('admin')) return;
  const admins = await ctx.db.query('users', { where: [['roles', 'array-contains', 'admin']] });
  const others = admins.filter(a => a.id !== target.id && a.status === 'active');
  if (others.length === 0) throw forbidden('LAST_ADMIN', 'This is the only active administrator. Make another account an administrator first.');
}

function notSelf(ctx, target, what) {
  if (target.id === ctx.user.id) throw forbidden('SELF_ACTION', `You cannot ${what} your own account.`);
}

async function saveUser(ctx, uid, patch) {
  const current = await ctx.db.get('users', uid);
  const merged = { ...current, ...patch };
  patch.attention = needsAttention(merged);
  patch.updatedAt = ctx.now;
  await ctx.db.update('users', uid, patch);
  forgetUser(uid);
  return { ...merged, ...patch };
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export default {
  /* ---------------- accounts ---------------- */
  'admin.users.list': {
    ...ADMIN,
    async handler(ctx) {
      const users = await ctx.db.query('users', {});
      const creds = await ctx.db.query('credentials', { where: [['lockedUntil', '>', ctx.now]] });
      const locked = new Map(creds.map(c => [c.id, c.lockedUntil]));
      return { items: users.map(u => ({ ...userView(u), lockedUntil: locked.get(u.id) || null })).sort((a, b) => a.name.localeCompare(b.name)) };
    }
  },

  'admin.user.create': {
    ...ADMIN,
    async handler(ctx, d) {
      const name = str(d.name, 'Name', { min: 2, max: 80 });
      const email = vEmail(d.email);
      const pw = vPassword(d.password, 'Temporary password');
      const roles = validRoles(d.roles || []);
      if (!roles.length) throw bad('INVALID_ROLE', 'Choose at least one role.');
      const mustChange = d.mustChangePassword !== false;
      const hash = await hashPassword(pw);
      const uid = ctx.db.newId();
      await ctx.db.runTransaction(async (tx) => {
        if (await tx.get('emails', email)) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
        createUserTx(tx, ctx, { uid, name, email, hash, roles, requestedRoles: [], status: 'active', mustChangePassword: mustChange, registeredVia: 'admin' });
        auditTx(tx, ctx, 'admin.user_created', { targetType: 'user', targetId: uid, summary: `Created account ${name} <${email}> with roles ${roles.join(', ')}` });
      });
      await bump(ctx, 'users');
      return { id: uid };
    }
  },

  'admin.user.update': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      const patch = {};
      if (d.name !== undefined) patch.name = str(d.name, 'Name', { min: 2, max: 80 });
      let newEmail = null;
      if (d.email !== undefined) { const e = vEmail(d.email); if (e !== target.email) newEmail = e; }
      if (d.roles !== undefined) {
        const roles = validRoles(d.roles);
        const removingAdmin = (target.roles || []).includes('admin') && !roles.includes('admin');
        if (removingAdmin && target.id === ctx.user.id) throw forbidden('SELF_ACTION', 'You cannot remove your own administrator role.');
        await assertNotLastAdmin(ctx, target, { removingAdmin });
        patch.roles = roles;
        patch.requestedRoles = (target.requestedRoles || []).filter(r => !roles.includes(r));
      }
      if (newEmail) {
        await ctx.db.runTransaction(async (tx) => {
          if (await tx.get('emails', newEmail)) throw conflict('EMAIL_TAKEN', 'Another account already uses this email.');
          tx.delete('emails', target.email);
          tx.create('emails', newEmail, { uid: target.id });
          tx.update('users', target.id, { email: newEmail });
        });
        patch.email = newEmail;
      }
      const updated = await saveUser(ctx, target.id, patch);
      await audit(ctx, 'admin.user_updated', {
        targetType: 'user', targetId: target.id, summary: `Edited account ${updated.name}`,
        details: { before: { name: target.name, email: target.email, roles: target.roles }, after: { name: updated.name, email: updated.email, roles: updated.roles } }
      });
      await bump(ctx, 'users');
      return { user: userView(updated) };
    }
  },

  'admin.user.approve': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      const grant = d.roles ? validRoles(d.roles) : (target.requestedRoles || []);
      const roles = Array.from(new Set([...(target.roles || []), ...grant]));
      if (!roles.length) throw bad('INVALID_ROLE', 'Choose at least one role to approve.');
      const patch = { roles, requestedRoles: [] };
      if (['pending', 'rejected'].includes(target.status)) Object.assign(patch, { status: 'active', statusReason: '' });
      const updated = await saveUser(ctx, target.id, patch);
      await audit(ctx, 'admin.user_approved', { targetType: 'user', targetId: target.id, summary: `Approved ${target.name} as ${grant.join(', ')}` });
      await bump(ctx, 'users');
      return { user: userView(updated) };
    }
  },

  'admin.user.denyRequest': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      const reason = multiline(d.reason, 'Reason', 200);
      const patch = { requestedRoles: [] };
      if (target.status === 'pending') Object.assign(patch, { status: 'rejected', statusReason: reason });
      const updated = await saveUser(ctx, target.id, patch);
      await audit(ctx, 'admin.user_request_denied', { targetType: 'user', targetId: target.id, summary: `Denied the request of ${target.name}${reason ? ': ' + reason : ''}` });
      await bump(ctx, 'users');
      return { user: userView(updated) };
    }
  },

  'admin.user.setPassword': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      const pw = vPassword(d.password, 'Temporary password');
      const mustChange = d.mustChangePassword !== false;
      const hash = await hashPassword(pw);
      await ctx.db.set('credentials', target.id, { hash, failedCount: 0, lockedUntil: 0, changedAt: ctx.now }, { merge: true });
      const updated = await saveUser(ctx, target.id, { mustChangePassword: mustChange, resetRequestedAt: null });
      const revoked = await revokeUserSessions(ctx.db, target.id);
      await audit(ctx, 'admin.password_reset', { targetType: 'user', targetId: target.id, summary: `Reset the password of ${target.name}${mustChange ? ' (must change at next sign-in)' : ''}; signed out ${revoked} session(s)` });
      await bump(ctx, 'users');
      return { user: userView(updated) };
    }
  },

  'admin.user.unlock': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      await ctx.db.set('credentials', target.id, { failedCount: 0, lockedUntil: 0 }, { merge: true });
      await audit(ctx, 'admin.user_unlocked', { targetType: 'user', targetId: target.id, summary: `Unlocked sign-in for ${target.name}` });
      await bump(ctx, 'users');
      return { ok: true };
    }
  },

  'admin.user.suspend': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      notSelf(ctx, target, 'suspend');
      await assertNotLastAdmin(ctx, target, { removingAdmin: true });
      const reason = str(d.reason, 'Reason', { max: 200 });
      let until = null;
      if (d.until !== undefined && d.until !== null && d.until !== '') {
        until = int(Number(d.until), 'Suspended until', { min: ctx.now + 60_000, max: ctx.now + 400 * 86400_000 });
      }
      const updated = await saveUser(ctx, target.id, { status: 'suspended', statusReason: reason, suspendedUntil: until });
      const revoked = await revokeUserSessions(ctx.db, target.id);
      await audit(ctx, 'admin.user_suspended', { targetType: 'user', targetId: target.id, summary: `Suspended ${target.name}${until ? ' until ' + new Date(until).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''}: ${reason}; signed out ${revoked} session(s)` });
      await bump(ctx, 'users');
      return { user: userView(updated) };
    }
  },

  'admin.user.ban': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      notSelf(ctx, target, 'ban');
      await assertNotLastAdmin(ctx, target, { removingAdmin: true });
      const reason = str(d.reason, 'Reason', { max: 200 });
      const updated = await saveUser(ctx, target.id, { status: 'banned', statusReason: reason, suspendedUntil: null });
      const revoked = await revokeUserSessions(ctx.db, target.id);
      await audit(ctx, 'admin.user_banned', { targetType: 'user', targetId: target.id, summary: `Banned ${target.name}: ${reason}; signed out ${revoked} session(s)` });
      await bump(ctx, 'users');
      return { user: userView(updated) };
    }
  },

  'admin.user.reactivate': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      if (!['suspended', 'banned', 'rejected'].includes(target.status)) throw bad('NOT_RESTRICTED', 'This account is not suspended or banned.');
      if (!(target.roles || []).length && !(target.requestedRoles || []).length) throw bad('NO_ROLES', 'Give this account a role first (Edit), then reactivate it.');
      const patch = { status: 'active', statusReason: '', suspendedUntil: null };
      if (!(target.roles || []).length) Object.assign(patch, { roles: target.requestedRoles, requestedRoles: [] });
      const updated = await saveUser(ctx, target.id, patch);
      await audit(ctx, 'admin.user_reactivated', { targetType: 'user', targetId: target.id, summary: `Reactivated ${target.name} (was ${target.status})` });
      await bump(ctx, 'users');
      return { user: userView(updated) };
    }
  },

  'admin.user.revokeSessions': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      const revoked = await revokeUserSessions(ctx.db, target.id, target.id === ctx.user.id ? { exceptToken: ctx.token } : {});
      await audit(ctx, 'admin.sessions_revoked', { targetType: 'user', targetId: target.id, summary: `Signed ${target.name} out of ${revoked} session(s)` });
      return { revoked };
    }
  },

  'admin.user.delete': {
    ...ADMIN,
    async handler(ctx, d) {
      const target = await getTarget(ctx, d.uid);
      notSelf(ctx, target, 'delete');
      await assertNotLastAdmin(ctx, target, { removingAdmin: true });
      await ctx.db.runTransaction(async (tx) => {
        const idx = await tx.get('emails', target.email);
        tx.delete('users', target.id);
        tx.delete('credentials', target.id);
        if (idx && idx.uid === target.id) tx.delete('emails', target.email);
        auditTx(tx, ctx, 'admin.user_deleted', { targetType: 'user', targetId: target.id, summary: `Deleted account ${target.name} <${target.email}>`, details: { user: userView(target) } });
      });
      await revokeUserSessions(ctx.db, target.id);
      forgetUser(target.id);
      await bump(ctx, 'users');
      return { ok: true };
    }
  },

  /* ---------------- booking periods ---------------- */
  'admin.periods.list': {
    ...ADMIN,
    async handler(ctx) {
      const list = await ctx.db.query('bookingPeriods', { orderBy: ['opensAt', 'desc'], limit: 60 });
      const win = await bookingWindow(ctx.db, ctx.now);
      return { items: list.map(p => publicPeriod(p, ctx.now)), current: publicPeriod(win.current, ctx.now), next: publicPeriod(win.next, ctx.now) };
    }
  },

  'admin.period.open': {
    ...ADMIN,
    async handler(ctx, d) {
      const opensAt = d.startNow ? ctx.now : int(Number(d.opensAt), 'Start time', { min: ctx.now - 10 * 60_000, max: ctx.now + 366 * 86400_000 });
      const closesAt = opensAt + BOOKING_PERIOD_MS;
      const bookableFrom = dateKey(d.bookableFrom, 'Bookable from');
      const bookableTo = dateKey(d.bookableTo, 'Bookable to');
      const today = schoolNow(ctx.settings, ctx.now).date;
      if (bookableTo < bookableFrom) throw bad('INVALID_RANGE', '"Bookable to" must be on or after "Bookable from".');
      if (bookableTo < today) throw bad('INVALID_RANGE', 'The bookable dates are all in the past.');
      if (daysBetween(bookableFrom, bookableTo) > 120) throw bad('RANGE_TOO_LARGE', 'A booking period can cover at most 120 days of visits.');
      const note = multiline(d.note, 'Note', 200);
      const id = await ctx.db.runTransaction(async (tx) => {
        const live = await tx.query('bookingPeriods', { where: [['closesAt', '>', opensAt]], orderBy: ['closesAt', 'asc'] });
        const clash = live.find(p => !(p.closedEarlyAt && p.closedEarlyAt <= ctx.now) && p.opensAt < closesAt);
        if (clash) throw conflict('PERIOD_OVERLAP', 'This period would overlap another booking period. Close that one first or start this one when it ends.');
        const pid = tx.create('bookingPeriods', null, {
          opensAt, closesAt, bookableFrom, bookableTo, note, closedEarlyAt: null, closedBy: null, closedByName: null,
          createdBy: ctx.user.id, createdByName: ctx.user.name, createdAt: ctx.now
        });
        const sn = zoned(opensAt, ctx.settings.timeZone), en = zoned(closesAt, ctx.settings.timeZone);
        auditTx(tx, ctx, 'admin.period_opened', { targetType: 'period', targetId: pid, summary: `Booking period ${sn.date} ${sn.time} → ${en.date} ${en.time} for visits ${bookableFrom} to ${bookableTo}` });
        return pid;
      });
      await bump(ctx, 'periods');
      return { id, opensAt, closesAt };
    }
  },

  'admin.period.close': {
    ...ADMIN,
    async handler(ctx, d) {
      const p = await ctx.db.get('bookingPeriods', String(d.id || ''));
      if (!p) throw notFound('Booking period');
      if (p.closesAt <= ctx.now || (p.closedEarlyAt && p.closedEarlyAt <= ctx.now)) throw bad('ALREADY_CLOSED', 'This booking period is already closed.');
      await ctx.db.update('bookingPeriods', p.id, { closedEarlyAt: ctx.now, closedBy: ctx.user.id, closedByName: ctx.user.name });
      await audit(ctx, 'admin.period_closed', { targetType: 'period', targetId: p.id, summary: p.opensAt > ctx.now ? 'Cancelled a scheduled booking period' : 'Closed the booking period early' });
      await bump(ctx, 'periods');
      return { ok: true };
    }
  },

  /* ---------------- settings ---------------- */
  'admin.settings.get': {
    ...ADMIN,
    async handler(ctx) { return { settings: await getSettings(ctx.db, { fresh: true }), defaults: DEFAULT_SETTINGS }; }
  },

  'admin.settings.update': {
    ...ADMIN,
    async handler(ctx, d) {
      const before = await getSettings(ctx.db, { fresh: true });
      const patch = {};
      if (d.schoolName !== undefined) patch.schoolName = str(d.schoolName, 'School name', { max: 100 });
      if (d.schoolNameAr !== undefined) patch.schoolNameAr = str(d.schoolNameAr, 'School name (Arabic)', { max: 100, required: false });
      if (d.timeZone !== undefined) {
        if (typeof d.timeZone !== 'string' || !isValidTimeZone(d.timeZone)) throw bad('INVALID_TIMEZONE', 'Unknown time zone.');
        patch.timeZone = d.timeZone;
      }
      for (const k of ['registrationOpen', 'autoApproveTeachers', 'autoApproveSupervisors', 'requireStudentId']) if (d[k] !== undefined) patch[k] = bool(d[k]);
      if (d.allowedDomains !== undefined) {
        const list = (Array.isArray(d.allowedDomains) ? d.allowedDomains : String(d.allowedDomains).split(/[\s,;]+/))
          .map(x => String(x).trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
        for (const dom of list) if (!DOMAIN_RE.test(dom)) throw bad('INVALID_DOMAIN', `"${dom}" is not a valid email domain.`);
        patch.allowedDomains = Array.from(new Set(list)).slice(0, 20);
      }
      if (d.maxActiveBookingsPerTeacher !== undefined) patch.maxActiveBookingsPerTeacher = int(d.maxActiveBookingsPerTeacher, 'Maximum upcoming bookings per teacher', { min: 0, max: 100 });
      if (d.visitsListFormCode !== undefined) patch.visitsListFormCode = str(d.visitsListFormCode, 'Visits list form code', { max: 30, required: false });
      if (d.visitorsLogFormCode !== undefined) patch.visitorsLogFormCode = str(d.visitorsLogFormCode, 'Visitors log form code', { max: 30, required: false });
      if (!Object.keys(patch).length) throw bad('NOTHING_TO_SAVE', 'No changes to save.');
      await ctx.db.set('settings', 'system', patch, { merge: true });
      forgetSettings();
      const changes = Object.fromEntries(Object.entries(patch).filter(([k, v]) => JSON.stringify(before[k]) !== JSON.stringify(v)).map(([k, v]) => [k, { from: before[k], to: v }]));
      await audit(ctx, 'admin.settings_updated', { targetType: 'settings', targetId: 'system', summary: `Changed settings: ${Object.keys(changes).join(', ') || 'no changes'}`, details: changes });
      await bump(ctx, 'settings');
      return { settings: await getSettings(ctx.db, { fresh: true }) };
    }
  },

  /* ---------------- audit log ---------------- */
  'admin.audit.search': {
    ...ADMIN,
    async handler(ctx, d) {
      const from = dateKey(d.from, 'From date');
      const to = dateKey(d.to, 'To date');
      if (to < from) throw bad('INVALID_RANGE', 'The end date must be after the start date.');
      if (daysBetween(from, to) > 400) throw bad('RANGE_TOO_LARGE', 'Search at most 400 days at a time.');
      const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
      const lo = Date.UTC(fy, fm - 1, fd) - 15 * 3600_000, hi = Date.UTC(ty, tm - 1, td) + 39 * 3600_000;
      const rows = await ctx.db.query('auditLog', { where: [['at', '>=', lo], ['at', '<=', hi]], orderBy: ['at', 'desc'], limit: 10000 });
      const q = typeof d.q === 'string' ? d.q.trim() : '';
      const prefix = typeof d.action === 'string' && d.action !== 'all' ? d.action : '';
      const tz = ctx.settings.timeZone;
      const out = rows.filter(r => {
        const day = zoned(r.at, tz).date;
        return day >= from && day <= to && (!prefix || r.action.startsWith(prefix)) && textMatch(q, r.summary, r.actorName, r.actorEmail, r.action);
      });
      return { items: out.slice(0, 3000).map(({ ip, ...r }) => ({ ...r, ip })), truncated: out.length > 3000 };
    }
  },

  /* ---------------- health ---------------- */
  'admin.system.health': {
    ...ADMIN,
    async handler(ctx) {
      const t0 = Date.now();
      await ctx.db.set('meta', 'healthcheck', { at: ctx.now, by: ctx.user.id });
      const back = await ctx.db.get('meta', 'healthcheck');
      const latencyMs = Date.now() - t0;
      if (!back || back.at !== ctx.now) throw new ApiError(500, 'DB_CHECK_FAILED', 'The database did not return what was written.');
      const sn = schoolNow(ctx.settings, ctx.now);
      return { ok: true, storage: ctx.db.kind, latencyMs, version: VERSION, timeZone: ctx.settings.timeZone, schoolDate: sn.date, schoolTime: sn.time, serverTime: ctx.now, setupKeyConfigured: !!process.env.ADMIN_SETUP_KEY };
    }
  }
};
