// Two helpers shared by the three apps:
//  - startTour(): a step-by-step tutorial that darkens the whole screen except the one
//    button being explained, with a short note next to it.
//  - mountMenu(): one clearly labelled "Menu" button in the header that holds the
//    language, dark mode, app switcher, password, install, tutorial and sign-out buttons.
const lang = () => (document.documentElement.lang === 'ar' ? 'ar' : 'en');
const tx = (v) => (Array.isArray(v) ? v[lang() === 'ar' ? 1 : 0] : v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UI = {
  next: ['Next', 'التالي'], back: ['Back', 'السابق'], done: ['Finish', 'إنهاء'], skip: ['Skip tutorial', 'تخطي الشرح'],
  step: (a, b) => (lang() === 'ar' ? `الخطوة ${a} من ${b}` : `Step ${a} of ${b}`)
};

function css() {
  if (document.getElementById('guideCss')) return;
  const s = document.createElement('link');
  s.id = 'guideCss'; s.rel = 'stylesheet'; s.href = '/shared/guide.css';
  document.head.appendChild(s);
}

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const find = (sel) => (typeof sel === 'function' ? sel() : document.querySelector(sel));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let active = null;
/* steps: [{ el: selector or () => element, title: [en, ar], text: [en, ar], before?: () => void }] */
export function startTour(steps, { onEnd } = {}) {
  css();
  if (active) active.end();
  const block = document.createElement('div'); block.className = 'tour-block';
  const hole = document.createElement('div'); hole.className = 'tour-hole';
  const tip = document.createElement('div'); tip.className = 'tour-tip'; tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-live', 'polite');
  document.body.append(block, hole, tip);
  let i = -1, target = null;

  const place = () => {
    if (!target || !target.isConnected) return;
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const tw = tip.offsetWidth, th = tip.offsetHeight, vw = innerWidth, vh = innerHeight;
    let top = r.bottom + pad + 12;
    if (top + th > vh - 8) top = r.top - pad - 12 - th;
    if (top < 8) top = Math.min(vh - th - 8, Math.max(8, r.bottom + pad + 12));
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(vw - tw - 8, left));
    Object.assign(tip.style, { top: `${top}px`, left: `${left}px` });
  };
  const usable = [];
  async function go(n) {
    // Find the next step whose button is on screen (steps for things this person cannot see are skipped).
    const dir = n >= i ? 1 : -1;
    let found = null;
    for (let k = n; k >= 0 && k < steps.length; k += dir) {
      const st = steps[k];
      if (st.before) { st.before(); await wait(150); }
      const el = find(st.el);
      if (visible(el)) { i = k; found = el; break; }
    }
    if (!found) { if (dir > 0 || !target) end(); return; }
    target = found;
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    await wait(60);
    const total = steps.length, st = steps[i];
    const last = i === total - 1;
    tip.innerHTML = `<div class="tour-count">${esc(UI.step(i + 1, total))}</div>
      <h3>${esc(tx(st.title))}</h3><p>${esc(tx(st.text))}</p>
      <div class="tour-btns"><button type="button" class="tour-skip" data-t="skip">${esc(tx(UI.skip))}</button>
        <span class="tour-gap"></span>${i > 0 ? `<button type="button" data-t="back">${esc(tx(UI.back))}</button>` : ''}
        <button type="button" class="tour-next" data-t="next">${esc(tx(last ? UI.done : UI.next))}</button></div>`;
    place();
    tip.querySelector('.tour-next').focus();
  }
  function end() {
    if (!active) return;
    active = null;
    block.remove(); hole.remove(); tip.remove();
    removeEventListener('resize', place); removeEventListener('scroll', place, true); document.removeEventListener('keydown', key, true);
    onEnd && onEnd();
  }
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const fwd = (e.key === 'ArrowRight') !== (lang() === 'ar');
      fwd ? (i === steps.length - 1 ? end() : go(i + 1)) : (i > 0 && go(i - 1));
    }
  };
  tip.addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    if (b.dataset.t === 'skip') end();
    else if (b.dataset.t === 'back') go(i - 1);
    else if (i === steps.length - 1) end(); else go(i + 1);
  });
  addEventListener('resize', place); addEventListener('scroll', place, true); document.addEventListener('keydown', key, true);
  active = { end };
  go(0);
  return active;
}

