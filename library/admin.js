// Admin panel of the Library Teachers App (administrators only; every action is
// checked again on the server and written to the activity log).
import { $, confirmDialog, downloadCsv, errorText, addDays, fmtDuration } from '/shared/core.js';
import {
  i18n, t, api, S, ctl, badge, libShort, langLabel, dLabel, dLong, dt, matchLib, defaultLib, libOptions, langOptions, periodOptions,
  act, formSheet, detailSheet, emptyHtml, sortRows, genPassword, formError, userError, esc, store, toast, openSheet
} from '/library/common.js';

const ROLES = ['teacher', 'librarian', 'supervisor', 'admin'];
// Bookings now live on the Visits & Bookings page ("All bookings").
const SUBS = ['overview', 'accounts', 'periods', 'settings', 'audit'];
const roleChips = (roles) => roles.map(r => `<span class="chip">${esc(t('role_' + r))}</span>`).join('') || '<span class="muted">—</span>';
const roleChecks = (sel = []) => `<div class="fg full"><label>${esc(t('roles'))}</label><div class="role-checks">${ROLES.map(r => `<label><input type="checkbox" name="role" value="${r}"${sel.includes(r) ? ' checked' : ''} /> ${esc(t('role_' + r))}</label>`).join('')}</div><small class="hint">${esc(t('librarianIsAdmin'))}</small></div>`;
// How an account signs in: its username (and email, if it has one).
const who = (u) => [u.username ? '@' + u.username : '', u.email || ''].filter(Boolean).join(' · ');
const readRoles = (root) => [...root.querySelectorAll('input[name="role"]:checked')].map(x => x.value);
const LRI = String.fromCharCode(0x2066), PDI = String.fromCharCode(0x2069); // keep time ranges in order in Arabic
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const localDateOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const until = (ms, key) => `<span data-until="${ms}" data-key="${key}">${esc(t(key, fmtDuration(ms - api.serverNow(), i18n)))}</span>`;

/* ---------------- accounts cache ---------------- */
const Users = {
  list: null, ver: null, loading: null,
  stale() { return !this.list || this.ver !== S.d?.versions?.users; },
  async load(force) {
    if (!force && !this.stale()) return this.list;
    if (this.loading) return this.loading;
    const ver = S.d?.versions?.users;
    this.loading = api.call('admin.users.list').then(r => { this.list = r.items; this.ver = ver; return this.list; }).finally(() => { this.loading = null; });
    return this.loading;
  },
  find(id) { return this.list?.find(u => u.id === id) || null; }
};
const locked = (u) => u.lockedUntil && u.lockedUntil > api.serverNow();

/* ======================= Overview ======================= */
const Overview = {
  health: null,
  mount(box) { this.box = box; this.render(); if (Users.stale()) Users.load().then(() => this.render()).catch(() => {}); },
  update() { this.render(); },
  render() {
    const d = S.d, att = d.attention || [];
    const stat = (n, label, go) => `<div class="stat click" data-go="${go}"><div class="n">${esc(n)}</div><div class="l">${esc(label)}</div></div>`;
    const p = d.period;
    this.box.innerHTML = `
      <div class="btn-row quick-row" style="margin-bottom:14px">
        <button class="btn primary" type="button" data-act="qteacher">＋ ${esc(t('newTeacher'))}</button>
        <button class="btn" type="button" data-act="qbooking">＋ ${esc(t('newBooking'))}</button>
      </div>
      <div class="stats">
        ${stat(d.pending.filter(matchLib).length, t('pendingReq'), 'tab:visits.today')}
        ${stat(d.visits.filter(matchLib).length, t('classesToday'), 'tab:records.class')}
        ${stat(d.slips.filter(matchLib).length, t('slipsToday'), 'tab:slips')}
        ${stat(d.visitors.filter(matchLib).length, t('studentsIn'), 'tab:records.visitors')}
        ${stat(Users.list ? Users.list.length : '…', t('totalAccounts'), 'sub:accounts')}
      </div>
      <div class="banner ${p.current?.state === 'open' ? 'open' : p.next ? 'scheduled' : 'closed'}">
        ${p.current?.state === 'open' ? `<span>${t('periodOpen', esc(dt(p.current.closesAt)))} ${until(p.current.closesAt, 'closesIn')}</span>` : `<span>${esc(t('noPeriod'))}${p.next ? ' ' + esc(t('periodNext', dt(p.next.opensAt))) : ''}</span>`}
        <button class="btn sm" type="button" data-go="sub:periods" style="margin-inline-start:auto">${esc(t('a_periods'))}</button>
      </div>
      <div class="card"><h3>${esc(t('needsAttention'))} ${att.length ? `<span class="status-badge st-pending">${att.length}</span>` : ''}</h3>
        ${att.length ? `<div class="list">${att.map(u => `<div class="item"><div class="main"><div class="title">${esc(u.name)} ${badge(u.status)}</div>
          <div class="meta">${esc(who(u))}${u.requestedRoles.length ? ` · ${esc(t('wantsRole', u.requestedRoles.map(r => t('role_' + r)).join(', ')))}` : ''}${u.resetRequestedAt ? ` · <b>${esc(t('resetAsked', dt(u.resetRequestedAt)))}</b>` : ''} · ${esc(t('registered', dt(u.createdAt)))}</div></div>
          <button class="btn primary sm" type="button" data-act="manage" data-uid="${esc(u.id)}">${esc(t('manage'))}</button></div>`).join('')}</div>` : `<p class="muted small" style="margin:0">${esc(t('attentionNone'))}</p>`}
      </div>
      <div class="card"><h3>${esc(t('health'))}</h3>
        ${this.health ? `<div class="kv" style="margin-bottom:12px">${this.health.error ? `<span>${esc(t('status'))}</span><span style="color:var(--red)">${esc(this.health.error)}</span>` : `
          <span>${esc(t('status'))}</span><span style="color:var(--green)">✓ ${esc(t('healthOk', this.health.latencyMs))}</span>
          <span>${esc(t('storage'))}</span><span>${esc(this.health.storage)}</span>
          <span>${esc(t('serverTime'))}</span><span>${esc(this.health.schoolDate)} ${esc(this.health.schoolTime)}</span>
          <span>${esc(t('tz'))}</span><span>${esc(this.health.timeZone)}</span>
          <span>Version</span><span>${esc(this.health.version)}</span>`}</div>` : ''}
        <button class="btn" type="button" data-act="health">${esc(t('runHealth'))}</button>
      </div>`;
  },
  async onClick(e, a) {
    if (a?.dataset.act === 'qteacher') return newAccount(['teacher']);
    if (a?.dataset.act === 'qbooking') return Bookings.form(null);
    if (a?.dataset.act === 'health') {
      a.disabled = true;
      try { this.health = await api.call('admin.system.health'); } catch (err) { this.health = { error: errorText(err, i18n) }; }
      this.render();
    }
  }
};

