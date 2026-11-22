// Shared client library for the three school library apps.
// Each app imports this module but keeps its own session, interface and navigation.
export const VERSION = '2.1.1';

/* ---------------- text & html ---------------- */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------------- storage that never throws ---------------- */
export const store = {
  get(k, area = 'local') { try { return (area === 'session' ? sessionStorage : localStorage).getItem(k); } catch { return null; } },
  set(k, v, area = 'local') { try { (area === 'session' ? sessionStorage : localStorage).setItem(k, v); } catch { /* blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } try { sessionStorage.removeItem(k); } catch { /* */ } }
};

/* ---------------- i18n ---------------- */
export function createI18n(dicts, appKey) {
  const i18n = {
    lang: store.get('langPref') === 'ar' ? 'ar' : 'en',
    t(key, ...args) {
      const v = dicts[i18n.lang]?.[key] ?? dicts.en?.[key];
      if (v === undefined) return key;
      return typeof v === 'function' ? v(...args) : v;
    },
    setLang(l) {
      i18n.lang = l;
      store.set('langPref', l);
      document.documentElement.lang = l;
      document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
      $$('[data-i]').forEach(el => { const v = i18n.t(el.dataset.i); if (typeof v === 'string') el.textContent = v; });
    },
    locale() { return i18n.lang === 'ar' ? 'ar-JO-u-nu-latn' : 'en-GB'; }
  };
  return i18n;
}

/* ---------------- dates ---------------- */
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
export function weekdayOf(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function fmtDate(key, i18n, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(i18n.locale(), { ...opts, timeZone: 'UTC' });
}
export function dayName(key, i18n, style = 'long') { return fmtDate(key, i18n, { weekday: style }); }
export function fmtDateTime(ms, i18n, tz) {
  if (!ms) return '';
  const o = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  if (tz) o.timeZone = tz;
  try { return new Date(ms).toLocaleString(i18n.locale(), o); } catch { return new Date(ms).toLocaleString(); }
}
export function fmtTimeOf(ms, i18n, tz) {
  const o = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  if (tz) o.timeZone = tz;
  try { return new Date(ms).toLocaleTimeString(i18n.locale(), o); } catch { return ''; }
}
export function fmtDuration(ms, i18n) {
  if (ms < 0) ms = 0;
  const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000);
  const ar = i18n.lang === 'ar';
  if (d > 0) return ar ? `${d} يوم ${h} ساعة` : `${d}d ${h}h`;
  if (h > 0) return ar ? `${h} ساعة ${m} دقيقة` : `${h}h ${m}m`;
  return ar ? `${Math.max(m, 1)} دقيقة` : `${Math.max(m, 1)}m`;
}

/* ---------------- API client ---------------- */
export class ApiError extends Error {
  constructor(code, message, details, status) { super(message); this.code = code; this.details = details; this.status = status; }
}
const SESSION_ENDERS = new Set(['UNAUTHENTICATED', 'SESSION_EXPIRED', 'SESSION_WRONG_APP', 'ACCOUNT_DELETED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'ACCOUNT_PENDING', 'ACCOUNT_REJECTED']);

export function createApi(appKey, { onSessionEnded } = {}) {
  const KEY = `slp.${appKey}.session`;
  let token = store.get(KEY, 'session') || store.get(KEY) || null;
  let offset = 0;
  const api = {
    app: appKey,
    hasSession: () => !!token,
    setSession(t, remember) {
      token = t;
      store.del(KEY);
      store.set(KEY, t, remember ? 'local' : 'session');
    },
    clearSession() { token = null; store.del(KEY); },
    serverNow: () => Date.now() + offset,
    onSessionEnded,
    async call(action, data = {}, { timeout = 20000 } = {}) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      let res;
      try {
        res = await fetch('/api/rpc', {
          method: 'POST', signal: ctrl.signal, cache: 'no-store', credentials: 'omit',
          headers: { 'Content-Type': 'application/json', 'X-App': appKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ action, data })
        });
      } catch (e) {
        throw new ApiError(navigator.onLine === false ? 'OFFLINE' : 'NETWORK', 'Network error');
      } finally { clearTimeout(timer); }
      let body = null;
      try { body = await res.json(); } catch { /* not json */ }
      if (body?.serverTime) offset = body.serverTime - Date.now();
      if (!body) throw new ApiError(res.status === 401 || res.status === 403 ? 'HOST_LOCKED' : res.status >= 500 ? 'UNAVAILABLE' : 'NETWORK', 'The server is not responding correctly.', null, res.status);
      if (!body.ok) {
        const err = new ApiError(body.error?.code || 'ERROR', body.error?.message || 'Error', body.error?.details, res.status);
        if (token && SESSION_ENDERS.has(err.code)) {
          api.clearSession();
          if (api.onSessionEnded) api.onSessionEnded(err);
        }
        throw err;
      }
      return body.data;
    }
  };
  return api;
}

