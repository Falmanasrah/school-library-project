// Public download page: QR code, per-device install steps and the Windows USB kit.
// Needs no account and reads no school data (only the public school name).
import { esc, $, $$, createI18n, initTheme, toast, printHtml, VERSION } from '/shared/core.js';
import { APP_LIST, buildKit } from '/download/kit.js';

const APP_META = {
  teachers: { icon: '/icons/icon-192.png' },
  library: { icon: '/library/icons/icon-192.png' },
  supervisors: { icon: '/supervisors/icons/icon-192.png' }
};

const D = {
  en: {
    title: 'School Library Apps',
    lead: 'Get the school library apps on any phone, tablet or computer. Downloading and installing do not need an account.',
    qrHead: 'Scan to open on a phone or tablet', qrPage: 'This page',
    copy: 'Copy link', copied: 'Link copied', copyFail: 'Could not copy. Select the link and copy it.', share: 'Share',
    saveQr: 'Save QR image', printQr: 'Print QR poster', qrMissing: 'The QR code could not be drawn. Use the link below.',
    appsHead: 'Choose your app', appsSub: 'Each app is separate and only shows what your role needs.',
    open: 'Open app', showQr: 'QR code', kitOne: 'USB kit',
    app_teachers: 'Library Booking', for_teachers: 'Teachers App',
    who_teachers: 'For teachers: book library periods for your classes and follow your bookings.',
    app_library: 'Library Teachers', for_library: 'Library Teachers App',
    who_library: 'For library staff: visits list, visitors log, booking approvals, permission slips and the admin panel.',
    app_supervisors: 'Floor Supervisors', for_supervisors: 'Floor Supervisors App',
    who_supervisors: 'For floor supervisors: send digital permission slips for students to visit the library.',
    devHead: 'Install on your device', devSub: 'Open your app first, then follow the steps for your device.',
    p_android: 'Android', p_ios: 'iPhone / iPad', p_windows: 'Windows', p_mac: 'Mac', p_chromebook: 'Chromebook', thisDevice: 'this device',
    steps_android: ['Open the app in <b>Chrome</b>.', 'Tap <b>Install</b> in the bar at the bottom of the page, or open the menu <b>⋮</b> and choose <b>Install app</b> (or <b>Add to Home screen</b>).', 'The app appears on your home screen like any other app.'],
    steps_ios: ['Open the app in <b>Safari</b>.', 'Tap the <b>Share</b> button (the square with an arrow).', 'Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.'],
    steps_windows: ['Open the app in <b>Microsoft Edge</b> or <b>Google Chrome</b>.', 'Click <b>Install</b> at the bottom of the page, or the install icon at the end of the address bar.', 'In Edge you can also use the menu <b>⋯</b> → <b>Apps</b> → <b>Install this site as an app</b>.', 'The app gets its own window, a Start menu entry and a desktop shortcut.'],
    steps_mac: ['Open the app in <b>Chrome</b> or <b>Edge</b> and click <b>Install</b> (or the install icon in the address bar).', 'In <b>Safari</b> (macOS Sonoma or later), choose <b>File</b> → <b>Add to Dock</b>.'],
    steps_chromebook: ['Open the app in <b>Chrome</b>.', 'Click <b>Install</b> at the bottom of the page, or the install icon in the address bar.', 'The app appears in the launcher.'],
    usbHead: 'Install from a USB stick (Windows)',
    usbSub: 'For school computers: download the kit once, copy it to a USB stick and install it on as many computers as you need.',
    usbSteps: ['Download a kit below and unzip it onto the USB stick.', 'On each computer, open the folder and double-click <b>Install.cmd</b>. No administrator rights are needed.', 'If Windows says “Windows protected your PC”, choose <b>More info</b> → <b>Run anyway</b>.', 'Shortcuts appear on the desktop and in the Start menu under “School Library”. If scripts are blocked on the computer, double-click the <b>Open … .url</b> files in the folder instead.'],
    kitAll: 'Download kit with all three apps', kitFor: 'Only one app:', kitBuilding: 'Preparing…',
    kitReady: (n) => `Saved ${n}`, kitFail: 'The kit could not be made. Check the connection and try again.',
    kitNote: 'The kit points to this website, so the apps always open the latest version.',
    goodHead: 'Good to know',
    good: ['The apps update themselves automatically. You never need to reinstall.', 'They work in the browser or installed, on phones, tablets and computers.', 'Downloading needs no account. Seeing school data needs a school account approved by the library teacher. Everyone chooses their own username and password.', 'The apps need the internet or the school network to load school data.'],
    foot: (v) => `Version ${v}`
  },
  ar: {
    title: 'تطبيقات مكتبة المدرسة',
    lead: 'احصل على تطبيقات مكتبة المدرسة على أي هاتف أو جهاز لوحي أو حاسوب. التنزيل والتثبيت لا يحتاجان إلى حساب.',
    qrHead: 'امسح الرمز لفتح التطبيق على الهاتف أو الجهاز اللوحي', qrPage: 'هذه الصفحة',
    copy: 'نسخ الرابط', copied: 'تم نسخ الرابط', copyFail: 'تعذّر النسخ. حدّد الرابط وانسخه.', share: 'مشاركة',
    saveQr: 'حفظ صورة الرمز', printQr: 'طباعة ملصق الرمز', qrMissing: 'تعذّر رسم رمز QR. استخدم الرابط أدناه.',
    appsHead: 'اختر تطبيقك', appsSub: 'كل تطبيق مستقل ويعرض فقط ما يحتاجه دورك.',
    open: 'فتح التطبيق', showQr: 'رمز QR', kitOne: 'حزمة USB',
    app_teachers: 'حجز المكتبة', for_teachers: 'تطبيق المعلمين',
    who_teachers: 'للمعلمين: احجز حصص المكتبة لصفوفك وتابع حجوزاتك.',
    app_library: 'معلمو المكتبة', for_library: 'تطبيق معلمي المكتبة',
    who_library: 'لمعلمي المكتبة: قائمة الزيارات وسجل الزوار واعتماد الحجوزات وأذونات الطلاب ولوحة الإدارة.',
    app_supervisors: 'مشرفو الطوابق', for_supervisors: 'تطبيق مشرفي الطوابق',
    who_supervisors: 'لمشرفي الطوابق: أرسل أذونات إلكترونية للطلاب لزيارة المكتبة.',
    devHead: 'التثبيت على جهازك', devSub: 'افتح تطبيقك أولًا، ثم اتبع خطوات جهازك.',
    p_android: 'أندرويد', p_ios: 'آيفون / آيباد', p_windows: 'Windows', p_mac: 'Mac', p_chromebook: 'Chromebook', thisDevice: 'هذا الجهاز',
    steps_android: ['افتح التطبيق في متصفح <b>Chrome</b>.', 'اضغط <b>تثبيت</b> في الشريط أسفل الصفحة، أو افتح القائمة <b>⋮</b> واختر <b>تثبيت التطبيق</b> (أو <b>إضافة إلى الشاشة الرئيسية</b>).', 'يظهر التطبيق على الشاشة الرئيسية مثل أي تطبيق آخر.'],
    steps_ios: ['افتح التطبيق في متصفح <b>Safari</b>.', 'اضغط زر <b>المشاركة</b> (المربع مع السهم).', 'مرّر للأسفل واضغط <b>إضافة إلى الشاشة الرئيسية</b> ثم <b>إضافة</b>.'],
    steps_windows: ['افتح التطبيق في <b>Microsoft Edge</b> أو <b>Google Chrome</b>.', 'انقر <b>تثبيت</b> أسفل الصفحة، أو أيقونة التثبيت في طرف شريط العنوان.', 'في Edge يمكنك أيضًا استخدام القائمة <b>⋯</b> ← <b>التطبيقات</b> ← <b>تثبيت هذا الموقع كتطبيق</b>.', 'يحصل التطبيق على نافذة مستقلة واختصار في قائمة ابدأ وعلى سطح المكتب.'],
    steps_mac: ['افتح التطبيق في <b>Chrome</b> أو <b>Edge</b> وانقر <b>تثبيت</b> (أو أيقونة التثبيت في شريط العنوان).', 'في <b>Safari</b> (macOS Sonoma أو أحدث) اختر <b>ملف</b> ← <b>إضافة إلى Dock</b>.'],
    steps_chromebook: ['افتح التطبيق في <b>Chrome</b>.', 'انقر <b>تثبيت</b> أسفل الصفحة، أو أيقونة التثبيت في شريط العنوان.', 'يظهر التطبيق في قائمة التطبيقات.'],
    usbHead: 'التثبيت من ذاكرة USB (Windows)',
    usbSub: 'لأجهزة المدرسة: نزّل الحزمة مرة واحدة، وانسخها إلى ذاكرة USB، وثبّتها على أي عدد من الأجهزة.',
    usbSteps: ['نزّل إحدى الحزم أدناه وفك ضغطها على ذاكرة USB.', 'على كل جهاز، افتح المجلد وانقر نقرًا مزدوجًا على <b>Install.cmd</b>. لا يلزم صلاحيات المسؤول.', 'إذا ظهرت رسالة “Windows protected your PC” فاختر <b>More info</b> ثم <b>Run anyway</b>.', 'تظهر الاختصارات على سطح المكتب وفي قائمة ابدأ تحت “School Library”. إذا كانت البرامج النصية محظورة على الجهاز فانقر نقرًا مزدوجًا على ملفات <b>.url</b> الموجودة في المجلد.'],
    kitAll: 'تنزيل حزمة بالتطبيقات الثلاثة', kitFor: 'تطبيق واحد فقط:', kitBuilding: 'جارٍ التجهيز…',
    kitReady: (n) => `تم حفظ ${n}`, kitFail: 'تعذّر إنشاء الحزمة. تحقّق من الاتصال وحاول مرة أخرى.',
    kitNote: 'تشير الحزمة إلى هذا الموقع، لذلك تفتح التطبيقات دائمًا أحدث إصدار.',
    goodHead: 'معلومات مهمة',
    good: ['تُحدَّث التطبيقات تلقائيًا، ولا حاجة لإعادة التثبيت.', 'تعمل في المتصفح أو بعد التثبيت، على الهواتف والأجهزة اللوحية والحواسيب.', 'التنزيل لا يحتاج إلى حساب، أما عرض بيانات المدرسة فيتطلب حساب مدرسة يعتمده معلم المكتبة، ويختار كل شخص اسم المستخدم وكلمة المرور بنفسه.', 'تحتاج التطبيقات إلى الإنترنت أو شبكة المدرسة لتحميل بيانات المدرسة.'],
    foot: (v) => `الإصدار ${v}`
  }
};

