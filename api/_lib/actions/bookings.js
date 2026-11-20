// Library booking requests: submitted by teachers, approved/rejected by library teachers, managed by admins.
import {
  ApiError, bad, conflict, notFound, str, multiline, int, oneOf, dateKey, timeHM, weekdayOf, addDays, daysBetween, textMatch,
  LIBRARIES, SCHOOL_DAYS, ACTIVE_BOOKING_STATUSES
} from '../util.js';
import { auditTx, bump, bookingWindow, schoolNow } from '../core.js';

export const BOOKING_STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show'];
const HOLDS_SLOT = new Set(['pending', 'approved', 'completed', 'no_show']);
export const slotId = (library, date, period) => `${library}_${date}_p${period}`;

export function validateBookingFields(d, { partial = false, base = {} } = {}) {
  const v = (k) => (d[k] !== undefined ? d[k] : base[k]);
  const out = {
    library: oneOf(v('library'), 'Library', LIBRARIES),
    date: dateKey(v('date')),
    period: int(v('period'), 'Period', { min: 1, max: 7 }),
    startTime: timeHM(v('startTime'), 'Arriving time'),
    endTime: timeHM(v('endTime'), 'Leaving time'),
    gradeSection: str(v('gradeSection'), 'Grade / Section', { max: 40 }),
    students: int(v('students'), 'Number of students', { min: 1, max: 200 }),
    classLanguage: oneOf(v('classLanguage'), 'Arabic / English class', ['arabic', 'english']),
    notes: multiline(v('notes'), 'Notes', 500)
  };
  if (!SCHOOL_DAYS.includes(weekdayOf(out.date))) throw bad('NOT_SCHOOL_DAY', 'Bookings are only possible Sunday to Thursday.');
  if (out.endTime <= out.startTime) throw bad('INVALID_TIME', 'Leaving time must be after arriving time.');
  if (partial) return out;
  return out;
}

export function slotDoc(id, b) {
  return {
    bookingId: id, library: b.library, date: b.date, period: b.period, startTime: b.startTime, endTime: b.endTime,
    teacherUid: b.teacherUid, teacherName: b.teacherName, gradeSection: b.gradeSection, status: b.status
  };
}

export function bookingView(b) {
  return {
    id: b.id, library: b.library, date: b.date, period: b.period, startTime: b.startTime, endTime: b.endTime,
    gradeSection: b.gradeSection, students: b.students, classLanguage: b.classLanguage, notes: b.notes || '',
    teacherName: b.teacherName, teacherUid: b.teacherUid, status: b.status, createdAt: b.createdAt, updatedAt: b.updatedAt,
    decidedByName: b.decidedByName || null, decidedAt: b.decidedAt || null, decisionNote: b.decisionNote || '',
    cancelledAt: b.cancelledAt || null, visitId: b.visitId || null, createdByName: b.createdByName || null
  };
}

function rangeQuery(from, to, field = 'date') {
  return { where: [[field, '>=', from], [field, '<=', to]], orderBy: [field, 'asc'] };
}

export function checkRange(d, maxDays = 400) {
  const from = dateKey(d.from, 'From date');
  const to = dateKey(d.to, 'To date');
  if (to < from) throw bad('INVALID_RANGE', 'The end date must be after the start date.');
  if (daysBetween(from, to) > maxDays) throw bad('RANGE_TOO_LARGE', `Search at most ${maxDays} days at a time.`);
  return { from, to };
}

async function loadBookingTx(tx, id) {
  if (typeof id !== 'string' || !id) throw bad('INVALID_INPUT', 'Booking id is required.');
  const b = await tx.get('bookingRequests', id);
  if (!b) throw notFound('Booking');
  const slot = await tx.get('bookingSlots', slotId(b.library, b.date, b.period));
  return { b, slot: slot && slot.bookingId === id ? slot : null, rawSlot: slot };
}

const LIB_ROLES = ['librarian', 'admin'];

