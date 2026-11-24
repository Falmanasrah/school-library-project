// Floor Supervisors App: issue digital permission slips that go straight to the
// Library Teachers App, and follow each slip (sent → received → used).
import {
  VERSION, createApi, createSync, createI18n, mergeDicts, COMMON_I18N, esc, $, store, errorText, toast, openSheet, confirmDialog,
  initTheme, printHtml, setupAutoUpdate, setupInstall, fmtDate, fmtTimeOf, closeAllSheets
} from '/shared/core.js';
import { createAuth, AUTH_I18N } from '/shared/auth.js';
import { slipHtml } from '/shared/forms.js';
import { startTour, tourOnce, mountMenu, setSignedIn } from '/shared/guide.js';

const SUP_I18N = {
  en: {
    appTitle: 'Floor Supervisors', loginSub: 'Digital permission slips for the library', roleName: 'floor supervisor',
    signedInAs: (n) => `Signed in as ${n}`, version: (v) => `Floor Supervisors App · version ${v} · updates automatically`,
    tabNew: 'New slip', tabMine: 'My slips',
    newTitle: "Student's permission slip to use the library", today: 'Today', dateDay: 'Date / Day',
    studentName: 'Student name', studentId: 'Student ID', grade: 'Grade / Class', teacherName: 'Teacher name', library: 'Library',
    reason: "Visit's reason", reasonOther: 'Write the reason', notes: 'Notes', optional: '(optional)', required: '(required)',
    reason_borrow_return: 'Borrow / return a book', reason_reading: 'Reading', reason_research: 'Research / project', reason_study: 'Study', reason_other: 'Other',
    authorize: 'I authorise this student to go to the library', signedBy: (n) => `Digital signature: ${n}`,
    send: 'Send slip to the library', sending: 'Sending…', signRequired: 'Tick the authorisation box to sign the slip.',
    fillRequired: 'Please fill in the student name, grade and teacher name.', chooseLibrary: 'Choose the library.', chooseReason: "Choose the visit's reason.",
    sentTitle: 'Slip sent to the library', sentHint: 'Give the student this code. The library teacher checks it when the student arrives.',
    newSlip: 'New slip', printSlip: 'Print slip', close: 'Close',
    mySlips: 'My permission slips', date: 'Date', showDate: 'Show', noSlips: 'No permission slips for this day.',
    st_sent: 'Sent', st_received: 'Received', st_used: 'Used', st_rejected: 'Rejected', st_cancelled: 'Cancelled', st_expired: 'Expired',
    stx_sent: 'Sent — waiting for the library to receive it', stx_received: (n, t) => `Received by the library${n ? ' (' + n + ')' : ''} at ${t} — waiting for the student`,
    stx_used: (a, b) => `Student entered the library at ${a}${b ? `, left at ${b}` : ' — still in the library'}`, stx_rejected: (r) => `Rejected by the library: ${r}`,
    stx_cancelled: 'Cancelled', stx_expired: 'Not used on the day it was issued',
    issued: (t) => `Issued at ${t}`, cancelSlip: 'Cancel slip', cancelTitle: 'Cancel this slip?', cancelBody: 'The library will no longer accept it.', cancelled: 'Slip cancelled',
    upd_received: (n) => `The library received the slip for ${n}`, upd_used: (n) => `${n} arrived at the library`, upd_rejected: (n) => `The library rejected the slip for ${n}`,
    err_SIGNATURE_REQUIRED: 'Tick the authorisation box to sign the slip.', err_NOT_CANCELLABLE: 'This slip can no longer be cancelled.', err_TRY_AGAIN: 'Please try again.'
  },
  ar: {
    appTitle: 'مشرفو الطوابق', loginSub: 'أذونات المكتبة الإلكترونية للطلبة', roleName: 'مشرف/ة طابق',
    signedInAs: (n) => `مسجّل الدخول باسم ${n}`, version: (v) => `تطبيق مشرفي الطوابق · الإصدار ${v} · يتم التحديث تلقائيًا`,
    tabNew: 'إذن جديد', tabMine: 'أذوناتي',
    newTitle: 'إذن استخدام المكتبة من قبل الطلبة', today: 'اليوم', dateDay: 'اليوم والتاريخ',
    studentName: 'اسم الطالب/ة', studentId: 'الرقم المدرسي للطالب/ة', grade: 'الصف / الشعبة', teacherName: 'اسم المعلم/ة', library: 'المكتبة',
    reason: 'سبب زيارة المكتبة', reasonOther: 'اكتب السبب', notes: 'ملاحظات', optional: '(اختياري)', required: '(مطلوب)',
    reason_borrow_return: 'استعارة / إرجاع كتاب', reason_reading: 'قراءة', reason_research: 'بحث / مشروع', reason_study: 'دراسة', reason_other: 'أخرى',
    authorize: 'أسمح لهذا الطالب/ة بالذهاب إلى المكتبة', signedBy: (n) => `التوقيع الإلكتروني: ${n}`,
    send: 'إرسال الإذن إلى المكتبة', sending: 'جارٍ الإرسال…', signRequired: 'حدد مربع السماح لتوقيع الإذن.',
    fillRequired: 'يرجى كتابة اسم الطالب/ة والصف واسم المعلم/ة.', chooseLibrary: 'اختر المكتبة.', chooseReason: 'اختر سبب الزيارة.',
    sentTitle: 'تم إرسال الإذن إلى المكتبة', sentHint: 'أعطِ الطالب/ة هذا الرمز. سيتحقق منه معلم/ة المكتبة عند وصوله إلى المكتبة.',
    newSlip: 'إذن جديد', printSlip: 'طباعة الإذن', close: 'إغلاق',
    mySlips: 'أذوناتي', date: 'التاريخ', showDate: 'عرض', noSlips: 'لا توجد أذونات في هذا اليوم.',
    st_sent: 'مُرسل', st_received: 'مُستلم', st_used: 'مُستخدم', st_rejected: 'مرفوض', st_cancelled: 'ملغى', st_expired: 'منتهي',
    stx_sent: 'مُرسل — بانتظار استلام المكتبة', stx_received: (n, t) => `استلمته المكتبة${n ? ' (' + n + ')' : ''} الساعة ${t} — بانتظار وصول الطالب`,
    stx_used: (a, b) => `دخل الطالب المكتبة الساعة ${a}${b ? `، وخرج الساعة ${b}` : ' — ما زال في المكتبة'}`, stx_rejected: (r) => `رفضته المكتبة: ${r}`,
    stx_cancelled: 'ملغى', stx_expired: 'لم يُستخدم في يوم إصداره',
    issued: (t) => `صدر الساعة ${t}`, cancelSlip: 'إلغاء الإذن', cancelTitle: 'إلغاء هذا الإذن؟', cancelBody: 'لن تقبله المكتبة بعد ذلك.', cancelled: 'تم إلغاء الإذن',
    upd_received: (n) => `استلمت المكتبة إذن ${n}`, upd_used: (n) => `وصل ${n} إلى المكتبة`, upd_rejected: (n) => `رفضت المكتبة إذن ${n}`,
    err_SIGNATURE_REQUIRED: 'حدد مربع السماح لتوقيع الإذن.', err_NOT_CANCELLABLE: 'لم يعد بالإمكان إلغاء هذا الإذن.', err_TRY_AGAIN: 'يرجى المحاولة مرة أخرى.'
  }
};