const i18n = createI18n(D, 'download');
const t = (k, ...a) => i18n.t(k, ...a);
const PLATFORMS = ['android', 'ios', 'windows', 'mac', 'chromebook'];
const S = {
  qr: 'page',
  platform: detectPlatform(),
  detected: detectPlatform(),
  version: VERSION,
  school: { en: 'International Independent Schools', ar: 'المدارس المستقلة الدولية' }
};

function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/CrOS/.test(ua)) return 'chromebook';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  return 'windows';
}

const pageUrl = () => location.origin + '/download/';
const appUrl = (key) => location.origin + APP_LIST.find(a => a.key === key).path;
const qrUrl = () => (S.qr === 'page' ? pageUrl() : appUrl(S.qr));

/* ---------------- QR code ---------------- */
function makeQr(text) {
  const gen = globalThis.qrcode;
  if (typeof gen !== 'function') return null;
  const q = gen(0, 'M');
  q.addData(text);
  q.make();
  return q;
}
function drawQr(canvas, q, cell, margin = 4) {
  const n = q.getModuleCount();
  const size = (n + margin * 2) * cell;
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  canvas.dataset.modules = String(n);
  canvas.dataset.margin = String(margin);
}
function renderQr() {
  const canvas = $('#qrCanvas');
  const url = qrUrl();
  $('#qrUrl').textContent = url;
  const q = makeQr(url);
  if (!q) { $('#qrBox').innerHTML = `<p class="muted">${esc(t('qrMissing'))}</p>`; return; }
  const n = q.getModuleCount();
  drawQr(canvas, q, Math.max(2, Math.ceil((232 * (window.devicePixelRatio || 1)) / (n + 8))));
  canvas.dataset.text = url;
  canvas.setAttribute('aria-label', `QR code: ${url}`);
}
function qrLabels() {
  if (S.qr === 'page') return { en: D.en.title, ar: D.ar.title, file: 'School-Library-Apps' };
  return { en: D.en['app_' + S.qr], ar: D.ar['app_' + S.qr], file: D.en['app_' + S.qr].replace(/\s+/g, '-') };
}
function saveQr() {
  const q = makeQr(qrUrl());
  if (!q) return toast(t('qrMissing'), true);
  const c = document.createElement('canvas');
  drawQr(c, q, 14);
  c.toBlob((blob) => blob && saveBlob(blob, `QR-${qrLabels().file}.png`), 'image/png');
}
function printQr() {
  const q = makeQr(qrUrl());
  if (!q) return toast(t('qrMissing'), true);
  const c = document.createElement('canvas');
  drawQr(c, q, 16);
  const L = qrLabels();
  printHtml(`<div class="qr-poster">
    <div class="pp-school">${esc(S.school.en)}<br><span dir="rtl">${esc(S.school.ar)}</span></div>
    <h1>${esc(L.en)}</h1>
    <h2 dir="rtl">${esc(L.ar)}</h2>
    <img src="${c.toDataURL('image/png')}" alt="">
    <div class="pp-url">${esc(qrUrl())}</div>
    <p>Scan with the phone camera to open</p>
    <p dir="rtl">امسح الرمز بكاميرا الهاتف لفتحه</p>
    <p class="pp-small">No account is needed to download. Signing in needs a school account. · <span dir="rtl">التنزيل لا يحتاج إلى حساب، وتسجيل الدخول يتطلب حساب مدرسة.</span></p>
  </div>`);
}