/* Turns an ApiError into a message in the current language. */
export function errorText(err, i18n) {
  const key = 'err_' + (err?.code || 'ERROR');
  const v = i18n.t(key);
  if (v !== key) return typeof v === 'string' ? v : err.message;
  return err?.message && err.code !== 'NETWORK' ? err.message : i18n.t('err_NETWORK');
}

/* ---------------- live sync (polling with change versions) ---------------- */
export function createSync(api, action, { interval = 6000, hiddenInterval = 60000, params = () => ({}), onData, onError, onState } = {}) {
  let versions = null, timer = null, running = false, inFlight = false, failures = 0, lastParams = null, stopped = true;
  async function tick(force) {
    if (stopped) return;
    if (inFlight) { if (force) setTimeout(() => tick(true), 300); return; }
    inFlight = true;
    clearTimeout(timer);
    const p = params();
    const pKey = JSON.stringify(p);
    const since = force || pKey !== lastParams ? null : versions;
    try {
      onState && onState('busy');
      const data = await api.call(action, { ...p, since, sinceDate: lastParams ? JSON.parse(lastParams).date : undefined });
      failures = 0;
      if (data.changed) { versions = data.versions; lastParams = pKey; }
      onState && onState('ok');
      onData && onData(data);
    } catch (e) {
      failures++;
      onState && onState(e.code === 'OFFLINE' || e.code === 'NETWORK' ? 'offline' : 'error');
      onError && onError(e);
      if (SESSION_ENDERS.has(e.code) || e.code === 'NO_APP_ACCESS' || e.code === 'PASSWORD_CHANGE_REQUIRED') { stopped = true; inFlight = false; return; }
    }
    inFlight = false;
    if (stopped) return;
    const base = document.visibilityState === 'hidden' ? hiddenInterval : interval;
    const delay = failures ? Math.min(base * (failures + 1), 60000) : base;
    timer = setTimeout(() => tick(false), delay);
  }
  const onVis = () => { if (document.visibilityState === 'visible') tick(false); };
  const onOnline = () => tick(true);
  return {
    start() {
      if (running) return; running = true; stopped = false;
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('online', onOnline);
      tick(true);
    },
    stop() {
      running = false; stopped = true; clearTimeout(timer); versions = null; lastParams = null;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
    },
    refresh() { if (running) { stopped = false; tick(true); } }
  };
}

/* ---------------- toast ---------------- */
let toastTimer;
export function toast(msg, isErr) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 4200 : 2800);
}

/* ---------------- bottom sheet / dialog ---------------- */
let sheetStack = [];
export function openSheet(html, { wide = false, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><div class="sheet-handle"></div>${html}</div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  const sheet = overlay.firstElementChild;
  const handle = {
    el: sheet,
    close() {
      overlay.classList.remove('show');
      sheetStack = sheetStack.filter(h => h !== handle);
      setTimeout(() => overlay.remove(), 200);
      onClose && onClose();
    }
  };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) handle.close(); });
  sheetStack.push(handle);
  const first = sheet.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
  if (first && matchMedia('(pointer: fine)').matches) setTimeout(() => first.focus(), 60);
  return handle;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close(); });
export function closeAllSheets() { [...sheetStack].forEach(h => h.close()); }