const i18n = createI18n(mergeDicts(COMMON_I18N, AUTH_I18N, SUP_I18N));
const t = (k, ...a) => i18n.t(k, ...a);
const LOGO = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#b36b00" stroke-width="1.6"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 11.5h5"/><path d="M9 16l2 2 4-4"/></svg>';
const REASONS = ['borrow_return', 'reading', 'research', 'study', 'other'];

const S = { me: null, d: null, loaded: false, tab: store.get('sup.tab') === 'mine' ? 'mine' : 'new', viewDate: null, known: new Map(), flash: new Set() };
const api = createApi('supervisors');

const reasonText = (s) => (s.reason === 'other' && s.reasonText ? s.reasonText : t('reason_' + s.reason));
const shownStatus = (s) => (['sent', 'received'].includes(s.status) && S.d && s.date < S.d.today ? 'expired' : s.status);
const badge = (st) => `<span class="status-badge st-${esc(st)}">${esc(t('st_' + st))}</span>`;
function stateText(s) {
  const st = shownStatus(s);
  if (st === 'received') return t('stx_received', s.receivedByName || '', fmtTimeOf(s.receivedAt, i18n, S.d?.timeZone));
  if (st === 'used') return t('stx_used', s.entranceTime || '', s.exitTime || '');
  if (st === 'rejected') return t('stx_rejected', s.rejectReason || '');
  return t('stx_' + st);
}
const recent = (key) => { try { return JSON.parse(store.get(key) || '[]'); } catch { return []; } };
function remember(key, val) { if (!val) return; store.set(key, JSON.stringify([val, ...recent(key).filter(x => x !== val)].slice(0, 12))); }

