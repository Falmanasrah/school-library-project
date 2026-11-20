// App chooser for the website: pick Teachers, Library Teachers or Floor Supervisors.
// Shown on the first visit to the site and from the "Apps" button. Installed apps never show it.
const APPS = [
  { key: 'teachers', path: '/', icon: '/icons/icon-192.png', color: '#0f5d8a',
    en: ['Teachers App', 'Book library periods for your classes'], ar: ['تطبيق المعلمين', 'احجز حصص المكتبة لصفوفك'] },
  { key: 'library', path: '/library/', icon: '/library/icons/icon-192.png', color: '#1f7a5a',
    en: ['Library Teachers App', 'Visits, approvals, permission slips and administration'], ar: ['تطبيق معلمي المكتبة', 'الزيارات والموافقات والأذونات والإدارة'] },
  { key: 'supervisors', path: '/supervisors/', icon: '/supervisors/icons/icon-192.png', color: '#9a5d00',
    en: ['Floor Supervisors App', 'Send permission slips to the library'], ar: ['تطبيق مشرفي الطوابق', 'أرسل أذونات الطلاب إلى المكتبة'] }
];
const TXT = {
  en: { title: 'Choose your app', sub: 'Each app is for a different job. You can switch any time with the Apps button.', btn: 'Apps', here: 'You are here', install: 'Install on a device' },
  ar: { title: 'اختر تطبيقك', sub: 'لكل تطبيق عمل مختلف. يمكنك التبديل في أي وقت من زر التطبيقات.', btn: 'التطبيقات', here: 'أنت هنا', install: 'التثبيت على جهاز' }
};
const KEY = 'slp.appChoice';
const store = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }
};
const installed = () => ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].some(m => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true;
const path = location.pathname;
const current = path.startsWith('/library') ? 'library' : path.startsWith('/supervisors') ? 'supervisors' : 'teachers';
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function css() {
  const s = document.createElement('style');
  s.textContent = `
  .ac-overlay{position:fixed;inset:0;z-index:400;background:rgba(10,20,30,.55);display:flex;align-items:center;justify-content:center;padding:16px}
  .ac-box{background:var(--surface,#fff);color:var(--ink,#14202b);width:100%;max-width:520px;border-radius:20px;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.3);max-height:92vh;overflow:auto}
  .ac-box h2{margin:0 0 4px;font-size:20px}.ac-box p.ac-sub{margin:0 0 16px;font-size:13.5px;color:var(--ink-soft,#5b6b78);line-height:1.5}
  .ac-app{display:flex;gap:12px;align-items:center;width:100%;text-align:start;padding:12px;margin-bottom:10px;border-radius:14px;border:1.5px solid var(--line-strong,#ccd6de);background:var(--page,#f4f7f9);color:inherit;cursor:pointer;font:inherit;text-decoration:none}
  .ac-app:hover{border-color:var(--c)}.ac-app.ac-on{border-color:var(--c);box-shadow:0 0 0 2px var(--c) inset}
  .ac-app img{width:46px;height:46px;border-radius:12px;flex-shrink:0}.ac-app b{display:block;font-size:15.5px}.ac-app span{font-size:12.5px;color:var(--ink-soft,#5b6b78)}
  .ac-app em{font-style:normal;font-size:11px;font-weight:700;color:var(--c);margin-inline-start:auto;white-space:nowrap}
  .ac-foot{text-align:center;font-size:13px;margin-top:6px}.ac-foot a{color:var(--brand,#0f5d8a)}`;
  document.head.appendChild(s);
}

function open(first) {
  const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const T = TXT[lang];
  const ov = document.createElement('div');
  ov.className = 'ac-overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `<div class="ac-box"><h2>${esc(T.title)}</h2><p class="ac-sub">${esc(T.sub)}</p>
    ${APPS.map(a => `<a class="ac-app${a.key === current ? ' ac-on' : ''}" href="${a.path}" data-k="${a.key}" style="--c:${a.color}">
      <img src="${a.icon}" alt=""><div><b>${esc(a[lang][0])}</b><span>${esc(a[lang][1])}</span></div>${a.key === current ? `<em>${esc(T.here)}</em>` : ''}</a>`).join('')}
    <div class="ac-foot"><a href="/download/">${esc(T.install)}</a></div></div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !first) close(); };
  ov.addEventListener('click', (e) => {
    const a = e.target.closest('.ac-app');
    if (a) {
      store.set(a.dataset.k);
      if (a.dataset.k === current) { e.preventDefault(); close(); }
      return;
    }
    if (e.target === ov && !first) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  ov.querySelector('.ac-app')?.focus();
}

if (!installed()) {
  css();
  const bar = document.querySelector('.util-bar');
  if (bar) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'util-btn';
    b.id = 'appChooserBtn';
    b.textContent = '⇄ ' + TXT[document.documentElement.lang === 'ar' ? 'ar' : 'en'].btn;
    b.addEventListener('click', () => open(false));
    bar.prepend(b);
    new MutationObserver(() => { b.textContent = '⇄ ' + TXT[document.documentElement.lang === 'ar' ? 'ar' : 'en'].btn; })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  // First visit to the website: ask which app to use. Remembered after that.
  if (!store.get()) open(true);
}
