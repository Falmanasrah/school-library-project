// Library Visits List (class visits, form FAC-P-02-R6), Library Visitors Log
// (individual visitors, form FAC-P-02-R5) and Student Permission Slips.
import { ApiError, bad, notFound, str, multiline, int, oneOf, dateKey, timeHM, textMatch, shortCode, LIBRARIES } from '../util.js';
import { audit, auditTx, bump, schoolNow } from '../core.js';
import { checkRange, rangeQuery } from './bookings.js';

const LIB_ROLES = ['librarian', 'admin'];
export const SLIP_STATUSES = ['sent', 'received', 'used', 'rejected', 'cancelled'];
export const SLIP_REASONS = ['borrow_return', 'reading', 'research', 'study', 'other'];

/* ---------------- class visits ---------------- */
function visitFields(d, base = {}) {
  const v = (k) => (d[k] !== undefined ? d[k] : base[k]);
  const out = {
    library: oneOf(v('library'), 'Library', LIBRARIES),
    date: dateKey(v('date')),
    gradeSection: str(v('gradeSection'), 'Grade / Section', { max: 40 }),
    students: int(v('students'), 'Number of students', { min: 0, max: 200 }),
    teacherName: str(v('teacherName'), 'Teacher name', { max: 80 }),
    classLanguage: oneOf(v('classLanguage'), 'Arabic / English class', ['arabic', 'english']),
    arrivedAt: timeHM(v('arrivedAt'), 'Arrival time', { required: false }),
    leftAt: timeHM(v('leftAt'), 'Leaving time', { required: false }),
    notes: multiline(v('notes'), 'Notes', 500)
  };
  if (out.arrivedAt && out.leftAt && out.leftAt < out.arrivedAt) throw bad('INVALID_TIME', 'Leaving time must be after arrival time.');
  return out;
}

export function visitView(v) {
  return {
    id: v.id, library: v.library, date: v.date, period: v.period ?? null, gradeSection: v.gradeSection, students: v.students,
    expectedStudents: v.expectedStudents ?? null, teacherName: v.teacherName, classLanguage: v.classLanguage, notes: v.notes || '',
    arrivedAt: v.arrivedAt || null, leftAt: v.leftAt || null, status: v.status, source: v.source || 'walkin', bookingId: v.bookingId || null,
    recordedByName: v.recordedByName || null, updatedByName: v.updatedByName || null, createdAt: v.createdAt, updatedAt: v.updatedAt
  };
}

/* ---------------- individual visitors ---------------- */
function visitorFields(d, base = {}) {
  const v = (k) => (d[k] !== undefined ? d[k] : base[k]);
  const out = {
    library: oneOf(v('library'), 'Library', LIBRARIES),
    date: dateKey(v('date')),
    name: str(v('name'), 'Name', { max: 80 }),
    className: str(v('className'), 'Class', { max: 40 }),
    purpose: str(v('purpose'), 'Purpose of visit', { max: 200 }),
    entranceTime: timeHM(v('entranceTime'), 'Entrance time', { required: false }),
    exitTime: timeHM(v('exitTime'), 'Exit time', { required: false }),
    notes: multiline(v('notes'), 'Notes', 300)
  };
  if (out.entranceTime && out.exitTime && out.exitTime < out.entranceTime) throw bad('INVALID_TIME', 'Exit time must be after entrance time.');
  return out;
}

export function visitorView(v) {
  return {
    id: v.id, library: v.library, date: v.date, name: v.name, className: v.className, purpose: v.purpose,
    entranceTime: v.entranceTime || null, exitTime: v.exitTime || null, notes: v.notes || '', source: v.source || 'walkin',
    slipId: v.slipId || null, studentId: v.studentId || '', teacherName: v.teacherName || '', supervisorName: v.supervisorName || '',
    recordedByName: v.recordedByName || null, createdAt: v.createdAt, updatedAt: v.updatedAt
  };
}