/* ======================= New slip ======================= */
const NewView = {
  mount(el) {
    const d = S.d, lastLib = store.get('sup.library');
    const reqId = !!d.settings.requireStudentId;
    el.innerHTML = `<div class="card slip-form"><h3 style="text-align:center">${esc(t('newTitle'))}</h3>
      <div class="today-line"><span>${esc(t('dateDay'))}: <b>${esc(fmtDate(d.today, i18n, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</b></span><span>${esc(S.me.name)}</span></div>
      <form id="slipForm" novalidate autocomplete="off">
        <div class="fg"><label for="sName">${esc(t('studentName'))}</label><input id="sName" maxlength="80" autocomplete="off" /></div>
        <div class="two-col">
          <div class="fg"><label for="sGrade">${esc(t('grade'))}</label><input id="sGrade" maxlength="40" list="gradeList" placeholder="8-B" /><datalist id="gradeList">${recent('sup.grades').map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist></div>
          <div class="fg"><label for="sId">${esc(t('studentId'))} <span class="muted" style="font-weight:500">${esc(reqId ? t('required') : t('optional'))}</span></label><input id="sId" maxlength="30" inputmode="text" /></div>
        </div>
        <div class="fg"><label for="sTeacher">${esc(t('teacherName'))}</label><input id="sTeacher" maxlength="80" list="teacherList" /><datalist id="teacherList">${recent('sup.teachers').map(g => `<option value="${esc(g)}"></option>`).join('')}</datalist></div>
        <div class="fg"><label>${esc(t('library'))}</label><div class="choice-row">
          <label><input type="radio" name="sLib" value="junior"${lastLib === 'junior' ? ' checked' : ''} /> ${esc(t('junior'))}</label>
          <label><input type="radio" name="sLib" value="senior"${lastLib === 'senior' ? ' checked' : ''} /> ${esc(t('senior'))}</label></div></div>
        <div class="fg"><label>${esc(t('reason'))}</label><div class="reason-row">${REASONS.map(r => `<label><input type="radio" name="sReason" value="${r}" /> ${esc(t('reason_' + r))}</label>`).join('')}</div></div>
        <div class="fg" id="otherWrap" style="display:none"><label for="sOther">${esc(t('reasonOther'))}</label><input id="sOther" maxlength="120" /></div>
        <div class="fg"><label for="sNotes">${esc(t('notes'))} <span class="muted" style="font-weight:500">${esc(t('optional'))}</span></label><textarea id="sNotes" rows="2" maxlength="300"></textarea></div>
        <div class="sign-box"><label class="check-row"><input type="checkbox" id="sAuth" /> <span>${esc(t('authorize'))}</span></label><div class="who">${esc(t('signedBy', S.me.name))}</div></div>
        <p class="field-err" id="sErr"></p>
        <button class="send-btn" id="sSend" type="submit">${esc(t('send'))}</button>
      </form></div>`;
    const f = $('#slipForm', el);
    f.addEventListener('change', () => { $('#otherWrap', f).style.display = f.querySelector('input[name="sReason"]:checked')?.value === 'other' ? '' : 'none'; });
    f.onsubmit = (e) => { e.preventDefault(); this.send(f); };
  },
  update() { /* the form keeps what is being typed */ },
  async send(f) {
    const err = $('#sErr', f), btn = $('#sSend', f);
    const fail = (m) => { err.textContent = m; err.style.display = 'block'; };
    err.style.display = 'none';
    const data = {
      studentName: $('#sName', f).value.trim(), studentId: $('#sId', f).value.trim(), grade: $('#sGrade', f).value.trim(), teacherName: $('#sTeacher', f).value.trim(),
      library: f.querySelector('input[name="sLib"]:checked')?.value, reason: f.querySelector('input[name="sReason"]:checked')?.value,
      reasonText: $('#sOther', f).value.trim(), notes: $('#sNotes', f).value.trim(), authorize: $('#sAuth', f).checked
    };
    if (!data.studentName || !data.grade || !data.teacherName || (S.d.settings.requireStudentId && !data.studentId)) return fail(t('fillRequired'));
    if (!data.library) return fail(t('chooseLibrary'));
    if (!data.reason || (data.reason === 'other' && !data.reasonText)) return fail(t('chooseReason'));
    if (!data.authorize) return fail(t('signRequired'));
    btn.disabled = true; btn.textContent = t('sending');
    try {
      const { slip } = await api.call('slip.create', data);
      store.set('sup.library', data.library); remember('sup.grades', data.grade); remember('sup.teachers', data.teacherName);
      S.known.set(slip.id, slip.status);
      sync.refresh();
      this.mount($('#main'));
      showSent(slip);
    } catch (e) {
      fail(e.code === 'INVALID_INPUT' && i18n.lang === 'en' ? e.message : errorText(e, i18n));
      btn.disabled = false; btn.textContent = t('send');
    }
  }
};

