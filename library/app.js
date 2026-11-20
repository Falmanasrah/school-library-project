// Library Teachers App: visits list, booking approval, permission slips,
// visits log, visitors log and (for administrators) the admin panel.
import {
  VERSION, createSync, $, errorText, confirmDialog, initTheme, downloadCsv, printHtml, setupAutoUpdate, setupInstall,
  addDays, weekdayOf, closeAllSheets, fmtDuration
} from '/shared/core.js';
import { createAuth } from '/shared/auth.js';
import { visitsListHtml, visitorsLogHtml, slipHtml } from '/shared/forms.js';
import {
  i18n, t, api, S, ctl, badge, libShort, langLabel, dLabel, dLong, dt, matchLib, nowHM, defaultLib, isAdmin, reasonText,
  libOptions, langOptions, periodOptions, act, formSheet, detailSheet, emptyHtml, sortRows, userError, esc, store, toast, openSheet
} from '/library/common.js';
import { AdminView } from '/library/admin.js';

const LOGO = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#1f7a5a" stroke-width="1.6"><path d="M4 19V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v14"/><path d="M9 19V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v12"/><path d="M14.5 6.5l2.9-.8a1 1 0 0 1 1.2.7l3 11.2"/><path d="M3 19h18"/></svg>';

/* ======================= shared bits ======================= */
const incoming = () => (S.d ? S.d.slips.filter(s => ['sent', 'received'].includes(s.status) && matchLib(s)) : []);
const visitFor = (b) => S.d.visits.find(v => v.bookingId === b.id) || null;
const libCol = () => S.filter === 'all';
// Times are wrapped in Unicode isolates so ranges keep their order in Arabic (RTL).
const LRI = String.fromCharCode(0x2066), PDI = String.fromCharCode(0x2069);
const timeRange = (a, b) => (a ? `${LRI}${a}${b ? '–' + b : ''}${PDI}` : '—');
const plainRange = (a, b) => (a ? `${a}${b ? '-' + b : ''}` : '');

function toolbarDates(q) {
  return `<div class="fg"><label for="qFrom">${esc(t('from'))}</label><input type="date" id="qFrom" value="${esc(q.from)}" /></div>
    <div class="fg"><label for="qTo">${esc(t('to'))}</label><input type="date" id="qTo" value="${esc(q.to)}" /></div>`;
}
function readDates(el, q) { q.from = $('#qFrom', el).value || q.from; q.to = $('#qTo', el).value || q.to; if (q.to < q.from) q.to = q.from; }

function periodBanner() {
  const p = S.d.period;
  if (p.current && p.current.state === 'open') {
    return `<div class="banner open">${t('periodOpen', esc(dt(p.current.closesAt)))} <span class="muted">${esc(t('visitDates'))}: ${esc(dLabel(p.current.bookableFrom))} – ${esc(dLabel(p.current.bookableTo))}</span></div>`;
  }
  return `<div class="banner closed">${t('periodClosed')}${p.next ? esc(t('periodNext', dt(p.next.opensAt))) : ''}</div>`;
}

/* ---- booking actions (used by the Visits List and Booking Requests) ---- */
function bookingSummary(b) {
  return `<div class="confirm-box">
    <div class="row"><span>${esc(t('gradeSection'))}</span><span>${esc(b.gradeSection)}</span></div>
    <div class="row"><span>${esc(t('teacher'))}</span><span>${esc(b.teacherName)}</span></div>
    <div class="row"><span>${esc(t('date'))}</span><span>${esc(dLong(b.date))}</span></div>
    <div class="row"><span>${esc(t('period'))}</span><span>${esc(b.period)} · ${esc(timeRange(b.startTime, b.endTime))}</span></div>
    <div class="row"><span>${esc(t('students'))}</span><span>${esc(b.students)} · ${esc(langLabel(b.classLanguage))}</span></div>
    ${libCol() ? `<div class="row"><span>${esc(t('library'))}</span><span>${esc(t(b.library))}</span></div>` : ''}
    ${b.notes ? `<div class="row"><span>${esc(t('notes'))}</span><span>${esc(b.notes)}</span></div>` : ''}
  </div>`;
}
const bookingActions = {
  async approve(b) {
    const note = await confirmDialog({ title: t('approveTitle'), message: bookingSummary(b), confirmLabel: t('approve'), cancelLabel: t('cancel'), input: { label: t('approveNote') + ' ' + t('optional'), multiline: true, max: 300 } });
    if (note === false) return;
    await act(() => api.call('booking.approve', { id: b.id, note }), t('approved'));
  },
  async reject(b) {
    const reason = await confirmDialog({ title: t('rejectTitle'), message: bookingSummary(b), confirmLabel: t('reject'), cancelLabel: t('cancel'), danger: true, input: { label: t('rejectReason'), multiline: true, max: 300, required: true, requiredMsg: t('reasonRequired') } });
    if (!reason) return;
    await act(() => api.call('booking.reject', { id: b.id, reason }), t('rejected'));
  },
  checkIn(b) {
    formSheet({
      title: t('checkInTitle'), sub: t('checkInSub'), extra: bookingSummary(b), submitLabel: t('checkIn'),
      fields: [
        { id: 'students', label: t('attendance'), type: 'number', value: b.students, min: 0, max: 200, inputmode: 'numeric' },
        { id: 'arrivedAt', label: t('arrivalTime'), type: 'time', value: nowHM() },
        { id: 'notes', label: t('notes'), type: 'textarea', value: b.notes, full: true, maxlength: 500, optional: true }
      ],
      onSubmit: async (v) => { await api.call('booking.checkIn', { id: b.id, ...v }); toast(t('checkedIn')); ctl.refresh(); }
    });
  },
  async noShow(b) {
    const ok = await confirmDialog({ title: t('noShowTitle'), message: esc(t('noShowBody')) + bookingSummary(b), confirmLabel: t('noShow'), cancelLabel: t('cancel'), danger: true });
    if (ok) await act(() => api.call('booking.noShow', { id: b.id }), t('markedNoShow'));
  }
};
function checkOutVisit(v, after) {
  formSheet({
    title: t('checkOut'), sub: `${v.gradeSection} · ${v.teacherName}`, submitLabel: t('checkOut'),
    fields: [{ id: 'leftAt', label: t('leavingTime'), type: 'time', value: nowHM() }],
    onSubmit: async (f) => { await api.call('visit.checkout', { id: v.id, leftAt: f.leftAt }); toast(t('checkedOut')); ctl.refresh(); after && after(); }
  });
}