/* ---------------- downloads, copy, share ---------------- */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function copyLink() {
  const url = qrUrl();
  try { await navigator.clipboard.writeText(url); toast(t('copied')); }
  catch {
    const r = document.createRange(); r.selectNodeContents($('#qrUrl'));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    toast(t('copyFail'), true);
  }
}
async function shareLink() {
  const url = qrUrl();
  const L = qrLabels();
  if (navigator.share) {
    try { await navigator.share({ title: L[i18n.lang], url }); } catch { /* cancelled */ }
  } else copyLink();
}
async function downloadKit(keys, btn) {
  const label = btn.innerHTML;
  btn.disabled = true; btn.textContent = t('kitBuilding');
  try {
    const icons = {};
    await Promise.all(keys.map(async (k) => {
      try { const r = await fetch(`/download/icons/${k}.ico`, { cache: 'no-cache' }); if (r.ok) icons[k] = new Uint8Array(await r.arrayBuffer()); } catch { /* icon is optional */ }
    }));
    const { filename, bytes } = buildKit({ origin: location.origin, keys, icons, version: S.version });
    saveBlob(new Blob([bytes], { type: 'application/zip' }), filename);
    toast(t('kitReady', filename));
  } catch {
    toast(t('kitFail'), true);
  } finally {
    if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
  }
}