function showSent(slip) {
  const h = openSheet(`<div class="sent-box"><h2>✓ ${esc(t('sentTitle'))}</h2>
      <div class="who">${esc(slip.studentName)} · ${esc(slip.grade)}</div>
      <div class="muted small">${esc(t(slip.library))} · ${esc(reasonText(slip))}</div>
      <div class="code big">${esc(slip.code)}</div>
      <div class="hint">${esc(t('sentHint'))}</div></div>
    <div class="sheet-btns"><button class="cancel" type="button" id="sPrint">${esc(t('printSlip'))}</button><button class="confirm" type="button" id="sNew">${esc(t('newSlip'))}</button></div>`);
  $('#sPrint', h.el).onclick = () => printHtml(slipHtml({ settings: S.d.settings, slips: [slip] }));
  $('#sNew', h.el).onclick = () => { h.close(); setTimeout(() => $('#sName')?.focus(), 250); };
}

/* ======================= My slips ======================= */
const MineView = {
  mount(el) {
    this.el = el;
    el.innerHTML = `<div class="page-head"><div><h2>${esc(t('mySlips'))}</h2></div></div>
      <div class="date-bar"><div class="fg"><label for="mDate">${esc(t('date'))}</label><input type="date" id="mDate" value="${esc(S.viewDate || S.d.today)}" max="${esc(S.d.today)}" /></div>
        <button class="btn" type="button" id="mToday">${esc(t('today'))}</button></div>
      <div id="mineList"></div>`;
    $('#mDate', el).onchange = (e) => { S.viewDate = e.target.value && e.target.value !== S.d.today ? e.target.value : null; $('#mineList', el).innerHTML = `<div class="empty">${esc(t('a_loading'))}</div>`; sync.refresh(); };
    $('#mToday', el).onclick = () => { S.viewDate = null; $('#mDate', el).value = S.d.today; sync.refresh(); };
    el.onclick = (e) => this.onClick(e);
    this.update();
  },
  update() {
    const box = $('#mineList', this.el);
    if (!box) return;
    const list = S.d.slips;
    box.innerHTML = list.length ? `<div class="list">${list.map(s => {
      const st = shownStatus(s);
      return `<div class="slip-row${S.flash.has(s.id) ? ' flash' : ''}"><div class="main">
        <div class="title">${esc(s.studentName)} <span class="muted" style="font-weight:500">· ${esc(s.grade)}</span></div>
        <div class="meta">${esc(t(s.library))} · ${esc(reasonText(s))} · ${esc(t('teacherName'))}: ${esc(s.teacherName)}${s.studentId ? ` · ${esc(s.studentId)}` : ''}<br>${esc(t('issued', s.issuedTime))}</div>
        <div class="state">${esc(stateText(s))}</div></div>
        <div class="side">${badge(st)}<span class="code">${esc(s.code)}</span>
          <div class="btn-row">${['sent', 'received'].includes(st) ? `<button class="btn sm danger" type="button" data-act="cancel" data-id="${esc(s.id)}">${esc(t('cancelSlip'))}</button>` : ''}<button class="btn sm" type="button" data-act="print" data-id="${esc(s.id)}">${esc(t('printSlip'))}</button></div></div></div>`;
    }).join('')}</div>` : `<div class="empty">${esc(t('noSlips'))}</div>`;
  },
  async onClick(e) {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const s = S.d.slips.find(x => x.id === a.dataset.id);
    if (!s) return;
    if (a.dataset.act === 'print') return printHtml(slipHtml({ settings: S.d.settings, slips: [s] }));
    if (a.dataset.act === 'cancel') {
      const ok = await confirmDialog({ title: t('cancelTitle'), message: `<b>${esc(s.studentName)}</b> · ${esc(s.grade)}<br>${esc(t('cancelBody'))}`, confirmLabel: t('cancelSlip'), cancelLabel: t('close'), danger: true });
      if (!ok) return;
      try { await api.call('slip.cancel', { id: s.id }); toast(t('cancelled')); sync.refresh(); }
      catch (err) { toast(errorText(err, i18n), true); }
    }
  }
};

