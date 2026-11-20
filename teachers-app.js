/* =========================================================
   TEACHERS APP — library booking for teachers.
   Same timetable and booking flow as before, now with real accounts,
   approval by the library teachers and the 7-day booking period.
   All data goes through the shared, secure school library API.
   ========================================================= */
import { VERSION, createApi, createSync, createI18n, mergeDicts, COMMON_I18N, esc, errorText, confirmDialog, openSheet, fmtDuration, store, setupAutoUpdate } from './shared/core.js';
import { createAuth, AUTH_I18N } from './shared/auth.js';

/* =========================================================
   TRANSLATIONS
   ========================================================= */
const APP_I18N = {
  en: {
    loginTitle: 'Library booking',
    loginSub: 'Teachers — sign in with your staff account',
    roleName: 'teacher',
    headerSub: 'Shared calendar — every teacher sees the same bookings',
    connBanner: "No internet connection — bookings can't sync right now",
    synced: 'Synced',
    syncing: 'Syncing…',
    offline: 'Offline',
    signOut: 'Sign out',
    juniorLib: 'Junior library',
    juniorLibSub: 'Below grade 7',
    seniorLib: 'Senior library',
    seniorLibSub: 'Grade 7 and up',
    thisWeek: 'This week',
    nextWeek: 'Next week',
    weekAhead: (n) => `${n} week${n > 1 ? 's' : ''} ahead`,
    loadingBookings: 'Loading bookings…',
    legendOpen: 'Open',
    legendMine: 'Your booking',
    legendPending: 'Waiting for approval',
    legendBooked: 'Booked',
    legendPast: 'Past',
    legendBreak: 'Break',
    yourBookings: 'Your bookings',
    noBookings: 'No bookings yet in this library.',
    footNote: 'Bookings remain on the schedule for the week so all teachers can see who reserved each slot.',
    breakLabel: 'Break',
    you: 'You',
    bookPeriod: (p) => `Book period ${p}`,
    arrivingAt: 'Arriving at',
    leavingAt: 'Leaving at',
    gradeSection: 'Grade / Section',
    gradeSectionPh: 'e.g. 5B',
    studentsCount: 'Number of students',
    classLang: 'Arabic / English class',
    notesOptional: 'Notes (optional)',
    notesPh: 'e.g. research for science project',
    timeErr: 'Enter both times, with leaving after arriving',
    classErr: 'Enter the grade / section and the number of students',
    pastSlotErr: 'Cannot book a time slot in the past',
    pastTimeErr: 'The chosen time has already passed today',
    cancel: 'Cancel',
    continueBtn: 'Continue',
    confirmBooking: 'Confirm booking request',
    confirmSub: 'Your request goes to the library teachers for approval. Other teachers will see the slot as reserved.',
    library: 'Library',
    date: 'Date',
    period: 'Period',
    arriving: 'Arriving',
    leaving: 'Leaving',
    bookedBy: 'Booked by',
    goBack: 'Go back',
    yesBookIt: 'Yes, send request',
    booking: 'Sending…',
    arrivesLeaves: (a, l) => `Arrives ${a} · Leaves ${l}`,
    periodClassLine: (p, cls, n, lang) => `Period ${p} · ${cls} · ${n} students · ${lang} class`,
    remove: 'Cancel',
    cancelBookingTitle: 'Cancel this booking?',
    cancelBookingBody: 'The slot will become free for other teachers.',
    keepIt: 'Keep it',
    yesCancel: 'Yes, cancel',
    needInternet: 'You need an internet connection to book',
    ghReadErr: 'Could not connect. Check your internet connection.',
    clashErr: 'Someone just booked this slot',
    requestSent: 'Request sent — waiting for approval',
    bookingRemoved: 'Booking cancelled',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
    dateLocale: 'en-US',
    st_pending: 'Waiting for approval', st_approved: 'Approved', st_rejected: 'Rejected', st_cancelled: 'Cancelled', st_completed: 'Visited', st_no_show: 'Did not attend',
    decidedBy: (n) => `by ${n}`,
    pbOpen: (left, end) => `<b>Booking is open.</b> Requests close in ${left} (${end}).`,
    pbOpenRange: (a, b) => `Dates you can book: ${a} – ${b}.`,
    pbScheduled: (start) => `<b>Booking is closed.</b> The next booking period opens ${start}.`,
    pbClosed: '<b>Booking is closed.</b> The library administrator will open the next 7-day booking period.',
    closedSlotErr: 'Booking is closed right now. You can book when the next booking period opens.',
    outsideRangeErr: (a, b) => `This booking period only accepts dates from ${a} to ${b}.`,
    err_BOOKING_CLOSED: 'The booking period is closed. You can submit requests when the next period opens.',
    err_OUTSIDE_BOOKING_RANGE: 'That date is outside the dates of this booking period.',
    err_SLOT_TAKEN: 'Someone just booked this slot',
    err_PAST_SLOT: 'That time has already passed.',
    err_NOT_SCHOOL_DAY: 'Bookings are only possible Sunday to Thursday.',
    err_BOOKING_LIMIT: 'You have reached the maximum number of upcoming bookings.',
    err_NOT_CANCELLABLE: 'This booking can no longer be cancelled.',
    changePassword: 'Username and password',
    version: (v) => `Version ${v} · updates automatically`
  },
  ar: {
    loginTitle: 'حجز المكتبة',
    loginSub: 'المعلمون — سجّل الدخول بحساب الموظف الخاص بك',
    roleName: 'معلم',
    headerSub: 'تقويم مشترك — يراه جميع المعلمين',
    connBanner: 'لا يوجد اتصال بالإنترنت — لا يمكن مزامنة الحجوزات الآن',
    synced: 'تمت المزامنة',
    syncing: 'جارٍ المزامنة…',
    offline: 'غير متصل',
    signOut: 'تسجيل الخروج',
    juniorLib: 'المكتبة الابتدائية',
    juniorLibSub: 'أقل من الصف السابع',
    seniorLib: 'مكتبة المرحلة المتوسطة والثانوية',
    seniorLibSub: 'الصف السابع فما فوق',
    thisWeek: 'هذا الأسبوع',
    nextWeek: 'الأسبوع القادم',
    weekAhead: (n) => `بعد ${n} ${n === 1 ? 'أسبوع' : 'أسابيع'}`,
    loadingBookings: 'جارٍ تحميل الحجوزات…',
    legendOpen: 'متاح',
    legendMine: 'حجزك',
    legendPending: 'بانتظار الموافقة',
    legendBooked: 'محجوز',
    legendPast: 'مضى',
    legendBreak: 'استراحة',
    yourBookings: 'حجوزاتك',
    noBookings: 'لا توجد حجوزات بعد في هذه المكتبة.',
    footNote: 'تبقى الحجوزات ظاهرة في الجدول طوال الأسبوع ليعرف جميع المعلمين مواعيد الحجز السابقة والقادمة.',
    breakLabel: 'استراحة',
    you: 'أنت',
    bookPeriod: (p) => `حجز الحصة ${p}`,
    arrivingAt: 'وقت الوصول',
    leavingAt: 'وقت المغادرة',
    gradeSection: 'الصف / الشعبة',
    gradeSectionPh: 'مثال: 5B',
    studentsCount: 'عدد الطلاب',
    classLang: 'حصة عربي / إنجليزي',
    notesOptional: 'ملاحظات (اختياري)',
    notesPh: 'مثال: بحث لمشروع العلوم',
    timeErr: 'أدخل الوقتين، على أن يكون وقت المغادرة بعد وقت الوصول',
    classErr: 'أدخل الصف / الشعبة وعدد الطلاب',
    pastSlotErr: 'لا يمكن حجز موعد في وقت مضى',
    pastTimeErr: 'الوقت المحدد قد مضى اليوم',
    cancel: 'إلغاء',
    continueBtn: 'متابعة',
    confirmBooking: 'تأكيد طلب الحجز',
    confirmSub: 'سيُرسل طلبك إلى معلمي المكتبة للموافقة. سيرى بقية المعلمين الموعد محجوزًا.',
    library: 'المكتبة',
    date: 'التاريخ',
    period: 'الحصة',
    arriving: 'الوصول',
    leaving: 'المغادرة',
    bookedBy: 'حجزه',
    goBack: 'رجوع',
    yesBookIt: 'نعم، أرسل الطلب',
    booking: 'جارٍ الإرسال…',
    arrivesLeaves: (a, l) => `الوصول ${a} · المغادرة ${l}`,
    periodClassLine: (p, cls, n, lang) => `الحصة ${p} · ${cls} · ${n} طالب · حصة ${lang}`,
    remove: 'إلغاء',
    cancelBookingTitle: 'إلغاء هذا الحجز؟',
    cancelBookingBody: 'سيصبح الموعد متاحًا لبقية المعلمين.',
    keepIt: 'إبقاء الحجز',
    yesCancel: 'نعم، ألغِ الحجز',
    needInternet: 'تحتاج إلى اتصال بالإنترنت لإتمام الحجز',
    ghReadErr: 'تعذر الاتصال. تحقق من اتصالك بالإنترنت.',
    clashErr: 'قام معلم آخر بحجز هذا الموعد للتو',
    requestSent: 'تم إرسال الطلب — بانتظار الموافقة',
    bookingRemoved: 'تم إلغاء الحجز',
    days: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
    dateLocale: 'ar-JO-u-nu-latn',
    st_pending: 'بانتظار الموافقة', st_approved: 'تمت الموافقة', st_rejected: 'مرفوض', st_cancelled: 'ملغى', st_completed: 'تمت الزيارة', st_no_show: 'لم يحضر',
    decidedBy: (n) => `بواسطة ${n}`,
    pbOpen: (left, end) => `<b>الحجز مفتوح.</b> تُغلق الطلبات خلال ${left} (${end}).`,
    pbOpenRange: (a, b) => `التواريخ المتاحة للحجز: ${a} – ${b}.`,
    pbScheduled: (start) => `<b>الحجز مغلق.</b> تبدأ فترة الحجز القادمة ${start}.`,
    pbClosed: '<b>الحجز مغلق.</b> سيفتح مسؤول المكتبة فترة الحجز القادمة (7 أيام).',
    closedSlotErr: 'الحجز مغلق الآن. يمكنك الحجز عند فتح فترة الحجز القادمة.',
    outsideRangeErr: (a, b) => `تقبل فترة الحجز هذه التواريخ من ${a} إلى ${b} فقط.`,
    err_BOOKING_CLOSED: 'فترة الحجز مغلقة. يمكنك إرسال الطلبات عند فتح الفترة القادمة.',
    err_OUTSIDE_BOOKING_RANGE: 'هذا التاريخ خارج تواريخ فترة الحجز الحالية.',
    err_SLOT_TAKEN: 'قام معلم آخر بحجز هذا الموعد للتو',
    err_PAST_SLOT: 'هذا الوقت قد مضى.',
    err_NOT_SCHOOL_DAY: 'الحجز متاح من الأحد إلى الخميس فقط.',
    err_BOOKING_LIMIT: 'وصلت إلى الحد الأقصى لعدد الحجوزات القادمة.',
    err_NOT_CANCELLABLE: 'لم يعد بالإمكان إلغاء هذا الحجز.',
    changePassword: 'اسم المستخدم وكلمة المرور',
    version: (v) => `الإصدار ${v} · يتم التحديث تلقائيًا`
  }
};