/* Confirmation dialog, optionally with a text input. Resolves to false, true or the input value. */
export function confirmDialog({ title, message = '', confirmLabel, cancelLabel, danger = false, input = null }) {
  return new Promise((resolve) => {
    let done = false;
    const h = openSheet(`
      <h2>${esc(title)}</h2>
      ${message ? `<p class="sub">${message}</p>` : ''}
      ${input ? `<div class="fg"><label>${esc(input.label)}</label>${input.multiline ? `<textarea id="cdInput" rows="3" maxlength="${input.max || 300}">${esc(input.value || '')}</textarea>` : `<input id="cdInput" type="${input.type || 'text'}" value="${esc(input.value || '')}" maxlength="${input.max || 300}" ${input.min ? `min="${esc(input.min)}"` : ''} autocomplete="off" />`}</div><p class="field-err" id="cdErr"></p>` : ''}
      <div class="sheet-btns">
        <button class="cancel" id="cdCancel" type="button">${esc(cancelLabel)}</button>
        <button class="confirm${danger ? ' danger' : ''}" id="cdOk" type="button">${esc(confirmLabel)}</button>
      </div>`, { onClose: () => { if (!done) { done = true; resolve(false); } } });
    const finish = (v) => { done = true; resolve(v); h.close(); };
    h.el.querySelector('#cdCancel').onclick = () => h.close();
    h.el.querySelector('#cdOk').onclick = () => {
      if (!input) return finish(true);
      const val = h.el.querySelector('#cdInput').value.trim();
      if (input.required && !val) { const e = h.el.querySelector('#cdErr'); e.textContent = input.requiredMsg || ''; e.style.display = 'block'; return; }
      finish(val || (input.required ? val : ''));
    };
    if (input && !input.multiline) h.el.querySelector('#cdInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') h.el.querySelector('#cdOk').click(); });
  });
}

/* Runs an async action with a busy button and translated error toasts. */
export async function busy(btn, fn, i18n) {
  if (btn?.disabled) return;
  const label = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
  try { return await fn(); }
  catch (e) { toast(errorText(e, i18n), true); throw e; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); btn.innerHTML = label; } }
}

/* ---------------- theme ---------------- */
export function initTheme(btn) {
  let theme = store.get('themePref') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const apply = () => { document.documentElement.setAttribute('data-theme', theme); if (btn) btn.textContent = '◐'; store.set('themePref', theme); };
  apply();
  btn?.addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; apply(); });
}

/* ---------------- CSV export & printing ---------------- */
export function downloadCsv(filename, headers, rows) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [headers, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function printHtml(html) {
  let area = $('#printArea');
  if (!area) { area = document.createElement('div'); area.id = 'printArea'; document.body.appendChild(area); }
  area.innerHTML = html;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
}

/* ---------------- automatic updates ---------------- */
export function setupAutoUpdate(swUrl, scope) {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let refreshing = false;
  const reload = () => { if (!refreshing) { refreshing = true; location.reload(); } };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) reload(); });
  window.addEventListener('load', async () => {
    let reg;
    try { reg = await navigator.serviceWorker.register(swUrl, { scope, updateViaCache: 'none' }); } catch { return; }
    const check = () => { reg.update().catch(() => {}); checkVersion(reg); };
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) w.postMessage({ type: 'SKIP_WAITING' }); });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    window.addEventListener('focus', check);
    setInterval(check, 60 * 1000);
    check();
  });
  async function checkVersion(reg) {
    try {
      const r = await fetch('/version.json', { cache: 'no-store' });
      if (!r.ok) return;
      const { version } = await r.json();
      if (version && version !== VERSION && store.get('slp.reloadedFor', 'session') !== version) {
        store.set('slp.reloadedFor', version, 'session');
        await reg.update().catch(() => {});
        setTimeout(reload, 1500);
      }
    } catch { /* offline */ }
  }
}

/* ---------------- install as an app ---------------- */
export function setupInstall(i18n, { appName }) {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return;
  let deferred = null;
  const bar = document.createElement('div');
  bar.className = 'install-bar show';
  bar.innerHTML = `<span data-i="installBarText">${esc(i18n.t('installBarText'))}</span><button type="button" data-i="installBarBtn">${esc(i18n.t('installBarBtn'))}</button>`;
  document.body.appendChild(bar);
  document.body.classList.add('has-install-bar');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { bar.remove(); document.body.classList.remove('has-install-bar'); });
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  bar.querySelector('button').addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* */ }
      deferred = null;
      return;
    }
    const h = openSheet(`<h2>${esc(i18n.t('installTitle'))}</h2><p class="sub">${esc(i18n.t('installBody', typeof appName === 'function' ? appName() : appName))}</p>
      <div class="ios-steps">${ios ? i18n.t('iosStepsBody') : i18n.t('fallbackStepsBody')}</div>
      <div class="sheet-btns"><button class="confirm" type="button">${esc(i18n.t('gotIt'))}</button></div>`);
    h.el.querySelector('.confirm').onclick = () => h.close();
  });
}