/* ======================= shell ======================= */
const TABS = [{ key: 'new', label: 'tabNew', view: NewView }, { key: 'mine', label: 'tabMine', view: MineView }];
let current = null;
function renderTabs() {
  const active = S.d ? S.d.slips.filter(s => ['sent', 'received'].includes(s.status)).length : 0;
  $('#tabs').innerHTML = TABS.map(x => `<button class="tab${x.key === S.tab ? ' active' : ''}" type="button" data-tab="${x.key}" role="tab">${esc(t(x.label))}${x.key === 'mine' && active && !S.viewDate ? `<span class="count soft">${active}</span>` : ''}</button>`).join('');
}
function showTab(key) {
  S.tab = key === 'mine' ? 'mine' : 'new'; store.set('sup.tab', S.tab);
  renderTabs();
  current = TABS.find(x => x.key === S.tab).view;
  const main = $('#main'); main.onclick = null;
  if (!S.d) { main.innerHTML = `<div class="empty">${esc(t('a_loading'))}</div>`; return; }
  current.mount(main);
}

function notifyChanges(first) {
  if (S.viewDate) return;
  for (const s of S.d.slips) {
    const before = S.known.get(s.id);
    S.known.set(s.id, s.status);
    if (first || !before || before === s.status) continue;
    if (['received', 'used', 'rejected'].includes(s.status)) {
      toast(t('upd_' + s.status, s.studentName), s.status === 'rejected');
      S.flash.add(s.id); setTimeout(() => { S.flash.delete(s.id); if (current === MineView) MineView.update(); }, 6000);
    }
  }
}

function onSync(d) {
  if (!d.changed) return;
  const first = !S.loaded;
  S.d = d;
  S.loaded = true;
  if (d.me) { S.me = d.me; $('#headerSub').textContent = t('signedInAs', d.me.name); }
  notifyChanges(first);
  renderTabs();
  if (first) showTab(S.tab); else current?.update();
}
function setSync(state) {
  if (!state) return;
  $('#syncDot').className = 'sync-dot' + (state === 'busy' ? ' busy' : state === 'ok' ? '' : ' err');
  $('#syncLabel').textContent = t(state === 'busy' ? 'syncing' : state === 'ok' ? 'synced' : state === 'offline' ? 'offline' : 'syncError');
}
const sync = createSync(api, 'supervisor.sync', {
  interval: 5000, hiddenInterval: 30000,
  params: () => (S.viewDate ? { date: S.viewDate } : {}),
  onData: onSync,
  onState: (s) => setSync(s === 'busy' ? (S.loaded ? null : 'busy') : s),
  onError: (e) => { if (!S.loaded) $('#main').innerHTML = `<div class="empty">${esc(errorText(e, i18n))}</div>`; }
});

