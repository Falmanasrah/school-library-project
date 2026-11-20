// Account registration, sign-in, sign-out, password changes, first-time setup.
import crypto from 'node:crypto';
import { ApiError, APPS, bad, conflict, str, email as vEmail, password as vPassword, isValidTimeZone, sha256, hasAppAccess, effectiveStatus } from '../util.js';
import { hashPassword, verifyPassword, createSession, deleteSession, revokeUserSessions, rateLimit, forgetUser, MAX_FAILED_LOGINS, LOCKOUT_MS } from '../auth.js';
import { audit, auditTx, bump, forgetSettings, getSettings } from '../core.js';
import { VERSION } from '../version.js';

export function needsAttention(u) {
  return u.status === 'pending' || (Array.isArray(u.requestedRoles) && u.requestedRoles.length > 0) || !!u.resetRequestedAt;
}

export function userView(u) {
  return {
    id: u.id, name: u.name, email: u.email, roles: u.roles || [], requestedRoles: u.requestedRoles || [],
    status: u.status, statusReason: u.statusReason || '', suspendedUntil: u.suspendedUntil || null,
    mustChangePassword: !!u.mustChangePassword, resetRequestedAt: u.resetRequestedAt || null,
    createdAt: u.createdAt || null, updatedAt: u.updatedAt || null, lastLoginAt: u.lastLoginAt || null, lastLoginApp: u.lastLoginApp || null,
    registeredVia: u.registeredVia || null, createdByName: u.createdByName || null, attention: needsAttention(u)
  };
}

export function meView(u, app) {
  return {
    id: u.id, name: u.name, email: u.email, roles: u.roles || [], requestedRoles: u.requestedRoles || [],
    status: u.status, mustChangePassword: !!u.mustChangePassword, hasAccess: hasAppAccess(u, app),
    isAdmin: (u.roles || []).includes('admin')
  };
}

function schoolInfo(settings) {
  return { schoolName: settings.schoolName, schoolNameAr: settings.schoolNameAr, timeZone: settings.timeZone };
}

// Creates the user, credentials and email index inside one transaction.
export function createUserTx(tx, ctx, { uid, name, email, hash, roles, requestedRoles, status, mustChangePassword = false, registeredVia = null }) {
  const user = {
    name, email, roles, requestedRoles, status, statusReason: '', suspendedUntil: null,
    mustChangePassword, resetRequestedAt: null, createdAt: ctx.now, updatedAt: ctx.now, lastLoginAt: null, lastLoginApp: null,
    createdBy: ctx.user?.id || 'self', createdByName: ctx.user?.name || null, registeredVia
  };
  user.attention = needsAttention(user);
  tx.create('users', uid, user);
  tx.create('credentials', uid, { hash, failedCount: 0, lockedUntil: 0, changedAt: ctx.now });
  tx.create('emails', email, { uid });
  return user;
}

function domainAllowed(email, domains) {
  if (!domains || domains.length === 0) return true;
  const d = email.split('@')[1];
  return domains.some(x => d === x || d.endsWith('.' + x));
}

