// Live sync for each app. Clients poll with the versions they already have;
// when nothing relevant changed the server answers with a single cheap read.
import { dateKey, addDays, LIBRARIES } from '../util.js';
import { getVersions, bookingWindow, publicPeriod, schoolNow } from '../core.js';
import { bookingView } from './bookings.js';
import { visitView, visitorView, slipView } from './records.js';
import { meView, userView } from './auth.js';

function unchanged(since, versions, keys) {
  return since && typeof since === 'object' && keys.every(k => since[k] === versions[k]);
}
function pickVersions(versions, keys) { return Object.fromEntries(keys.map(k => [k, versions[k]])); }

function clock(ctx) {
  const sn = schoolNow(ctx.settings, ctx.now);
  return { today: sn.date, nowTime: sn.time, weekday: sn.weekday, serverTime: ctx.now, timeZone: ctx.settings.timeZone };
}

async function periods(ctx) {
  const win = await bookingWindow(ctx.db, ctx.now);
  return { current: publicPeriod(win.current, ctx.now), next: publicPeriod(win.next, ctx.now) };
}

export default {
  'teacher.sync': {
    auth: 'active', apps: ['teachers'], roles: ['teacher'],
    async handler(ctx, d) {
      const keys = ['bookings', 'periods', 'settings', 'users'];
      const versions = await getVersions(ctx.db);
      if (unchanged(d.since, versions, keys)) return { changed: false, ...clock(ctx) };
      const c = clock(ctx);
      const period = await periods(ctx);
      const from = addDays(c.today, -7);
      let to = addDays(c.today, 28);
      for (const p of [period.current, period.next]) if (p && p.bookableTo > to) to = p.bookableTo;
      if (to > addDays(c.today, 130)) to = addDays(c.today, 130);
      const slots = await ctx.db.query('bookingSlots', { where: [['date', '>=', from], ['date', '<=', to]], orderBy: ['date', 'asc'] });
      const mine = await ctx.db.query('bookingRequests', { where: [['teacherUid', '==', ctx.user.id]] });
      const minDate = addDays(c.today, -60);
      return {
        changed: true, versions: pickVersions(versions, keys), ...c, period, me: meView(ctx.user, ctx.app),
        range: { from, to },
        slots: slots.map(s => ({
          library: s.library, date: s.date, period: s.period, startTime: s.startTime, endTime: s.endTime,
          teacherName: s.teacherName, gradeSection: s.gradeSection, status: s.status, mine: s.teacherUid === ctx.user.id, bookingId: s.teacherUid === ctx.user.id ? s.bookingId : null
        })),
        mine: mine.filter(b => b.date >= minDate).sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period).map(bookingView),
        limits: { maxActiveBookingsPerTeacher: ctx.settings.maxActiveBookingsPerTeacher || 0 },
        school: { schoolName: ctx.settings.schoolName, schoolNameAr: ctx.settings.schoolNameAr }
      };
    }
  },

  'library.sync': {
    auth: 'active', apps: ['library'], roles: ['librarian', 'admin'],
    async handler(ctx, d) {
      const isAdmin = ctx.user.roles.includes('admin');
      const keys = ['bookings', 'slips', 'visits', 'visitors', 'periods', 'settings', 'users'];
      const versions = await getVersions(ctx.db);
      if (unchanged(d.since, versions, keys)) return { changed: false, ...clock(ctx) };
      const c = clock(ctx);
      const [period, pending, upcoming, slips, visits, visitors] = await Promise.all([
        periods(ctx),
        ctx.db.query('bookingRequests', { where: [['status', '==', 'pending']] }),
        ctx.db.query('bookingRequests', { where: [['date', '>=', c.today]], orderBy: ['date', 'asc'], limit: 800 }),
        ctx.db.query('slips', { where: [['date', '==', c.today]] }),
        ctx.db.query('visits', { where: [['date', '==', c.today]] }),
        ctx.db.query('visitors', { where: [['date', '==', c.today]] })
      ]);
      let attention = [];
      if (isAdmin) attention = (await ctx.db.query('users', { where: [['attention', '==', true]] })).map(userView);
      const s = ctx.settings;
      return {
        changed: true, versions: pickVersions(versions, keys), ...c, period, me: meView(ctx.user, ctx.app),
        pending: pending.sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period).map(bookingView),
        upcoming: upcoming.filter(b => ['pending', 'approved'].includes(b.status) || b.date === c.today).map(bookingView),
        slips: slips.sort((a, b) => b.issuedAt - a.issuedAt).map(slipView),
        visits: visits.sort((a, b) => (a.arrivedAt || '').localeCompare(b.arrivedAt || '')).map(visitView),
        visitors: visitors.sort((a, b) => a.createdAt - b.createdAt).map(visitorView),
        attention,
        settings: {
          schoolName: s.schoolName, schoolNameAr: s.schoolNameAr, visitsListFormCode: s.visitsListFormCode, visitorsLogFormCode: s.visitorsLogFormCode,
          registrationOpen: s.registrationOpen, timeZone: s.timeZone
        },
        libraries: LIBRARIES
      };
    }
  },

  'supervisor.sync': {
    auth: 'active', apps: ['supervisors'], roles: ['supervisor'],
    async handler(ctx, d) {
      const keys = ['slips', 'settings', 'users'];
      const c = clock(ctx);
      const date = d.date ? dateKey(d.date) : c.today;
      const versions = await getVersions(ctx.db);
      if (d.date === d.sinceDate && unchanged(d.since, versions, keys)) return { changed: false, ...c };
      const rows = await ctx.db.query('slips', { where: [['supervisorUid', '==', ctx.user.id], ['date', '==', date]] });
      return {
        changed: true, versions: pickVersions(versions, keys), ...c, date, me: meView(ctx.user, ctx.app),
        slips: rows.sort((a, b) => b.issuedAt - a.issuedAt).map(slipView),
        settings: { requireStudentId: !!ctx.settings.requireStudentId, schoolName: ctx.settings.schoolName, schoolNameAr: ctx.settings.schoolNameAr }
      };
    }
  }
};