/* ======================= Accounts ======================= */
const Accounts = {
  q: { text: '', role: 'all', status: 'all' },
  mount(box) {
    this.box = box;
    const st = ['all', 'active', 'pending', 'suspended', 'banned', 'rejected', 'locked', 'attention'];
    box.innerHTML = `<div class="toolbar">
        <div class="fg grow"><label for="aText">${esc(t('search'))}</label><input id="aText" value="${esc(this.q.text)}" placeholder="${esc(t('name'))}, ${esc(t('username'))}, ${esc(t('email'))}" /></div>
        <div class="fg"><label for="aRole">${esc(t('roles'))}</label><select id="aRole"><option value="all">${esc(t('allRoles'))}</option>${ROLES.map(r => `<option value="${r}"${this.q.role === r ? ' selected' : ''}>${esc(t('role_' + r))}</option>`).join('')}</select></div>
        <div class="fg"><label for="aStatus">${esc(t('status'))}</label><select id="aStatus">${st.map(s => `<option value="${s}"${this.q.status === s ? ' selected' : ''}>${esc(s === 'all' ? t('allStatuses') : s === 'locked' ? t('locked') : s === 'attention' ? t('needsAttention') : t('st_' + s))}</option>`).join('')}</select></div>
        <button class="btn primary" type="button" data-act="new">＋ ${esc(t('newAccount'))}</button><div class="out-group"><button class="btn" type="button" data-act="csv">${esc(t('exportCsv'))}</button></div></div>
      <div id="accRes">${emptyHtml(t('loading'))}</div>`;
    const re = () => { this.q.text = $('#aText', box).value.trim(); this.q.role = $('#aRole', box).value; this.q.status = $('#aStatus', box).value; this.renderList(); };
    $('#aText', box).oninput = re; $('#aRole', box).onchange = re; $('#aStatus', box).onchange = re;
    this.reload();
  },
  update() { if (Users.stale()) this.reload(); },
  async reload(force) {
    try { await Users.load(force); this.renderList(); }
    catch (e) { const b = $('#accRes', this.box); if (b) b.innerHTML = emptyHtml(errorText(e, i18n)); }
  },
  filtered() {
    const q = this.q.text.toLowerCase();
    return (Users.list || []).filter(u => (!q || u.name.toLowerCase().includes(q) || (u.username || '').includes(q) || (u.email || '').includes(q)) &&
      (this.q.role === 'all' || u.roles.includes(this.q.role) || u.requestedRoles.includes(this.q.role)) &&
      (this.q.status === 'all' || (this.q.status === 'locked' ? locked(u) : this.q.status === 'attention' ? u.attention : u.status === this.q.status)));
  },
  renderList() {
    const box = $('#accRes', this.box);
    if (!box || !Users.list) return;
    const rows = this.filtered();
    box.innerHTML = rows.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('roles'))}</th><th>${esc(t('status'))}</th><th>${esc(t('lastSignIn'))}</th><th>${esc(t('created'))}</th><th></th></tr></thead><tbody>
      ${rows.map(u => `<tr class="clickable" data-act="manage" data-uid="${esc(u.id)}"><td><b>${esc(u.name)}</b>${u.id === S.me.id ? ` <span class="muted">${esc(t('you'))}</span>` : ''}<span class="sub">${esc(who(u))}</span></td>
        <td>${roleChips(u.roles)}${u.requestedRoles.length ? `<span class="sub">${esc(t('requested'))}: ${esc(u.requestedRoles.map(r => t('role_' + r)).join(', '))}</span>` : ''}</td>
        <td>${badge(u.status)}${locked(u) ? ` <span class="status-badge st-rejected">${esc(t('locked'))}</span>` : ''}${u.resetRequestedAt ? ` <span class="status-badge st-pending">${esc(t('resetReq'))}</span>` : ''}${u.statusReason ? `<span class="sub">${esc(u.statusReason)}</span>` : ''}</td>
        <td class="small">${u.lastLoginAt ? `${esc(dt(u.lastLoginAt))}<span class="sub">${esc(t('app_' + (u.lastLoginApp || 'library')))}</span>` : esc(t('never'))}</td><td class="small">${esc(dt(u.createdAt))}</td>
        <td class="actions"><button class="btn sm" type="button" data-act="manage" data-uid="${esc(u.id)}">${esc(t('manage'))}</button></td></tr>`).join('')}</tbody></table></div>` : emptyHtml(t('nothingFound'));
  },
  onClick(e, a) {
    if (!a) return;
    if (a.dataset.act === 'new') return newAccount();
    if (a.dataset.act === 'csv') {
      return downloadCsv(`accounts-${S.today}.csv`, ['Name', 'Username', 'Email', 'Roles', 'Requested roles', 'Status', 'Reason', 'Last sign-in', 'Created'],
        this.filtered().map(u => [u.name, u.username || '', u.email || '', u.roles.join(' '), u.requestedRoles.join(' '), u.status, u.statusReason, u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '', u.createdAt ? new Date(u.createdAt).toISOString() : '']));
    }
    return undefined;
  }
};

// A new account; teacher is ticked unless other roles are given.
export function newAccount(defaultRoles = ['teacher']) {
  formSheet({
    title: defaultRoles.length === 1 && defaultRoles[0] === 'teacher' ? t('newTeacher') : t('newAccount'), wide: true, submitLabel: t('newAccount'),
    fields: [
      { id: 'name', label: t('a_name'), maxlength: 80 },
      { id: 'username', label: t('username'), maxlength: 30, autocomplete: 'off', hint: t('usernameTempHint') },
      { id: 'email', label: t('email'), type: 'email', autocomplete: 'off', optional: true },
      { type: 'html', html: roleChecks(defaultRoles) },
      { id: 'password', label: t('tempPassword'), value: genPassword(), autocomplete: 'off', hint: t('a_passHint') },
      { id: 'mustChangePassword', type: 'check', label: t('mustChange'), value: true }
    ],
    onSubmit: async (v, h) => {
      const roles = readRoles(h.el);
      if (!roles.length) throw userError(t('chooseRole'));
      await api.call('admin.user.create', { ...v, roles });
      toast(t('accountCreated'));
      await Users.load(true).catch(() => {});
      ctl.refresh(); if (Accounts.box?.isConnected) Accounts.renderList();
      setTimeout(() => detailSheet({ title: t('accountCreated'), sub: esc(t('giveTemp')), rows: [[t('a_name'), v.name], [t('username'), v.username.toLowerCase()], [t('roles'), roles.map(r => t('role_' + r)).join(', ')], [t('tempPassword'), `<b class="code">${esc(v.password)}</b>`, true]] }), 250);
    }
  });
}

/* The account manager: every account control in one sheet. */
async function manageAccount(uid) {
  let u = Users.find(uid) || (S.d.attention || []).find(x => x.id === uid);
  const h = openSheet(`<p class="sub">${esc(t('loading'))}</p>`, { wide: true });
  try { await Users.load(); u = Users.find(uid) || u; } catch (e) { toast(errorText(e, i18n), true); }
  if (!u) { h.close(); return toast(t('err_NOT_FOUND'), true); }
  const self = () => u.id === S.me.id;

  const render = () => {
    const pendingReq = u.status === 'pending' || u.requestedRoles.length > 0;
    const restricted = ['suspended', 'banned', 'rejected'].includes(u.status);
    h.el.innerHTML = `<div class="sheet-handle"></div>
      <h2>${esc(u.name)} ${self() ? `<span class="muted" style="font-size:13px">${esc(t('you'))}</span>` : ''}</h2>
      <p class="sub">${esc(who(u))} · ${badge(u.status)} ${roleChips(u.roles)}</p>
      ${pendingReq ? `<div class="auth-notice warn">${esc(u.requestedRoles.length ? t('wantsRole', u.requestedRoles.map(r => t('role_' + r)).join(', ')) : t('st_pending'))}
        <div class="btn-row" style="margin-top:8px"><button class="btn good sm" type="button" data-m="approve">✓ ${esc(t('approveReq', (u.requestedRoles.length ? u.requestedRoles : u.roles).map(r => t('role_' + r)).join(', ') || '—'))}</button><button class="btn danger sm" type="button" data-m="deny">${esc(t('denyReq'))}</button></div></div>` : ''}
      ${u.resetRequestedAt ? `<div class="auth-notice warn">${esc(t('resetAsked', dt(u.resetRequestedAt)))}</div>` : ''}
      ${locked(u) ? `<div class="auth-notice err">${esc(t('lockedUntil', dt(u.lockedUntil)))} <button class="btn sm" type="button" data-m="unlock" style="margin-inline-start:8px">${esc(t('unlock'))}</button></div>` : ''}
      ${restricted && (u.statusReason || u.suspendedUntil) ? `<div class="auth-notice err">${u.statusReason ? `${esc(t('statusReason'))}: ${esc(u.statusReason)}` : ''}${u.suspendedUntil ? ` · ${esc(t('until'))}: ${esc(dt(u.suspendedUntil))}` : ''}</div>` : ''}
      <div class="kv"><span>${esc(t('created'))}</span><span>${esc(dt(u.createdAt))}${u.createdByName ? ` · ${esc(u.createdByName)}` : ''}</span>
        <span>${esc(t('lastSignIn'))}</span><span>${u.lastLoginAt ? `${esc(dt(u.lastLoginAt))} · ${esc(t('app_' + (u.lastLoginApp || 'library')))}` : esc(t('never'))}</span></div>

      <div class="section-label">${esc(t('sec_details'))}</div>
      <div class="form-grid">
        <div class="fg"><label for="mName">${esc(t('a_name'))}</label><input id="mName" value="${esc(u.name)}" maxlength="80" autocomplete="off" /></div>
        <div class="fg"><label for="mUser">${esc(t('username'))}</label><input id="mUser" value="${esc(u.username || '')}" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" /></div>
        <div class="fg"><label for="mEmail">${esc(t('email'))} <span class="muted" style="font-weight:500">${esc(t('optional'))}</span></label><input id="mEmail" type="email" value="${esc(u.email || '')}" autocomplete="off" /></div>
        ${roleChecks(u.roles)}
      </div>
      <button class="btn primary" type="button" data-m="save">${esc(t('saveDetails'))}</button>

      <div class="section-label">${esc(t('sec_password'))}</div>
      <div class="two-col"><div class="fg"><label for="mPass">${esc(t('tempPassword'))}</label><input id="mPass" value="${esc(genPassword())}" autocomplete="off" /><small class="hint">${esc(t('a_passHint'))}</small></div>
        <div style="padding-top:26px"><button class="btn" type="button" data-m="gen">${esc(t('generate'))}</button></div></div>
      <label class="check-row"><input type="checkbox" id="mMust" checked /> <span>${esc(t('mustChange'))}</span></label>
      <button class="btn primary" type="button" data-m="setpw">${esc(t('setPassword'))}</button>

      <div class="section-label">${esc(t('sec_status'))}</div>
      <div class="acct-actions">
        ${u.status === 'active' && !self() ? `<button class="btn" type="button" data-m="suspend">⏸ ${esc(t('suspend'))}</button><button class="btn danger" type="button" data-m="ban">${esc(t('ban'))}</button>` : ''}
        ${restricted ? `<button class="btn good" type="button" data-m="reactivate">▶ ${esc(t('reactivate'))}</button>` : ''}
        ${u.status === 'suspended' && !self() ? `<button class="btn danger" type="button" data-m="ban">${esc(t('ban'))}</button>` : ''}
        <button class="btn" type="button" data-m="revoke">${esc(t('signOutAll'))}</button>
      </div>
      ${!self() ? `<div class="section-label">${esc(t('sec_danger'))}</div><button class="btn danger" type="button" data-m="delete">${esc(t('deleteAccount'))}</button>` : ''}
      <p class="field-err" id="mErr"></p>
      <div class="sheet-btns" style="margin-top:18px"><button class="cancel" type="button" data-m="close">${esc(t('close'))}</button></div>`;
  };

  const after = async (msg) => {
    if (msg) toast(msg);
    try { await Users.load(true); u = Users.find(uid) || u; } catch { /* keep the old view */ }
    ctl.refresh(); Accounts.renderList();
    if (h.el.isConnected) render();
  };
  const call = async (btn, action, data, msg) => {
    const err = $('#mErr', h.el);
    err.style.display = 'none';
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
    try { const r = await api.call(action, { uid, ...data }); await after(typeof msg === 'function' ? msg(r) : msg); return r; }
    catch (e) { err.textContent = formError(e); err.style.display = 'block'; toast(formError(e), true); return null; }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); } }
  };

  h.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    switch (b.dataset.m) {
      case 'close': return h.close();
      case 'gen': $('#mPass', h.el).value = genPassword(); return undefined;
      case 'approve': return call(b, 'admin.user.approve', u.requestedRoles.length ? {} : { roles: readRoles(h.el) }, t('approvedMsg'));
      case 'deny': {
        const reason = await confirmDialog({ title: t('denyTitle'), message: esc(u.name), confirmLabel: t('denyReq'), cancelLabel: t('cancel'), danger: true, input: { label: t('reasonLabel') + ' ' + t('optional'), max: 200 } });
        if (reason !== false) await call(null, 'admin.user.denyRequest', { reason }, t('deniedMsg'));
        return undefined;
      }
      case 'save': {
        const roles = readRoles(h.el);
        if (!roles.length) { const er = $('#mErr', h.el); er.textContent = t('chooseRole'); er.style.display = 'block'; return undefined; }
        return call(b, 'admin.user.update', { name: $('#mName', h.el).value.trim(), username: $('#mUser', h.el).value.trim(), email: $('#mEmail', h.el).value.trim(), roles }, t('saved'));
      }
      case 'setpw': {
        const password = $('#mPass', h.el).value.trim();
        const r = await call(b, 'admin.user.setPassword', { password, mustChangePassword: $('#mMust', h.el).checked }, null);
        if (r) detailSheet({ title: t('setPassword'), sub: esc(t('passwordSet')), rows: [[t('a_name'), u.name], [t('username'), u.username || u.email || ''], [t('tempPassword'), `<b class="code">${esc(password)}</b>`, true]] });
        return undefined;
      }
      case 'unlock': return call(b, 'admin.user.unlock', {}, t('unlocked'));
      case 'suspend': return formSheet({
        title: `${t('suspendTitle')}: ${u.name}`, submitLabel: t('suspend'), danger: true,
        fields: [
          { id: 'reason', label: t('reasonLabel'), type: 'textarea', maxlength: 200, full: true },
          { id: 'until', label: t('suspendUntil'), type: 'datetime-local', full: true, min: toLocalInput(Date.now() + 5 * 60000) }
        ],
        onSubmit: async (v) => {
          if (!v.reason) throw userError(t('reasonRequired'));
          await api.call('admin.user.suspend', { uid, reason: v.reason, until: v.until ? new Date(v.until).getTime() : null });
          await after(t('suspended'));
        }
      });
      case 'ban': {
        const reason = await confirmDialog({ title: `${t('banTitle')}: ${u.name}`, confirmLabel: t('ban'), cancelLabel: t('cancel'), danger: true, input: { label: t('reasonLabel'), max: 200, required: true, requiredMsg: t('reasonRequired') } });
        if (reason) await call(null, 'admin.user.ban', { reason }, t('banned'));
        return undefined;
      }
      case 'reactivate': return call(b, 'admin.user.reactivate', {}, t('reactivated'));
      case 'revoke': return call(b, 'admin.user.revokeSessions', {}, (r) => t('sessionsOut', r.revoked));
      case 'delete': {
        const ok = await confirmDialog({ title: t('deleteAccountTitle'), message: `<b>${esc(u.name)}</b> · ${esc(who(u))}<br>${esc(t('deleteAccountBody'))}`, confirmLabel: t('deleteAccount'), cancelLabel: t('cancel'), danger: true });
        if (!ok) return undefined;
        try { await api.call('admin.user.delete', { uid }); toast(t('deleted')); h.close(); await Users.load(true).catch(() => {}); ctl.refresh(); Accounts.renderList(); }
        catch (e2) { toast(formError(e2), true); }
        return undefined;
      }
      default: return undefined;
    }
  });
  render();
  return undefined;
}

/* ======================= Bookings ======================= */
export const Bookings = {
  q: null, items: null,
  mount(box) {
    this.box = box;
    if (!this.q) this.q = { from: addDays(S.today, -7), to: addDays(S.today, 60), status: 'all', text: '' };
    const st = ['all', 'pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show'];
    box.innerHTML = `<div class="toolbar">
        <div class="fg"><label for="bFrom">${esc(t('from'))}</label><input type="date" id="bFrom" value="${esc(this.q.from)}" /></div>
        <div class="fg"><label for="bTo">${esc(t('to'))}</label><input type="date" id="bTo" value="${esc(this.q.to)}" /></div>
        <div class="fg"><label for="bStatus">${esc(t('status'))}</label><select id="bStatus">${st.map(s => `<option value="${s}"${this.q.status === s ? ' selected' : ''}>${esc(s === 'all' ? t('allStatusesB') : t('st_' + s))}</option>`).join('')}</select></div>
        <div class="fg grow"><label for="bText">${esc(t('search'))}</label><input id="bText" value="${esc(this.q.text)}" placeholder="${esc(t('searchPh'))}" /></div>
        <button class="btn primary" type="button" data-act="bsearch">${esc(t('search'))}</button>
        <div class="out-group"><button class="btn" type="button" data-act="bcsv">${esc(t('exportCsv'))}</button></div></div>
      <div id="bRes">${emptyHtml(t('loading'))}</div>`;
    $('#bText', box).onkeydown = (e) => { if (e.key === 'Enter') this.search(false); };
    this.search(true);
  },
  update() { if (S.d.versions?.bookings !== this.ver) this.search(true); },
  async search(silent) {
    if (!this.q || !this.box?.isConnected) return; // not on screen (e.g. after "+ New booking" from another page)
    if (!silent) {
      this.q.from = $('#bFrom', this.box).value || this.q.from; this.q.to = $('#bTo', this.box).value || this.q.to;
      this.q.status = $('#bStatus', this.box).value; this.q.text = $('#bText', this.box).value.trim();
    }
    try {
      this.ver = S.d.versions?.bookings;
      const r = await api.call('bookings.search', { from: this.q.from, to: this.q.to, status: this.q.status, q: this.q.text, library: S.filter });
      this.items = sortRows(r.items, 'date', 'period');
      this.renderList();
    } catch (e) { toast(errorText(e, i18n), true); }
  },
  renderList() {
    const box = $('#bRes', this.box);
    if (!box) return;
    if (!this.items.length) { box.innerHTML = emptyHtml(t('nothingFound')); return; }
    box.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('period'))}</th><th>${esc(t('library'))}</th><th>${esc(t('gradeSection'))}</th><th>${esc(t('studentsShort'))}</th><th>${esc(t('teacher'))}</th><th>${esc(t('status'))}</th><th></th></tr></thead><tbody>
      ${this.items.map(b => `<tr><td>${esc(dLabel(b.date))}</td><td>${esc(b.period)}<span class="sub">${LRI}${esc(b.startTime)}–${esc(b.endTime)}${PDI}</span></td><td>${esc(libShort(b.library))}</td><td><b>${esc(b.gradeSection)}</b><span class="sub">${esc(langLabel(b.classLanguage))}</span></td><td>${esc(b.students)}</td>
        <td>${esc(b.teacherName)}${b.createdByName ? `<span class="sub">${esc(b.createdByName)}</span>` : ''}</td><td>${badge(b.status)}${b.decidedByName ? `<span class="sub">${esc(b.decidedByName)}${b.decisionNote ? ': ' + esc(b.decisionNote) : ''}</span>` : ''}</td>
        <td class="actions"><div class="btn-row" style="justify-content:flex-end">${b.status === 'pending' ? `<button class="btn good sm" type="button" data-act="bapprove" data-id="${esc(b.id)}">${esc(t('approve'))}</button><button class="btn danger sm" type="button" data-act="breject" data-id="${esc(b.id)}">${esc(t('reject'))}</button>` : ''}
          <button class="btn sm" type="button" data-act="bedit" data-id="${esc(b.id)}">${esc(t('edit'))}</button><button class="btn danger sm" type="button" data-act="bdel" data-id="${esc(b.id)}">${esc(t('delete'))}</button></div></td></tr>`).join('')}</tbody></table></div>`;
  },
  async form(b) {
    let teacherField;
    if (!b) {
      try { await Users.load(); } catch (e) { return toast(errorText(e, i18n), true); }
      const teachers = Users.list.filter(u => u.roles.includes('teacher') && u.status === 'active');
      teacherField = { id: 'teacherUid', label: t('chooseTeacher'), type: 'select', full: true, options: [{ value: '', label: '—' }, ...teachers.map(u => ({ value: u.id, label: `${u.name} (${who(u)})` }))] };
    }
    const statuses = b ? ['pending', 'approved', 'rejected', 'cancelled', 'completed', 'no_show'] : ['approved', 'pending'];
    const fields = [
      ...(teacherField ? [teacherField] : []),
      { id: 'library', label: t('library'), type: 'select', value: b ? b.library : defaultLib(), options: libOptions() },
      { id: 'date', label: t('date'), type: 'date', value: b ? b.date : S.today },
      { id: 'period', label: t('period'), type: 'select', value: b ? b.period : 1, options: periodOptions(false) },
      { id: 'status', label: t('status'), type: 'select', value: b ? b.status : 'approved', options: statuses.map(s => ({ value: s, label: t('st_' + s) })) },
      { id: 'startTime', label: t('startTime'), type: 'time', value: b?.startTime || '' },
      { id: 'endTime', label: t('endTime'), type: 'time', value: b?.endTime || '' },
      { id: 'gradeSection', label: t('gradeSection'), value: b?.gradeSection || '', maxlength: 40 },
      { id: 'students', label: t('students'), type: 'number', value: b?.students ?? '', min: 1, max: 200 },
      { id: 'classLanguage', label: t('classLang'), type: 'choice', value: b?.classLanguage || 'english', options: langOptions(), full: true },
      { id: 'notes', label: t('notes'), type: 'textarea', value: b?.notes || '', full: true, maxlength: 500, optional: true },
      ...(b ? [{ id: 'decisionNote', label: t('decisionNote'), type: 'textarea', value: b.decisionNote || '', full: true, maxlength: 300, optional: true }] : [])
    ];
    formSheet({
      title: b ? `${t('edit')}: ${t('bookingTitle')} · ${b.teacherName}` : t('newBooking'), wide: true, fields,
      onSubmit: async (v) => {
        if (!b && !v.teacherUid) throw userError(t('chooseTeacher') + ' ?');
        v.period = Number(v.period);
        await api.call(b ? 'admin.booking.update' : 'admin.booking.create', b ? { id: b.id, ...v } : v);
        toast(t('saved')); ctl.refresh(); this.search(true);
      }
    });
    return undefined;
  },
  async onClick(e, a) {
    if (!a) return undefined;
    const b = a.dataset.id ? this.items?.find(x => x.id === a.dataset.id) : null;
    switch (a.dataset.act) {
      case 'bsearch': return this.search(false);
      case 'badd': return this.form(null);
      case 'bedit': return b && this.form(b);
      case 'bapprove': {
        const note = await confirmDialog({ title: t('approveTitle'), message: `${esc(b.gradeSection)} · ${esc(b.teacherName)} · ${esc(dLong(b.date))}`, confirmLabel: t('approve'), cancelLabel: t('cancel'), input: { label: t('approveNote') + ' ' + t('optional'), max: 300 } });
        if (note !== false && await act(() => api.call('booking.approve', { id: b.id, note }), t('approved'))) this.search(true);
        return undefined;
      }
      case 'breject': {
        const reason = await confirmDialog({ title: t('rejectTitle'), message: `${esc(b.gradeSection)} · ${esc(b.teacherName)} · ${esc(dLong(b.date))}`, confirmLabel: t('reject'), cancelLabel: t('cancel'), danger: true, input: { label: t('rejectReason'), max: 300, required: true, requiredMsg: t('reasonRequired') } });
        if (reason && await act(() => api.call('booking.reject', { id: b.id, reason }), t('rejected'))) this.search(true);
        return undefined;
      }
      case 'bdel': {
        const ok = await confirmDialog({ title: t('deleteBookingTitle'), message: `${esc(b.gradeSection)} · ${esc(b.teacherName)} · ${esc(dLong(b.date))}<br>${esc(t('deleteBookingBody'))}`, confirmLabel: t('delete'), cancelLabel: t('cancel'), danger: true });
        if (ok && await act(() => api.call('admin.booking.delete', { id: b.id }), t('deleted'))) this.search(true);
        return undefined;
      }
      case 'bcsv': return this.items && downloadCsv(`bookings-${this.q.from}-to-${this.q.to}.csv`,
        ['Date', 'Period', 'Start', 'End', 'Library', 'Grade/Section', 'Students', 'Arabic/English', 'Teacher', 'Notes', 'Status', 'Decided by', 'Decision note', 'Requested at', 'Added by'],
        this.items.map(x => [x.date, x.period, x.startTime, x.endTime, x.library, x.gradeSection, x.students, x.classLanguage, x.teacherName, x.notes, x.status, x.decidedByName || '', x.decisionNote, new Date(x.createdAt).toISOString(), x.createdByName || '']));
      default: return undefined;
    }
  }
};