/* ---------------- permission slips ---------------- */
export function slipView(s) {
  return {
    id: s.id, code: s.code, studentName: s.studentName, studentId: s.studentId || '', grade: s.grade, teacherName: s.teacherName,
    library: s.library, reason: s.reason, reasonText: s.reasonText || '', notes: s.notes || '', date: s.date, issuedAt: s.issuedAt, issuedTime: s.issuedTime,
    status: s.status, supervisorName: s.supervisorName, signedAt: s.signedAt,
    receivedAt: s.receivedAt || null, receivedByName: s.receivedByName || null,
    entranceTime: s.entranceTime || null, exitTime: s.exitTime || null, verifiedByName: s.verifiedByName || null, verifiedAt: s.verifiedAt || null,
    rejectReason: s.rejectReason || '', rejectedByName: s.rejectedByName || null, cancelledAt: s.cancelledAt || null, visitorId: s.visitorId || null
  };
}

function reasonLabel(s) {
  const map = { borrow_return: 'Borrow / return a book', reading: 'Reading', research: 'Research / project', study: 'Study', other: 'Other' };
  return s.reason === 'other' && s.reasonText ? s.reasonText : (map[s.reason] || s.reason);
}

async function loadSlipTx(tx, id) {
  if (typeof id !== 'string' || !id) throw bad('INVALID_INPUT', 'Slip id is required.');
  const s = await tx.get('slips', id);
  if (!s) throw notFound('Permission slip');
  return s;
}

