// End-to-end tests of the shared backend through real HTTP requests.
// Covers: first-time setup, registration + approval, sign-in, per-app sessions,
// the 7-day booking period (including automatic closure), booking approval and
// rejection, permission slips from supervisor to library with verification,
// the visits list / visitors log, admin account controls and the audit log.
//   npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../scripts/dev-server.mjs';
import { createMemoryDb } from '../api/_lib/db-memory.js';
import { zoned, addDays, weekdayOf } from '../api/_lib/util.js';

process.env.ADMIN_SETUP_KEY = 'test-setup-key-123';
const TZ = 'Asia/Amman';
let server, base, db;

before(async () => {
  db = createMemoryDb();
  server = await startServer({ port: 0, db });
  base = `http://127.0.0.1:${server.port}`;
});
after(() => server?.close());

async function call(app, action, data = {}, token, headers = {}) {
  const r = await fetch(`${base}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App': app, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify({ action, data })
  });
  const j = await r.json();
  return { status: r.status, ...j };
}
async function ok(app, action, data, token) {
  const r = await call(app, action, data, token);
  assert.equal(r.ok, true, `${action} failed: ${JSON.stringify(r.error)}`);
  return r.data;
}
async function fail(code, app, action, data, token) {
  const r = await call(app, action, data, token);
  assert.equal(r.ok, false, `${action} should have failed with ${code}`);
  assert.equal(r.error.code, code, `${action}: expected ${code}, got ${r.error.code} (${r.error.message})`);
  return r;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const today = () => zoned(Date.now(), TZ).date;
function nextSchoolDay(from, n = 1) {
  let d = from, found = 0;
  while (found < n) { d = addDays(d, 1); if (weekdayOf(d) <= 4) found++; }
  return d;
}
function lastSchoolDayOnOrBefore(d) { while (weekdayOf(d) > 4) d = addDays(d, -1); return d; }
function nextWeekday(from, wd) { let d = addDays(from, 1); while (weekdayOf(d) !== wd) d = addDays(d, 1); return d; }

const S = {}; // shared state between steps
const booking = (date, period, extra = {}) => ({ library: 'junior', date, period, startTime: '08:00', endTime: '08:45', gradeSection: '5B', students: 24, classLanguage: 'english', notes: 'Reading week', ...extra });

test('full school library workflow', async (t) => {
  await t.test('first-time setup creates the first administrator', async () => {
    const info = await ok('library', 'system.info');
    assert.equal(info.needsSetup, true);
    assert.equal(info.setupEnabled, true);
    await fail('BAD_SETUP_KEY', 'library', 'system.setup', { setupKey: 'wrong', name: 'Head Librarian', email: 'admin@school.test', password: 'Admin-pass-1' });
    await fail('WRONG_APP', 'teachers', 'system.setup', { setupKey: 'test-setup-key-123', name: 'X', email: 'x@school.test', password: 'Admin-pass-1' });
    const r = await ok('library', 'system.setup', { setupKey: 'test-setup-key-123', name: 'Head Librarian', email: 'admin@school.test', password: 'Admin-pass-1', timeZone: TZ });
    assert.ok(r.token);
    assert.deepEqual(r.me.roles.sort(), ['admin', 'librarian']);
    S.admin = r.token;
    await fail('ALREADY_SET_UP', 'library', 'system.setup', { setupKey: 'test-setup-key-123', name: 'Other', email: 'other@school.test', password: 'Admin-pass-1' });
    assert.equal((await ok('library', 'system.info')).needsSetup, false);
  });

  await t.test('teacher registers, waits for approval, admin approves', async () => {
    await fail('WEAK_PASSWORD', 'teachers', 'auth.register', { name: 'Sarah Ahmad', email: 'sarah@school.test', password: 'short' });
    const r = await ok('teachers', 'auth.register', { name: 'Sarah Ahmad', email: 'Sarah@School.test', password: 'Teacher-pass-1' });
    assert.equal(r.status, 'pending');
    assert.equal(r.token, undefined);
    await fail('EMAIL_TAKEN', 'teachers', 'auth.register', { name: 'Sarah Again', email: 'sarah@school.test', password: 'Teacher-pass-1' });
    await fail('ACCOUNT_PENDING', 'teachers', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' });

    const users = (await ok('library', 'admin.users.list', {}, S.admin)).items;
    const sarah = users.find(u => u.email === 'sarah@school.test');
    assert.equal(sarah.status, 'pending');
    assert.deepEqual(sarah.requestedRoles, ['teacher']);
    assert.equal(sarah.attention, true);
    const sync = await ok('library', 'library.sync', {}, S.admin);
    assert.ok(sync.attention.some(u => u.id === sarah.id), 'admin sees the pending account');
    await ok('library', 'admin.user.approve', { uid: sarah.id }, S.admin);
    S.sarahId = sarah.id;

    await fail('INVALID_CREDENTIALS', 'teachers', 'auth.login', { email: 'sarah@school.test', password: 'Wrong-pass-1' });
    const login = await ok('teachers', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1', remember: true });
    assert.equal(login.me.hasAccess, true);
    S.sarah = login.token;

    // A second teacher, created directly by the administrator.
    await ok('library', 'admin.user.create', { name: 'Khalid Omar', email: 'khalid@school.test', password: 'Temp-pass-1', roles: ['teacher'], mustChangePassword: false }, S.admin);
    S.khalid = (await ok('teachers', 'auth.login', { email: 'khalid@school.test', password: 'Temp-pass-1' })).token;
  });

  await t.test('apps are separate: sessions and roles are bound to one app', async () => {
    await fail('SESSION_WRONG_APP', 'library', 'library.sync', {}, S.sarah);
    await fail('WRONG_APP', 'teachers', 'library.sync', {}, S.sarah);
    await fail('WRONG_APP', 'teachers', 'slip.create', {}, S.sarah);
    // Signing in to the Library app with a teacher account gives no access…
    const lib = await ok('library', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' });
    assert.equal(lib.me.hasAccess, false);
    await fail('NO_APP_ACCESS', 'library', 'library.sync', {}, lib.token);
    await fail('NO_APP_ACCESS', 'library', 'booking.approve', { id: 'x' }, lib.token);
    // …but the teacher may ask for access, which the admin can deny.
    const req = await ok('library', 'me.requestAccess', {}, lib.token);
    assert.deepEqual(req.me.requestedRoles, ['librarian']);
    await ok('library', 'admin.user.denyRequest', { uid: S.sarahId }, S.admin);
    const after = (await ok('library', 'admin.users.list', {}, S.admin)).items.find(u => u.id === S.sarahId);
    assert.deepEqual(after.requestedRoles, []);
    assert.equal(after.status, 'active');
    await ok('library', 'auth.logout', {}, lib.token);
    await fail('SESSION_EXPIRED', 'library', 'me.get', {}, lib.token);
    // Tampered / random tokens are rejected.
    await fail('SESSION_EXPIRED', 'teachers', 'teacher.sync', {}, 'not-a-real-token');
    await fail('UNAUTHENTICATED', 'teachers', 'teacher.sync', {});
  });

  await t.test('bookings are refused while no booking period is open', async () => {
    S.day1 = nextSchoolDay(today(), 1);
    await fail('BOOKING_CLOSED', 'teachers', 'booking.create', booking(S.day1, 2), S.sarah);
    const sync = await ok('teachers', 'teacher.sync', {}, S.sarah);
    assert.equal(sync.period.current, null);
  });

  await t.test('admin opens a 7-day booking period; teachers submit requests', async () => {
    const bookableTo = addDays(today(), 21);
    const p = await ok('library', 'admin.period.open', { startNow: true, bookableFrom: today(), bookableTo, note: 'Term 2' }, S.admin);
    assert.equal(p.closesAt - p.opensAt, 7 * 24 * 3600 * 1000, 'period lasts exactly 7 days');
    S.periodId = p.id;
    await fail('PERIOD_OVERLAP', 'library', 'admin.period.open', { startNow: true, bookableFrom: today(), bookableTo }, S.admin);
    await fail('FORBIDDEN', 'teachers', 'admin.period.open', {}, S.sarah).catch(async () => fail('WRONG_APP', 'teachers', 'admin.period.open', {}, S.sarah));

    const r = await ok('teachers', 'booking.create', booking(S.day1, 2), S.sarah);
    assert.equal(r.status, 'pending');
    S.b1 = r.id;
    await fail('SLOT_TAKEN', 'teachers', 'booking.create', booking(S.day1, 2, { gradeSection: '6A' }), S.khalid);
    S.b2 = (await ok('teachers', 'booking.create', booking(S.day1, 3, { gradeSection: '6A', classLanguage: 'arabic' }), S.khalid)).id;
    S.b3 = (await ok('teachers', 'booking.create', booking(S.day1, 5, { gradeSection: '6C' }), S.khalid)).id;

    await fail('PAST_SLOT', 'teachers', 'booking.create', booking(lastSchoolDayOnOrBefore(addDays(today(), -1)), 1), S.sarah);
    await fail('NOT_SCHOOL_DAY', 'teachers', 'booking.create', booking(nextWeekday(today(), 5), 1), S.sarah);
    await fail('OUTSIDE_BOOKING_RANGE', 'teachers', 'booking.create', booking(nextSchoolDay(bookableTo, 1), 1), S.sarah);
    await fail('INVALID_TIME', 'teachers', 'booking.create', booking(S.day1, 4, { startTime: '10:00', endTime: '09:00' }), S.sarah);
    await fail('INVALID_INPUT', 'teachers', 'booking.create', booking(S.day1, 4, { gradeSection: '' }), S.sarah);

    const sync = await ok('teachers', 'teacher.sync', {}, S.sarah);
    assert.equal(sync.period.current.state, 'open');
    const slot = sync.slots.find(s => s.date === S.day1 && s.period === 2);
    assert.equal(slot.mine, true);
    assert.equal(slot.status, 'pending');
    assert.equal(sync.slots.find(s => s.period === 3).mine, false);
    assert.equal(sync.mine.length, 1);
    // Unchanged versions -> cheap "no change" answer.
    const again = await ok('teachers', 'teacher.sync', { since: sync.versions }, S.sarah);
    assert.equal(again.changed, false);
  });

  await t.test('librarian account with temporary password must change it first', async () => {
    await ok('library', 'admin.user.create', { name: 'Mona Librarian', email: 'mona@school.test', password: 'Temp-pass-9', roles: ['librarian'] }, S.admin);
    const login = await ok('library', 'auth.login', { email: 'mona@school.test', password: 'Temp-pass-9' });
    assert.equal(login.me.mustChangePassword, true);
    await fail('PASSWORD_CHANGE_REQUIRED', 'library', 'library.sync', {}, login.token);
    await fail('WRONG_PASSWORD', 'library', 'me.changePassword', { currentPassword: 'nope', newPassword: 'Mona-pass-22' }, login.token);
    await ok('library', 'me.changePassword', { currentPassword: 'Temp-pass-9', newPassword: 'Mona-pass-22' }, login.token);
    S.mona = login.token;
    const sync = await ok('library', 'library.sync', {}, S.mona);
    assert.equal(sync.pending.length, 3);
    assert.equal(sync.attention.length, 0, 'librarians do not get the admin account list');
    await fail('FORBIDDEN', 'library', 'admin.users.list', {}, S.mona);
    await fail('FORBIDDEN', 'library', 'admin.user.ban', { uid: S.sarahId, reason: 'x' }, S.mona);
  });

  await t.test('booking approval and rejection travel back to the Teachers App', async () => {
    await ok('library', 'booking.approve', { id: S.b1, note: 'See you then' }, S.mona);
    await fail('NOT_PENDING', 'library', 'booking.approve', { id: S.b1 }, S.mona);
    await fail('INVALID_INPUT', 'library', 'booking.reject', { id: S.b2, reason: '' }, S.mona);
    await ok('library', 'booking.reject', { id: S.b2, reason: 'Library closed for inventory' }, S.mona);

    const sarah = await ok('teachers', 'teacher.sync', {}, S.sarah);
    assert.equal(sarah.mine[0].status, 'approved');
    assert.equal(sarah.mine[0].decidedByName, 'Mona Librarian');
    const khalid = await ok('teachers', 'teacher.sync', {}, S.khalid);
    const rejected = khalid.mine.find(b => b.id === S.b2);
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.decisionNote, 'Library closed for inventory');
    assert.ok(!khalid.slots.some(s => s.period === 3 && s.date === S.day1), 'rejected booking frees the slot');
    // The freed slot can be booked again.
    S.b4 = (await ok('teachers', 'booking.create', booking(S.day1, 3, { gradeSection: '5A' }), S.sarah)).id;
    // Teachers can cancel their own requests but not other teachers'.
    await fail('FORBIDDEN', 'teachers', 'booking.cancel', { id: S.b4 }, S.khalid);
    await ok('teachers', 'booking.cancel', { id: S.b4 }, S.sarah);
    const lib = await ok('library', 'library.sync', {}, S.mona);
    assert.equal(lib.pending.length, 1, 'only booking b3 is still pending');
  });

  await t.test('booking submissions close automatically when the 7 days end', async () => {
    // Move the open period's end to 1.5 seconds from now (as if 7 days had passed).
    await db.update('bookingPeriods', S.periodId, { closesAt: Date.now() + 1500 });
    await ok('teachers', 'booking.create', booking(S.day1, 6), S.sarah);
    await sleep(2000);
    await fail('BOOKING_CLOSED', 'teachers', 'booking.create', booking(S.day1, 7), S.sarah);
    const sync = await ok('teachers', 'teacher.sync', {}, S.sarah);
    assert.equal(sync.period.current, null, 'Teachers App sees the period as closed');
    // Approvals still work after the period has closed.
    await ok('library', 'booking.approve', { id: S.b3 }, S.mona);
  });

  await t.test('admin opens the next period, schedules one and can close early', async () => {
    const p = await ok('library', 'admin.period.open', { startNow: true, bookableFrom: today(), bookableTo: addDays(today(), 14) }, S.admin);
    await ok('teachers', 'booking.create', booking(S.day1, 7), S.sarah);
    const sched = await ok('library', 'admin.period.open', { opensAt: p.closesAt, bookableFrom: today(), bookableTo: addDays(today(), 30) }, S.admin);
    const list = await ok('library', 'admin.periods.list', {}, S.admin);
    assert.equal(list.current.id, p.id);
    assert.equal(list.next.id, sched.id);
    assert.equal(list.next.state, 'scheduled');
    await ok('library', 'admin.period.close', { id: p.id }, S.admin);
    await fail('BOOKING_CLOSED', 'teachers', 'booking.create', booking(S.day1, 4), S.sarah);
    await fail('ALREADY_CLOSED', 'library', 'admin.period.close', { id: p.id }, S.admin);
    await ok('library', 'admin.period.close', { id: sched.id }, S.admin); // cancel the scheduled one
  });

  await t.test('class visits: check-in, check-out, no-show, walk-in records and search', async () => {
    const day = lastSchoolDayOnOrBefore(today());
    const users = (await ok('library', 'admin.users.list', {}, S.admin)).items;
    const khalidId = users.find(u => u.email === 'khalid@school.test').id;
    const a = await ok('library', 'admin.booking.create', { ...booking(day, 1, { gradeSection: '7A', students: 28 }), teacherUid: khalidId }, S.admin);
    const b = await ok('library', 'admin.booking.create', { ...booking(day, 2, { gradeSection: '7B' }), teacherUid: khalidId }, S.admin);
    await fail('TOO_EARLY', 'library', 'booking.checkIn', { id: S.b1, students: 20 }, S.mona);
    const v = await ok('library', 'booking.checkIn', { id: a.id, students: 26, arrivedAt: '08:05', notes: '2 absent' }, S.mona);
    await fail('NOT_CHECKABLE', 'library', 'booking.checkIn', { id: a.id, students: 26 }, S.mona);
    await ok('library', 'visit.checkout', { id: v.visitId, leftAt: '08:50' }, S.mona);
    await fail('NOT_IN_LIBRARY', 'library', 'visit.checkout', { id: v.visitId }, S.mona);
    await ok('library', 'booking.noShow', { id: b.id }, S.mona);
    await ok('library', 'visit.create', { library: 'senior', date: day, gradeSection: '10C', students: 18, teacherName: 'Mr. Walk-in', classLanguage: 'arabic', arrivedAt: '11:00', leftAt: '11:40', notes: 'Unbooked visit' }, S.mona);
    await fail('FUTURE_DATE', 'library', 'visit.create', { library: 'senior', date: addDays(today(), 3), gradeSection: '10C', students: 18, teacherName: 'X', classLanguage: 'arabic' }, S.mona);
    const found = await ok('library', 'visits.search', { from: addDays(day, -1), to: today(), library: 'all' }, S.mona);
    assert.equal(found.items.length, 3);
    const done = found.items.find(x => x.id === v.visitId);
    assert.equal(done.status, 'completed');
    assert.equal(done.students, 26);
    assert.equal(done.expectedStudents, 28);
    assert.equal(done.leftAt, '08:50');
    assert.equal(found.items.find(x => x.bookingId === b.id).status, 'no_show');
    assert.equal((await ok('library', 'visits.search', { from: addDays(day, -1), to: today(), q: 'walk-in' }, S.mona)).items.length, 1);
    const hist = await ok('library', 'bookings.search', { from: addDays(day, -1), to: addDays(today(), 30), status: 'completed' }, S.mona);
    assert.ok(hist.items.some(x => x.id === a.id));
  });

  await t.test('floor supervisor issues permission slips that arrive in the Library App', async () => {
    const reg = await ok('supervisors', 'auth.register', { name: 'Huda Supervisor', email: 'huda@school.test', password: 'Huda-pass-1' });
    assert.equal(reg.status, 'pending');
    const pending = (await ok('library', 'admin.users.list', {}, S.admin)).items.find(u => u.email === 'huda@school.test');
    assert.deepEqual(pending.requestedRoles, ['supervisor']);
    await ok('library', 'admin.user.approve', { uid: pending.id }, S.admin);
    S.huda = (await ok('supervisors', 'auth.login', { email: 'huda@school.test', password: 'Huda-pass-1' })).token;
    await fail('WRONG_APP', 'supervisors', 'library.sync', {}, S.huda);
    await fail('NO_APP_ACCESS', 'supervisors', 'supervisor.sync', {}, (await ok('supervisors', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' })).token);

    const slipIn = { studentName: 'Omar Khaled', studentId: 'S-1042', grade: '8B', teacherName: 'Ms. Rania', library: 'senior', reason: 'research', notes: 'Science project' };
    await fail('SIGNATURE_REQUIRED', 'supervisors', 'slip.create', slipIn, S.huda);
    const { slip } = await ok('supervisors', 'slip.create', { ...slipIn, authorize: true }, S.huda);
    assert.match(slip.code, /^[A-Z2-9]{4}$/);
    assert.equal(slip.status, 'sent');
    assert.equal(slip.supervisorName, 'Huda Supervisor');
    assert.equal(slip.date, today());
    S.slip = slip;

    let lib = await ok('library', 'library.sync', {}, S.mona);
    assert.equal(lib.slips.length, 1);
    assert.equal(lib.slips[0].status, 'sent');
    await ok('library', 'slip.receive', { ids: [slip.id] }, S.mona);
    let sup = await ok('supervisors', 'supervisor.sync', {}, S.huda);
    assert.equal(sup.slips[0].status, 'received');
    assert.equal(sup.slips[0].receivedByName, 'Mona Librarian');

    await fail('CODE_MISMATCH', 'library', 'slip.verify', { id: slip.id, code: 'ZZZZ' }, S.mona);
    const ver = await ok('library', 'slip.verify', { id: slip.id, code: slip.code.toLowerCase(), entranceTime: '10:15' }, S.mona);
    await fail('ALREADY_USED', 'library', 'slip.verify', { id: slip.id }, S.mona);
    sup = await ok('supervisors', 'supervisor.sync', {}, S.huda);
    assert.equal(sup.slips[0].status, 'used');
    assert.equal(sup.slips[0].entranceTime, '10:15');
    await ok('library', 'slip.exit', { id: slip.id, exitTime: '10:55' }, S.mona);
    lib = await ok('library', 'library.sync', {}, S.mona);
    const visitor = lib.visitors.find(v => v.id === ver.visitorId);
    assert.equal(visitor.name, 'Omar Khaled');
    assert.equal(visitor.className, '8B');
    assert.equal(visitor.purpose, 'Research / project');
    assert.equal(visitor.exitTime, '10:55');
    assert.equal(lib.slips[0].exitTime, '10:55');

    // Rejected slip (student did not match) and a slip cancelled by the supervisor.
    const s2 = (await ok('supervisors', 'slip.create', { ...slipIn, studentName: 'Lina Fares', studentId: '', grade: '9A', reason: 'other', reasonText: 'Return laptop', authorize: true }, S.huda)).slip;
    await ok('library', 'slip.reject', { id: s2.id, reason: 'Different student arrived' }, S.mona);
    const s3 = (await ok('supervisors', 'slip.create', { ...slipIn, studentName: 'Yazan Ali', authorize: true }, S.huda)).slip;
    await ok('supervisors', 'slip.cancel', { id: s3.id }, S.huda);
    await fail('NOT_VALID', 'library', 'slip.verify', { id: s3.id }, S.mona);
    sup = await ok('supervisors', 'supervisor.sync', {}, S.huda);
    assert.deepEqual(sup.slips.map(s => s.status).sort(), ['cancelled', 'rejected', 'used']);

    // Supervisors only see their own slips.
    await ok('library', 'admin.user.create', { name: 'Second Supervisor', email: 'sup2@school.test', password: 'Sup2-pass-1', roles: ['supervisor'], mustChangePassword: false }, S.admin);
    const sup2 = (await ok('supervisors', 'auth.login', { email: 'sup2@school.test', password: 'Sup2-pass-1' })).token;
    assert.equal((await ok('supervisors', 'supervisor.sync', {}, sup2)).slips.length, 0);
    await fail('FORBIDDEN', 'supervisors', 'slip.cancel', { id: s2.id }, sup2);

    const search = await ok('library', 'slips.search', { from: today(), to: today(), q: 'omar' }, S.mona);
    assert.equal(search.items.length, 1);
  });

  await t.test('visitors log: walk-in student, exit time, search', async () => {
    const r = await ok('library', 'visitor.create', { library: 'junior', date: today(), name: 'Sami Nasser', className: '4C', purpose: 'Borrow a book', entranceTime: '12:00' }, S.mona);
    await ok('library', 'visitor.exit', { id: r.id, exitTime: '12:20' }, S.mona);
    await fail('ALREADY_LEFT', 'library', 'visitor.exit', { id: r.id }, S.mona);
    const found = await ok('library', 'visitors.search', { from: today(), to: today() }, S.mona);
    assert.equal(found.items.length, 2);
    assert.equal(found.items.find(v => v.id === r.id).exitTime, '12:20');
  });

  await t.test('admin account controls: suspend, auto-lift, ban, reset, lockout, edit, delete', async () => {
    // Suspend: existing session stops working immediately and sign-in shows the reason.
    await fail('SELF_ACTION', 'library', 'admin.user.suspend', { uid: (await ok('library', 'me.get', {}, S.admin)).me.id, reason: 'x' }, S.admin);
    await ok('library', 'admin.user.suspend', { uid: S.sarahId, reason: 'Policy review' }, S.admin);
    await fail('SESSION_EXPIRED', 'teachers', 'teacher.sync', {}, S.sarah);
    const susp = await fail('ACCOUNT_SUSPENDED', 'teachers', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' });
    assert.equal(susp.error.details.reason, 'Policy review');
    await ok('library', 'admin.user.reactivate', { uid: S.sarahId }, S.admin);
    S.sarah = (await ok('teachers', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' })).token;

    // A suspension with an end date lifts itself once that time has passed.
    await ok('library', 'admin.user.suspend', { uid: S.sarahId, reason: 'One day', until: Date.now() + 120_000 }, S.admin);
    await fail('ACCOUNT_SUSPENDED', 'teachers', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' });
    await db.update('users', S.sarahId, { suspendedUntil: Date.now() - 1000 });
    S.sarah = (await ok('teachers', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' })).token;
    assert.equal((await ok('library', 'admin.users.list', {}, S.admin)).items.find(u => u.id === S.sarahId).status, 'active');

    // Ban.
    await ok('library', 'admin.user.ban', { uid: S.sarahId, reason: 'Misuse' }, S.admin);
    await fail('SESSION_EXPIRED', 'teachers', 'teacher.sync', {}, S.sarah);
    await fail('ACCOUNT_BANNED', 'teachers', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' });
    await ok('library', 'admin.user.reactivate', { uid: S.sarahId }, S.admin);

    // Forgot password -> admin sees the request -> sets a temporary password.
    await ok('teachers', 'auth.forgotPassword', { email: 'sarah@school.test' });
    await ok('teachers', 'auth.forgotPassword', { email: 'nobody@school.test' }); // same answer, no leak
    let u = (await ok('library', 'admin.users.list', {}, S.admin)).items.find(x => x.id === S.sarahId);
    assert.ok(u.resetRequestedAt);
    await ok('library', 'admin.user.setPassword', { uid: S.sarahId, password: 'Reset-pass-7' }, S.admin);
    await fail('INVALID_CREDENTIALS', 'teachers', 'auth.login', { email: 'sarah@school.test', password: 'Teacher-pass-1' });
    const t1 = await ok('teachers', 'auth.login', { email: 'sarah@school.test', password: 'Reset-pass-7' });
    assert.equal(t1.me.mustChangePassword, true);
    await ok('teachers', 'me.changePassword', { currentPassword: 'Reset-pass-7', newPassword: 'Teacher-pass-2' }, t1.token);
    S.sarah = t1.token;
    u = (await ok('library', 'admin.users.list', {}, S.admin)).items.find(x => x.id === S.sarahId);
    assert.equal(u.resetRequestedAt, null);

    // Lockout after 5 wrong passwords, then admin unlock.
    for (let i = 0; i < 5; i++) await fail('INVALID_CREDENTIALS', 'teachers', 'auth.login', { email: 'khalid@school.test', password: 'Bad-pass-' + i });
    await fail('ACCOUNT_LOCKED', 'teachers', 'auth.login', { email: 'khalid@school.test', password: 'Temp-pass-1' });
    const khalid = (await ok('library', 'admin.users.list', {}, S.admin)).items.find(x => x.email === 'khalid@school.test');
    assert.ok(khalid.lockedUntil > Date.now());
    await ok('library', 'admin.user.unlock', { uid: khalid.id }, S.admin);
    await ok('teachers', 'auth.login', { email: 'khalid@school.test', password: 'Temp-pass-1' });

    // Edit: change email and roles.
    await ok('library', 'admin.user.update', { uid: khalid.id, name: 'Khalid Omar Saleh', email: 'k.omar@school.test', roles: ['teacher', 'supervisor'] }, S.admin);
    await fail('INVALID_CREDENTIALS', 'teachers', 'auth.login', { email: 'khalid@school.test', password: 'Temp-pass-1' });
    const ks = await ok('supervisors', 'auth.login', { email: 'k.omar@school.test', password: 'Temp-pass-1' });
    assert.equal(ks.me.hasAccess, true);
    assert.equal(ks.me.name, 'Khalid Omar Saleh');

    // The last administrator is protected.
    const me = (await ok('library', 'me.get', {}, S.admin)).me;
    await fail('SELF_ACTION', 'library', 'admin.user.update', { uid: me.id, roles: ['librarian'] }, S.admin);
    await fail('SELF_ACTION', 'library', 'admin.user.delete', { uid: me.id }, S.admin);

    // Delete: the account disappears, its records stay, the email can be reused.
    await ok('library', 'admin.user.delete', { uid: khalid.id }, S.admin);
    await fail('INVALID_CREDENTIALS', 'supervisors', 'auth.login', { email: 'k.omar@school.test', password: 'Temp-pass-1' });
    await fail('ACCOUNT_DELETED', 'supervisors', 'supervisor.sync', {}, ks.token).catch(() => fail('SESSION_EXPIRED', 'supervisors', 'supervisor.sync', {}, ks.token));
    const hist = await ok('library', 'bookings.search', { from: addDays(today(), -10), to: addDays(today(), 30) }, S.admin);
    assert.ok(hist.items.some(b => b.teacherName === 'Khalid Omar'), 'records of deleted accounts are kept');
    assert.equal((await ok('teachers', 'auth.register', { name: 'New Khalid', email: 'k.omar@school.test', password: 'Again-pass-1' })).status, 'pending');
  });

  await t.test('admin edits and deletes records', async () => {
    await ok('library', 'admin.booking.update', { id: S.b1, period: 4, gradeSection: '5B-edited' }, S.admin);
    const sync = await ok('teachers', 'teacher.sync', {}, S.sarah);
    assert.ok(sync.slots.some(s => s.period === 4 && s.date === S.day1 && s.gradeSection === '5B-edited'));
    assert.ok(!sync.slots.some(s => s.period === 2 && s.date === S.day1), 'old slot released after move');
    await ok('library', 'admin.booking.delete', { id: S.b1 }, S.admin);
    assert.ok(!(await ok('teachers', 'teacher.sync', {}, S.sarah)).mine.some(b => b.id === S.b1));
    const slips = await ok('library', 'slips.search', { from: today(), to: today() }, S.admin);
    const target = slips.items.find(s => s.status === 'rejected');
    await ok('library', 'admin.slip.update', { id: target.id, notes: 'Checked with supervisor' }, S.admin);
    await ok('library', 'admin.slip.delete', { id: target.id }, S.admin);
    await fail('FORBIDDEN', 'library', 'admin.slip.delete', { id: S.slip.id }, S.mona);
  });

  await t.test('system settings: registration controls', async () => {
    await ok('library', 'admin.settings.update', { registrationOpen: false }, S.admin);
    await fail('REGISTRATION_CLOSED', 'teachers', 'auth.register', { name: 'Late Teacher', email: 'late@school.test', password: 'Late-pass-1' });
    await ok('library', 'admin.settings.update', { registrationOpen: true, allowedDomains: 'school.test', autoApproveTeachers: true }, S.admin);
    await fail('DOMAIN_NOT_ALLOWED', 'teachers', 'auth.register', { name: 'Outsider', email: 'someone@gmail.com', password: 'Outs-pass-1' });
    const r = await ok('teachers', 'auth.register', { name: 'Auto Teacher', email: 'auto@school.test', password: 'Auto-pass-1' });
    assert.equal(r.status, 'active');
    assert.ok(r.token);
    // Library accounts always need approval, even with auto-approve on.
    assert.equal((await ok('library', 'auth.register', { name: 'Lib Applicant', email: 'lib2@school.test', password: 'Lib2-pass-1' })).status, 'pending');
    await fail('INVALID_DOMAIN', 'library', 'admin.settings.update', { allowedDomains: 'not a domain!' }, S.admin);
    const health = await ok('library', 'admin.system.health', {}, S.admin);
    assert.equal(health.ok, true);
  });

  await t.test('audit log records who did what', async () => {
    const r = await ok('library', 'admin.audit.search', { from: addDays(today(), -1), to: today() }, S.admin);
    const actions = new Set(r.items.map(i => i.action));
    for (const a of ['system.setup', 'auth.register', 'auth.login', 'admin.user_approved', 'admin.period_opened', 'admin.period_closed', 'booking.requested',
      'booking.approved', 'booking.rejected', 'booking.cancelled', 'visit.checked_in', 'visit.no_show', 'slip.issued', 'slip.verified', 'slip.rejected',
      'slip.cancelled', 'admin.user_suspended', 'user.suspension_ended', 'admin.user_banned', 'admin.password_reset', 'auth.lockout', 'admin.user_deleted', 'admin.settings_updated']) {
      assert.ok(actions.has(a), `audit log contains ${a}`);
    }
    const approved = r.items.find(i => i.action === 'booking.approved');
    assert.equal(approved.actorName, 'Mona Librarian');
    const filtered = await ok('library', 'admin.audit.search', { from: addDays(today(), -1), to: today(), action: 'slip.' }, S.admin);
    assert.ok(filtered.items.every(i => i.action.startsWith('slip.')));
    await fail('FORBIDDEN', 'library', 'admin.audit.search', { from: today(), to: today() }, S.mona);
  });

  await t.test('request hygiene: other websites, unknown actions, bad input', async () => {
    const r = await call('teachers', 'system.info', {}, null, { Origin: 'https://evil.example' });
    assert.equal(r.error.code, 'BAD_ORIGIN');
    await fail('UNKNOWN_ACTION', 'teachers', 'nope.nothing');
    await fail('UNKNOWN_ACTION', 'teachers', '__proto__');
    const noApp = await fetch(`${base}/api/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'system.info' }) });
    assert.equal((await noApp.json()).error.code, 'UNKNOWN_APP');
    const badJson = await fetch(`${base}/api/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App': 'teachers' }, body: '{oops' });
    assert.equal((await badJson.json()).error.code, 'BAD_JSON');
    // Credentials are never exposed to clients.
    const list = await ok('library', 'admin.users.list', {}, S.admin);
    assert.ok(list.items.every(u => !('hash' in u) && !('password' in u)));
    // Server files are not served as static files.
    assert.equal((await fetch(`${base}/api/_lib/auth.js`)).status, 404);
  });
});