export default {
  /* ---------------- Teachers App ---------------- */
  'booking.create': {
    auth: 'active', apps: ['teachers'], roles: ['teacher'],
    async handler(ctx, d) {
      const f = validateBookingFields(d);
      const sn = schoolNow(ctx.settings, ctx.now);
      if (f.date < sn.date || (f.date === sn.date && f.endTime <= sn.time)) throw bad('PAST_SLOT', 'That time has already passed.');
      const sid = slotId(f.library, f.date, f.period);
      const id = await ctx.db.runTransaction(async (tx) => {
        const { current } = await bookingWindow(ctx.db, ctx.now, tx);
        if (!current) throw new ApiError(403, 'BOOKING_CLOSED', 'The booking period is closed. Bookings can only be submitted while a booking period is open.');
        if (f.date < current.bookableFrom || f.date > current.bookableTo) {
          throw new ApiError(403, 'OUTSIDE_BOOKING_RANGE', `This booking period only accepts dates from ${current.bookableFrom} to ${current.bookableTo}.`, { from: current.bookableFrom, to: current.bookableTo });
        }
        if (await tx.get('bookingSlots', sid)) throw conflict('SLOT_TAKEN', 'Someone already booked this slot.');
        const max = ctx.settings.maxActiveBookingsPerTeacher || 0;
        if (max > 0) {
          const mine = await tx.query('bookingRequests', { where: [['teacherUid', '==', ctx.user.id]] });
          const active = mine.filter(b => ACTIVE_BOOKING_STATUSES.includes(b.status) && b.date >= sn.date).length;
          if (active >= max) throw new ApiError(403, 'BOOKING_LIMIT', `You can have at most ${max} upcoming bookings at a time.`, { max });
        }
        const booking = {
          ...f, teacherUid: ctx.user.id, teacherName: ctx.user.name, status: 'pending', periodId: current.id,
          createdAt: ctx.now, updatedAt: ctx.now, createdBy: ctx.user.id, createdByName: ctx.user.name,
          decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: '', cancelledAt: null, visitId: null
        };
        const bid = tx.create('bookingRequests', null, booking);
        tx.create('bookingSlots', sid, slotDoc(bid, booking));
        auditTx(tx, ctx, 'booking.requested', { targetType: 'booking', targetId: bid, summary: `${ctx.user.name} requested ${f.library} library, ${f.date} period ${f.period} (${f.gradeSection})` });
        return bid;
      });
      await bump(ctx, 'bookings');
      return { id, status: 'pending' };
    }
  },

  'booking.cancel': {
    auth: 'active', apps: ['teachers'], roles: ['teacher'],
    async handler(ctx, d) {
      const sn = schoolNow(ctx.settings, ctx.now);
      await ctx.db.runTransaction(async (tx) => {
        const { b, slot } = await loadBookingTx(tx, d.id);
        if (b.teacherUid !== ctx.user.id) throw new ApiError(403, 'FORBIDDEN', 'You can only cancel your own bookings.');
        if (!ACTIVE_BOOKING_STATUSES.includes(b.status)) throw bad('NOT_CANCELLABLE', 'This booking can no longer be cancelled.');
        if (b.date < sn.date) throw bad('NOT_CANCELLABLE', 'Past bookings cannot be cancelled.');
        tx.update('bookingRequests', b.id, { status: 'cancelled', cancelledAt: ctx.now, updatedAt: ctx.now });
        if (slot) tx.delete('bookingSlots', slot.id);
        auditTx(tx, ctx, 'booking.cancelled', { targetType: 'booking', targetId: b.id, summary: `${ctx.user.name} cancelled their booking for ${b.date} period ${b.period}` });
      });
      await bump(ctx, 'bookings');
      return { ok: true };
    }
  },

  /* ---------------- Library Teachers App ---------------- */
  'booking.approve': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const note = multiline(d.note, 'Note', 300);
      await ctx.db.runTransaction(async (tx) => {
        const { b, slot } = await loadBookingTx(tx, d.id);
        if (b.status !== 'pending') throw bad('NOT_PENDING', `This request is already ${b.status}.`);
        tx.update('bookingRequests', b.id, { status: 'approved', decidedBy: ctx.user.id, decidedByName: ctx.user.name, decidedAt: ctx.now, decisionNote: note, updatedAt: ctx.now });
        if (slot) tx.update('bookingSlots', slot.id, { status: 'approved' });
        auditTx(tx, ctx, 'booking.approved', { targetType: 'booking', targetId: b.id, summary: `Approved ${b.teacherName}'s booking for ${b.date} period ${b.period} (${b.gradeSection})` });
      });
      await bump(ctx, 'bookings');
      return { ok: true };
    }
  },

  'booking.reject': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const reason = str(d.reason, 'Reason', { max: 300 });
      await ctx.db.runTransaction(async (tx) => {
        const { b, slot } = await loadBookingTx(tx, d.id);
        if (!ACTIVE_BOOKING_STATUSES.includes(b.status)) throw bad('NOT_PENDING', `This request is already ${b.status}.`);
        tx.update('bookingRequests', b.id, { status: 'rejected', decidedBy: ctx.user.id, decidedByName: ctx.user.name, decidedAt: ctx.now, decisionNote: reason, updatedAt: ctx.now });
        if (slot) tx.delete('bookingSlots', slot.id);
        auditTx(tx, ctx, 'booking.rejected', { targetType: 'booking', targetId: b.id, summary: `Rejected ${b.teacherName}'s booking for ${b.date} period ${b.period}: ${reason}` });
      });
      await bump(ctx, 'bookings');
      return { ok: true };
    }
  },

  'booking.checkIn': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const sn = schoolNow(ctx.settings, ctx.now);
      const students = int(d.students, 'Number of students', { min: 0, max: 200 });
      const arrivedAt = timeHM(d.arrivedAt || sn.time, 'Arrival time');
      const notes = multiline(d.notes, 'Notes', 500);
      const visitId = await ctx.db.runTransaction(async (tx) => {
        const { b, slot } = await loadBookingTx(tx, d.id);
        if (!ACTIVE_BOOKING_STATUSES.includes(b.status)) throw bad('NOT_CHECKABLE', `This booking is ${b.status}.`);
        if (b.date > sn.date) throw bad('TOO_EARLY', 'You can only check in a class on the day of its visit.');
        const visit = {
          library: b.library, date: b.date, period: b.period, gradeSection: b.gradeSection, students, expectedStudents: b.students,
          teacherName: b.teacherName, classLanguage: b.classLanguage, notes: notes || b.notes || '', arrivedAt, leftAt: null,
          status: 'in_library', bookingId: b.id, source: 'booking',
          recordedBy: ctx.user.id, recordedByName: ctx.user.name, createdAt: ctx.now, updatedAt: ctx.now, updatedByName: ctx.user.name
        };
        const vid = tx.create('visits', null, visit);
        const patch = { status: 'completed', visitId: vid, updatedAt: ctx.now };
        if (b.status === 'pending') Object.assign(patch, { decidedBy: ctx.user.id, decidedByName: ctx.user.name, decidedAt: ctx.now });
        tx.update('bookingRequests', b.id, patch);
        if (slot) tx.update('bookingSlots', slot.id, { status: 'completed' });
        auditTx(tx, ctx, 'visit.checked_in', { targetType: 'visit', targetId: vid, summary: `Checked in ${b.gradeSection} (${b.teacherName}) with ${students} students` });
        return vid;
      });
      await bump(ctx, 'bookings', 'visits');
      return { visitId };
    }
  },

  'booking.noShow': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const sn = schoolNow(ctx.settings, ctx.now);
      const notes = multiline(d.notes, 'Notes', 500);
      await ctx.db.runTransaction(async (tx) => {
        const { b, slot } = await loadBookingTx(tx, d.id);
        if (!ACTIVE_BOOKING_STATUSES.includes(b.status)) throw bad('NOT_CHECKABLE', `This booking is ${b.status}.`);
        if (b.date > sn.date) throw bad('TOO_EARLY', 'A class can only be marked absent on or after the day of its visit.');
        const vid = tx.create('visits', null, {
          library: b.library, date: b.date, period: b.period, gradeSection: b.gradeSection, students: 0, expectedStudents: b.students,
          teacherName: b.teacherName, classLanguage: b.classLanguage, notes: notes || 'Did not attend', arrivedAt: null, leftAt: null,
          status: 'no_show', bookingId: b.id, source: 'booking',
          recordedBy: ctx.user.id, recordedByName: ctx.user.name, createdAt: ctx.now, updatedAt: ctx.now, updatedByName: ctx.user.name
        });
        tx.update('bookingRequests', b.id, { status: 'no_show', visitId: vid, updatedAt: ctx.now });
        if (slot) tx.update('bookingSlots', slot.id, { status: 'no_show' });
        auditTx(tx, ctx, 'visit.no_show', { targetType: 'booking', targetId: b.id, summary: `Marked ${b.gradeSection} (${b.teacherName}) as did not attend on ${b.date}` });
      });
      await bump(ctx, 'bookings', 'visits');
      return { ok: true };
    }
  },

  'bookings.search': {
    auth: 'active', apps: ['library'], roles: LIB_ROLES,
    async handler(ctx, d) {
      const { from, to } = checkRange(d);
      const status = d.status && d.status !== 'all' ? oneOf(d.status, 'Status', BOOKING_STATUSES) : null;
      const library = d.library && d.library !== 'all' ? oneOf(d.library, 'Library', LIBRARIES) : null;
      const q = typeof d.q === 'string' ? d.q.trim() : '';
      const rows = await ctx.db.query('bookingRequests', rangeQuery(from, to));
      const out = rows.filter(b => (!status || b.status === status) && (!library || b.library === library) && textMatch(q, b.teacherName, b.gradeSection, b.notes, b.decisionNote));
      return { items: out.slice(0, 2000).map(bookingView), truncated: out.length > 2000 };
    }
  },

  /* ---------------- Admin ---------------- */
  'admin.booking.create': {
    auth: 'active', apps: ['library'], roles: ['admin'],
    async handler(ctx, d) {
      const f = validateBookingFields(d);
      const status = oneOf(d.status || 'approved', 'Status', ['pending', 'approved']);
      const teacher = await ctx.db.get('users', String(d.teacherUid || ''));
      if (!teacher) throw notFound('Teacher');
      const sid = slotId(f.library, f.date, f.period);
      const id = await ctx.db.runTransaction(async (tx) => {
        if (await tx.get('bookingSlots', sid)) throw conflict('SLOT_TAKEN', 'This slot is already booked.');
        const booking = {
          ...f, teacherUid: teacher.id, teacherName: teacher.name, status, periodId: null,
          createdAt: ctx.now, updatedAt: ctx.now, createdBy: ctx.user.id, createdByName: ctx.user.name,
          decidedBy: status === 'approved' ? ctx.user.id : null, decidedByName: status === 'approved' ? ctx.user.name : null,
          decidedAt: status === 'approved' ? ctx.now : null, decisionNote: 'Added by administrator', cancelledAt: null, visitId: null
        };
        const bid = tx.create('bookingRequests', null, booking);
        tx.create('bookingSlots', sid, slotDoc(bid, booking));
        auditTx(tx, ctx, 'admin.booking_created', { targetType: 'booking', targetId: bid, summary: `Added booking for ${teacher.name}: ${f.library} ${f.date} period ${f.period}` });
        return bid;
      });
      await bump(ctx, 'bookings');
      return { id };
    }
  },

  'admin.booking.update': {
    auth: 'active', apps: ['library'], roles: ['admin'],
    async handler(ctx, d) {
      await ctx.db.runTransaction(async (tx) => {
        const { b, slot, rawSlot } = await loadBookingTx(tx, d.id);
        const f = validateBookingFields(d, { base: b });
        const status = d.status !== undefined ? oneOf(d.status, 'Status', BOOKING_STATUSES) : b.status;
        const newSid = slotId(f.library, f.date, f.period);
        const oldSid = slotId(b.library, b.date, b.period);
        const target = newSid !== oldSid ? await tx.get('bookingSlots', newSid) : rawSlot;
        if (HOLDS_SLOT.has(status) && target && target.bookingId !== b.id) throw conflict('SLOT_TAKEN', 'The new slot is already booked.');
        const updated = { ...b, ...f, status, updatedAt: ctx.now };
        const patch = { ...f, status, updatedAt: ctx.now };
        if (status !== b.status && ['approved', 'rejected'].includes(status)) Object.assign(patch, { decidedBy: ctx.user.id, decidedByName: ctx.user.name, decidedAt: ctx.now });
        if (d.decisionNote !== undefined) patch.decisionNote = multiline(d.decisionNote, 'Decision note', 300);
        tx.update('bookingRequests', b.id, patch);
        if (slot && (newSid !== oldSid || !HOLDS_SLOT.has(status))) tx.delete('bookingSlots', oldSid);
        if (HOLDS_SLOT.has(status)) tx.set('bookingSlots', newSid, slotDoc(b.id, updated));
        auditTx(tx, ctx, 'admin.booking_updated', { targetType: 'booking', targetId: b.id, summary: `Edited booking of ${b.teacherName} (${f.date} period ${f.period}, ${status})`, details: { before: { date: b.date, period: b.period, library: b.library, status: b.status } } });
      });
      await bump(ctx, 'bookings');
      return { ok: true };
    }
  },

  'admin.booking.delete': {
    auth: 'active', apps: ['library'], roles: ['admin'],
    async handler(ctx, d) {
      await ctx.db.runTransaction(async (tx) => {
        const { b, slot } = await loadBookingTx(tx, d.id);
        tx.delete('bookingRequests', b.id);
        if (slot) tx.delete('bookingSlots', slot.id);
        auditTx(tx, ctx, 'admin.booking_deleted', { targetType: 'booking', targetId: b.id, summary: `Deleted booking of ${b.teacherName} for ${b.date} period ${b.period}`, details: { booking: { library: b.library, date: b.date, period: b.period, gradeSection: b.gradeSection, status: b.status } } });
      });
      await bump(ctx, 'bookings');
      return { ok: true };
    }
  }
};

export { rangeQuery, addDays };