/* ======================= Visits List ======================= */
const VisitsView = {
  range: ['today', 'week', 'upcoming'].includes(store.get('lib.visitsRange')) ? store.get('lib.visitsRange') : 'today',
  mount(el) { this.el = el; el.onclick = (e) => this.onClick(e); this.render(); },
  update() { this.render(); },
  rows() {
    const today = S.today;
    // "This week" = until Thursday of the current school week (Sun–Thu); on Friday/Saturday, the coming one.
    const wd = weekdayOf(today);
    const to = this.range === 'today' ? today : this.range === 'week' ? addDays(today, wd <= 4 ? 4 - wd : 11 - wd) : '9999-12-31';
    return S.d.upcoming.filter(b => matchLib(b) && b.date <= to &&
      (['pending', 'approved'].includes(b.status) || (b.date === today && ['completed', 'no_show'].includes(b.status))))
      .sort((a, b) => a.date.localeCompare(b.date) || a.period - b.period || a.library.localeCompare(b.library));
  },
  render() {
    const rows = this.rows();
    const inLib = S.d.visits.filter(v => v.status === 'in_library' && matchLib(v));
    const days = new Map();
    for (const b of rows) { if (!days.has(b.date)) days.set(b.date, []); days.get(b.date).push(b); }
    const seg = ['today', 'week', 'upcoming'].map(r => `<button type="button" data-range="${r}" class="${this.range === r ? 'on' : ''}">${esc(t(r === 'week' ? 'thisWeek' : r))}</button>`).join('');
    const head = `<tr><th>${esc(t('period'))}</th><th>${esc(t('time'))}</th><th>${esc(t('gradeSection'))}</th><th>${esc(t('studentsShort'))}</th><th>${esc(t('teacherName'))}</th><th>${esc(t('classLang'))}</th>${libCol() ? `<th>${esc(t('library'))}</th>` : ''}<th>${esc(t('notes'))}</th><th>${esc(t('status'))}</th><th></th></tr>`;
    const dayBlocks = [...days.entries()].map(([date, list]) => {
      const total = list.reduce((n, b) => n + (Number(b.students) || 0), 0);
      return `<div class="day-head"><b>${esc(dLong(date))}${date === S.today ? ` · ${esc(t('today'))}` : ''}</b><span class="muted">${esc(t('totalStudents', list.length, total))}</span></div>
        <div class="table-wrap"><table class="data"><thead>${head}</thead><tbody>${list.map(b => this.rowHtml(b)).join('')}</tbody></table></div>`;
    }).join('');
    this.el.innerHTML = `
      <div class="page-head"><div><h2>${esc(t('visitsTitle'))}</h2><p>${esc(t('visitsSub'))}</p></div>
        <div class="btn-row"><div class="seg">${seg}</div><button class="btn" type="button" data-act="print">🖨 ${esc(t('print'))}</button><button class="btn" type="button" data-act="csv">${esc(t('exportCsv'))}</button></div></div>
      ${inLib.length ? `<div class="section-title"><h3>${esc(t('inLibraryNow'))}</h3><span class="n">${inLib.length}</span></div>
        <div class="list">${inLib.map(v => `<div class="item highlight"><div class="main"><div class="title">${esc(v.gradeSection)} · ${esc(v.teacherName)}</div>
          <div class="meta">${esc(t('arrived'))} ${esc(v.arrivedAt || '—')} · ${esc(v.students)} ${esc(t('studentsShort'))}${libCol() ? ' · ' + esc(libShort(v.library)) : ''}${v.source === 'walkin' ? ` · <span class="chip">${esc(t('src_walkin'))}</span>` : ''}</div></div>
          <button class="btn primary sm" type="button" data-act="checkout" data-id="${esc(v.id)}">${esc(t('checkOut'))}</button></div>`).join('')}</div>` : ''}
      <div style="margin-top:16px">${dayBlocks || emptyHtml(t('noVisits'))}</div>`;
  },
  rowHtml(b) {
    const v = b.status === 'completed' ? visitFor(b) : null;
    const today = b.date === S.today;
    const btns = [];
    if (today && ['pending', 'approved'].includes(b.status)) {
      btns.push(`<button class="btn primary sm" type="button" data-act="checkin" data-id="${esc(b.id)}">${esc(t('checkIn'))}</button>`);
      btns.push(`<button class="btn sm" type="button" data-act="noshow" data-id="${esc(b.id)}">${esc(t('noShow'))}</button>`);
    }
    if (b.status === 'pending') {
      btns.push(`<button class="btn good sm" type="button" data-act="approve" data-id="${esc(b.id)}">${esc(t('approve'))}</button>`);
      btns.push(`<button class="btn danger sm" type="button" data-act="reject" data-id="${esc(b.id)}">${esc(t('reject'))}</button>`);
    }
    if (v && v.status === 'in_library') btns.push(`<button class="btn primary sm" type="button" data-act="checkout" data-id="${esc(v.id)}">${esc(t('checkOut'))}</button>`);
    const studentsCell = v ? `${esc(v.students)}<span class="sub">${esc(t('expected', b.students))}</span>` : esc(b.students);
    const statusCell = badge(b.status) + (v ? `<span class="sub">${esc(timeRange(v.arrivedAt, v.leftAt))}</span>` : '');
    return `<tr><td><b>${esc(b.period)}</b></td><td>${esc(timeRange(b.startTime, b.endTime))}</td><td><b>${esc(b.gradeSection)}</b></td><td>${studentsCell}</td>
      <td>${esc(b.teacherName)}</td><td>${esc(langLabel(b.classLanguage))}</td>${libCol() ? `<td>${esc(libShort(b.library))}</td>` : ''}
      <td class="small">${esc(b.notes)}</td><td>${statusCell}</td><td class="actions"><div class="btn-row" style="justify-content:flex-end">${btns.join('')}</div></td></tr>`;
  },
  onClick(e) {
    const r = e.target.closest('[data-range]');
    if (r) { this.range = r.dataset.range; store.set('lib.visitsRange', this.range); return this.render(); }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const id = a.dataset.id;
    const b = id ? S.d.upcoming.find(x => x.id === id) : null;
    switch (a.dataset.act) {
      case 'checkin': return b && bookingActions.checkIn(b);
      case 'noshow': return b && bookingActions.noShow(b);
      case 'approve': return b && bookingActions.approve(b);
      case 'reject': return b && bookingActions.reject(b);
      case 'checkout': { const v = S.d.visits.find(x => x.id === id); return v && checkOutVisit(v); }
      case 'print': return this.print();
      case 'csv': return this.csv();
      default: return undefined;
    }
  },
  printable() {
    return this.rows().map(b => {
      const v = b.status === 'completed' ? visitFor(b) : null;
      return { date: b.date, gradeSection: b.gradeSection, students: v ? v.students : b.students, teacherName: b.teacherName, classLanguage: b.classLanguage, status: b.status, arrivedAt: v?.arrivedAt, leftAt: v?.leftAt, notes: [`P${b.period} ${plainRange(b.startTime, b.endTime)}`, b.notes].filter(Boolean).join(' · ') };
    });
  },
  print() {
    const rows = this.printable();
    printHtml(visitsListHtml({ settings: S.d.settings, rows, from: S.today, to: rows.length ? rows[rows.length - 1].date : S.today, library: S.filter }));
  },
  csv() {
    downloadCsv(`visits-list-${S.today}.csv`, ['Day', 'Date', 'Period', 'Time', 'Library', 'Grade/Section', 'Students', 'Teacher', 'Arabic/English', 'Notes', 'Status'],
      this.rows().map(b => [new Date(b.date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }), b.date, b.period, plainRange(b.startTime, b.endTime), b.library, b.gradeSection, b.students, b.teacherName, b.classLanguage, b.notes, b.status]));
  }
};