export default {
  'system.info': {
    auth: 'public',
    async handler(ctx) {
      const boot = await ctx.db.get('system', 'bootstrap');
      return {
        version: VERSION, storage: ctx.db.kind, needsSetup: !boot, setupEnabled: !!process.env.ADMIN_SETUP_KEY,
        registrationOpen: !!ctx.settings.registrationOpen, ...schoolInfo(ctx.settings), serverTime: ctx.now
      };
    }
  },

  'system.setup': {
    auth: 'public', apps: ['library'],
    async handler(ctx, d) {
      await rateLimit(ctx.db, { ip: ctx.ip, bucket: 'setup', limit: 10, windowMs: 3600_000, now: ctx.now });
      const envKey = process.env.ADMIN_SETUP_KEY;
      if (!envKey) throw new ApiError(503, 'SETUP_DISABLED', 'First-time setup is disabled. Set ADMIN_SETUP_KEY on the server.');
      const given = typeof d.setupKey === 'string' ? d.setupKey : '';
      if (!crypto.timingSafeEqual(Buffer.from(sha256(given)), Buffer.from(sha256(envKey)))) throw new ApiError(403, 'BAD_SETUP_KEY', 'The setup key is not correct.');
      const name = str(d.name, 'Name', { min: 2, max: 80 });
      const email = vEmail(d.email);
      const pw = vPassword(d.password);
      const tz = typeof d.timeZone === 'string' && isValidTimeZone(d.timeZone) ? d.timeZone : null;
      const hash = await hashPassword(pw);
      const uid = ctx.db.newId();
      const user = await ctx.db.runTransaction(async (tx) => {
        if (await tx.get('system', 'bootstrap')) throw conflict('ALREADY_SET_UP', 'The system has already been set up. Sign in instead.');
        if (await tx.get('emails', email)) throw conflict('EMAIL_TAKEN', 'An account with this email already exists.');
        const u = createUserTx(tx, ctx, { uid, name, email, hash, roles: ['admin', 'librarian'], requestedRoles: [], status: 'active', registeredVia: 'setup' });
        tx.set('system', 'bootstrap', { at: ctx.now, uid });
        if (tz) tx.set('settings', 'system', { timeZone: tz }, { merge: true });
        auditTx(tx, { ...ctx, user: { id: uid, name, email } }, 'system.setup', { targetType: 'user', targetId: uid, summary: `First administrator ${name} created` });
        return { id: uid, ...u };
      });
      forgetSettings();
      await bump(ctx, 'users', 'settings');
      const session = await createSession(ctx.db, { uid, app: ctx.app, remember: false, ua: ctx.ua, now: ctx.now });
      return { token: session.token, expiresAt: session.expiresAt, me: meView(user, ctx.app) };
    }
  },

  'auth.register': {
    auth: 'public',
    async handler(ctx, d) {
      await rateLimit(ctx.db, { ip: ctx.ip, bucket: 'register', limit: 40, windowMs: 3600_000, now: ctx.now });
      const settings = ctx.settings;
      if (!settings.registrationOpen) throw new ApiError(403, 'REGISTRATION_CLOSED', 'New account registration is currently closed. Ask the library administrator to create your account.');
      const name = str(d.name, 'Name', { min: 2, max: 80 });
      const email = vEmail(d.email);
      const pw = vPassword(d.password);
      if (!domainAllowed(email, settings.allowedDomains)) throw new ApiError(403, 'DOMAIN_NOT_ALLOWED', `Please register with your school email address (${settings.allowedDomains.join(', ')}).`);
      const role = APPS[ctx.app].registerRole;
      const auto = (role === 'teacher' && settings.autoApproveTeachers) || (role === 'supervisor' && settings.autoApproveSupervisors);
      const hash = await hashPassword(pw);
      const uid = ctx.db.newId();
      const user = await ctx.db.runTransaction(async (tx) => {
        if (await tx.get('emails', email)) throw conflict('EMAIL_TAKEN', 'An account with this email already exists. Sign in instead, or use "Forgot password".');
        const u = createUserTx(tx, ctx, {
          uid, name, email, hash, registeredVia: ctx.app,
          roles: auto ? [role] : [], requestedRoles: auto ? [] : [role], status: auto ? 'active' : 'pending'
        });
        auditTx(tx, { ...ctx, user: { id: uid, name, email } }, 'auth.register', { targetType: 'user', targetId: uid, summary: `${name} registered in the ${ctx.app} app (${auto ? 'approved automatically' : 'awaiting approval'})`, details: { role } });
        return { id: uid, ...u };
      });
      await bump(ctx, 'users');
      if (user.status !== 'active') return { status: 'pending' };
      const session = await createSession(ctx.db, { uid, app: ctx.app, remember: false, ua: ctx.ua, now: ctx.now });
      return { status: 'active', token: session.token, expiresAt: session.expiresAt, me: meView(user, ctx.app) };
    }
  },

  'auth.login': {
    auth: 'public',
    async handler(ctx, d) {
      await rateLimit(ctx.db, { ip: ctx.ip, bucket: 'login', limit: 300, windowMs: 15 * 60_000, now: ctx.now });
      const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
      const pw = typeof d.password === 'string' ? d.password : '';
      if (!email || !pw) throw bad('INVALID_INPUT', 'Enter your email and password.');
      const idx = await ctx.db.get('emails', email);
      const uid = idx?.uid;
      const cred = uid ? await ctx.db.get('credentials', uid) : null;
      if (cred && cred.lockedUntil > ctx.now) {
        throw new ApiError(423, 'ACCOUNT_LOCKED', 'Too many wrong passwords. This account is locked for a few minutes.', { until: cred.lockedUntil });
      }
      const ok = await verifyPassword(pw, cred?.hash);
      if (!ok || !cred) {
        if (cred) {
          const failed = (cred.failedCount || 0) + 1;
          if (failed >= MAX_FAILED_LOGINS) {
            await ctx.db.update('credentials', uid, { failedCount: 0, lockedUntil: ctx.now + LOCKOUT_MS });
            const u = await ctx.db.get('users', uid);
            await audit({ ...ctx, actorName: u?.name || email, actorEmail: email }, 'auth.lockout', { targetType: 'user', targetId: uid, summary: `${email} locked for 15 minutes after ${MAX_FAILED_LOGINS} wrong passwords` });
            await bump(ctx, 'users');
          } else {
            await ctx.db.update('credentials', uid, { failedCount: failed });
          }
        }
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      if (cred.failedCount) await ctx.db.update('credentials', uid, { failedCount: 0 });
      let user = await ctx.db.get('users', uid);
      if (!user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      const status = effectiveStatus(user, ctx.now);
      if (status === 'banned') throw new ApiError(403, 'ACCOUNT_BANNED', 'This account has been banned.', { reason: user.statusReason || '' });
      if (status === 'suspended') throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended.', { reason: user.statusReason || '', until: user.suspendedUntil || null });
      if (status === 'pending') throw new ApiError(403, 'ACCOUNT_PENDING', 'Your account is waiting for approval by the library administrator.');
      if (status === 'rejected') throw new ApiError(403, 'ACCOUNT_REJECTED', 'This registration was not approved.');
      const patch = { lastLoginAt: ctx.now, lastLoginApp: ctx.app, updatedAt: user.updatedAt || ctx.now };
      if (user.status === 'suspended') Object.assign(patch, { status: 'active', statusReason: '', suspendedUntil: null });
      await ctx.db.update('users', uid, patch);
      forgetUser(uid);
      if (user.status === 'suspended') {
        await audit({ ...ctx, user: { ...user, ...patch } }, 'user.suspension_ended', { targetType: 'user', targetId: uid, summary: `Suspension of ${user.name} ended automatically` });
        await bump(ctx, 'users');
      }
      user = { ...user, ...patch };
      const session = await createSession(ctx.db, { uid, app: ctx.app, remember: !!d.remember, ua: ctx.ua, now: ctx.now });
      await audit({ ...ctx, user }, 'auth.login', { targetType: 'user', targetId: uid, summary: `${user.name} signed in to the ${ctx.app} app` });
      return { token: session.token, expiresAt: session.expiresAt, me: meView(user, ctx.app) };
    }
  },

  'auth.logout': {
    auth: 'session',
    async handler(ctx) {
      await deleteSession(ctx.db, ctx.token);
      return { ok: true };
    }
  },

  'auth.forgotPassword': {
    auth: 'public',
    async handler(ctx, d) {
      await rateLimit(ctx.db, { ip: ctx.ip, bucket: 'forgot', limit: 30, windowMs: 3600_000, now: ctx.now });
      const email = vEmail(d.email);
      const idx = await ctx.db.get('emails', email);
      if (idx) {
        const u = await ctx.db.get('users', idx.uid);
        if (u && u.status !== 'banned') {
          await ctx.db.update('users', idx.uid, { resetRequestedAt: ctx.now, attention: true });
          forgetUser(idx.uid);
          await audit({ ...ctx, actorName: u.name, actorEmail: email }, 'auth.reset_requested', { targetType: 'user', targetId: idx.uid, summary: `${u.name} asked for a password reset from the ${ctx.app} app` });
          await bump(ctx, 'users');
        }
      }
      // Same answer whether or not the email exists.
      return { ok: true };
    }
  },

  'me.get': {
    auth: 'session',
    async handler(ctx) {
      return { me: meView(ctx.user, ctx.app), school: schoolInfo(await getSettings(ctx.db)) };
    }
  },

  'me.changePassword': {
    auth: 'session',
    async handler(ctx, d) {
      const cred = await ctx.db.get('credentials', ctx.user.id);
      if (!cred || !(await verifyPassword(typeof d.currentPassword === 'string' ? d.currentPassword : '', cred.hash))) {
        throw new ApiError(401, 'WRONG_PASSWORD', 'Your current password is not correct.');
      }
      const pw = vPassword(d.newPassword, 'New password');
      if (pw === d.currentPassword) throw bad('SAME_PASSWORD', 'Choose a password different from the current one.');
      const hash = await hashPassword(pw);
      await ctx.db.update('credentials', ctx.user.id, { hash, changedAt: ctx.now, failedCount: 0, lockedUntil: 0 });
      const patch = { mustChangePassword: false, resetRequestedAt: null, updatedAt: ctx.now };
      patch.attention = needsAttention({ ...ctx.user, ...patch });
      await ctx.db.update('users', ctx.user.id, patch);
      await revokeUserSessions(ctx.db, ctx.user.id, { exceptToken: ctx.token });
      await audit(ctx, 'auth.password_changed', { targetType: 'user', targetId: ctx.user.id, summary: `${ctx.user.name} changed their password` });
      await bump(ctx, 'users');
      return { me: meView({ ...ctx.user, ...patch }, ctx.app) };
    }
  },

  'me.requestAccess': {
    auth: 'session',
    async handler(ctx) {
      const role = APPS[ctx.app].registerRole;
      if (hasAppAccess(ctx.user, ctx.app)) throw bad('ALREADY_HAS_ACCESS', 'You already have access to this app.');
      const requested = Array.from(new Set([...(ctx.user.requestedRoles || []), role]));
      await ctx.db.update('users', ctx.user.id, { requestedRoles: requested, attention: true, updatedAt: ctx.now });
      forgetUser(ctx.user.id);
      await audit(ctx, 'user.access_requested', { targetType: 'user', targetId: ctx.user.id, summary: `${ctx.user.name} requested ${role} access`, details: { role } });
      await bump(ctx, 'users');
      return { me: meView({ ...ctx.user, requestedRoles: requested }, ctx.app) };
    }
  }
};