/* ======================= Booking periods ======================= */
const Periods = {
  data: null, ver: null,
  mount(box) { this.box = box; box.innerHTML = emptyHtml(t('loading')); this.load(); },
  update() { if (S.d.versions?.periods !== this.ver) this.load(); },
  async load() {
    try { this.ver = S.d.versions?.periods; this.data = await api.call('admin.periods.list'); this.render(); }
    catch (e) { this.box.innerHTML = emptyHtml(errorText(e, i18n)); }
  },
  periodCard(p, kind) {
    return `<div class="card"><h3>${esc(t(kind === 'current' ? 'currentPeriod' : 'nextPeriod'))} ${badge(p.state)}</h3>
      <div class="kv" style="margin-bottom:12px">
        <span>${esc(t('opens'))}</span><span>${esc(dt(p.opensAt))}${kind === 'next' ? ` · <b>${until(p.opensAt, 'opensIn')}</b>` : ''}</span>
        <span>${esc(t('closes'))}</span><span>${esc(dt(p.closesAt))}${kind === 'current' ? ` · <b class="countdown">${until(p.closesAt, 'closesIn')}</b>` : ''}</span>
        <span>${esc(t('visitDates'))}</span><span>${esc(dLong(p.bookableFrom))} – ${esc(dLong(p.bookableTo))}</span>
        ${p.note ? `<span>${esc(t('notes'))}</span><span>${esc(p.note)}</span>` : ''}
        <span>${esc(t('createdBy'))}</span><span>${esc(p.createdByName || '—')}</span></div>
      <button class="btn danger" type="button" data-act="pclose" data-id="${esc(p.id)}">${esc(t(kind === 'current' ? 'closeNow' : 'cancelPeriod'))}</button></div>`;
  },
  render() {
    const { current, next, items } = this.data;
    const now = api.serverNow();
    const last = next || (current && current.state === 'open' ? current : null);
    const startDefault = last ? last.closesAt : now + 5 * 60000;
    let fromDefault = last ? addDays(last.bookableTo, 1) : localDateOf(startDefault);
    if (fromDefault < S.today) fromDefault = S.today;
    this.box.innerHTML = `
      ${current && current.state === 'open' ? this.periodCard(current, 'current') : `<div class="banner closed"><b>${esc(t('noPeriod'))}</b></div>`}
      ${next ? this.periodCard(next, 'next') : ''}
      <div class="card"><h3>${esc(t('openPeriodTitle'))}</h3>
        <form id="pForm" novalidate>
          <div class="fg"><label>${esc(t('startWhen'))}</label><div class="choice-row">
            <label><input type="radio" name="pStart" value="now"${last ? '' : ' checked'} /> ${esc(t('startNow'))}</label>
            <label><input type="radio" name="pStart" value="at"${last ? ' checked' : ''} /> ${esc(t('startAt'))}</label></div></div>
          <div class="form-grid">
            <div class="fg full" id="pAtWrap"><label for="pAt">${esc(t('startAtLabel'))}</label><input type="datetime-local" id="pAt" value="${esc(toLocalInput(startDefault))}" /></div>
            <div class="fg"><label for="pFrom">${esc(t('bookableFrom'))}</label><input type="date" id="pFrom" value="${esc(fromDefault)}" /></div>
            <div class="fg"><label for="pTo">${esc(t('bookableTo'))}</label><input type="date" id="pTo" value="${esc(addDays(fromDefault, 13))}" /></div>
            <div class="fg full"><label for="pNote">${esc(t('noteLabel'))}</label><input id="pNote" maxlength="200" autocomplete="off" /></div>
          </div>
          <div class="banner scheduled" id="pCloses"></div>
          <p class="field-err" id="pErr"></p>
          <button class="btn primary" type="submit" id="pOpen">${esc(t('openPeriodBtn'))}</button>
        </form></div>
      <div class="section-title"><h3>${esc(t('periodHistory'))}</h3><span class="n">${items.length}</span></div>
      ${items.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('opens'))}</th><th>${esc(t('closes'))}</th><th>${esc(t('visitDates'))}</th><th>${esc(t('status'))}</th><th>${esc(t('createdBy'))}</th><th>${esc(t('notes'))}</th></tr></thead><tbody>
        ${items.map(p => `<tr><td>${esc(dt(p.opensAt))}</td><td>${esc(dt(p.closesAt))}${p.closedEarlyAt ? `<span class="sub">${esc(t('closedBy'))}: ${esc(p.closedByName || '')}</span>` : ''}</td><td>${esc(dLabel(p.bookableFrom))} – ${esc(dLabel(p.bookableTo))}</td><td>${badge(p.state)}</td><td>${esc(p.createdByName || '')}</td><td class="small">${esc(p.note)}</td></tr>`).join('')}</tbody></table></div>` : emptyHtml(t('none'))}`;
    const form = $('#pForm', this.box);
    const startMs = () => (form.querySelector('input[name="pStart"]:checked').value === 'now' ? api.serverNow() : new Date($('#pAt', form).value).getTime());
    const refresh = () => {
      const isAt = form.querySelector('input[name="pStart"]:checked').value === 'at';
      $('#pAtWrap', form).style.display = isAt ? '' : 'none';
      const s = startMs();
      $('#pCloses', form).textContent = Number.isFinite(s) ? t('closesAuto', dt(s + 7 * 86400000)) : '';
    };
    form.addEventListener('change', refresh); form.addEventListener('input', refresh); refresh();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const err = $('#pErr', form), btn = $('#pOpen', form);
      err.style.display = 'none';
      const now2 = form.querySelector('input[name="pStart"]:checked').value === 'now';
      const data = { startNow: now2, bookableFrom: $('#pFrom', form).value, bookableTo: $('#pTo', form).value, note: $('#pNote', form).value.trim() };
      if (!now2) { data.opensAt = startMs(); if (!Number.isFinite(data.opensAt)) { err.textContent = t('startAtLabel'); err.style.display = 'block'; return; } }
      btn.disabled = true; btn.classList.add('is-busy');
      try { await api.call('admin.period.open', data); toast(t('periodOpened')); ctl.refresh(); await this.load(); }
      catch (ex) { err.textContent = formError(ex); err.style.display = 'block'; }
      finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); } }
    };
  },
  async onClick(e, a) {
    if (a?.dataset.act !== 'pclose') return;
    const ok = await confirmDialog({ title: t('closePeriodTitle'), message: esc(t('closePeriodBody')), confirmLabel: t('closeNow'), cancelLabel: t('cancel'), danger: true });
    if (ok && await act(() => api.call('admin.period.close', { id: a.dataset.id }), t('periodClosedMsg'))) this.load();
  }
};

/* ======================= Settings ======================= */
const Settings = {
  mount(box) { this.box = box; box.innerHTML = emptyHtml(t('loading')); this.load(); },
  update() { /* the form is not replaced while someone is editing it */ },
  async load() {
    try { const r = await api.call('admin.settings.get'); this.render(r.settings); }
    catch (e) { this.box.innerHTML = emptyHtml(errorText(e, i18n)); }
  },
  render(s) {
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = ['Asia/Amman', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'UTC']; }
    const toggle = (id, label, hint) => `<label class="toggle-row"><span>${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span><input type="checkbox" id="${id}"${s[id] ? ' checked' : ''} /></label>`;
    this.box.innerHTML = `<form id="sForm" novalidate>
      <div class="card"><h3>${esc(t('s_school'))}</h3><div class="form-grid">
        <div class="fg"><label for="schoolName">${esc(t('s_schoolName'))}</label><input id="schoolName" value="${esc(s.schoolName)}" maxlength="100" /></div>
        <div class="fg"><label for="schoolNameAr">${esc(t('s_schoolNameAr'))}</label><input id="schoolNameAr" value="${esc(s.schoolNameAr)}" maxlength="100" dir="rtl" /></div>
        <div class="fg"><label for="timeZone">${esc(t('s_tz'))}</label><input id="timeZone" value="${esc(s.timeZone)}" list="tzList" autocomplete="off" /><datalist id="tzList">${zones.map(z => `<option value="${esc(z)}"></option>`).join('')}</datalist></div>
      </div></div>
      <div class="card"><h3>${esc(t('s_reg'))}</h3>
        ${toggle('registrationOpen', t('s_regOpen'), t('s_regOpenHint'))}
        <div class="fg" style="margin-top:12px"><label for="allowedDomains">${esc(t('s_domains'))}</label><input id="allowedDomains" value="${esc((s.allowedDomains || []).join(', '))}" autocomplete="off" /><small class="hint">${esc(t('s_domainsHint'))}</small></div>
        ${toggle('autoApproveTeachers', t('s_autoT'), t('s_autoHint'))}
        ${toggle('autoApproveSupervisors', t('s_autoS'), t('s_autoHint'))}
      </div>
      <div class="card"><h3>${esc(t('s_booking'))}</h3>
        <div class="fg"><label for="maxActiveBookingsPerTeacher">${esc(t('s_maxB'))}</label><input id="maxActiveBookingsPerTeacher" type="number" min="0" max="100" value="${esc(s.maxActiveBookingsPerTeacher || 0)}" style="max-width:140px" /></div>
        ${toggle('requireStudentId', t('s_reqId'))}
      </div>
      <div class="card"><h3>${esc(t('s_forms'))}</h3><div class="form-grid">
        <div class="fg"><label for="visitsListFormCode">${esc(t('s_formV'))}</label><input id="visitsListFormCode" value="${esc(s.visitsListFormCode)}" maxlength="30" /></div>
        <div class="fg"><label for="visitorsLogFormCode">${esc(t('s_formVis'))}</label><input id="visitorsLogFormCode" value="${esc(s.visitorsLogFormCode)}" maxlength="30" /></div>
      </div></div>
      <p class="field-err" id="sErr"></p>
      <button class="btn primary" type="submit" id="sSave" style="min-width:160px;height:44px">${esc(t('save'))}</button></form>`;
    const f = $('#sForm', this.box);
    f.onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => $('#' + id, f).value.trim(), c = (id) => $('#' + id, f).checked;
      const data = {
        schoolName: v('schoolName'), schoolNameAr: v('schoolNameAr'), timeZone: v('timeZone'), allowedDomains: v('allowedDomains'),
        registrationOpen: c('registrationOpen'), autoApproveTeachers: c('autoApproveTeachers'), autoApproveSupervisors: c('autoApproveSupervisors'),
        requireStudentId: c('requireStudentId'), maxActiveBookingsPerTeacher: Number(v('maxActiveBookingsPerTeacher') || 0),
        visitsListFormCode: v('visitsListFormCode'), visitorsLogFormCode: v('visitorsLogFormCode')
      };
      const err = $('#sErr', f), btn = $('#sSave', f);
      err.style.display = 'none'; btn.disabled = true; btn.classList.add('is-busy');
      try { const r = await api.call('admin.settings.update', data); toast(t('settingsSaved')); ctl.refresh(); this.render(r.settings); }
      catch (ex) { err.textContent = formError(ex); err.style.display = 'block'; }
      finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); } }
    };
  }
};

/* ======================= Activity log ======================= */
const Audit = {
  q: null, items: null,
  mount(box) {
    this.box = box;
    if (!this.q) this.q = { from: addDays(S.today, -7), to: S.today, action: 'all', text: '' };
    const cats = [['all', 'cat_all'], ['auth.', 'cat_auth'], ['user.', 'cat_user'], ['booking.', 'cat_booking'], ['visit.', 'cat_visit'], ['visitor.', 'cat_visitor'], ['slip.', 'cat_slip'], ['admin.', 'cat_admin'], ['system.', 'cat_system']];
    box.innerHTML = `<div class="toolbar">
        <div class="fg"><label for="lFrom">${esc(t('from'))}</label><input type="date" id="lFrom" value="${esc(this.q.from)}" /></div>
        <div class="fg"><label for="lTo">${esc(t('to'))}</label><input type="date" id="lTo" value="${esc(this.q.to)}" /></div>
        <div class="fg"><label for="lCat">${esc(t('auditCat'))}</label><select id="lCat">${cats.map(([v, k]) => `<option value="${v}"${this.q.action === v ? ' selected' : ''}>${esc(t(k))}</option>`).join('')}</select></div>
        <div class="fg grow"><label for="lText">${esc(t('search'))}</label><input id="lText" value="${esc(this.q.text)}" /></div>
        <button class="btn primary" type="button" data-act="lsearch">${esc(t('search'))}</button><div class="out-group"><button class="btn" type="button" data-act="lcsv">${esc(t('exportCsv'))}</button></div></div>
      <div id="lRes">${emptyHtml(t('loading'))}</div>`;
    $('#lText', box).onkeydown = (e) => { if (e.key === 'Enter') this.search(false); };
    this.search(true);
  },
  update() {},
  async search(silent) {
    if (!silent) {
      this.q.from = $('#lFrom', this.box).value || this.q.from; this.q.to = $('#lTo', this.box).value || this.q.to;
      this.q.action = $('#lCat', this.box).value; this.q.text = $('#lText', this.box).value.trim();
    }
    try {
      const r = await api.call('admin.audit.search', { from: this.q.from, to: this.q.to, action: this.q.action, q: this.q.text });
      this.items = r.items;
      const box = $('#lRes', this.box);
      if (!box) return;
      box.innerHTML = this.items.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>${esc(t('when'))}</th><th>${esc(t('who'))}</th><th>${esc(t('app'))}</th><th>${esc(t('summary'))}</th><th>${esc(t('action'))}</th></tr></thead><tbody>
        ${this.items.map((x, i) => `<tr class="clickable" data-act="ldetail" data-i="${i}"><td class="small" style="white-space:nowrap">${esc(dt(x.at))}</td><td>${esc(x.actorName)}${x.actorEmail ? `<span class="sub">${esc(x.actorEmail)}</span>` : ''}</td><td class="small">${esc(x.app ? t('app_' + x.app) : '')}</td><td>${esc(x.summary)}</td><td class="mono small">${esc(x.action)}</td></tr>`).join('')}</tbody></table></div>${r.truncated ? `<p class="muted small">…</p>` : ''}` : emptyHtml(t('nothingFound'));
    } catch (e) { toast(errorText(e, i18n), true); }
  },
  onClick(e, a) {
    if (!a) return undefined;
    if (a.dataset.act === 'lsearch') return this.search(false);
    if (a.dataset.act === 'lcsv' && this.items) {
      return downloadCsv(`activity-log-${this.q.from}-to-${this.q.to}.csv`, ['Time (ISO)', 'Who', 'Email', 'App', 'Action', 'Summary', 'Target type', 'Target id', 'IP'],
        this.items.map(x => [new Date(x.at).toISOString(), x.actorName, x.actorEmail || '', x.app || '', x.action, x.summary, x.targetType || '', x.targetId || '', x.ip || '']));
    }
    if (a.dataset.act === 'ldetail') {
      const x = this.items[Number(a.dataset.i)];
      if (!x) return undefined;
      return detailSheet({
        title: t('auditDetails'), wide: true,
        rows: [[t('when'), dt(x.at)], [t('who'), x.actorName], [t('email'), x.actorEmail], [t('app'), x.app ? t('app_' + x.app) : ''], [t('action'), x.action], [t('summary'), x.summary], ['Target', x.targetType ? `${x.targetType} · ${x.targetId}` : ''], ['IP', x.ip]],
        extra: x.details ? `<pre class="details">${esc(JSON.stringify(x.details, null, 2))}</pre>` : ''
      });
    }
    return undefined;
  }
};