/* ---------------- page ---------------- */
const LOGO = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M6 21h13"/><path d="M12 7v6M9.5 10.5 12 13l2.5-2.5"/></svg>';

function appCard(a) {
  const k = a.key;
  return `<article class="dl-app k-${k}">
    <div class="dl-app-top">
      <img src="${APP_META[k].icon}" alt="" width="52" height="52">
      <div class="dl-app-body">
        <div class="dl-app-kind">${esc(t('for_' + k))}</div>
        <h3>${esc(t('app_' + k))}</h3>
      </div>
    </div>
    <p>${esc(t('who_' + k))}</p>
    <div class="btn-row">
      <a class="btn primary" href="${a.path}">${esc(t('open'))}</a>
      <button class="btn" type="button" data-act="qr" data-k="${k}">${esc(t('showQr'))}</button>
      <button class="btn" type="button" data-act="kit" data-k="${k}">⬇ ${esc(t('kitOne'))}</button>
    </div>
  </article>`;
}

function stepsHtml() {
  return `<ol class="steps">${t('steps_' + S.platform).map(s => `<li>${s}</li>`).join('')}</ol>`;
}

function render() {
  const school = i18n.lang === 'ar' ? S.school.ar : S.school.en;
  document.title = t('title');
  $('#page').innerHTML = `
  <header class="dl-hero">
    <div class="dl-hero-text">
      <div class="dl-logo">${LOGO}</div>
      <p class="dl-school">${esc(school)}</p>
      <h1>${esc(t('title'))}</h1>
      <p class="dl-lead">${esc(t('lead'))}</p>
    </div>
    <section class="card dl-qr" id="qrCard" aria-labelledby="qrHead">
      <h2 id="qrHead">${esc(t('qrHead'))}</h2>
      <div class="seg qr-seg" role="group">
        ${[['page', t('qrPage')], ...APP_LIST.map(a => [a.key, t('app_' + a.key)])].map(([k, l]) => `<button type="button" data-act="qrFor" data-k="${k}" class="${S.qr === k ? 'on' : ''}" aria-pressed="${S.qr === k}">${esc(l)}</button>`).join('')}
      </div>
      <div class="qr-box" id="qrBox"><canvas id="qrCanvas" role="img"></canvas></div>
      <div class="qr-url" id="qrUrl"></div>
      <div class="btn-row">
        <button class="btn sm" type="button" data-act="copy">${esc(t('copy'))}</button>
        <button class="btn sm" type="button" data-act="share">${esc(t('share'))}</button>
        <button class="btn sm" type="button" data-act="saveQr">${esc(t('saveQr'))}</button>
        <button class="btn sm" type="button" data-act="printQr">${esc(t('printQr'))}</button>
      </div>
    </section>
  </header>

  <section class="dl-sec" aria-labelledby="appsHead">
    <h2 id="appsHead">${esc(t('appsHead'))}</h2>
    <p class="muted">${esc(t('appsSub'))}</p>
    <div class="dl-apps">${APP_LIST.map(appCard).join('')}</div>
  </section>

  <section class="dl-sec card" id="devices" aria-labelledby="devHead">
    <h2 id="devHead">${esc(t('devHead'))}</h2>
    <p class="muted">${esc(t('devSub'))}</p>
    <div class="seg plat-seg" role="group">
      ${PLATFORMS.map(p => `<button type="button" data-act="plat" data-k="${p}" class="${S.platform === p ? 'on' : ''}" aria-pressed="${S.platform === p}">${esc(t('p_' + p))}${p === S.detected ? ` <span class="here">· ${esc(t('thisDevice'))}</span>` : ''}</button>`).join('')}
    </div>
    <div id="steps">${stepsHtml()}</div>
  </section>

  <section class="dl-sec card" id="usb" aria-labelledby="usbHead">
    <h2 id="usbHead">${esc(t('usbHead'))}</h2>
    <p class="muted">${esc(t('usbSub'))}</p>
    <ol class="steps">${t('usbSteps').map(s => `<li>${s}</li>`).join('')}</ol>
    <div class="kit-row">
      <button class="btn primary" type="button" data-act="kitAll">⬇ ${esc(t('kitAll'))}</button>
    </div>
    <div class="kit-row">
      <span class="muted">${esc(t('kitFor'))}</span>
      ${APP_LIST.map(a => `<button class="btn sm" type="button" data-act="kit" data-k="${a.key}">${esc(t('app_' + a.key))}</button>`).join('')}
    </div>
    <p class="muted kit-note">${esc(t('kitNote'))}</p>
  </section>

  <section class="dl-sec card dl-good" aria-labelledby="goodHead">
    <h2 id="goodHead">${esc(t('goodHead'))}</h2>
    <ul>${t('good').map(s => `<li>${esc(s)}</li>`).join('')}</ul>
  </section>

  <p class="app-foot">${esc(t('foot', S.version))} · ${esc(school)}</p>`;
  renderQr();
}