// Strings that only the Teachers App's original install sheet uses.
Object.assign(APP_I18N.en, { installBodyT: 'Add Library Booking to your home screen — on phone, tablet, or computer — for quick access, just like a regular app.', installIconPc: 'Computer', installIconAndroid: 'Android', installIconIos: 'iPhone / iPad', installNow: 'Install now', notNow: 'Not now', iosStepsTitle: 'Install on iPhone or iPad' });
Object.assign(APP_I18N.ar, { installBodyT: 'أضف تطبيق حجز المكتبة إلى شاشتك الرئيسية — على الهاتف أو الجهاز اللوحي أو الحاسوب — للوصول السريع، تمامًا مثل أي تطبيق عادي.', installIconPc: 'حاسوب', installIconAndroid: 'أندرويد', installIconIos: 'آيفون / آيباد', installNow: 'تثبيت الآن', notNow: 'ليس الآن', iosStepsTitle: 'التثبيت على آيفون أو آيباد' });

const i18n = createI18n(mergeDicts(COMMON_I18N, AUTH_I18N, APP_I18N), 'teachers');
const PERIODS_A = [1, 2, 3];
const PERIODS_B = [4, 5, 6, 7];
const BOOK_ICON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>';

class App {
  constructor() {
    this.me = null;
    this.library = store.get('teachers.library') === 'senior' ? 'senior' : 'junior';
    this.weekOffset = 0;
    this.pending = null;
    this.slots = [];
    this.mine = [];
    this.period = { current: null, next: null };
    this.today = null;
    this.serverOffset = 0;
    this.online = navigator.onLine;
    this.loaded = false;
    this.bound = false;
    this.theme = store.get('themePref') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

    this.api = createApi('teachers', { onSessionEnded: (err) => this.onSessionEnded(err) });
    this.auth = createAuth({
      root: document.getElementById('loginView'), api: this.api, i18n,
      appName: () => this.t('loginTitle'), appSub: () => this.t('loginSub'), roleName: () => this.t('roleName'), iconSvg: BOOK_ICON,
      onReady: (me) => this.startApp(me),
      onSignedOut: () => this.stopApp()
    });
    this.sync = createSync(this.api, 'teacher.sync', {
      interval: 10000, hiddenInterval: 60000,
      onData: (d) => this.onSync(d),
      onState: (s) => this.setSyncState(s === 'ok' ? 'ok' : s === 'busy' ? (this.loaded ? 'ok' : 'busy') : 'err'),
      onError: (e) => { if (!this.loaded) this.showToast(errorText(e, i18n), true); }
    });

    this.applyTheme();
    this.applyLang();
    this.bindUtilBar();
    this.initInstallPrompt();
    document.getElementById('versionNote').textContent = this.t('version', VERSION);
    this.auth.start();
  }