/* ======================= Admin root ======================= */
const VIEWS = { overview: Overview, accounts: Accounts, periods: Periods, settings: Settings, audit: Audit };

export const AdminView = {
  sub: SUBS.includes(store.get('lib.adminTab')) ? store.get('lib.adminTab') : 'overview',
  reset() { Users.list = null; Users.ver = null; Bookings.q = null; Bookings.items = null; Audit.q = null; Audit.items = null; Periods.data = null; Overview.health = null; },
  mount(el) {
    this.el = el;
    el.innerHTML = `<div class="admin-nav" id="adminNav"></div><div id="adminBody"></div>`;
    el.onclick = (e) => this.onClick(e);
    this.renderNav();
    this.showSub(this.sub);
  },
  update() { this.renderNav(); VIEWS[this.sub].update(); },
  renderNav() {
    const nav = $('#adminNav', this.el);
    if (!nav) return;
    const att = (S.d.attention || []).length;
    nav.innerHTML = SUBS.map(s => `<button type="button" data-sub="${s}" class="${this.sub === s ? 'on' : ''}">${esc(t('a_' + s))}${s === 'overview' && att ? `<span class="count">${att}</span>` : ''}</button>`).join('');
  },
  showSub(sub) {
    this.sub = SUBS.includes(sub) ? sub : 'overview';
    store.set('lib.adminTab', this.sub);
    this.renderNav();
    VIEWS[this.sub].mount($('#adminBody', this.el));
  },
  onClick(e) {
    const s = e.target.closest('[data-sub]');
    if (s) return this.showSub(s.dataset.sub);
    const g = e.target.closest('[data-go]');
    if (g) { const [kind, where] = g.dataset.go.split(':'); return kind === 'tab' ? ctl.goTab(where) : this.showSub(where); }
    const a = e.target.closest('[data-act]');
    if (a?.dataset.act === 'manage') return manageAccount(a.dataset.uid);
    return VIEWS[this.sub].onClick?.(e, a);
  }
};