function flash(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('flash-sec'); void el.offsetWidth; el.classList.add('flash-sec');
}

$('#page').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const k = b.dataset.k;
  switch (b.dataset.act) {
    case 'qrFor':
      S.qr = k;
      $$('.qr-seg button').forEach(x => { const on = x.dataset.k === k; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      renderQr();
      break;
    case 'qr':
      S.qr = k;
      $$('.qr-seg button').forEach(x => { const on = x.dataset.k === k; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      renderQr();
      flash($('#qrCard'));
      break;
    case 'plat':
      S.platform = k;
      $$('.plat-seg button').forEach(x => { const on = x.dataset.k === k; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      $('#steps').innerHTML = stepsHtml();
      break;
    case 'copy': copyLink(); break;
    case 'share': shareLink(); break;
    case 'saveQr': saveQr(); break;
    case 'printQr': printQr(); break;
    case 'kitAll': downloadKit(APP_LIST.map(a => a.key), b); break;
    case 'kit': downloadKit([k], b); break;
  }
});

$('#langToggle').addEventListener('click', () => { i18n.setLang(i18n.lang === 'ar' ? 'en' : 'ar'); render(); });
initTheme($('#themeToggle'));
i18n.setLang(i18n.lang);
render();

// Optional extras: the deployed version and the school name (public information only).
fetch('/version.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then((v) => {
  if (v && v.version && v.version !== S.version) { S.version = v.version; render(); }
}).catch(() => {});
fetch('/api/rpc', {
  method: 'POST', cache: 'no-store', credentials: 'omit',
  headers: { 'Content-Type': 'application/json', 'X-App': 'teachers' },
  body: JSON.stringify({ action: 'system.info', data: {} })
}).then(r => r.json()).then((b) => {
  const d = b && b.ok && b.data;
  if (d && (d.schoolName || d.schoolNameAr)) {
    S.school = { en: d.schoolName || S.school.en, ar: d.schoolNameAr || d.schoolName || S.school.ar };
    render();
  }
}).catch(() => {});