  t(key, ...args) { return i18n.t(key, ...args); }

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
    document.getElementById('themeToggle').textContent = this.theme === 'dark' ? '☀️' : '🌙';
    store.set('themePref', this.theme);
  }

  applyLang() {
    i18n.setLang(i18n.lang);
    document.getElementById('versionNote').textContent = this.t('version', VERSION);
    this.auth.rerender();
    if (this.me) {
      this.renderLibTabs();
      this.renderAll();
      this.setSyncState(this.online ? 'ok' : 'err');
    }
  }

  /* ---------------- INSTALL PROMPT ---------------- */
  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }
  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  initInstallPrompt() {
    if (this.isStandalone()) return; // already installed, never show anything
    this.deferredPrompt = null;
    document.getElementById('installBar').classList.add('show');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      document.getElementById('installBar').classList.remove('show');
      document.getElementById('installOverlay').classList.remove('show');
    });
    document.getElementById('installBarBtn').addEventListener('click', () => this.openInstallSheet());
    if (!store.get('installPromptSeen')) setTimeout(() => this.openInstallSheet(true), 900);
  }

  openInstallSheet() {
    const ios = this.isIOS();
    const content = document.getElementById('installSheetContent');
    if (ios) {
      content.innerHTML = `
        <div class="sheet-handle"></div>
        <h2>${this.t('iosStepsTitle')}</h2>
        <p class="sub">${this.t('installBodyT')}</p>
        <div class="ios-steps">${this.t('iosStepsBody')}</div>
        <div class="sheet-btns"><button class="confirm" id="installGotIt" style="flex:1;">${this.t('gotIt')}</button></div>`;
    } else {
      content.innerHTML = `
        <div class="sheet-handle"></div>
        <h2>${this.t('installTitle')}</h2>
        <p class="sub">${this.t('installBodyT')}</p>
        <div class="install-icons">
          <div class="install-icon-item"><div class="circle">💻</div>${this.t('installIconPc')}</div>
          <div class="install-icon-item"><div class="circle">🤖</div>${this.t('installIconAndroid')}</div>
          <div class="install-icon-item"><div class="circle">📱</div>${this.t('installIconIos')}</div>
        </div>
        <div class="sheet-btns">
          <button class="cancel" id="installNotNow">${this.t('notNow')}</button>
          <button class="confirm" id="installNowBtn">${this.t('installNow')}</button>
        </div>`;
    }
    document.getElementById('installOverlay').classList.add('show');
    store.set('installPromptSeen', '1');
    if (ios) {
      document.getElementById('installGotIt').addEventListener('click', () => this.closeInstallSheet());
    } else {
      document.getElementById('installNotNow').addEventListener('click', () => this.closeInstallSheet());
      document.getElementById('installNowBtn').addEventListener('click', async () => {
        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          try { await this.deferredPrompt.userChoice; } catch { /* */ }
          this.deferredPrompt = null;
          this.closeInstallSheet();
        } else {
          content.innerHTML = `
            <div class="sheet-handle"></div>
            <h2>${this.t('installTitle')}</h2>
            <div class="ios-steps">${this.t('fallbackStepsBody')}</div>
            <div class="sheet-btns"><button class="confirm" id="installGotIt2" style="flex:1;">${this.t('gotIt')}</button></div>`;
          document.getElementById('installGotIt2').addEventListener('click', () => this.closeInstallSheet());
        }
      });
    }
  }

  closeInstallSheet() { document.getElementById('installOverlay').classList.remove('show'); }

  bindUtilBar() {
    document.getElementById('themeToggle').addEventListener('click', () => {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      this.applyTheme();
    });
    document.getElementById('langToggle').addEventListener('click', () => {
      i18n.lang = i18n.lang === 'en' ? 'ar' : 'en';
      this.applyLang();
    });
  }

  /* ---------------- SESSION ---------------- */
  onSessionEnded(err) {
    this.stopApp();
    this.auth.handleSessionEnded(err);
  }

  stopApp() {
    this.me = null;
    this.sync.stop();
    document.getElementById('app').style.display = 'none';
    this.closeSheet();
  }

  /* ---------------- APP INIT ---------------- */
  startApp(me) {
    this.me = me;
    this.loaded = false;
    this.slots = []; this.mine = [];
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('headerName').textContent = me.name;
    if (!this.bound) { this.bindStatic(); this.bindConnectivity(); this.bindAutoDayRollover(); this.bound = true; }
    this.renderLibTabs();
    document.getElementById('gridLoading').classList.add('show');
    this.setSyncState('busy');
    this.renderAll();
    this.sync.start();
  }

  onSync(d) {
    this.serverOffset = d.serverTime - Date.now();
    this.today = d.today;
    this.nowTime = d.nowTime;
    if (!d.changed) { this.renderPeriodBanner(); return; }
    this.loaded = true;
    this.slots = d.slots;
    this.mine = d.mine;
    this.period = d.period;
    this.range = d.range;
    if (d.me) { this.me = d.me; document.getElementById('headerName').textContent = d.me.name; }
    document.getElementById('gridLoading').classList.remove('show');
    this.renderAll();
  }

  renderAll() {
    this.renderPeriodBanner();
    this.renderGrid();
    this.renderMyList();
  }

  bindAutoDayRollover() {
    this._lastDayKey = this.todayKey();
    const checkDateChange = () => {
      const currentToday = this.todayKey();
      if (currentToday !== this._lastDayKey) {
        this._lastDayKey = currentToday;
        this.sync.refresh();
      }
      this.renderPeriodBanner();
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkDateChange(); });
    window.addEventListener('focus', checkDateChange);
    setInterval(checkDateChange, 30 * 1000);
  }

  bindConnectivity() {
    window.addEventListener('online', () => { this.online = true; this.updateConnBanner(); this.setSyncState('ok'); });
    window.addEventListener('offline', () => { this.online = false; this.updateConnBanner(); this.setSyncState('err'); });
    this.updateConnBanner();
  }

  updateConnBanner() { document.getElementById('connBanner').classList.toggle('show', !this.online); }

  setSyncState(state) {
    const dot = document.getElementById('syncDot');
    const label = document.getElementById('syncLabel');
    dot.className = 'sync-dot';
    if (state === 'busy') { dot.classList.add('busy'); label.textContent = this.t('syncing'); }
    else if (state === 'err') { dot.classList.add('err'); label.textContent = this.t('offline'); }
    else { label.textContent = this.t('synced'); }
  }

  bindStatic() {
    document.getElementById('logoutBtn').addEventListener('click', () => this.auth.signOut());
    document.getElementById('passwordBtn').addEventListener('click', () => this.auth.changePassword(this.me, { openSheet }));
    document.getElementById('prevWeek').addEventListener('click', () => { this.setWeekOffset(this.weekOffset - 7); });
    document.getElementById('nextWeek').addEventListener('click', () => { this.setWeekOffset(this.weekOffset + 7); });
    document.querySelectorAll('.week-pill').forEach(btn => {
      btn.addEventListener('click', () => this.setWeekOffset(parseInt(btn.dataset.offset)));
    });
    document.getElementById('overlay').addEventListener('mousedown', (e) => { if (e.target.id === 'overlay') this.closeSheet(); });
  }

  maxWeekOffset() {
    // This week and next week as before; further ahead when the booking period allows it.
    let max = 7;
    const until = [this.period?.current?.bookableTo, this.period?.next?.bookableTo].filter(Boolean).sort().pop();
    if (until) {
      const sunday = this.getWeekDates(0)[0];
      const [y, m, d] = until.split('-').map(Number);
      const days = Math.floor((new Date(y, m - 1, d) - sunday) / 86400000);
      max = Math.max(7, Math.floor(days / 7) * 7);
    }
    return Math.min(max, 16 * 7);
  }

  setWeekOffset(offset) {
    this.weekOffset = Math.max(0, Math.min(this.maxWeekOffset(), offset));
    this.updateWeekPills();
    this.renderGrid();
  }

  updateWeekPills() {
    const max = this.maxWeekOffset();
    document.querySelectorAll('.week-pill').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.offset) === this.weekOffset);
    });
    const prevBtn = document.getElementById('prevWeek');
    const nextBtn = document.getElementById('nextWeek');
    prevBtn.disabled = this.weekOffset <= 0;
    prevBtn.style.opacity = this.weekOffset <= 0 ? '0.35' : '1';
    prevBtn.style.pointerEvents = this.weekOffset <= 0 ? 'none' : 'auto';
    nextBtn.disabled = this.weekOffset >= max;
    nextBtn.style.opacity = this.weekOffset >= max ? '0.35' : '1';
    nextBtn.style.pointerEvents = this.weekOffset >= max ? 'none' : 'auto';
  }

  renderLibTabs() {
    const tabs = document.getElementById('libTabs');
    tabs.innerHTML = `
      <div class="lib-tab ${this.library === 'junior' ? 'active' : ''}" data-lib="junior"><div class="t1">${this.t('juniorLib')}</div><div class="t2">${this.t('juniorLibSub')}</div></div>
      <div class="lib-tab ${this.library === 'senior' ? 'active' : ''}" data-lib="senior"><div class="t1">${this.t('seniorLib')}</div><div class="t2">${this.t('seniorLibSub')}</div></div>`;
    tabs.querySelectorAll('.lib-tab').forEach(t => {
      t.addEventListener('click', () => {
        this.library = t.dataset.lib;
        store.set('teachers.library', this.library);
        this.renderLibTabs();
        this.renderGrid();
        this.renderMyList();
      });
    });
  }

  /* ---------------- BOOKING PERIOD ---------------- */
  serverNow() { return Date.now() + this.serverOffset; }

  openPeriod() {
    const p = this.period?.current;
    if (!p) return null;
    const now = this.serverNow();
    return now >= p.opensAt && now < p.closesAt ? p : null;
  }

  fmtStamp(ms) {
    return new Date(ms).toLocaleString(this.t('dateLocale'), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  renderPeriodBanner() {
    const el = document.getElementById('periodBanner');
    if (!this.loaded) { el.className = 'period-banner'; return; }
    const open = this.openPeriod();
    const next = this.period?.next;
    if (open) {
      el.className = 'period-banner show open';
      el.innerHTML = `${this.t('pbOpen', fmtDuration(open.closesAt - this.serverNow(), i18n), esc(this.fmtStamp(open.closesAt)))}<span class="pb-sub">${esc(this.t('pbOpenRange', this.fmtDate(open.bookableFrom, true), this.fmtDate(open.bookableTo, true)))}</span>`;
      if (this._wasOpen === false) this.renderGrid();
      this._wasOpen = true;
    } else {
      el.className = 'period-banner show ' + (next ? 'scheduled' : 'closed');
      el.innerHTML = next ? this.t('pbScheduled', esc(this.fmtStamp(next.opensAt))) : this.t('pbClosed');
      // The 7 days just ended while the app was open: lock the grid immediately.
      if (this._wasOpen) { this._wasOpen = false; this.renderGrid(); this.sync.refresh(); }
      this._wasOpen = false;
    }
  }

  /* ---------------- HELPERS ---------------- */
  getWeekDates(offset = this.weekOffset) {
    const today = this.today ? new Date(this.today + 'T00:00:00') : new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();
    let daysToSunday;
    if (dayOfWeek === 5) daysToSunday = 2;       // Friday -> upcoming Sunday
    else if (dayOfWeek === 6) daysToSunday = 1;  // Saturday -> tomorrow Sunday
    else daysToSunday = -dayOfWeek;              // Sunday..Thursday -> Sunday of this week
    const sunday = new Date(today);
    sunday.setDate(today.getDate() + daysToSunday + offset);
    return [0, 1, 2, 3, 4].map(i => { const d = new Date(sunday); d.setDate(sunday.getDate() + i); return d; });
  }
  dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  todayKey() { return this.today || this.dateKey(new Date()); }
  findSlot(dateKey, period) { return this.slots.find(b => b.library === this.library && b.date === dateKey && b.period === period); }
  fmtDate(dateKey, short) {
    const d = new Date(dateKey + 'T00:00:00');
    return d.toLocaleDateString(this.t('dateLocale'), short ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'long', month: 'short', day: 'numeric' });
  }
  libName(lib) { return lib === 'junior' ? this.t('juniorLib') : this.t('seniorLib'); }

  showToast(msg, isErr) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), isErr ? 4000 : 2800);
  }

  closeSheet() {
    document.getElementById('overlay').classList.remove('show');
    if (this.pending) {
      const cell = document.querySelector(`td[data-date="${this.pending.dateKey}"][data-period="${this.pending.period}"]`);
      if (cell) cell.classList.remove('selecting');
    }
    this.pending = null;
  }

  /* ---------------- BOOKING FLOW ---------------- */
  openTimeSheet(dateKey, period, cell) {
    if (!navigator.onLine) { this.showToast(this.t('needInternet'), true); return; }
    if (cell) cell.classList.add('selecting');
    const prev = this.pending && this.pending.dateKey === dateKey && this.pending.period === period ? this.pending : {};
    const last = JSON.parse(store.get('teachers.lastClass') || '{}');
    this.pending = { dateKey, period, ...prev };
    const v = (k, d = '') => esc(prev[k] ?? last[k] ?? d);
    document.getElementById('sheetContent').innerHTML = `
      <div class="sheet-handle"></div>
      <h2>${this.t('bookPeriod', period)}</h2>
      <p class="sub">${this.fmtDate(dateKey)} · ${this.libName(this.library)}</p>
      <div class="two-col">
        <div class="fg"><label for="sheetStart">${this.t('arrivingAt')}</label><input type="time" id="sheetStart" value="${esc(prev.startTime || '')}" /></div>
        <div class="fg"><label for="sheetEnd">${this.t('leavingAt')}</label><input type="time" id="sheetEnd" value="${esc(prev.endTime || '')}" /></div>
      </div>
      <div class="two-col">
        <div class="fg"><label for="sheetGrade">${this.t('gradeSection')}</label><input id="sheetGrade" maxlength="40" placeholder="${esc(this.t('gradeSectionPh'))}" value="${v('gradeSection')}" /></div>
        <div class="fg"><label for="sheetStudents">${this.t('studentsCount')}</label><input id="sheetStudents" type="number" min="1" max="200" inputmode="numeric" value="${v('students')}" /></div>
      </div>
      <div class="fg"><label for="sheetLang">${this.t('classLang')}</label>
        <select id="sheetLang"><option value="english" ${(prev.classLanguage || last.classLanguage) !== 'arabic' ? 'selected' : ''}>${this.t('english')}</option><option value="arabic" ${(prev.classLanguage || last.classLanguage) === 'arabic' ? 'selected' : ''}>${this.t('arabic')}</option></select></div>
      <div class="fg"><label for="sheetNotes">${this.t('notesOptional')}</label><textarea id="sheetNotes" rows="2" maxlength="500" placeholder="${esc(this.t('notesPh'))}">${esc(prev.notes || '')}</textarea></div>
      <p class="field-err" id="sheetErr">${this.t('timeErr')}</p>
      <div class="sheet-btns">
        <button class="cancel" id="sheetCancel">${this.t('cancel')}</button>
        <button class="confirm" id="sheetNext">${this.t('continueBtn')}</button>
      </div>`;
    document.getElementById('overlay').classList.add('show');
    document.getElementById('sheetCancel').addEventListener('click', () => this.closeSheet());
    ['sheetStart', 'sheetEnd', 'sheetGrade', 'sheetStudents'].forEach(id => document.getElementById(id).addEventListener('input', () => { document.getElementById('sheetErr').style.display = 'none'; }));
    document.getElementById('sheetNext').addEventListener('click', () => {
      const err = (m) => { const e = document.getElementById('sheetErr'); e.textContent = m; e.style.display = 'block'; };
      const start = document.getElementById('sheetStart').value;
      const end = document.getElementById('sheetEnd').value;
      const gradeSection = document.getElementById('sheetGrade').value.trim();
      const students = parseInt(document.getElementById('sheetStudents').value, 10);
      if (!start || !end || end <= start) return err(this.t('timeErr'));
      if (dateKey === this.todayKey()) {
        const nowHM = this.nowTime || `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
        if (end <= nowHM) return err(this.t('pastTimeErr'));
      }
      if (!gradeSection || !Number.isInteger(students) || students < 1 || students > 200) return err(this.t('classErr'));
      Object.assign(this.pending, {
        startTime: start, endTime: end, gradeSection, students,
        classLanguage: document.getElementById('sheetLang').value,
        notes: document.getElementById('sheetNotes').value.trim()
      });
      store.set('teachers.lastClass', JSON.stringify({ gradeSection, students, classLanguage: this.pending.classLanguage }));
      this.openConfirmSheet();
    });
  }

  openConfirmSheet() {
    const { dateKey, period, startTime, endTime, gradeSection, students, classLanguage, notes } = this.pending;
    document.getElementById('sheetContent').innerHTML = `
      <div class="sheet-handle"></div>
      <h2>${this.t('confirmBooking')}</h2>
      <p class="sub">${this.t('confirmSub')}</p>
      <div class="confirm-box">
        <div class="row"><span>${this.t('library')}</span><span>${this.libName(this.library)}</span></div>
        <div class="row"><span>${this.t('date')}</span><span>${this.fmtDate(dateKey)}</span></div>
        <div class="row"><span>${this.t('period')}</span><span>${period}</span></div>
        <div class="row"><span>${this.t('arriving')}</span><span>${esc(startTime)}</span></div>
        <div class="row"><span>${this.t('leaving')}</span><span>${esc(endTime)}</span></div>
        <div class="row"><span>${this.t('gradeSection')}</span><span>${esc(gradeSection)}</span></div>
        <div class="row"><span>${this.t('studentsCount')}</span><span>${students}</span></div>
        <div class="row"><span>${this.t('classLang')}</span><span>${this.t(classLanguage)}</span></div>
        ${notes ? `<div class="row"><span>${this.t('notesOptional')}</span><span>${esc(notes)}</span></div>` : ''}
        <div class="row"><span>${this.t('bookedBy')}</span><span>${esc(this.me.name)}</span></div>
      </div>
      <div class="sheet-btns">
        <button class="cancel" id="sheetBack">${this.t('goBack')}</button>
        <button class="confirm" id="sheetConfirm">${this.t('yesBookIt')}</button>
      </div>`;
    document.getElementById('sheetBack').addEventListener('click', () => this.openTimeSheet(dateKey, period, document.querySelector(`td[data-date="${dateKey}"][data-period="${period}"]`)));
    document.getElementById('sheetConfirm').addEventListener('click', () => this.finalizeBooking());
  }

  async finalizeBooking() {
    const btn = document.getElementById('sheetConfirm');
    btn.disabled = true;
    btn.textContent = this.t('booking');
    if (!navigator.onLine) {
      btn.disabled = false;
      btn.textContent = this.t('yesBookIt');
      this.showToast(this.t('needInternet'), true);
      return;
    }
    const { dateKey, period, startTime, endTime, gradeSection, students, classLanguage, notes } = this.pending;
    try {
      await this.api.call('booking.create', { library: this.library, date: dateKey, period, startTime, endTime, gradeSection, students, classLanguage, notes });
      document.getElementById('overlay').classList.remove('show');
      this.pending = null;
      this.showToast(this.t('requestSent'));
      this.sync.refresh();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = this.t('yesBookIt');
      if (['SLOT_TAKEN', 'BOOKING_CLOSED', 'OUTSIDE_BOOKING_RANGE', 'PAST_SLOT'].includes(e.code)) {
        document.getElementById('overlay').classList.remove('show');
        this.pending = null;
        this.sync.refresh();
      }
      this.showToast(errorText(e, i18n), true);
    }
  }

  async cancelBooking(id, btn) {
    const ok = await confirmDialog({ title: this.t('cancelBookingTitle'), message: esc(this.t('cancelBookingBody')), confirmLabel: this.t('yesCancel'), cancelLabel: this.t('keepIt'), danger: true });
    if (!ok) return;
    btn.disabled = true;
    try {
      await this.api.call('booking.cancel', { id });
      this.showToast(this.t('bookingRemoved'));
      this.sync.refresh();
    } catch (e) {
      btn.disabled = false;
      this.showToast(errorText(e, i18n), true);
    }
  }

  /* ---------------- RENDER ---------------- */
  renderGrid() {
    const weekDates = this.getWeekDates();
    const today = this.todayKey();
    const days = this.t('days');
    const firstDay = weekDates[0];
    const lastDay = weekDates[weekDates.length - 1];
    const dateRangeStr = `${firstDay.getDate()}/${firstDay.getMonth() + 1} – ${lastDay.getDate()}/${lastDay.getMonth() + 1}`;
    let labelText;
    if (this.weekOffset === 0) labelText = `${this.t('thisWeek')} (${dateRangeStr})`;
    else if (this.weekOffset === 7) labelText = `${this.t('nextWeek')} (${dateRangeStr})`;
    else labelText = `${this.t('weekAhead', this.weekOffset / 7)} (${dateRangeStr})`;
    document.getElementById('weekLabel').textContent = labelText;
    this.updateWeekPills();

    const open = this.openPeriod();
    const table = document.getElementById('ttTable');
    const thead = '<tr><th></th>' + PERIODS_A.map(p => `<th>${p}</th>`).join('') + `<th class="break-head">${this.t('breakLabel')}</th>` + PERIODS_B.map(p => `<th>${p}</th>`).join('') + '</tr>';

    const renderCell = (dk, p) => {
      const b = this.findSlot(dk, p);
      const isPastDay = dk < today;
      if (b) {
        const cls = b.mine ? 'mine' : 'other';
        const pend = b.status === 'pending' ? ' pending' : '';
        const pastCls = isPastDay ? ' past-booked' : '';
        const name = b.mine ? this.t('you') : String(b.teacherName || '').split(' ').slice(-1)[0];
        return `<td class="slot ${cls}${pend}${pastCls}" data-date="${dk}" data-period="${p}" title="${esc(b.teacherName)} · ${esc(b.gradeSection || '')}"><span class="slot-name">${esc(name)}</span><span class="slot-time">${esc(b.startTime)}-${esc(b.endTime)}</span></td>`;
      }
      if (isPastDay) return `<td class="slot past" data-date="${dk}" data-period="${p}"><span class="dot"></span></td>`;
      if (!open || dk < open.bookableFrom || dk > open.bookableTo) return `<td class="slot closed" data-date="${dk}" data-period="${p}"><span class="dot"></span></td>`;
      return `<td class="slot available" data-date="${dk}" data-period="${p}"><span class="dot"></span></td>`;
    };

    const rows = days.map((label, i) => {
      const d = weekDates[i];
      const dk = this.dateKey(d);
      const isToday = dk === today;
      const cellsA = PERIODS_A.map(p => renderCell(dk, p)).join('');
      const breakCell = `<td class="slot break-cell">${this.t('breakLabel')}</td>`;
      const cellsB = PERIODS_B.map(p => renderCell(dk, p)).join('');
      return `<tr><td class="day-cell${isToday ? ' today' : ''}">${label}<span class="date-num">${d.getDate()}/${d.getMonth() + 1}</span></td>${cellsA}${breakCell}${cellsB}</tr>`;
    }).join('');

    table.innerHTML = thead + rows;
    table.querySelectorAll('.slot.available').forEach(cell => {
      cell.addEventListener('click', () => this.openTimeSheet(cell.dataset.date, parseInt(cell.dataset.period), cell));
    });
    table.querySelectorAll('.slot.past').forEach(cell => {
      cell.addEventListener('click', () => this.showToast(this.t('pastSlotErr'), true));
    });
    table.querySelectorAll('.slot.closed').forEach(cell => {
      cell.addEventListener('click', () => {
        const p = this.openPeriod();
        this.showToast(p ? this.t('outsideRangeErr', this.fmtDate(p.bookableFrom, true), this.fmtDate(p.bookableTo, true)) : this.t('closedSlotErr'), true);
      });
    });
  }

  renderMyList() {
    const list = document.getElementById('myList');
    const mine = this.mine.filter(b => b.library === this.library);
    if (mine.length === 0) {
      list.innerHTML = `<div class="empty-note">${this.t('noBookings')}</div>`;
      return;
    }
    const today = this.todayKey();
    list.innerHTML = mine.map(b => {
      const d = new Date(b.date + 'T00:00:00');
      const dateStr = d.toLocaleDateString(this.t('dateLocale'), { weekday: 'short', month: 'short', day: 'numeric' });
      const isPast = b.date < today;
      const inactive = ['rejected', 'cancelled'].includes(b.status);
      const canCancel = ['pending', 'approved'].includes(b.status) && !isPast;
      const note = b.decisionNote ? ` — ${esc(b.decisionNote)}` : '';
      const by = b.decidedByName && ['approved', 'rejected'].includes(b.status) ? ` ${esc(this.t('decidedBy', b.decidedByName))}` : '';
      return `
        <div class="booking-row${isPast ? ' past-row' : ''}${inactive ? ' dim' : ''}">
          <div class="info">
            <span class="lib-tag">${this.libName(b.library)}</span>
            <span class="when">${dateStr} · ${this.t('arrivesLeaves', esc(b.startTime), esc(b.endTime))}</span>
            <span class="period">${esc(this.t('periodClassLine', b.period, b.gradeSection, b.students, this.t(b.classLanguage)))}</span>
            <span class="status-line"><span class="status-badge st-${esc(b.status)}">${this.t('st_' + b.status)}</span><span class="note">${by}${note}</span></span>
          </div>
          ${canCancel ? `<button data-id="${esc(b.id)}">${this.t('remove')}</button>` : ''}
        </div>`;
    }).join('');
    list.querySelectorAll('button[data-id]').forEach(btn => btn.addEventListener('click', () => this.cancelBooking(btn.dataset.id, btn)));
  }
}

window.app = new App();
setupAutoUpdate('/service-worker.js', '/');
