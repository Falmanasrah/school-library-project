// State and small UI helpers shared by the Library Teachers App screens and its admin panel.
import { createApi, createI18n, mergeDicts, COMMON_I18N, esc, store, errorText, toast, openSheet, fmtDate, fmtDateTime } from '/shared/core.js';
import { AUTH_I18N } from '/shared/auth.js';
import { LIB_I18N, ADMIN_I18N } from '/library/i18n.js';

export const i18n = createI18n(mergeDicts(COMMON_I18N, AUTH_I18N, LIB_I18N, ADMIN_I18N));
export const t = (k, ...a) => i18n.t(k, ...a);
export const api = createApi('library');

const savedFilter = store.get('lib.filter');
export const S = {
  me: null, d: null, loaded: false, today: null, nowTime: null, tz: null,
  tab: store.get('lib.tab') || 'visits',
  filter: ['junior', 'senior'].includes(savedFilter) ? savedFilter : 'all',
  seenSlips: null, newIds: new Set()
};
// Filled in by app.js: refresh the live data now, switch tab.
export const ctl = { refresh() {}, goTab() {} };

export const LIBS = ['junior', 'senior'];
export const badge = (st) => `<span class="status-badge st-${esc(st)}">${esc(t('st_' + st))}</span>`;
export const libShort = (l) => t(l + 'Short');
export const libName = (l) => t(l);
export const langLabel = (l) => t(l === 'arabic' ? 'arabic' : 'english');
export const dLabel = (key) => fmtDate(key, i18n, { weekday: 'short', day: 'numeric', month: 'short' });
export const dLong = (key) => fmtDate(key, i18n, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const dt = (ms) => (ms ? fmtDateTime(ms, i18n, S.tz) : '');
export const matchLib = (x) => S.filter === 'all' || x.library === S.filter;
export const nowHM = () => S.nowTime || new Date().toTimeString().slice(0, 5);
export const defaultLib = () => (S.filter !== 'all' ? S.filter : (store.get('lib.lastLib') === 'senior' ? 'senior' : 'junior'));
export const isAdmin = () => !!S.me?.isAdmin;
export const reasonText = (s) => (s.reason === 'other' && s.reasonText ? s.reasonText : t('reason_' + s.reason));
export const libOptions = () => LIBS.map(l => ({ value: l, label: libName(l) }));
export const langOptions = () => [{ value: 'english', label: t('english') }, { value: 'arabic', label: t('arabic') }];
export const periodOptions = (blank) => [...(blank ? [{ value: '', label: '—' }] : []), ...[1, 2, 3, 4, 5, 6, 7].map(p => ({ value: p, label: String(p) }))];

/* Error text for forms: validation errors keep the server's explanation of which field is wrong. */
export function formError(e) {
  if (['INVALID_INPUT', 'INVALID_DATE'].includes(e?.code) && e.message) return i18n.lang === 'en' ? e.message : `${t('err_INVALID_INPUT')} (${e.message})`;
  if (e?.code === 'INVALID_TIME' && e.message && i18n.lang === 'en') return e.message;
  return errorText(e, i18n);
}
export function userError(message) { return Object.assign(new Error(message), { code: 'CLIENT_CHECK' }); }

/* Runs an action, shows a toast, refreshes the live data. Returns true when it worked. */
export async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); ctl.refresh(); return r ?? true; }
  catch (e) { toast(formError(e), true); return false; }
}