function runTour() {
  const back = S.tab;
  const tab = (k) => () => document.querySelector(`#tabs [data-tab="${k}"]`);
  startTour([
    { before: () => showTab('new'), el: tab('new'), title: ['New slip', 'إذن جديد'], text: ['Fill in a permission slip here when a student needs to go to the library.', 'من هون بتعبّي إذن لما يحتاج طالب يروح على المكتبة.'] },
    { el: '#sName', title: ['Student name', 'اسم الطالب/ة'], text: ["Type the student's name, then the grade and the teacher's name below it.", 'اكتب اسم الطالب، وبعدين الصف واسم المعلم/ة تحته.'] },
    { el: () => document.querySelector('input[name="sLib"]')?.closest('.choice-row'), title: ['Which library', 'أي مكتبة'], text: ['Choose the library the student is going to.', 'اختار المكتبة اللي رايح عليها الطالب.'] },
    { el: '.reason-row', title: ["Visit's reason", 'سبب الزيارة'], text: ['Pick why the student is going. Choose Other to write your own reason.', 'اختار ليش رايح الطالب. اختار «أخرى» إذا بدك تكتب السبب بنفسك.'] },
    { el: '.sign-box', title: ['Sign the slip', 'وقّع الإذن'], text: ['Tick this box. It is your signature on the slip.', 'علّم على هذا المربع، هذا هو توقيعك على الإذن.'] },
    { el: '#sSend', title: ['Send', 'إرسال'], text: ['The slip reaches the library at once. Give the student the 4-character code that appears.', 'الإذن بوصل المكتبة فورًا. أعطِ الطالب الرمز (4 خانات) اللي بطلعلك.'] },
    { el: tab('mine'), title: ['My slips', 'أذوناتي'], text: ['Follow each slip: received by the library, student arrived, or rejected. You can print or cancel a slip here.', 'تابع كل إذن: استلمته المكتبة، وصل الطالب، أو انرفض. ومن هون بتقدر تطبع الإذن أو تلغيه.'] },
    { el: '#menuBtn', title: ['Menu', 'القائمة'], text: ['Language, dark mode, your password, sign out, and this tutorial again are all here.', 'اللغة، الوضع الداكن، كلمة المرور، تسجيل الخروج، وهذا الشرح مرة ثانية، كلهم هون.'] }
  ], { onEnd: () => showTab(back) });
}

function startApp(me) {
  setSignedIn(true);
  mountMenu({ onTutorial: runTour });
  tourOnce('supervisors', () => setTimeout(runTour, S.loaded ? 0 : 1500));
  S.me = me; S.d = null; S.loaded = false; S.viewDate = null; S.known = new Map();
  $('#loginView').style.display = 'none';
  $('#app').style.display = 'flex';
  $('#headerSub').textContent = t('signedInAs', me.name);
  renderTabs();
  $('#main').innerHTML = `<div class="empty">${esc(t('a_loading'))}</div>`;
  setSync('busy');
  sync.start();
}
function stopApp() { setSignedIn(false); sync.stop(); S.me = null; S.d = null; S.loaded = false; current = null; closeAllSheets(); $('#app').style.display = 'none'; }

const auth = createAuth({
  root: $('#loginView'), api, i18n, iconSvg: LOGO,
  appName: () => t('appTitle'), appSub: () => t('loginSub'), roleName: () => t('roleName'),
  onReady: startApp, onSignedOut: stopApp
});
api.onSessionEnded = (err) => { stopApp(); auth.handleSessionEnded(err); };

initTheme($('#themeToggle'));
i18n.setLang(i18n.lang);
$('#appFoot').textContent = t('version', VERSION);
$('#langToggle').addEventListener('click', () => {
  i18n.setLang(i18n.lang === 'en' ? 'ar' : 'en');
  $('#appFoot').textContent = t('version', VERSION);
  auth.rerender();
  if (S.me) { $('#headerSub').textContent = t('signedInAs', S.me.name); if (S.loaded) showTab(S.tab); else renderTabs(); }
});
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
$('#logoutBtn').addEventListener('click', () => auth.signOut());
$('#passwordBtn').addEventListener('click', () => auth.changePassword(S.me, { openSheet }));
if ('ResizeObserver' in window) new ResizeObserver(([e]) => document.documentElement.style.setProperty('--hdr', Math.round(e.target.getBoundingClientRect().height) + 'px')).observe($('header.top'));
const conn = () => $('#connBanner').classList.toggle('show', !navigator.onLine);
window.addEventListener('online', conn); window.addEventListener('offline', conn); conn();

setupInstall(i18n, { appName: () => t('appTitle') });
setupAutoUpdate('/supervisors/sw.js', '/supervisors/');
auth.start();