/* Strings shared by every app (merged into each app's dictionary). */
export const COMMON_I18N = {
  en: {
    installBarText: 'Get this as an app on your device', installBarBtn: 'Install', installTitle: 'Install this app',
    installBody: (n) => `Add ${n} to your home screen or desktop for quick access, just like a regular app. It updates itself automatically.`,
    iosStepsBody: 'Tap the <b>Share</b> icon in Safari (the square with an arrow), then choose <b>"Add to Home Screen"</b>.',
    fallbackStepsBody: 'Open your browser menu (⋮ or ⋯) and choose <b>"Install app"</b> or <b>"Add to Home screen"</b>.',
    gotIt: 'Got it', cancel: 'Cancel', close: 'Close', save: 'Save', confirm: 'Confirm', signOut: 'Sign out',
    synced: 'Live', syncing: 'Syncing…', offline: 'Offline', syncError: 'Connection problem',
    connBanner: "No internet connection — changes can't be saved right now",
    junior: 'Junior library', senior: 'Senior library', juniorShort: 'Junior', seniorShort: 'Senior',
    arabic: 'Arabic', english: 'English',
    err_NETWORK: 'Could not reach the server. Check your internet connection and try again.',
    err_OFFLINE: 'You are offline. Connect to the internet and try again.',
    err_UNAVAILABLE: 'The service is temporarily unavailable. Please try again in a moment.',
    err_SERVER_NOT_CONFIGURED: 'The system is not configured yet (no database). Ask the administrator to finish the setup.',
    err_INTERNAL: 'Something went wrong on the server. Please try again.',
    err_RATE_LIMITED: 'Too many attempts. Please wait a few minutes and try again.',
    err_SESSION_EXPIRED: 'Your session has ended. Please sign in again.',
    err_UNAUTHENTICATED: 'Please sign in.',
    err_FORBIDDEN: 'You do not have permission to do that.',
    err_NO_APP_ACCESS: 'Your account does not have access to this app.',
    err_NOT_FOUND: 'That record no longer exists.'
  },
  ar: {
    installBarText: 'ثبّت هذا كتطبيق على جهازك', installBarBtn: 'تثبيت', installTitle: 'تثبيت التطبيق',
    installBody: (n) => `أضف ${n} إلى الشاشة الرئيسية أو سطح المكتب للوصول السريع مثل أي تطبيق عادي. يتم تحديثه تلقائيًا.`,
    iosStepsBody: 'اضغط على أيقونة <b>المشاركة</b> في سفاري (المربع الذي عليه سهم)، ثم اختر <b>«إضافة إلى الشاشة الرئيسية»</b>.',
    fallbackStepsBody: 'افتح قائمة المتصفح (⋮ أو ⋯) واختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.',
    gotIt: 'حسنًا', cancel: 'إلغاء', close: 'إغلاق', save: 'حفظ', confirm: 'تأكيد', signOut: 'تسجيل الخروج',
    synced: 'مباشر', syncing: 'جارٍ المزامنة…', offline: 'غير متصل', syncError: 'مشكلة في الاتصال',
    connBanner: 'لا يوجد اتصال بالإنترنت — لا يمكن حفظ التغييرات الآن',
    junior: 'المكتبة الابتدائية', senior: 'مكتبة المرحلة المتوسطة والثانوية', juniorShort: 'الابتدائية', seniorShort: 'المتوسطة والثانوية',
    arabic: 'عربي', english: 'إنجليزي',
    err_NETWORK: 'تعذر الوصول إلى الخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.',
    err_OFFLINE: 'أنت غير متصل. اتصل بالإنترنت وحاول مرة أخرى.',
    err_UNAVAILABLE: 'الخدمة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.',
    err_SERVER_NOT_CONFIGURED: 'لم يتم إعداد النظام بعد (لا توجد قاعدة بيانات). اطلب من المسؤول إكمال الإعداد.',
    err_INTERNAL: 'حدث خطأ في الخادم. حاول مرة أخرى.',
    err_RATE_LIMITED: 'محاولات كثيرة. انتظر بضع دقائق ثم حاول مرة أخرى.',
    err_SESSION_EXPIRED: 'انتهت جلستك. سجّل الدخول مرة أخرى.',
    err_UNAUTHENTICATED: 'يرجى تسجيل الدخول.',
    err_FORBIDDEN: 'ليست لديك صلاحية للقيام بذلك.',
    err_NO_APP_ACCESS: 'حسابك لا يملك صلاحية الوصول إلى هذا التطبيق.',
    err_NOT_FOUND: 'هذا السجل لم يعد موجودًا.'
  }
};

export function mergeDicts(...dicts) {
  const out = { en: {}, ar: {} };
  for (const d of dicts) { Object.assign(out.en, d.en); Object.assign(out.ar, d.ar); }
  return out;
}