/* ---------------- forms in bottom sheets ---------------- */
function fieldHtml(f) {
  if (f.type === 'html') return f.html;
  const id = 'f_' + f.id;
  const full = f.full ? ' full' : '';
  if (f.type === 'check') {
    return `<label class="check-row full"><input type="checkbox" id="${id}"${f.value ? ' checked' : ''} /> <span>${esc(f.label)}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</span></label>`;
  }
  if (f.type === 'choice') {
    return `<div class="fg${full}"><label>${esc(f.label)}</label><div class="choice-row">${f.options.map(o => `<label><input type="radio" name="${id}" value="${esc(o.value)}"${String(o.value) === String(f.value) ? ' checked' : ''} /> ${esc(o.label)}</label>`).join('')}</div></div>`;
  }
  const attrs = [
    f.min !== undefined ? `min="${esc(f.min)}"` : '', f.max !== undefined ? `max="${esc(f.max)}"` : '',
    f.maxlength ? `maxlength="${f.maxlength}"` : '', f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '',
    f.list ? `list="${id}_list"` : '', f.readonly ? 'readonly' : '', f.cls ? `class="${f.cls}"` : '',
    `autocomplete="${f.autocomplete || 'off'}"`, f.inputmode ? `inputmode="${f.inputmode}"` : ''
  ].filter(Boolean).join(' ');
  let input;
  if (f.type === 'select') input = `<select id="${id}">${f.options.map(o => `<option value="${esc(o.value)}"${String(o.value) === String(f.value ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') input = `<textarea id="${id}" rows="${f.rows || 2}" ${attrs}>${esc(f.value ?? '')}</textarea>`;
  else input = `<input id="${id}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${attrs} />`;
  const list = f.list ? `<datalist id="${id}_list">${f.list.map(x => `<option value="${esc(x)}"></option>`).join('')}</datalist>` : '';
  const opt = f.optional ? ` <span class="muted" style="font-weight:500">${esc(t('optional'))}</span>` : '';
  return `<div class="fg${full}"><label for="${id}">${esc(f.label)}${opt}</label>${input}${list}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}</div>`;
}

export function readFields(root, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'html') continue;
    const id = 'f_' + f.id;
    if (f.type === 'choice') out[f.id] = root.querySelector(`input[name="${id}"]:checked`)?.value ?? null;
    else if (f.type === 'check') out[f.id] = root.querySelector('#' + id).checked;
    else {
      const v = root.querySelector('#' + id).value;
      out[f.id] = f.type === 'number' ? (v === '' ? null : Number(v)) : v.trim();
    }
  }
  return out;
}

/* A form in a sheet. onSubmit(values, handle) may throw; the error is shown inside the form. Return false to keep it open. */
export function formSheet({ title, sub, fields, submitLabel, danger = false, wide = false, extra = '', onSubmit, onMount }) {
  const h = openSheet(`<h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}${extra}
    <form id="fsForm" novalidate><div class="form-grid">${fields.map(fieldHtml).join('')}</div>
      <p class="field-err" id="fsErr"></p>
      <div class="sheet-btns"><button type="button" class="cancel" id="fsCancel">${esc(t('cancel'))}</button><button type="submit" class="confirm${danger ? ' danger' : ''}" id="fsOk">${esc(submitLabel || t('save'))}</button></div>
    </form>`, { wide });
  const err = h.el.querySelector('#fsErr');
  h.el.querySelector('#fsCancel').onclick = () => h.close();
  h.el.querySelector('#fsForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = h.el.querySelector('#fsOk');
    if (btn.disabled) return;
    err.style.display = 'none';
    btn.disabled = true; btn.classList.add('is-busy');
    try {
      const r = await onSubmit(readFields(h.el, fields), h);
      if (r !== false) h.close();
    } catch (ex) { err.textContent = formError(ex); err.style.display = 'block'; }
    finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); } }
  };
  onMount && onMount(h);
  return h;
}

/* Detail sheet: a key/value list plus buttons. buttons: [{ id, label, cls, onClick(handle) }] */
export function detailSheet({ title, sub, rows, buttons = [], wide = false, extra = '' }) {
  const kv = rows.filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v, raw]) => `<span>${esc(k)}</span><span>${raw ? v : esc(v)}</span>`).join('');
  const h = openSheet(`<h2>${esc(title)}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}
    <div class="confirm-box"><div class="kv">${kv}</div></div>${extra}
    <div class="btn-row" style="justify-content:flex-end">${buttons.map(b => `<button type="button" class="btn ${b.cls || ''}" data-b="${b.id}">${esc(b.label)}</button>`).join('')}<button type="button" class="btn" data-b="__close">${esc(t('close'))}</button></div>`, { wide });
  h.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    if (b.dataset.b === '__close') return h.close();
    const def = buttons.find(x => x.id === b.dataset.b);
    if (def) def.onClick(h, b);
  });
  return h;
}

export function emptyHtml(msg) { return `<div class="empty">${esc(msg)}</div>`; }

export function sortRows(rows, ...keys) {
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const desc = k.startsWith('-'); const f = desc ? k.slice(1) : k;
      const x = a[f] ?? '', y = b[f] ?? '';
      if (x < y) return desc ? 1 : -1;
      if (x > y) return desc ? -1 : 1;
    }
    return 0;
  });
}

export function genPassword() {
  const L = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789', all = L + D;
  const r = crypto.getRandomValues(new Uint32Array(12));
  const chars = Array.from(r.slice(0, 10), (x) => all[x % all.length]);
  const pos = r[10] % 10;
  chars[pos] = D[r[11] % D.length];
  if (!chars.some(c => L.includes(c))) chars[(pos + 1) % 10] = L[r[11] % L.length];
  return chars.join('');
}

export { esc, store, toast, openSheet };