export default {
  /* ---------- Library Visits List (classes) ---------- */
  'visit.create': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const f = visitFields(d);
      const sn = schoolNow(ctx.settings, ctx.now);
      if (f.date > sn.date) throw bad('FUTURE_DATE', 'You can only record visits for today or earlier.');
      const status = f.leftAt ? 'completed' : (f.arrivedAt ? 'in_library' : 'completed');
      const id = await ctx.db.create('visits', null, {
        ...f, period: d.period ? int(d.period, 'Period', { min: 1, max: 7 }) : null, expectedStudents: null, status, source: 'walkin', bookingId: null,
        recordedBy: ctx.user.id, recordedByName: ctx.user.name, createdAt: ctx.now, updatedAt: ctx.now, updatedByName: ctx.user.name
      });
      await audit(ctx, 'visit.recorded', { targetType: 'visit', targetId: id, summary: `Recorded class visit: ${f.gradeSection} (${f.teacherName}), ${f.students} students on ${f.date}` });
      await bump(ctx, 'visits');
      return { id };
    }
  },

  'visit.update': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const v = await ctx.db.get('visits', String(d.id || ''));
      if (!v) throw notFound('Visit');
      const f = visitFields(d, v);
      let status = v.status;
      if (d.status !== undefined) status = oneOf(d.status, 'Status', ['in_library', 'completed', 'no_show']);
      else if (v.status === 'in_library' && f.leftAt) status = 'completed';
      await ctx.db.update('visits', v.id, { ...f, status, updatedAt: ctx.now, updatedByName: ctx.user.name });
      await audit(ctx, 'visit.updated', { targetType: 'visit', targetId: v.id, summary: `Edited class visit ${f.gradeSection} on ${f.date}`, details: { before: { students: v.students, arrivedAt: v.arrivedAt, leftAt: v.leftAt, status: v.status } } });
      await bump(ctx, 'visits');
      return { ok: true };
    }
  },

  'visit.checkout': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const v = await ctx.db.get('visits', String(d.id || ''));
      if (!v) throw notFound('Visit');
      if (v.status !== 'in_library') throw bad('NOT_IN_LIBRARY', 'This class is not currently in the library.');
      const leftAt = timeHM(d.leftAt || schoolNow(ctx.settings, ctx.now).time, 'Leaving time');
      await ctx.db.update('visits', v.id, { leftAt, status: 'completed', updatedAt: ctx.now, updatedByName: ctx.user.name });
      await audit(ctx, 'visit.checked_out', { targetType: 'visit', targetId: v.id, summary: `${v.gradeSection} (${v.teacherName}) left the library at ${leftAt}` });
      await bump(ctx, 'visits');
      return { ok: true };
    }
  },

  'visits.search': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const { from, to } = checkRange(d);
      const library = d.library && d.library !== 'all' ? oneOf(d.library, 'Library', LIBRARIES) : null;
      const q = typeof d.q === 'string' ? d.q.trim() : '';
      const rows = await ctx.db.query('visits', rangeQuery(from, to));
      const out = rows.filter(v => (!library || v.library === library) && textMatch(q, v.gradeSection, v.teacherName, v.notes, v.classLanguage));
      return { items: out.slice(0, 3000).map(visitView), truncated: out.length > 3000 };
    }
  },

  'admin.visit.delete': {
    auth: 'active', apps: ['library'], roles: ['admin'],
    async handler(ctx, d) {
      const v = await ctx.db.get('visits', String(d.id || ''));
      if (!v) throw notFound('Visit');
      await ctx.db.delete('visits', v.id);
      await audit(ctx, 'admin.visit_deleted', { targetType: 'visit', targetId: v.id, summary: `Deleted class visit ${v.gradeSection} (${v.teacherName}) on ${v.date}`, details: { visit: visitView(v) } });
      await bump(ctx, 'visits');
      return { ok: true };
    }
  },

  /* ---------- Library Visitors Log (individuals) ---------- */
  'visitor.create': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const f = visitorFields(d);
      const sn = schoolNow(ctx.settings, ctx.now);
      if (f.date > sn.date) throw bad('FUTURE_DATE', 'You can only record visitors for today or earlier.');
      if (!f.entranceTime && f.date === sn.date) f.entranceTime = sn.time;
      const id = await ctx.db.create('visitors', null, {
        ...f, source: 'walkin', slipId: null, recordedBy: ctx.user.id, recordedByName: ctx.user.name, createdAt: ctx.now, updatedAt: ctx.now
      });
      await audit(ctx, 'visitor.recorded', { targetType: 'visitor', targetId: id, summary: `Recorded visitor ${f.name} (${f.className}) on ${f.date}` });
      await bump(ctx, 'visitors');
      return { id };
    }
  },

  'visitor.update': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const v = await ctx.db.get('visitors', String(d.id || ''));
      if (!v) throw notFound('Visitor');
      const f = visitorFields(d, v);
      await ctx.db.update('visitors', v.id, { ...f, updatedAt: ctx.now, updatedByName: ctx.user.name });
      if (v.slipId && (f.exitTime !== (v.exitTime || null) || f.entranceTime !== (v.entranceTime || null))) {
        await ctx.db.update('slips', v.slipId, { exitTime: f.exitTime, entranceTime: f.entranceTime }).catch(() => {});
      }
      await audit(ctx, 'visitor.updated', { targetType: 'visitor', targetId: v.id, summary: `Edited visitor ${f.name} on ${f.date}` });
      await bump(ctx, 'visitors', 'slips');
      return { ok: true };
    }
  },

  'visitor.exit': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const v = await ctx.db.get('visitors', String(d.id || ''));
      if (!v) throw notFound('Visitor');
      if (v.exitTime) throw bad('ALREADY_LEFT', 'Exit time is already recorded.');
      const exitTime = timeHM(d.exitTime || schoolNow(ctx.settings, ctx.now).time, 'Exit time');
      await ctx.db.update('visitors', v.id, { exitTime, updatedAt: ctx.now, updatedByName: ctx.user.name });
      if (v.slipId) await ctx.db.update('slips', v.slipId, { exitTime }).catch(() => {});
      await audit(ctx, 'visitor.exited', { targetType: 'visitor', targetId: v.id, summary: `${v.name} left the library at ${exitTime}` });
      await bump(ctx, 'visitors', 'slips');
      return { ok: true };
    }
  },

  'visitors.search': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const { from, to } = checkRange(d);
      const library = d.library && d.library !== 'all' ? oneOf(d.library, 'Library', LIBRARIES) : null;
      const q = typeof d.q === 'string' ? d.q.trim() : '';
      const rows = await ctx.db.query('visitors', rangeQuery(from, to));
      const out = rows.filter(v => (!library || v.library === library) && textMatch(q, v.name, v.className, v.purpose, v.studentId, v.notes));
      return { items: out.slice(0, 5000).map(visitorView), truncated: out.length > 5000 };
    }
  },

  'admin.visitor.delete': {
    auth: 'active', apps: ['library'], roles: ['admin'],
    async handler(ctx, d) {
      const v = await ctx.db.get('visitors', String(d.id || ''));
      if (!v) throw notFound('Visitor');
      await ctx.db.delete('visitors', v.id);
      await audit(ctx, 'admin.visitor_deleted', { targetType: 'visitor', targetId: v.id, summary: `Deleted visitor record ${v.name} (${v.className}) on ${v.date}`, details: { visitor: visitorView(v) } });
      await bump(ctx, 'visitors');
      return { ok: true };
    }
  },

  /* ---------- Permission slips: Floor Supervisors App ---------- */
  'slip.create': {
    auth: 'active', apps: ['supervisors'], roles: ['supervisor'],
    async handler(ctx, d) {
      if (d.authorize !== true) throw bad('SIGNATURE_REQUIRED', 'Confirm that you authorise this student to go to the library.');
      const studentName = str(d.studentName, 'Student name', { min: 2, max: 80 });
      const studentId = str(d.studentId, 'Student ID', { max: 30, required: !!ctx.settings.requireStudentId });
      const grade = str(d.grade, 'Grade', { max: 40 });
      const teacherName = str(d.teacherName, 'Teacher name', { max: 80 });
      const library = oneOf(d.library, 'Library', LIBRARIES);
      const reason = oneOf(d.reason, "Visit's reason", SLIP_REASONS);
      const reasonText = reason === 'other' ? str(d.reasonText, "Visit's reason", { max: 120 }) : '';
      const notes = multiline(d.notes, 'Notes', 300);
      const sn = schoolNow(ctx.settings, ctx.now);
      let code = null;
      for (let i = 0; i < 8 && !code; i++) {
        const c = shortCode(4);
        const clash = await ctx.db.query('slips', { where: [['date', '==', sn.date], ['code', '==', c]], limit: 1 });
        if (!clash.length) code = c;
      }
      if (!code) throw new ApiError(503, 'TRY_AGAIN', 'Could not create a slip code. Please try again.');
      const slip = {
        code, studentName, studentId, grade, teacherName, library, reason, reasonText, notes,
        date: sn.date, issuedAt: ctx.now, issuedTime: sn.time, status: 'sent',
        supervisorUid: ctx.user.id, supervisorName: ctx.user.name, signedAt: ctx.now,
        receivedAt: null, receivedByName: null, entranceTime: null, exitTime: null, verifiedBy: null, verifiedByName: null, verifiedAt: null,
        rejectReason: '', rejectedByName: null, cancelledAt: null, visitorId: null
      };
      const id = await ctx.db.create('slips', null, slip);
      await audit(ctx, 'slip.issued', { targetType: 'slip', targetId: id, summary: `${ctx.user.name} issued slip ${code} for ${studentName} (${grade}) to the ${library} library` });
      await bump(ctx, 'slips');
      return { slip: slipView({ id, ...slip }) };
    }
  },

  'slip.cancel': {
    auth: 'active', apps: ['supervisors'], roles: ['supervisor'],
    async handler(ctx, d) {
      await ctx.db.runTransaction(async (tx) => {
        const s = await loadSlipTx(tx, d.id);
        if (s.supervisorUid !== ctx.user.id) throw new ApiError(403, 'FORBIDDEN', 'You can only cancel slips you issued.');
        if (!['sent', 'received'].includes(s.status)) throw bad('NOT_CANCELLABLE', `This slip is already ${s.status}.`);
        tx.update('slips', s.id, { status: 'cancelled', cancelledAt: ctx.now });
        auditTx(tx, ctx, 'slip.cancelled', { targetType: 'slip', targetId: s.id, summary: `${ctx.user.name} cancelled slip ${s.code} (${s.studentName})` });
      });
      await bump(ctx, 'slips');
      return { ok: true };
    }
  },

  'slips.mine': {
    auth: 'active', apps: ['supervisors'], roles: ['supervisor'],
    async handler(ctx, d) {
      const date = dateKey(d.date || schoolNow(ctx.settings, ctx.now).date);
      const rows = await ctx.db.query('slips', { where: [['supervisorUid', '==', ctx.user.id], ['date', '==', date]] });
      rows.sort((a, b) => b.issuedAt - a.issuedAt);
      return { date, items: rows.map(slipView) };
    }
  },

  /* ---------- Permission slips: Library Teachers App ---------- */
  'slip.receive': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const ids = Array.isArray(d.ids) ? d.ids.filter(x => typeof x === 'string').slice(0, 50) : [];
      if (!ids.length) return { received: 0 };
      const n = await ctx.db.runTransaction(async (tx) => {
        const slips = [];
        for (const id of ids) { const s = await tx.get('slips', id); if (s && s.status === 'sent') slips.push(s); }
        for (const s of slips) tx.update('slips', s.id, { status: 'received', receivedAt: ctx.now, receivedBy: ctx.user.id, receivedByName: ctx.user.name });
        return slips.length;
      });
      if (n) await bump(ctx, 'slips');
      return { received: n };
    }
  },

  'slip.verify': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const sn = schoolNow(ctx.settings, ctx.now);
      const entranceTime = timeHM(d.entranceTime || sn.time, 'Entrance time');
      const code = typeof d.code === 'string' ? d.code.trim().toUpperCase() : '';
      const result = await ctx.db.runTransaction(async (tx) => {
        const s = await loadSlipTx(tx, d.id);
        if (s.status === 'used') throw bad('ALREADY_USED', 'This slip has already been used.');
        if (!['sent', 'received'].includes(s.status)) throw bad('NOT_VALID', `This slip is ${s.status} and cannot be used.`);
        if (s.date !== sn.date) throw bad('SLIP_EXPIRED', 'This slip was issued on another day and has expired.');
        if (code && code !== s.code) throw bad('CODE_MISMATCH', 'The code does not match this slip. Check the student\'s identity.');
        const vid = tx.create('visitors', null, {
          library: s.library, date: s.date, name: s.studentName, className: s.grade, purpose: reasonLabel(s), entranceTime, exitTime: null,
          notes: s.notes || '', source: 'slip', slipId: s.id, studentId: s.studentId || '', teacherName: s.teacherName, supervisorName: s.supervisorName,
          recordedBy: ctx.user.id, recordedByName: ctx.user.name, createdAt: ctx.now, updatedAt: ctx.now
        });
        const patch = { status: 'used', entranceTime, verifiedBy: ctx.user.id, verifiedByName: ctx.user.name, verifiedAt: ctx.now, visitorId: vid };
        if (!s.receivedAt) Object.assign(patch, { receivedAt: ctx.now, receivedBy: ctx.user.id, receivedByName: ctx.user.name });
        tx.update('slips', s.id, patch);
        auditTx(tx, ctx, 'slip.verified', { targetType: 'slip', targetId: s.id, summary: `Verified ${s.studentName} (${s.grade}) with slip ${s.code}; entered at ${entranceTime}` });
        return { visitorId: vid };
      });
      await bump(ctx, 'slips', 'visitors');
      return result;
    }
  },

  'slip.reject': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const reason = str(d.reason, 'Reason', { max: 200 });
      await ctx.db.runTransaction(async (tx) => {
        const s = await loadSlipTx(tx, d.id);
        if (!['sent', 'received'].includes(s.status)) throw bad('NOT_VALID', `This slip is already ${s.status}.`);
        tx.update('slips', s.id, { status: 'rejected', rejectReason: reason, rejectedBy: ctx.user.id, rejectedByName: ctx.user.name, rejectedAt: ctx.now });
        auditTx(tx, ctx, 'slip.rejected', { targetType: 'slip', targetId: s.id, summary: `Rejected slip ${s.code} for ${s.studentName}: ${reason}` });
      });
      await bump(ctx, 'slips');
      return { ok: true };
    }
  },

  'slip.exit': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const exitTime = timeHM(d.exitTime || schoolNow(ctx.settings, ctx.now).time, 'Exit time');
      const s = await ctx.db.get('slips', String(d.id || ''));
      if (!s) throw notFound('Permission slip');
      if (s.status !== 'used') throw bad('NOT_IN_LIBRARY', 'This student has not been admitted with this slip.');
      if (s.exitTime) throw bad('ALREADY_LEFT', 'Exit time is already recorded.');
      await ctx.db.update('slips', s.id, { exitTime });
      if (s.visitorId) await ctx.db.update('visitors', s.visitorId, { exitTime, updatedAt: ctx.now }).catch(() => {});
      await audit(ctx, 'slip.exit', { targetType: 'slip', targetId: s.id, summary: `${s.studentName} left the library at ${exitTime}` });
      await bump(ctx, 'slips', 'visitors');
      return { ok: true };
    }
  },

  'slips.search': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const { from, to } = checkRange(d);
      const library = d.library && d.library !== 'all' ? oneOf(d.library, 'Library', LIBRARIES) : null;
      const status = d.status && d.status !== 'all' ? String(d.status) : null;
      const q = typeof d.q === 'string' ? d.q.trim() : '';
      const today = schoolNow(ctx.settings, ctx.now).date;
      const rows = await ctx.db.query('slips', rangeQuery(from, to));
      const out = rows.filter(s => {
        const shown = ['sent', 'received'].includes(s.status) && s.date < today ? 'expired' : s.status;
        return (!library || s.library === library) && (!status || shown === status) && textMatch(q, s.studentName, s.studentId, s.grade, s.teacherName, s.supervisorName, s.code);
      });
      return { items: out.slice(0, 5000).map(slipView), truncated: out.length > 5000 };
    }
  },

  'admin.slip.update': {
    auth: 'active', apps: ['library'], roles: ['admin'],
    async handler(ctx, d) {
      const s = await ctx.db.get('slips', String(d.id || ''));
      if (!s) throw notFound('Permission slip');
      const patch = {};
      if (d.studentName !== undefined) patch.studentName = str(d.studentName, 'Student name', { max: 80 });
      if (d.studentId !== undefined) patch.studentId = str(d.studentId, 'Student ID', { max: 30, required: false });
      if (d.grade !== undefined) patch.grade = str(d.grade, 'Grade', { max: 40 });
      if (d.teacherName !== undefined) patch.teacherName = str(d.teacherName, 'Teacher name', { max: 80 });
      if (d.library !== undefined) patch.library = oneOf(d.library, 'Library', LIBRARIES);
      if (d.notes !== undefined) patch.notes = multiline(d.notes, 'Notes', 300);
      if (d.status !== undefined) patch.status = oneOf(d.status, 'Status', SLIP_STATUSES);
      if (d.entranceTime !== undefined) patch.entranceTime = timeHM(d.entranceTime, 'Entrance time', { required: false });
      if (d.exitTime !== undefined) patch.exitTime = timeHM(d.exitTime, 'Exit time', { required: false });
      await ctx.db.update('slips', s.id, patch);
      await audit(ctx, 'admin.slip_updated', { targetType: 'slip', targetId: s.id, summary: `Edited slip ${s.code} (${s.studentName})`, details: { changes: patch } });
      await bump(ctx, 'slips');
      return { ok: true };
    }
  },

  'admin.slip.delete': {
    auth: 'active', apps: ['library'], roles: ['admin'],
    async handler(ctx, d) {
      const s = await ctx.db.get('slips', String(d.id || ''));
      if (!s) throw notFound('Permission slip');
      await ctx.db.delete('slips', s.id);
      await audit(ctx, 'admin.slip_deleted', { targetType: 'slip', targetId: s.id, summary: `Deleted slip ${s.code} for ${s.studentName} (${s.date})`, details: { slip: slipView(s) } });
      await bump(ctx, 'slips');
      return { ok: true };
    }
  }
};