/* ======================= Booking Requests ======================= */
const RequestsView = {
  mode: 'pending', q: null, items: null,
  mount(el) {
    this.el = el; el.onclick = (e) => this.onClick(e);
    if (!this.q) this.q = { from: addDays(S.today, -30), to: addDays(S.today, 90), status: 'all', text: '' };
    this.render();
    if (this.mode === 'history') this.search(true);
  },
  update() {
    if (this.mode === 'pending') return this.render();
    $('#reqBanner', this.el).innerHTML = periodBanner();
    $('#reqCount', this.el).textContent = S.d.pending.filter(matchLib).length || '';
  },
  render() {
    const pend = S.d.pending.filter(matchLib);
    this.el.innerHTML = `
      <div class="page-head"><div><h2>${esc(t('requestsTitle'))}</h2><p>${esc(t('requestsSub'))}</p></div>
        <div class="seg"><button type="button" data-mode="pending" class="${this.mode === 'pending' ? 'on' : ''}">${esc(t('pendingTab'))} <span id="reqCount">${pend.length || ''}</span></button><button type="button" data-mode="history" class="${this.mode === 'history' ? 'on' : ''}">${esc(t('historyTab'))}</button></div></div>
      <div id="reqBanner">${periodBanner()}</div>
      <div id="reqBody">${this.mode === 'pending' ? this.pendingHtml(pend) : this.historyHtml()}</div>`;
  },
  pendingHtml(pend) {
    if (!pend.length) return emptyHtml(t('noPending'));
    return `<div class="list">${pend.map(b => `<div class="item"><div class="main">
        <div class="title">${esc(b.gradeSection)} · ${esc(b.teacherName)}</div>
        <div class="meta"><b>${esc(dLong(b.date))}</b> · ${esc(t('period'))} ${esc(b.period)} (${esc(timeRange(b.startTime, b.endTime))}) · ${esc(b.students)} ${esc(t('studentsShort'))} · ${esc(langLabel(b.classLanguage))}${libCol() ? ' · ' + esc(t(b.library)) : ''}
        ${b.notes ? `<br>${esc(t('notes'))}: ${esc(b.notes)}` : ''}<br><span class="small">${esc(t('requestedOn', dt(b.createdAt)))}</span></div></div>
        <div class="btn-row"><button class="btn good" type="button" data-act="approve" data-id="${esc(b.id)}">✓ ${esc(t('approve'))}</button><button class="btn danger" type="button" data-act="reject" data-id="${esc(b.id)}">✕ ${esc(t('reject'))}</button></div></div>`).join('')}</div>`;
  },
  historyHtml() {
    const st = ['all', 'pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show'];
    return `<div class="toolbar">${toolbarDates(this.q)}
        <div class="fg"><label for="qStatus">${esc(t('status'))}</label><select id="qStatus">${st.map(s => `<option value="${s}"${this.q.status === s ? ' selected' : ''}>${esc(s === 'all' ? t('all') : t('st_' + s))}</option>`).join('')}</select></div>
        <div class="fg grow"><label for="qText">${esc(t('search'))}</label><input id="qText" value="${esc(this.q.text)}" placeholder="${esc(t('searchPh'))}" /></div>
        <button class="btn primary" type="button" data-act="search">${esc(t('search'))}</button><button class="btn" type="button" data-act="csv">${esc(t('exportCsv'))}</button></div>
      <div id="histRes">${this.items ? this.resultsHtml() : emptyHtml(t('loading'))}</div>`;
  },
  resultsHtml() {
    if (!this.items.length) return emptyHtml(t('nothingFound'));
    return `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('period'))}</th>${libCol() ? `<th>${esc(t('library'))}</th>` : ''}<th>${esc(t('gradeSection'))}</th><th>${esc(t('studentsShort'))}</th><th>${esc(t('teacher'))}</th><th>${esc(t('status'))}</th><th>${esc(t('decidedBy'))}</th></tr></thead><tbody>
      ${this.items.map(b => `<tr><td>${esc(dLabel(b.date))}</td><td>${esc(b.period)}<span class="sub">${esc(timeRange(b.startTime, b.endTime))}</span></td>${libCol() ? `<td>${esc(libShort(b.library))}</td>` : ''}
        <td><b>${esc(b.gradeSection)}</b></td><td>${esc(b.students)}</td><td>${esc(b.teacherName)}<span class="sub">${esc(t('requestedOn', dt(b.createdAt)))}</span></td><td>${badge(b.status)}</td>
        <td>${esc(b.decidedByName || '—')}${b.decisionNote ? `<span class="sub">${esc(b.decisionNote)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  },
  readQ() { readDates(this.el, this.q); this.q.status = $('#qStatus', this.el).value; this.q.text = $('#qText', this.el).value.trim(); },
  async search(silent) {
    if (!silent) this.readQ();
    try {
      const r = await api.call('bookings.search', { from: this.q.from, to: this.q.to, status: this.q.status, q: this.q.text, library: S.filter });
      this.items = r.items;
      const box = $('#histRes', this.el);
      if (box) box.innerHTML = this.resultsHtml();
    } catch (e) { toast(errorText(e, i18n), true); }
  },
  onClick(e) {
    const m = e.target.closest('[data-mode]');
    if (m) { this.mode = m.dataset.mode; this.render(); if (this.mode === 'history') this.search(true); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const b = a.dataset.id ? S.d.pending.find(x => x.id === a.dataset.id) : null;
    if (a.dataset.act === 'approve' && b) bookingActions.approve(b);
    else if (a.dataset.act === 'reject' && b) bookingActions.reject(b);
    else if (a.dataset.act === 'search') this.search(false);
    else if (a.dataset.act === 'csv' && this.items) {
      downloadCsv(`booking-requests-${this.q.from}-to-${this.q.to}.csv`, ['Date', 'Period', 'Start', 'End', 'Library', 'Grade/Section', 'Students', 'Arabic/English', 'Teacher', 'Notes', 'Status', 'Decided by', 'Decision note', 'Requested at'],
        this.items.map(b => [b.date, b.period, b.startTime, b.endTime, b.library, b.gradeSection, b.students, b.classLanguage, b.teacherName, b.notes, b.status, b.decidedByName || '', b.decisionNote, new Date(b.createdAt).toISOString()]));
    }
  }
};
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'qText') e.target.closest('main')?.querySelector('[data-act="search"]')?.click(); });

/* ======================= Permission Slips ======================= */
const slipShownStatus = (s) => (['sent', 'received'].includes(s.status) && s.date < S.today ? 'expired' : s.status);

const SlipsView = {
  mode: 'today', q: null, items: null,
  mount(el) {
    this.el = el; el.onclick = (e) => this.onClick(e);
    if (!this.q) this.q = { from: addDays(S.today, -7), to: S.today, status: 'all', text: '' };
    this.render();
    if (this.mode === 'history') this.search(true);
  },
  update() { if (this.mode === 'today') this.renderToday(); },
  render() {
    this.el.innerHTML = `
      <div class="page-head"><div><h2>${esc(t('slipsTitle'))}</h2><p>${esc(t('slipsSub'))}</p></div>
        <div class="seg"><button type="button" data-mode="today" class="${this.mode === 'today' ? 'on' : ''}">${esc(t('today'))}</button><button type="button" data-mode="history" class="${this.mode === 'history' ? 'on' : ''}">${esc(t('slipHistory'))}</button></div></div>
      <div id="slipBody"></div>`;
    if (this.mode === 'today') this.renderToday(); else this.renderHistory();
  },
  renderToday() {
    const box = $('#slipBody', this.el);
    if (!box) return;
    const typed = $('#codeIn', box)?.value || '';
    const mine = S.d.slips.filter(matchLib);
    const waiting = mine.filter(s => ['sent', 'received'].includes(s.status)).sort((a, b) => a.issuedAt - b.issuedAt);
    const inside = mine.filter(s => s.status === 'used' && !s.exitTime);
    const done = mine.filter(s => (s.status === 'used' && s.exitTime) || ['rejected', 'cancelled'].includes(s.status));
    box.innerHTML = `
      <div class="card"><div class="code-lookup">
        <div class="fg" style="margin:0"><label for="codeIn">${esc(t('codeLookup'))}</label><input id="codeIn" maxlength="4" autocomplete="off" placeholder="A7K3" value="${esc(typed)}" /></div>
        <button class="btn primary" type="button" data-act="find">${esc(t('find'))}</button></div></div>
      <div class="section-title"><h3>${esc(t('incoming'))}</h3><span class="n">${waiting.length}</span></div>
      ${waiting.length ? `<div class="list">${waiting.map(s => this.card(s, 'incoming')).join('')}</div>` : emptyHtml(t('noIncoming'))}
      <div class="section-title"><h3>${esc(t('inLibrary'))}</h3><span class="n">${inside.length}</span></div>
      ${inside.length ? `<div class="list">${inside.map(s => this.card(s, 'inside')).join('')}</div>` : emptyHtml(t('noneInLibrary'))}
      ${done.length ? `<div class="section-title"><h3>${esc(t('finishedToday'))}</h3><span class="n">${done.length}</span></div>${this.table(done)}` : ''}`;
    const ci = $('#codeIn', box);
    ci.onkeydown = (e) => { if (e.key === 'Enter') this.findCode(); };
  },
  card(s, kind) {
    const fresh = S.newIds.has(s.id);
    const btns = kind === 'incoming'
      ? `<button class="btn primary" type="button" data-act="verify" data-id="${esc(s.id)}">✓ ${esc(t('studentArrived'))}</button><button class="btn danger sm" type="button" data-act="sreject" data-id="${esc(s.id)}">${esc(t('doesntMatch'))}</button>`
      : `<button class="btn primary" type="button" data-act="sexit" data-id="${esc(s.id)}">${esc(t('recordExit'))}</button>`;
    return `<div class="slip-card${fresh ? ' new' : ''}"><div>
      <div class="who">${esc(s.studentName)} <span class="muted" style="font-weight:500;font-size:14px">· ${esc(s.grade)}</span> ${badge(s.status)}</div>
      <div class="det"><b>${esc(t('teacher'))}:</b> ${esc(s.teacherName)} · <b>${esc(t('reason'))}:</b> ${esc(reasonText(s))}${s.studentId ? ` · <b>${esc(t('studentId'))}:</b> ${esc(s.studentId)}` : ''}${libCol() ? ` · <b>${esc(libShort(s.library))}</b>` : ''}<br>
      ${esc(t('issuedBy', s.supervisorName, s.issuedTime))}${s.entranceTime ? ` · <b>${esc(t('entrance'))}:</b> ${esc(s.entranceTime)}` : ''}${s.notes ? `<br>${esc(t('notes'))}: ${esc(s.notes)}` : ''}</div></div>
      <div class="actions">${btns}<button class="btn sm" type="button" data-act="sprint" data-id="${esc(s.id)}">🖨 ${esc(t('printSlip'))}</button></div></div>`;
  },
  table(list) {
    return `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('name'))}</th><th>${esc(t('grade'))}</th><th>${esc(t('teacher'))}</th><th>${esc(t('reason'))}</th><th>${esc(t('supervisor'))}</th><th>${esc(t('entrance'))}–${esc(t('exit'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
      ${list.map(s => `<tr class="clickable" data-act="sdetail" data-id="${esc(s.id)}"><td>${esc(dLabel(s.date))}<span class="sub">${esc(s.issuedTime)}</span></td><td><b>${esc(s.studentName)}</b>${s.studentId ? `<span class="sub">${esc(s.studentId)}</span>` : ''}</td><td>${esc(s.grade)}</td><td>${esc(s.teacherName)}</td>
        <td class="small">${esc(reasonText(s))}</td><td>${esc(s.supervisorName)}</td><td>${esc(timeRange(s.entranceTime, s.exitTime))}</td><td>${badge(slipShownStatus(s))}${s.rejectReason ? `<span class="sub">${esc(s.rejectReason)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  },
  renderHistory() {
    const box = $('#slipBody', this.el);
    const st = ['all', 'sent', 'received', 'used', 'rejected', 'cancelled', 'expired'];
    box.innerHTML = `<div class="toolbar">${toolbarDates(this.q)}
        <div class="fg"><label for="qStatus">${esc(t('status'))}</label><select id="qStatus">${st.map(s => `<option value="${s}"${this.q.status === s ? ' selected' : ''}>${esc(s === 'all' ? t('all') : t('st_' + s))}</option>`).join('')}</select></div>
        <div class="fg grow"><label for="qText">${esc(t('search'))}</label><input id="qText" value="${esc(this.q.text)}" placeholder="${esc(t('searchPh'))}" /></div>
        <button class="btn primary" type="button" data-act="search">${esc(t('search'))}</button><button class="btn" type="button" data-act="csv">${esc(t('exportCsv'))}</button><button class="btn" type="button" data-act="printall">🖨 ${esc(t('print'))}</button></div>
      <div id="histRes">${this.items ? this.histResults() : emptyHtml(t('loading'))}</div>`;
  },
  histResults() { return this.items.length ? this.table(this.items) : emptyHtml(t('nothingFound')); },
  async search(silent) {
    if (!silent) { readDates(this.el, this.q); this.q.status = $('#qStatus', this.el).value; this.q.text = $('#qText', this.el).value.trim(); }
    try {
      const r = await api.call('slips.search', { from: this.q.from, to: this.q.to, status: this.q.status, q: this.q.text, library: S.filter });
      this.items = sortRows(r.items, '-date', '-issuedAt');
      const box = $('#histRes', this.el);
      if (box) box.innerHTML = this.histResults();
    } catch (e) { toast(errorText(e, i18n), true); }
  },
  find(id) { return S.d.slips.find(s => s.id === id) || this.items?.find(s => s.id === id) || null; },
  findCode() {
    const code = ($('#codeIn', this.el)?.value || '').trim().toUpperCase();
    if (!code) return;
    const s = S.d.slips.find(x => x.code === code);
    if (!s) return toast(t('codeNotFound'), true);
    $('#codeIn', this.el).value = '';
    if (['sent', 'received'].includes(s.status)) this.verify(s, code); else this.detail(s);
  },
  verify(s, knownCode = '') {
    const box = `<div class="verify-box"><div class="who">${esc(s.studentName)}</div><div class="grid">
      <span>${esc(t('grade'))}</span><span>${esc(s.grade)}</span>
      ${s.studentId ? `<span>${esc(t('studentId'))}</span><span>${esc(s.studentId)}</span>` : ''}
      <span>${esc(t('teacher'))}</span><span>${esc(s.teacherName)}</span>
      <span>${esc(t('reason'))}</span><span>${esc(reasonText(s))}</span>
      <span>${esc(t('library'))}</span><span>${esc(t(s.library))}</span>
      <span>${esc(t('supervisor'))}</span><span>${esc(t('signedBy', s.supervisorName, s.issuedTime))}</span>
      ${s.notes ? `<span>${esc(t('notes'))}</span><span>${esc(s.notes)}</span>` : ''}</div></div>`;
    formSheet({
      title: t('verifyTitle'), extra: box, submitLabel: t('admit'),
      fields: [
        { id: 'checked', type: 'check', label: t('verifyCheck'), value: !!knownCode },
        { id: 'code', label: t('verifyCode'), value: knownCode, maxlength: 4, cls: 'code-in', hint: t('verifyCodeHint'), optional: true },
        { id: 'entranceTime', label: t('entrance'), type: 'time', value: nowHM() }
      ],
      onSubmit: async (v) => {
        if (!v.checked) throw userError(t('checkRequired'));
        await api.call('slip.verify', { id: s.id, code: v.code.toUpperCase(), entranceTime: v.entranceTime });
        toast(t('admitted')); ctl.refresh();
      }
    });
  },
  async reject(s) {
    const reason = await confirmDialog({ title: t('slipRejectTitle'), message: `<b>${esc(s.studentName)}</b> · ${esc(s.grade)}`, confirmLabel: t('reject'), cancelLabel: t('cancel'), danger: true, input: { label: t('slipRejectReason'), max: 200, required: true, requiredMsg: t('reasonRequired') } });
    if (reason) await act(() => api.call('slip.reject', { id: s.id, reason }), t('slipRejected'));
  },
  exit(s) {
    formSheet({
      title: t('exitTitle'), sub: `${s.studentName} · ${s.grade}`, submitLabel: t('recordExit'),
      fields: [{ id: 'exitTime', label: t('exit'), type: 'time', value: nowHM() }],
      onSubmit: async (v) => { await api.call('slip.exit', { id: s.id, exitTime: v.exitTime }); toast(t('exitRecorded')); ctl.refresh(); }
    });
  },
  print(slips) { printHtml(slipHtml({ settings: S.d.settings, slips })); },
  detail(s) {
    const shown = slipShownStatus(s);
    const buttons = [{ id: 'print', label: '🖨 ' + t('printSlip'), onClick: () => this.print([s]) }];
    if (['sent', 'received'].includes(shown)) buttons.unshift({ id: 'verify', label: t('studentArrived'), cls: 'primary', onClick: (h) => { h.close(); this.verify(s); } });
    if (shown === 'used' && !s.exitTime) buttons.unshift({ id: 'exit', label: t('recordExit'), cls: 'primary', onClick: (h) => { h.close(); this.exit(s); } });
    if (isAdmin()) {
      buttons.push({ id: 'edit', label: t('edit'), onClick: (h) => { h.close(); this.adminEdit(s); } });
      buttons.push({ id: 'del', label: t('delete'), cls: 'danger', onClick: async (h) => {
        const ok = await confirmDialog({ title: t('delete') + '?', message: `${esc(s.studentName)} · ${esc(s.code)}<br>${esc(t('deleteForever'))}`, confirmLabel: t('delete'), cancelLabel: t('cancel'), danger: true });
        if (ok && await act(() => api.call('admin.slip.delete', { id: s.id }), t('deleted'))) { h.close(); if (this.mode === 'history') this.search(true); }
      } });
    }
    detailSheet({
      title: s.studentName, sub: badge(shown) + ` <span class="code">${esc(s.code)}</span>`, wide: true, buttons,
      rows: [
        [t('date'), dLong(s.date)], [t('grade'), s.grade], [t('studentId'), s.studentId], [t('teacherName'), s.teacherName], [t('library'), t(s.library)],
        [t('reason'), reasonText(s)], [t('notes'), s.notes], [t('signature'), t('signedBy', s.supervisorName, dt(s.signedAt))],
        [t('received'), s.receivedAt ? `${dt(s.receivedAt)} · ${s.receivedByName || ''}` : ''], [t('entrance'), s.entranceTime], [t('exit'), s.exitTime],
        [t('verifiedBy'), s.verifiedByName ? `${s.verifiedByName} · ${dt(s.verifiedAt)}` : ''],
        [t('slipRejectReason'), s.rejectReason ? `${s.rejectReason} (${s.rejectedByName || ''})` : '']
      ]
    });
  },
  adminEdit(s) {
    const st = ['sent', 'received', 'used', 'rejected', 'cancelled'];
    formSheet({
      title: `${t('edit')}: ${s.studentName}`, wide: true,
      fields: [
        { id: 'studentName', label: t('name'), value: s.studentName, maxlength: 80 }, { id: 'studentId', label: t('studentId'), value: s.studentId, maxlength: 30, optional: true },
        { id: 'grade', label: t('grade'), value: s.grade, maxlength: 40 }, { id: 'teacherName', label: t('teacherName'), value: s.teacherName, maxlength: 80 },
        { id: 'library', label: t('library'), type: 'select', value: s.library, options: libOptions() },
        { id: 'status', label: t('status'), type: 'select', value: s.status, options: st.map(x => ({ value: x, label: t('st_' + x) })) },
        { id: 'entranceTime', label: t('entrance'), type: 'time', value: s.entranceTime || '' }, { id: 'exitTime', label: t('exit'), type: 'time', value: s.exitTime || '' },
        { id: 'notes', label: t('notes'), type: 'textarea', value: s.notes, full: true, maxlength: 300 }
      ],
      onSubmit: async (v) => { await api.call('admin.slip.update', { id: s.id, ...v }); toast(t('saved')); ctl.refresh(); if (this.mode === 'history') this.search(true); }
    });
  },
  onClick(e) {
    const m = e.target.closest('[data-mode]');
    if (m) { this.mode = m.dataset.mode; this.render(); if (this.mode === 'history') this.search(true); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const s = a.dataset.id ? this.find(a.dataset.id) : null;
    switch (a.dataset.act) {
      case 'find': return this.findCode();
      case 'verify': return s && this.verify(s);
      case 'sreject': return s && this.reject(s);
      case 'sexit': return s && this.exit(s);
      case 'sprint': return s && this.print([s]);
      case 'sdetail': return s && this.detail(s);
      case 'search': return this.search(false);
      case 'printall': return this.items?.length && this.print(this.items);
      case 'csv': return this.items && downloadCsv(`permission-slips-${this.q.from}-to-${this.q.to}.csv`,
        ['Date', 'Issued', 'Code', 'Student', 'Student ID', 'Grade', 'Teacher', 'Library', 'Reason', 'Notes', 'Supervisor', 'Entrance', 'Exit', 'Status', 'Verified by', 'Reject reason'],
        this.items.map(x => [x.date, x.issuedTime, x.code, x.studentName, x.studentId, x.grade, x.teacherName, x.library, reasonText(x), x.notes, x.supervisorName, x.entranceTime || '', x.exitTime || '', slipShownStatus(x), x.verifiedByName || '', x.rejectReason]));
      default: return undefined;
    }
  }
};

/* ======================= Visits Log (FAC-P-02-R6) ======================= */
const LogView = {
  q: null, items: null, ver: null,
  mount(el) {
    this.el = el; el.onclick = (e) => this.onClick(e);
    if (!this.q) this.q = { from: addDays(S.today, -30), to: S.today, text: '' };
    el.innerHTML = `
      <div class="page-head"><div><h2>${esc(t('logTitle'))}</h2><p>${esc(t('logSub'))}</p></div>
        <div class="btn-row"><button class="btn primary" type="button" data-act="add">＋ ${esc(t('addClassVisit'))}</button></div></div>
      <div class="toolbar">${toolbarDates(this.q)}
        <div class="fg grow"><label for="qText">${esc(t('search'))}</label><input id="qText" value="${esc(this.q.text)}" placeholder="${esc(t('searchPh'))}" /></div>
        <button class="btn primary" type="button" data-act="search">${esc(t('search'))}</button>
        <button class="btn" type="button" data-act="print">🖨 ${esc(t('print'))}</button><button class="btn" type="button" data-act="csv">${esc(t('exportCsv'))}</button></div>
      <div id="logRes">${emptyHtml(t('loading'))}</div>`;
    this.search(true);
  },
  update() { if (S.d.versions?.visits !== this.ver && this.q.to >= S.today) this.search(true); },
  async search(silent) {
    if (!silent) { readDates(this.el, this.q); this.q.text = $('#qText', this.el).value.trim(); }
    try {
      this.ver = S.d.versions?.visits;
      const r = await api.call('visits.search', { from: this.q.from, to: this.q.to, q: this.q.text, library: S.filter });
      this.items = r.items;
      this.renderResults();
    } catch (e) { if (!silent) toast(errorText(e, i18n), true); else if (!this.items) $('#logRes', this.el).innerHTML = emptyHtml(errorText(e, i18n)); }
  },
  renderResults() {
    const box = $('#logRes', this.el);
    if (!box) return;
    const rows = sortRows(this.items, '-date', '-arrivedAt');
    if (!rows.length) { box.innerHTML = emptyHtml(t('nothingFound')); return; }
    const total = rows.reduce((n, v) => n + (Number(v.students) || 0), 0);
    box.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('day'))} / ${esc(t('date'))}</th><th>${esc(t('gradeSection'))}</th><th>${esc(t('students'))}</th><th>${esc(t('teacherName'))}</th><th>${esc(t('classLang'))}</th>${libCol() ? `<th>${esc(t('library'))}</th>` : ''}<th>${esc(t('arrived'))}–${esc(t('left'))}</th><th>${esc(t('status'))}</th><th>${esc(t('notes'))}</th><th></th></tr></thead><tbody>
      ${rows.map(v => `<tr><td>${esc(dLabel(v.date))}${v.period ? `<span class="sub">${esc(t('period'))} ${esc(v.period)}</span>` : ''}</td><td><b>${esc(v.gradeSection)}</b></td>
        <td>${esc(v.students)}${v.expectedStudents != null ? `<span class="sub">${esc(t('expected', v.expectedStudents))}</span>` : ''}</td><td>${esc(v.teacherName)}</td><td>${esc(langLabel(v.classLanguage))}</td>${libCol() ? `<td>${esc(libShort(v.library))}</td>` : ''}
        <td>${esc(timeRange(v.arrivedAt, v.leftAt))}</td><td>${badge(v.status)}<span class="sub">${esc(t('src_' + v.source))}</span></td><td class="small">${esc(v.notes)}</td>
        <td class="actions"><div class="btn-row" style="justify-content:flex-end">${v.status === 'in_library' ? `<button class="btn primary sm" type="button" data-act="checkout" data-id="${esc(v.id)}">${esc(t('checkOut'))}</button>` : ''}
          <button class="btn sm" type="button" data-act="edit" data-id="${esc(v.id)}">${esc(t('edit'))}</button>${isAdmin() ? `<button class="btn danger sm" type="button" data-act="del" data-id="${esc(v.id)}">${esc(t('delete'))}</button>` : ''}</div></td></tr>`).join('')}
      <tr class="total-row"><td colspan="2">${esc(t('total'))}</td><td colspan="${libCol() ? 8 : 7}">${esc(t('totalStudents', rows.length, total))}</td></tr></tbody></table></div>`;
  },
  form(v) {
    const fields = [
      { id: 'date', label: t('date'), type: 'date', value: v ? v.date : S.today, max: S.today },
      { id: 'library', label: t('library'), type: 'select', value: v ? v.library : defaultLib(), options: libOptions() },
      { id: 'gradeSection', label: t('gradeSection'), value: v?.gradeSection || '', maxlength: 40, placeholder: '7-B' },
      { id: 'students', label: t('students'), type: 'number', value: v ? v.students : '', min: 0, max: 200, inputmode: 'numeric' },
      { id: 'teacherName', label: t('teacherName'), value: v?.teacherName || '', maxlength: 80, full: true },
      { id: 'classLanguage', label: t('classLang'), type: 'choice', value: v?.classLanguage || 'english', options: langOptions(), full: true },
      { id: 'arrivedAt', label: t('arrivalTime'), type: 'time', value: v ? (v.arrivedAt || '') : nowHM() },
      { id: 'leftAt', label: t('leavingTime'), type: 'time', value: v?.leftAt || '', optional: true },
      ...(v ? [{ id: 'status', label: t('status'), type: 'select', value: v.status, options: ['in_library', 'completed', 'no_show'].map(x => ({ value: x, label: t('st_' + x) })) }]
        : [{ id: 'period', label: t('period'), type: 'select', value: '', options: periodOptions(true), optional: true }]),
      { id: 'notes', label: t('notes'), type: 'textarea', value: v?.notes || '', full: true, maxlength: 500, optional: true }
    ];
    formSheet({
      title: v ? `${t('edit')}: ${t('classVisitTitle')}` : t('addClassVisit'), wide: true, fields,
      onSubmit: async (f) => {
        if (f.period === '') delete f.period; else if (f.period) f.period = Number(f.period);
        store.set('lib.lastLib', f.library);
        await api.call(v ? 'visit.update' : 'visit.create', v ? { id: v.id, ...f } : f);
        toast(t('visitSaved')); ctl.refresh(); this.search(true);
      }
    });
  },
  onClick(e) {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const v = a.dataset.id ? this.items?.find(x => x.id === a.dataset.id) : null;
    switch (a.dataset.act) {
      case 'search': return this.search(false);
      case 'add': return this.form(null);
      case 'edit': return v && this.form(v);
      case 'checkout': return v && checkOutVisit(v, () => this.search(true));
      case 'del': return v && (async () => {
        const ok = await confirmDialog({ title: t('deleteVisitTitle'), message: `${esc(v.gradeSection)} · ${esc(v.teacherName)} · ${esc(dLabel(v.date))}<br>${esc(t('deleteForever'))}`, confirmLabel: t('delete'), cancelLabel: t('cancel'), danger: true });
        if (ok && await act(() => api.call('admin.visit.delete', { id: v.id }), t('deleted'))) this.search(true);
      })();
      case 'print': return this.items && printHtml(visitsListHtml({ settings: S.d.settings, rows: sortRows(this.items, 'date', 'arrivedAt'), from: this.q.from, to: this.q.to, library: S.filter }));
      case 'csv': return this.items && downloadCsv(`visits-log-${this.q.from}-to-${this.q.to}.csv`,
        ['Date', 'Period', 'Library', 'Grade/Section', 'Students', 'Expected', 'Teacher', 'Arabic/English', 'Arrived', 'Left', 'Status', 'Source', 'Notes', 'Recorded by'],
        sortRows(this.items, 'date', 'arrivedAt').map(x => [x.date, x.period || '', x.library, x.gradeSection, x.students, x.expectedStudents ?? '', x.teacherName, x.classLanguage, x.arrivedAt || '', x.leftAt || '', x.status, x.source, x.notes, x.recordedByName || '']));
      default: return undefined;
    }
  }
};

/* ======================= Visitors Log (FAC-P-02-R5) ======================= */
const VisitorsView = {
  q: null, items: null, ver: null,
  mount(el) {
    this.el = el; el.onclick = (e) => this.onClick(e);
    if (!this.q || this.q.auto) this.q = { from: S.today, to: S.today, text: '', auto: true };
    el.innerHTML = `
      <div class="page-head"><div><h2>${esc(t('visitorsTitle'))}</h2><p>${esc(t('visitorsSub'))}</p></div>
        <div class="btn-row"><button class="btn primary" type="button" data-act="add">＋ ${esc(t('addVisitor'))}</button></div></div>
      <div class="toolbar">${toolbarDates(this.q)}
        <div class="fg grow"><label for="qText">${esc(t('search'))}</label><input id="qText" value="${esc(this.q.text)}" placeholder="${esc(t('searchPh'))}" /></div>
        <button class="btn primary" type="button" data-act="search">${esc(t('search'))}</button>
        <button class="btn" type="button" data-act="print">🖨 ${esc(t('print'))}</button><button class="btn" type="button" data-act="csv">${esc(t('exportCsv'))}</button></div>
      <div id="visRes">${emptyHtml(t('loading'))}</div>`;
    this.search(true);
  },
  update() { if (S.d.versions?.visitors !== this.ver && this.q.to >= S.today) this.search(true); },
  async search(silent) {
    if (!silent) { readDates(this.el, this.q); this.q.text = $('#qText', this.el).value.trim(); this.q.auto = false; }
    try {
      this.ver = S.d.versions?.visitors;
      const r = await api.call('visitors.search', { from: this.q.from, to: this.q.to, q: this.q.text, library: S.filter });
      this.items = r.items;
      this.renderResults();
    } catch (e) { if (!silent) toast(errorText(e, i18n), true); else if (!this.items) $('#visRes', this.el).innerHTML = emptyHtml(errorText(e, i18n)); }
  },
  renderResults() {
    const box = $('#visRes', this.el);
    if (!box) return;
    if (!this.items.length) { box.innerHTML = emptyHtml(t('nothingFound')); return; }
    const days = new Map();
    for (const v of sortRows(this.items, '-date', 'createdAt')) { if (!days.has(v.date)) days.set(v.date, []); days.get(v.date).push(v); }
    box.innerHTML = [...days.entries()].map(([date, list]) => `
      <div class="day-head"><b>${esc(dLong(date))}</b><b>${esc(t('totalN', list.length))}</b></div>
      <div class="table-wrap"><table class="data"><thead><tr><th style="width:50px">${esc(t('no'))}</th><th>${esc(t('name'))}</th><th>${esc(t('className'))}</th><th>${esc(t('purpose'))}</th>${libCol() ? `<th>${esc(t('library'))}</th>` : ''}<th>${esc(t('entrance'))}</th><th>${esc(t('exit'))}</th><th></th></tr></thead><tbody>
      ${list.map((v, i) => `<tr><td>${i + 1}</td><td><b>${esc(v.name)}</b>${v.source === 'slip' ? `<span class="sub">📝 ${esc(t('src_slip'))} · ${esc(v.supervisorName)}</span>` : ''}</td><td>${esc(v.className)}</td><td>${esc(v.purpose)}${v.notes ? `<span class="sub">${esc(v.notes)}</span>` : ''}</td>${libCol() ? `<td>${esc(libShort(v.library))}</td>` : ''}
        <td>${esc(v.entranceTime || '—')}</td><td>${v.exitTime ? esc(v.exitTime) : (date === S.today ? `<button class="btn primary sm" type="button" data-act="exit" data-id="${esc(v.id)}">${esc(t('recordExit'))}</button>` : '—')}</td>
        <td class="actions"><div class="btn-row" style="justify-content:flex-end"><button class="btn sm" type="button" data-act="edit" data-id="${esc(v.id)}">${esc(t('edit'))}</button>${isAdmin() ? `<button class="btn danger sm" type="button" data-act="del" data-id="${esc(v.id)}">${esc(t('delete'))}</button>` : ''}</div></td></tr>`).join('')}
      </tbody></table></div>`).join('');
  },
  form(v) {
    const purposes = ['reading', 'borrow_return', 'research', 'study'].map(k => t('reason_' + k));
    const fields = [
      { id: 'name', label: t('name'), value: v?.name || '', maxlength: 80, full: true, autocomplete: 'off' },
      { id: 'className', label: t('className'), value: v?.className || '', maxlength: 40, placeholder: '8-A' },
      { id: 'library', label: t('library'), type: 'select', value: v ? v.library : defaultLib(), options: libOptions() },
      { id: 'purpose', label: t('purpose'), value: v?.purpose || '', maxlength: 200, list: purposes, full: true },
      { id: 'date', label: t('date'), type: 'date', value: v ? v.date : S.today, max: S.today },
      { id: 'entranceTime', label: t('entrance'), type: 'time', value: v ? (v.entranceTime || '') : nowHM() },
      { id: 'exitTime', label: t('exit'), type: 'time', value: v?.exitTime || '', optional: true },
      { id: 'notes', label: t('notes'), type: 'textarea', value: v?.notes || '', full: true, maxlength: 300, optional: true }
    ];
    formSheet({
      title: v ? `${t('edit')}: ${v.name}` : t('addVisitor'), wide: true, fields,
      onSubmit: async (f) => {
        store.set('lib.lastLib', f.library);
        await api.call(v ? 'visitor.update' : 'visitor.create', v ? { id: v.id, ...f } : f);
        toast(t('visitorSaved')); ctl.refresh(); this.search(true);
        if (!v) setTimeout(() => this.form(null), 250); // quick entry of the next visitor
      }
    });
  },
  onClick(e) {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const v = a.dataset.id ? this.items?.find(x => x.id === a.dataset.id) : null;
    switch (a.dataset.act) {
      case 'search': return this.search(false);
      case 'add': return this.form(null);
      case 'edit': return v && this.form(v);
      case 'exit': return v && formSheet({
        title: t('exitTitle'), sub: `${v.name} · ${v.className}`, submitLabel: t('recordExit'),
        fields: [{ id: 'exitTime', label: t('exit'), type: 'time', value: nowHM() }],
        onSubmit: async (f) => { await api.call('visitor.exit', { id: v.id, exitTime: f.exitTime }); toast(t('exitRecorded')); ctl.refresh(); this.search(true); }
      });
      case 'del': return v && (async () => {
        const ok = await confirmDialog({ title: t('deleteVisitorTitle'), message: `${esc(v.name)} · ${esc(v.className)} · ${esc(dLabel(v.date))}<br>${esc(t('deleteForever'))}`, confirmLabel: t('delete'), cancelLabel: t('cancel'), danger: true });
        if (ok && await act(() => api.call('admin.visitor.delete', { id: v.id }), t('deleted'))) this.search(true);
      })();
      case 'print': return this.items && printHtml(visitorsLogHtml({ settings: S.d.settings, rows: sortRows(this.items, 'date', 'createdAt'), from: this.q.from, to: this.q.to, library: S.filter }));
      case 'csv': return this.items && downloadCsv(`visitors-log-${this.q.from}-to-${this.q.to}.csv`,
        ['Date', 'No.', 'Name', 'Class', 'Purpose of visit', 'Library', 'Entrance', 'Exit', 'Source', 'Student ID', 'Supervisor', 'Notes'],
        (() => { const n = {}; return sortRows(this.items, 'date', 'createdAt').map(x => { n[x.date] = (n[x.date] || 0) + 1; return [x.date, n[x.date], x.name, x.className, x.purpose, x.library, x.entranceTime || '', x.exitTime || '', x.source, x.studentId, x.supervisorName, x.notes]; }); })());
      default: return undefined;
    }
  }
};

/* ======================= app shell ======================= */
const TABS = [
  { key: 'visits', label: 'tabVisits', view: VisitsView },
  { key: 'requests', label: 'tabRequests', view: RequestsView, count: () => S.d.pending.filter(matchLib).length },
  { key: 'slips', label: 'tabSlips', view: SlipsView, count: () => incoming().length },
  { key: 'log', label: 'tabLog', view: LogView },
  { key: 'visitors', label: 'tabVisitors', view: VisitorsView },
  { key: 'admin', label: 'tabAdmin', view: AdminView, admin: true, count: () => (S.d.attention || []).length }
];
let current = null;
const tabsFor = () => TABS.filter(x => !x.admin || isAdmin());

function renderTabs() {
  $('#tabs').innerHTML = tabsFor().map(tb => {
    const n = S.d && tb.count ? tb.count() : 0;
    return `<button class="tab${tb.key === S.tab ? ' active' : ''}" data-tab="${tb.key}" role="tab" type="button" aria-selected="${tb.key === S.tab}">${esc(t(tb.label))}${n ? `<span class="count">${n}</span>` : ''}</button>`;
  }).join('');
}
function showTab(key) {
  const tab = tabsFor().find(x => x.key === key) || TABS[0];
  S.tab = tab.key; store.set('lib.tab', tab.key);
  renderTabs();
  current = tab.view;
  const main = $('#main');
  main.onclick = null;
  if (!S.d) { main.innerHTML = emptyHtml(t('loading')); return; }
  current.mount(main);
}
ctl.goTab = showTab;

function setHeader() {
  if (!S.me) return;
  $('#headerSub').textContent = t('signedInAs', S.me.name) + (S.me.isAdmin ? ` · ${t('role_admin')}` : '');
}
function renderLibFilter() {
  const sel = $('#libFilter');
  sel.innerHTML = ['all', 'junior', 'senior'].map(v => `<option value="${v}"${S.filter === v ? ' selected' : ''}>${esc(v === 'all' ? t('allLibraries') : t(v))}</option>`).join('');
  sel.setAttribute('aria-label', t('library'));
}
function setSync(state) {
  if (!state) return;
  const dot = $('#syncDot');
  dot.className = 'sync-dot' + (state === 'busy' ? ' busy' : state === 'ok' ? '' : ' err');
  $('#syncLabel').textContent = t(state === 'busy' ? 'syncing' : state === 'ok' ? 'synced' : state === 'offline' ? 'offline' : 'syncError');
}

/* New permission slips: sound, toast, highlight, and tell the supervisor it was received. */
let audioCtx = null;
function chime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), s = t0 + i * 0.18;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.22, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.4);
      o.connect(g).connect(audioCtx.destination); o.start(s); o.stop(s + 0.45);
    });
  } catch { /* no audio */ }
}
let titleFlash = null;
function announceSlips(first) {
  if (!S.seenSlips) S.seenSlips = new Set();
  const sent = S.d.slips.filter(s => s.status === 'sent' && matchLib(s));
  const news = sent.filter(s => !S.seenSlips.has(s.id));
  S.d.slips.forEach(s => S.seenSlips.add(s.id));
  if (!first && news.length) {
    chime();
    toast(t('newSlip', news[0].studentName, news[0].grade));
    news.forEach(s => S.newIds.add(s.id));
    setTimeout(() => news.forEach(s => S.newIds.delete(s.id)), 20000);
    if (document.visibilityState === 'hidden') {
      if (!titleFlash) titleFlash = document.title;
      document.title = `● ${news.length} · ${t('appTitle')}`;
    }
  }
  if (sent.length && document.visibilityState === 'visible') api.call('slip.receive', { ids: sent.map(s => s.id) }).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (titleFlash) { document.title = titleFlash; titleFlash = null; } if (S.loaded) sync.refresh(); }
});

function tickCountdowns() {
  document.querySelectorAll('[data-until]').forEach(el => { el.textContent = t(el.dataset.key, fmtDuration(Number(el.dataset.until) - api.serverNow(), i18n)); });
}
setInterval(tickCountdowns, 30000);

function onSync(d) {
  S.today = d.today; S.nowTime = d.nowTime; S.tz = d.timeZone;
  if (!d.changed) { tickCountdowns(); return; }
  const first = !S.loaded;
  S.d = d; S.loaded = true;
  if (d.me) { S.me = d.me; setHeader(); }
  announceSlips(first);
  if (first || (S.tab === 'admin' && !isAdmin())) showTab(S.tab);
  else { renderTabs(); current?.update(); }
}

const sync = createSync(api, 'library.sync', {
  interval: 5000, hiddenInterval: 15000,
  onData: onSync,
  onState: (s) => setSync(s === 'busy' ? (S.loaded ? null : 'busy') : s),
  onError: (e) => { if (!S.loaded) $('#main').innerHTML = emptyHtml(errorText(e, i18n)); }
});
ctl.refresh = () => sync.refresh();

function startApp(me) {
  S.me = me; S.loaded = false; S.d = null; S.seenSlips = null;
  $('#loginView').style.display = 'none';
  $('#app').style.display = 'flex';
  setHeader(); renderLibFilter(); renderTabs();
  $('#main').innerHTML = emptyHtml(t('loading'));
  setSync('busy');
  sync.start();
}
function stopApp() {
  sync.stop();
  S.me = null; S.d = null; S.loaded = false; current = null;
  RequestsView.items = null; SlipsView.items = null; LogView.items = null; VisitorsView.items = null;
  RequestsView.q = SlipsView.q = LogView.q = VisitorsView.q = null;
  AdminView.reset?.();
  closeAllSheets();
  $('#app').style.display = 'none';
}

const auth = createAuth({
  root: $('#loginView'), api, i18n, allowSetup: true, iconSvg: LOGO,
  appName: () => t('appTitle'), appSub: () => t('loginSub'), roleName: () => t('roleName'),
  onReady: startApp, onSignedOut: stopApp
});
api.onSessionEnded = (err) => { stopApp(); auth.handleSessionEnded(err); };

/* static wiring */
initTheme($('#themeToggle'));
i18n.setLang(i18n.lang);
$('#appFoot').textContent = t('version', VERSION);
$('#langToggle').addEventListener('click', () => {
  i18n.setLang(i18n.lang === 'en' ? 'ar' : 'en');
  $('#appFoot').textContent = t('version', VERSION);
  auth.rerender();
  if (S.me) { setHeader(); renderLibFilter(); if (S.loaded) showTab(S.tab); else renderTabs(); }
});
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
$('#libFilter').addEventListener('change', (e) => { S.filter = e.target.value; store.set('lib.filter', S.filter); if (S.d) { S.seenSlips = null; announceSlips(true); } showTab(S.tab); });
$('#logoutBtn').addEventListener('click', () => auth.signOut());
$('#passwordBtn').addEventListener('click', () => auth.changePassword(S.me, { openSheet }));
// Keep the tab bar right under the (variable height) header while scrolling.
if ('ResizeObserver' in window) new ResizeObserver(([e]) => document.documentElement.style.setProperty('--hdr', Math.round(e.target.getBoundingClientRect().height) + 'px')).observe($('header.top'));
const conn = () => $('#connBanner').classList.toggle('show', !navigator.onLine);
window.addEventListener('online', conn); window.addEventListener('offline', conn); conn();

setupInstall(i18n, { appName: () => t('appTitle') });
setupAutoUpdate('/library/sw.js', '/library/');
auth.start();