/* Starts the tour once per app on this device (after the first sign-in); the Menu can replay it. */
export function tourOnce(appKey, run) {
  const k = `slp.tourSeen.${appKey}`;
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch { return; }
  setTimeout(run, 900);
}

/* ---------------- the header Menu ---------------- */
const ICONS = {
  help: '<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4.5"/><circle cx="12" cy="18" r=".6"/><circle cx="12" cy="12" r="10"/>',
  lang: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  theme: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
  apps: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  key: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11"/>'
};
const svg = (k) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${ICONS[k]}</svg>`;
const clickEl = (sel) => () => document.querySelector(sel)?.click();

/* Puts one "Menu" button at the end of the header. onTutorial starts this app's tour. */
export function mountMenu({ onTutorial }) {
  css();
  const host = document.querySelector('header.top .header-btns');
  if (!host || document.getElementById('menuBtn')) return;
  const items = [
    { k: 'help', label: ['How to use this app (tutorial)', 'طريقة استخدام التطبيق (شرح)'], run: onTutorial },
    { k: 'lang', label: ['العربية', 'English'], run: clickEl('#langToggle') },
    { k: 'theme', label: () => (document.documentElement.dataset.theme === 'dark' ? ['Light mode', 'الوضع الفاتح'] : ['Dark mode', 'الوضع الداكن']), run: clickEl('#themeToggle') },
    { k: 'apps', label: ['Switch to another app', 'الانتقال إلى تطبيق آخر'], run: clickEl('#appChooserBtn'), show: () => !!document.getElementById('appChooserBtn') },
    { k: 'key', label: ['Username and password', 'اسم المستخدم وكلمة المرور'], run: clickEl('#passwordBtn') },
    { k: 'install', label: ['Install as an app', 'تثبيت كتطبيق على الجهاز'], run: clickEl('.install-bar button'), show: () => !!document.querySelector('.install-bar button') && !matchMedia('(display-mode: standalone)').matches },
    { k: 'out', label: ['Sign out', 'تسجيل الخروج'], run: clickEl('#logoutBtn'), danger: true }
  ];
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'menuBtn'; btn.className = 'icon-btn menu-btn';
  btn.setAttribute('aria-haspopup', 'menu'); btn.setAttribute('aria-expanded', 'false');
  const label = () => { btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>${lang() === 'ar' ? 'القائمة' : 'Menu'}</span>`; };
  label();
  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  host.appendChild(btn);

  let pop = null;
  const close = () => { pop?.remove(); pop = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc1, true); };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !btn.contains(e.target)) close(); };
  const esc1 = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); btn.focus(); } };
  btn.addEventListener('click', () => {
    if (pop) return close();
    pop = document.createElement('div');
    pop.className = 'menu-pop'; pop.setAttribute('role', 'menu');
    pop.innerHTML = items.filter(x => !x.show || x.show()).map((x, n) => {
      const l = typeof x.label === 'function' ? x.label() : x.label;
      return `<button type="button" role="menuitem" data-n="${n}" class="${x.danger ? 'danger' : ''}${x.k === 'out' ? ' sep' : ''}">${svg(x.k)}<span>${esc(tx(l))}</span></button>`;
    }).join('');
    const shown = items.filter(x => !x.show || x.show());
    pop.addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (!b) return; close(); shown[Number(b.dataset.n)].run(); });
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    pop.style.top = `${r.bottom + 6}px`;
    if (lang() === 'ar') pop.style.left = `${Math.max(8, r.left)}px`; else pop.style.right = `${Math.max(8, innerWidth - r.right)}px`;
    btn.setAttribute('aria-expanded', 'true');
    pop.querySelector('button')?.focus();
    document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc1, true);
  });
}

/* Hides the separate top strip and install bar while signed in (they live in the Menu then). */
export function setSignedIn(on) { document.body.classList.toggle('in-app', !!on); }
