// Sign-in, registration, password reset request, first-time setup and account
// status screens. Each app mounts this into its own login view; sessions are
// stored per app, so signing in to one app never signs you in to another.
import { esc, $, toast, errorText, fmtDateTime } from './core.js';

export const AUTH_I18N = {
  en: {
    a_email: 'Email', a_password: 'Password', a_name: 'Full name', a_confirm: 'Confirm password',
    a_login: 'Username or email', a_username: 'Username', a_usernamePh: 'e.g. sarah.ahmad', a_emailOpt: 'Email (optional)',
    a_usernameHint: 'Choose your own: 3 to 30 English letters or numbers. Dots, dashes and underscores are allowed, no spaces.',
    a_accountTitle: 'Username and password', a_newOptional: 'New password (leave empty to keep your current one)', a_saved: 'Saved',
    a_emailPh: 'name@school.edu', a_namePh: 'e.g. Sarah Ahmad', a_passHint: 'At least 8 characters, with letters and numbers.',
    a_remember: 'Keep me signed in on this device', a_rememberHint: 'Leave unticked on shared computers.',
    a_signIn: 'Sign in', a_signingIn: 'Signing in…', a_forgot: 'Forgot password?', a_noAccount: 'New here?', a_create: 'Create an account',
    a_haveAccount: 'Already have an account?', a_backToSignIn: 'Back to sign in', a_register: 'Create account', a_registering: 'Creating…',
    a_registerTitle: 'Create your account', a_registerSub: (role) => `Your account will be reviewed before you can use the app as a ${role}.`,
    a_mismatch: 'The two passwords do not match.', a_required: 'Please fill in every field.',
    a_forgotTitle: 'Reset your password', a_forgotSub: 'Enter your username or email. The library teacher will receive your request and give you a temporary password.',
    a_forgotBtn: 'Send request', a_forgotDone: 'Request sent. The library administrator will contact you with a temporary password.',
    a_setupLink: 'First-time setup (library teacher)', a_setupTitle: 'Create your account', a_setupSub: 'This is the first library teacher, with full administrator rights. Choose your own username and password.',
    a_setupBoxTitle: 'Enter the setup password', a_setupBoxSub: 'You only do this once. It unlocks the first library teacher account, then this box is gone for good.',
    a_setupKeyHint: 'This is ADMIN_SETUP_KEY from Vercel. It is not PROXY_SECRET and not your account password.', a_setupShow: 'Show what I typed', a_setupContinue: 'Continue',
    a_setupStep1: 'Step 1 of 2', a_setupStep2: 'Step 2 of 2', a_setupFirst: 'The library teacher has not finished first-time setup yet.', a_setupFirstLink: 'Open the Library Teachers App',
    a_setupKey: 'Setup password', a_setupBtn: 'Create my account',
    a_pendingTitle: 'Waiting for approval', a_pendingBody: 'Your account has been created. The library administrator must approve it before you can sign in. Please check back later.',
    a_suspendedTitle: 'Account suspended', a_suspendedBody: 'Your account has been suspended by the library administrator.',
    a_bannedTitle: 'Account blocked', a_bannedBody: 'Your account has been blocked by the library administrator.',
    a_rejectedTitle: 'Registration not approved', a_rejectedBody: 'Your registration was not approved. Contact the library administrator if you think this is a mistake.',
    a_reason: 'Reason', a_until: 'Until',
    a_noAccessTitle: 'No access to this app', a_noAccessBody: (app) => `You are signed in, but your account does not have access to the ${app}.`,
    a_requestAccess: 'Request access', a_requestSent: 'Access requested. The administrator will review it.', a_requested: 'Access requested — waiting for the administrator.',
    a_changeTitle: 'Choose your username and password', a_changeSub: 'Before you continue, choose your own username and a new password. Only you will know them.',
    a_current: 'Current (temporary) password', a_currentVoluntary: 'Current password', a_new: 'New password', a_changeBtn: 'Save new password',
    a_changed: 'Password changed', a_sessionEnded: 'Your session has ended. Please sign in again.', a_signedOut: 'You have been signed out.',
    a_loading: 'Loading…', a_retry: 'Try again', a_cantReach: 'Could not reach the server.',
    err_INVALID_CREDENTIALS: 'Username or password is incorrect.',
    err_USERNAME_TAKEN: 'This username is already taken. Choose another one.',
    err_INVALID_USERNAME: 'A username has 3 to 30 English letters or numbers (dots, dashes and underscores are allowed, no spaces).',
    err_NOTHING_TO_CHANGE: 'Nothing was changed.',
    err_ACCOUNT_LOCKED: 'Too many wrong passwords. This account is locked for 15 minutes.',
    err_ACCOUNT_PENDING: 'Your account is waiting for approval by the library administrator.',
    err_ACCOUNT_SUSPENDED: 'This account is suspended.', err_ACCOUNT_BANNED: 'This account has been blocked.',
    err_ACCOUNT_REJECTED: 'This registration was not approved.', err_ACCOUNT_DELETED: 'This account no longer exists.',
    err_EMAIL_TAKEN: 'An account with this email already exists. Sign in instead, or use "Forgot password?".',
    err_WEAK_PASSWORD: 'Password must be at least 8 characters and contain letters and numbers.',
    err_INVALID_EMAIL: 'Enter a valid email address.', err_REGISTRATION_CLOSED: 'Registration is closed. Ask the library administrator to create your account.',
    err_DOMAIN_NOT_ALLOWED: 'Please register with your school email address.', err_BAD_SETUP_KEY: 'That is not the setup password. Copy ADMIN_SETUP_KEY from Vercel again.',
    err_SETUP_DISABLED: 'ADMIN_SETUP_KEY is missing in Vercel. Add it, redeploy, then come back.',
    err_HOST_LOCKED: 'Vercel is locking this site. Turn it off in Vercel: Settings, then Deployment Protection.', err_ALREADY_SET_UP: 'The system is already set up. Sign in instead.',
    err_WRONG_PASSWORD: 'Your current password is not correct.', err_SAME_PASSWORD: 'Choose a password different from the current one.',
    err_PASSWORD_CHANGE_REQUIRED: 'You must set a new password first.', err_ALREADY_HAS_ACCESS: 'You already have access.',
    err_INVALID_INPUT: 'Please check the highlighted information.'
  },
  ar: {
    a_email: 'البريد الإلكتروني', a_password: 'كلمة المرور', a_name: 'الاسم الكامل', a_confirm: 'تأكيد كلمة المرور',
    a_login: 'اسم المستخدم أو البريد الإلكتروني', a_username: 'اسم المستخدم', a_usernamePh: 'مثال: sarah.ahmad', a_emailOpt: 'البريد الإلكتروني (اختياري)',
    a_usernameHint: 'اختره بنفسك: من 3 إلى 30 حرفًا إنجليزيًا أو رقمًا. يُسمح بالنقطة والشرطة والشرطة السفلية، دون مسافات.',
    a_accountTitle: 'اسم المستخدم وكلمة المرور', a_newOptional: 'كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)', a_saved: 'تم الحفظ',
    a_emailPh: 'name@school.edu', a_namePh: 'مثال: سارة أحمد', a_passHint: '8 أحرف على الأقل، تحتوي على حروف وأرقام.',
    a_remember: 'إبقائي مسجّلًا على هذا الجهاز', a_rememberHint: 'اتركه دون تحديد على الأجهزة المشتركة.',
    a_signIn: 'تسجيل الدخول', a_signingIn: 'جارٍ تسجيل الدخول…', a_forgot: 'نسيت كلمة المرور؟', a_noAccount: 'مستخدم جديد؟', a_create: 'إنشاء حساب',
    a_haveAccount: 'لديك حساب؟', a_backToSignIn: 'العودة لتسجيل الدخول', a_register: 'إنشاء الحساب', a_registering: 'جارٍ الإنشاء…',
    a_registerTitle: 'إنشاء حسابك', a_registerSub: (role) => `ستتم مراجعة حسابك قبل أن تتمكن من استخدام التطبيق بصفة ${role}.`,
    a_mismatch: 'كلمتا المرور غير متطابقتين.', a_required: 'يرجى تعبئة جميع الحقول.',
    a_forgotTitle: 'إعادة تعيين كلمة المرور', a_forgotSub: 'أدخل اسم المستخدم أو البريد الإلكتروني. سيستلم معلم المكتبة طلبك ويعطيك كلمة مرور مؤقتة.',
    a_forgotBtn: 'إرسال الطلب', a_forgotDone: 'تم إرسال الطلب. سيتواصل معك مسؤول المكتبة بكلمة مرور مؤقتة.',
    a_setupLink: 'الإعداد الأول (معلم المكتبة)', a_setupTitle: 'أنشئ حسابك', a_setupSub: 'هذا حساب معلم المكتبة الأول بصلاحيات المسؤول الكاملة. اختر اسم المستخدم وكلمة المرور بنفسك.',
    a_setupBoxTitle: 'أدخل كلمة مرور الإعداد', a_setupBoxSub: 'تفعل هذا مرة واحدة فقط. تفتح هذه الخطوة حساب معلم المكتبة الأول، ثم يختفي هذا المربع نهائيًا.',
    a_setupKeyHint: 'هذه هي قيمة ADMIN_SETUP_KEY في Vercel، وليست PROXY_SECRET وليست كلمة مرور حسابك.', a_setupShow: 'إظهار ما كتبته', a_setupContinue: 'متابعة',
    a_setupStep1: 'الخطوة 1 من 2', a_setupStep2: 'الخطوة 2 من 2', a_setupFirst: 'لم يُكمل معلم المكتبة الإعداد الأول بعد.', a_setupFirstLink: 'افتح تطبيق معلمي المكتبة',
    a_setupKey: 'كلمة مرور الإعداد', a_setupBtn: 'إنشاء حسابي',
    a_pendingTitle: 'بانتظار الموافقة', a_pendingBody: 'تم إنشاء حسابك. يجب أن يوافق عليه مسؤول المكتبة قبل أن تتمكن من تسجيل الدخول. يرجى المحاولة لاحقًا.',
    a_suspendedTitle: 'الحساب موقوف', a_suspendedBody: 'تم إيقاف حسابك من قبل مسؤول المكتبة.',
    a_bannedTitle: 'الحساب محظور', a_bannedBody: 'تم حظر حسابك من قبل مسؤول المكتبة.',
    a_rejectedTitle: 'لم تتم الموافقة على التسجيل', a_rejectedBody: 'لم تتم الموافقة على تسجيلك. تواصل مع مسؤول المكتبة إذا كنت تعتقد أن هذا خطأ.',
    a_reason: 'السبب', a_until: 'حتى',
    a_noAccessTitle: 'لا تملك صلاحية لهذا التطبيق', a_noAccessBody: (app) => `أنت مسجّل الدخول، لكن حسابك لا يملك صلاحية الوصول إلى ${app}.`,
    a_requestAccess: 'طلب صلاحية', a_requestSent: 'تم طلب الصلاحية. سيراجعها المسؤول.', a_requested: 'تم طلب الصلاحية — بانتظار المسؤول.',
    a_changeTitle: 'اختر اسم المستخدم وكلمة المرور', a_changeSub: 'قبل المتابعة، اختر اسم مستخدم خاصًا بك وكلمة مرور جديدة. لن يعرفهما غيرك.',
    a_current: 'كلمة المرور الحالية (المؤقتة)', a_currentVoluntary: 'كلمة المرور الحالية', a_new: 'كلمة المرور الجديدة', a_changeBtn: 'حفظ كلمة المرور',
    a_changed: 'تم تغيير كلمة المرور', a_sessionEnded: 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.', a_signedOut: 'تم تسجيل خروجك.',
    a_loading: 'جارٍ التحميل…', a_retry: 'إعادة المحاولة', a_cantReach: 'تعذر الوصول إلى الخادم.',
    err_INVALID_CREDENTIALS: 'اسم المستخدم أو كلمة المرور غير صحيحة.',
    err_USERNAME_TAKEN: 'اسم المستخدم هذا مستخدم بالفعل. اختر اسمًا آخر.',
    err_INVALID_USERNAME: 'يتكون اسم المستخدم من 3 إلى 30 حرفًا إنجليزيًا أو رقمًا (يُسمح بالنقطة والشرطة والشرطة السفلية، دون مسافات).',
    err_NOTHING_TO_CHANGE: 'لم يتم تغيير أي شيء.',
    err_ACCOUNT_LOCKED: 'محاولات خاطئة كثيرة. تم قفل الحساب لمدة 15 دقيقة.',
    err_ACCOUNT_PENDING: 'حسابك بانتظار موافقة مسؤول المكتبة.',
    err_ACCOUNT_SUSPENDED: 'هذا الحساب موقوف.', err_ACCOUNT_BANNED: 'هذا الحساب محظور.',
    err_ACCOUNT_REJECTED: 'لم تتم الموافقة على هذا التسجيل.', err_ACCOUNT_DELETED: 'هذا الحساب لم يعد موجودًا.',
    err_EMAIL_TAKEN: 'يوجد حساب بهذا البريد الإلكتروني. سجّل الدخول بدلًا من ذلك أو استخدم «نسيت كلمة المرور؟».',
    err_WEAK_PASSWORD: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل وتحتوي على حروف وأرقام.',
    err_INVALID_EMAIL: 'أدخل بريدًا إلكترونيًا صحيحًا.', err_REGISTRATION_CLOSED: 'التسجيل مغلق. اطلب من مسؤول المكتبة إنشاء حسابك.',
    err_DOMAIN_NOT_ALLOWED: 'يرجى التسجيل باستخدام بريد المدرسة الإلكتروني.', err_BAD_SETUP_KEY: 'هذه ليست كلمة مرور الإعداد. انسخ ADMIN_SETUP_KEY من Vercel مرة أخرى.',
    err_SETUP_DISABLED: 'قيمة ADMIN_SETUP_KEY غير موجودة في Vercel. أضفها وأعد النشر ثم عد إلى هنا.',
    err_HOST_LOCKED: 'منصة Vercel تقفل هذا الموقع. أوقف ذلك من Vercel: Settings ثم Deployment Protection.', err_ALREADY_SET_UP: 'تم إعداد النظام مسبقًا. سجّل الدخول.',
    err_WRONG_PASSWORD: 'كلمة المرور الحالية غير صحيحة.', err_SAME_PASSWORD: 'اختر كلمة مرور مختلفة عن الحالية.',
    err_PASSWORD_CHANGE_REQUIRED: 'يجب تعيين كلمة مرور جديدة أولًا.', err_ALREADY_HAS_ACCESS: 'لديك صلاحية بالفعل.',
    err_INVALID_INPUT: 'يرجى التحقق من المعلومات المدخلة.'
  }
};

const ICONS = {
  wait: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  block: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  lock: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
};

export function createAuth({ root, api, i18n, appName, appSub, roleName, iconSvg, allowSetup = false, onReady, onSignedOut }) {
  const t = (k, ...a) => i18n.t(k, ...a);
  let systemInfo = null;
  let current = { screen: 'login' };
  let infoError = null;
  let setupKey = ''; // held in memory only, between the two setup steps

  function card(inner) {
    const school = (i18n.lang === 'ar' ? systemInfo?.schoolNameAr || systemInfo?.schoolName : systemInfo?.schoolName) || '';
    root.innerHTML = `<div class="login-sheet">
      <aside class="login-side">
        <div class="ls-mark">${iconSvg || ''}</div>
        <div class="ls-text">
          ${school ? `<p class="ls-school">${esc(school)}</p>` : ''}
          <h2>${esc(appName())}</h2>
          <p>${esc(appSub())}</p>
        </div>
        <div class="shelf" aria-hidden="true">${'<i></i>'.repeat(40)}</div>
      </aside>
      <div class="login-card">${inner}</div>
    </div>`;
    root.style.display = 'flex';
  }
  function fieldErr(msg) { const e = $('#aErr', root); if (e) { e.textContent = msg; e.style.display = msg ? 'block' : 'none'; } }
  function notice(msg, kind = 'info') { return msg ? `<div class="auth-notice ${kind}">${esc(msg)}</div>` : ''; }

  async function loadInfo() {
    try { systemInfo = await api.call('system.info'); infoError = null; } catch (e) { systemInfo = null; infoError = e; }
    return systemInfo;
  }

  function showLogin(msg, kind) {
    current = { screen: 'login', msg, kind };
    onSignedOut && onSignedOut();
    const showSetup = allowSetup && systemInfo?.needsSetup;
    card(`
      <h1>${esc(t('a_signIn'))}</h1>
      ${notice(msg, kind)}
      ${!msg && infoError ? notice(errorText(infoError, i18n), 'err') : ''}
      ${!allowSetup && systemInfo?.needsSetup ? `<div class="auth-notice warn">${esc(t('a_setupFirst'))} <a href="/library/">${esc(t('a_setupFirstLink'))}</a></div>` : ''}
      <form id="aForm" novalidate>
        <div class="fg"><label for="aLogin">${esc(t('a_login'))}</label><input type="text" id="aLogin" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="200" required /></div>
        <div class="fg"><label for="aPass">${esc(t('a_password'))}</label><input type="password" id="aPass" autocomplete="current-password" required /></div>
        <label class="check-row"><input type="checkbox" id="aRemember" /> <span>${esc(t('a_remember'))}<small>${esc(t('a_rememberHint'))}</small></span></label>
        <p class="field-err" id="aErr"></p>
        <button class="login-btn" id="aSubmit" type="submit">${esc(t('a_signIn'))}</button>
      </form>
      <div class="auth-links">
        <a href="#" id="aForgot">${esc(t('a_forgot'))}</a>
        <span>${esc(t('a_noAccount'))} <a href="#" id="aRegister">${esc(t('a_create'))}</a></span>
        ${showSetup ? `<a href="#" id="aSetup" class="strong">${esc(t('a_setupLink'))}</a>` : ''}
      </div>`);
    $('#aForgot', root).onclick = (e) => { e.preventDefault(); showForgot(); };
    $('#aRegister', root).onclick = (e) => { e.preventDefault(); showRegister(); };
    if (showSetup) $('#aSetup', root).onclick = (e) => { e.preventDefault(); showSetupForm(); };
    $('#aForm', root).onsubmit = async (e) => {
      e.preventDefault();
      const login = $('#aLogin', root).value.trim(), password = $('#aPass', root).value, remember = $('#aRemember', root).checked;
      if (!login || !password) return fieldErr(t('a_required'));
      const btn = $('#aSubmit', root);
      btn.disabled = true; btn.textContent = t('a_signingIn'); fieldErr('');
      try {
        const r = await api.call('auth.login', { login, password, remember });
        api.setSession(r.token, remember);
        route(r.me);
      } catch (err) {
        btn.disabled = false; btn.textContent = t('a_signIn');
        if (['ACCOUNT_PENDING', 'ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'ACCOUNT_REJECTED'].includes(err.code)) return showStatus(err.code, err.details);
        let m = errorText(err, i18n);
        if (err.code === 'ACCOUNT_LOCKED' && err.details?.until) m += ` (${fmtDateTime(err.details.until, i18n)})`;
        fieldErr(m);
      }
    };
  }

  function showRegister() {
    current = { screen: 'register' };
    card(`
      <h1>${esc(t('a_registerTitle'))}</h1>
      <p class="sub">${esc(appName())}</p>
      <div class="auth-notice info">${esc(t('a_registerSub', roleName()))}</div>
      <form id="aForm" novalidate>
        <div class="fg"><label for="rName">${esc(t('a_name'))}</label><input id="rName" autocomplete="name" maxlength="80" placeholder="${esc(t('a_namePh'))}" /></div>
        <div class="fg"><label for="rUser">${esc(t('a_username'))}</label><input id="rUser" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="30" placeholder="${esc(t('a_usernamePh'))}" /><small class="hint">${esc(t('a_usernameHint'))}</small></div>
        <div class="fg"><label for="rEmail">${esc(t('a_emailOpt'))}</label><input id="rEmail" type="email" inputmode="email" autocomplete="email" placeholder="${esc(t('a_emailPh'))}" /></div>
        <div class="fg"><label for="rPass">${esc(t('a_password'))}</label><input id="rPass" type="password" autocomplete="new-password" /><small class="hint">${esc(t('a_passHint'))}</small></div>
        <div class="fg"><label for="rPass2">${esc(t('a_confirm'))}</label><input id="rPass2" type="password" autocomplete="new-password" /></div>
        <p class="field-err" id="aErr"></p>
        <button class="login-btn" id="aSubmit" type="submit">${esc(t('a_register'))}</button>
      </form>
      <div class="auth-links"><span>${esc(t('a_haveAccount'))} <a href="#" id="aBack">${esc(t('a_signIn'))}</a></span></div>`);
    $('#aBack', root).onclick = (e) => { e.preventDefault(); showLogin(); };
    $('#aForm', root).onsubmit = async (e) => {
      e.preventDefault();
      const name = $('#rName', root).value.trim(), username = $('#rUser', root).value.trim(), email = $('#rEmail', root).value.trim(), password = $('#rPass', root).value, p2 = $('#rPass2', root).value;
      if (!name || !username || !password) return fieldErr(t('a_required'));
      if (password !== p2) return fieldErr(t('a_mismatch'));
      const btn = $('#aSubmit', root);
      btn.disabled = true; btn.textContent = t('a_registering'); fieldErr('');
      try {
        const r = await api.call('auth.register', { name, username, email, password });
        if (r.status === 'active' && r.token) { api.setSession(r.token, false); route(r.me); }
        else showStatus('ACCOUNT_PENDING');
      } catch (err) {
        btn.disabled = false; btn.textContent = t('a_register');
        fieldErr(err.code === 'DOMAIN_NOT_ALLOWED' && i18n.lang === 'en' ? err.message : errorText(err, i18n));
      }
    };
  }

  function showForgot() {
    current = { screen: 'forgot' };
    card(`
      <h1>${esc(t('a_forgotTitle'))}</h1>
      <p class="sub">${esc(t('a_forgotSub'))}</p>
      <form id="aForm" novalidate>
        <div class="fg"><label for="fLogin">${esc(t('a_login'))}</label><input id="fLogin" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="200" /></div>
        <p class="field-err" id="aErr"></p>
        <button class="login-btn" id="aSubmit" type="submit">${esc(t('a_forgotBtn'))}</button>
      </form>
      <div class="auth-links"><a href="#" id="aBack">${esc(t('a_backToSignIn'))}</a></div>`);
    $('#aBack', root).onclick = (e) => { e.preventDefault(); showLogin(); };
    $('#aForm', root).onsubmit = async (e) => {
      e.preventDefault();
      const login = $('#fLogin', root).value.trim();
      if (!login) return fieldErr(t('a_required'));
      const btn = $('#aSubmit', root);
      btn.disabled = true;
      try { await api.call('auth.forgotPassword', { login }); showLogin(t('a_forgotDone'), 'ok'); }
      catch (err) { btn.disabled = false; fieldErr(errorText(err, i18n)); }
    };
  }

  // Step 1: the one-time box. It never appears again once the first account exists.
  function showSetupKeyBox() {
    current = { screen: 'setup' };
    const off = systemInfo && !systemInfo.setupEnabled;
    card(`
      <p class="step-tag">${esc(t('a_setupStep1'))}</p>
      <h1>${esc(t('a_setupBoxTitle'))}</h1>
      <p class="sub">${esc(t('a_setupBoxSub'))}</p>
      ${off ? notice(t('err_SETUP_DISABLED'), 'err') : ''}
      <form id="aForm" novalidate>
        <div class="fg"><label for="sKey">${esc(t('a_setupKey'))}</label><input id="sKey" type="password" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" /><small class="hint">${esc(t('a_setupKeyHint'))}</small></div>
        <label class="check-row"><input type="checkbox" id="sShow" /> <span>${esc(t('a_setupShow'))}</span></label>
        <p class="field-err" id="aErr"></p>
        <button class="login-btn" id="aSubmit" type="submit">${esc(t('a_setupContinue'))}</button>
      </form>
      <div class="auth-links"><a href="#" id="aBack">${esc(t('a_backToSignIn'))}</a></div>`);
    $('#sShow', root).onchange = (e) => { $('#sKey', root).type = e.target.checked ? 'text' : 'password'; };
    $('#aBack', root).onclick = (e) => { e.preventDefault(); showLogin(); };
    $('#sKey', root).focus();
    $('#aForm', root).onsubmit = async (e) => {
      e.preventDefault();
      const value = $('#sKey', root).value.trim();
      if (!value) return fieldErr(t('a_required'));
      const btn = $('#aSubmit', root);
      btn.disabled = true; fieldErr('');
      try {
        await api.call('system.checkSetupKey', { setupKey: value });
        setupKey = value;
        showSetupForm();
      } catch (err) {
        if (err.code === 'ALREADY_SET_UP') { systemInfo = { ...systemInfo, needsSetup: false }; return showLogin(errorText(err, i18n), 'info'); }
        btn.disabled = false; fieldErr(errorText(err, i18n));
      }
    };
  }

  // Step 2: the first library teacher chooses a name, username and password.
  function showSetupForm() {
    if (!setupKey) return showSetupKeyBox();
    current = { screen: 'setup' };
    card(`
      <p class="step-tag">${esc(t('a_setupStep2'))}</p>
      <h1>${esc(t('a_setupTitle'))}</h1>
      <p class="sub">${esc(t('a_setupSub'))}</p>
      <form id="aForm" novalidate>
        <div class="fg"><label for="sName">${esc(t('a_name'))}</label><input id="sName" autocomplete="name" maxlength="80" /></div>
        <div class="fg"><label for="sUser">${esc(t('a_username'))}</label><input id="sUser" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="30" placeholder="${esc(t('a_usernamePh'))}" /><small class="hint">${esc(t('a_usernameHint'))}</small></div>
        <div class="fg"><label for="sEmail">${esc(t('a_emailOpt'))}</label><input id="sEmail" type="email" autocomplete="email" /></div>
        <div class="fg"><label for="sPass">${esc(t('a_password'))}</label><input id="sPass" type="password" autocomplete="new-password" /><small class="hint">${esc(t('a_passHint'))}</small></div>
        <div class="fg"><label for="sPass2">${esc(t('a_confirm'))}</label><input id="sPass2" type="password" autocomplete="new-password" /></div>
        <p class="field-err" id="aErr"></p>
        <button class="login-btn" id="aSubmit" type="submit">${esc(t('a_setupBtn'))}</button>
      </form>
      <div class="auth-links"><a href="#" id="aBack">${esc(t('a_backToSignIn'))}</a></div>`);
    $('#aBack', root).onclick = (e) => { e.preventDefault(); setupKey = ''; showLogin(); };
    $('#aForm', root).onsubmit = async (e) => {
      e.preventDefault();
      const name = $('#sName', root).value.trim(), username = $('#sUser', root).value.trim(), email = $('#sEmail', root).value.trim(), password = $('#sPass', root).value;
      if (!name || !username || !password) return fieldErr(t('a_required'));
      if (password !== $('#sPass2', root).value) return fieldErr(t('a_mismatch'));
      const btn = $('#aSubmit', root);
      btn.disabled = true;
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const r = await api.call('system.setup', { setupKey, name, username, email, password, timeZone: tz });
        setupKey = '';
        api.setSession(r.token, false);
        systemInfo = { ...systemInfo, needsSetup: false };
        route(r.me);
      } catch (err) {
        if (err.code === 'BAD_SETUP_KEY') { setupKey = ''; return showSetupKeyBox(); }
        btn.disabled = false; fieldErr(errorText(err, i18n));
      }
    };
  }

  function showStatus(code, details = {}) {
    current = { screen: 'status', code, details };
    onSignedOut && onSignedOut();
    const map = {
      ACCOUNT_PENDING: ['wait', 'a_pendingTitle', 'a_pendingBody'],
      ACCOUNT_SUSPENDED: ['block', 'a_suspendedTitle', 'a_suspendedBody'],
      ACCOUNT_BANNED: ['block', 'a_bannedTitle', 'a_bannedBody'],
      ACCOUNT_REJECTED: ['block', 'a_rejectedTitle', 'a_rejectedBody']
    };
    const [icon, title, body] = map[code] || map.ACCOUNT_PENDING;
    const extra = [
      details?.reason ? `<div class="row"><span>${esc(t('a_reason'))}</span><span>${esc(details.reason)}</span></div>` : '',
      details?.until ? `<div class="row"><span>${esc(t('a_until'))}</span><span>${esc(fmtDateTime(details.until, i18n))}</span></div>` : ''
    ].join('');
    card(`
      <div class="status-icon ${icon}">${ICONS[icon]}</div>
      <h1>${esc(t(title))}</h1>
      <p class="sub">${esc(t(body))}</p>
      ${extra ? `<div class="confirm-box">${extra}</div>` : ''}
      <button class="login-btn" id="aBack" type="button">${esc(t('a_backToSignIn'))}</button>`);
    $('#aBack', root).onclick = () => showLogin();
  }

  function showNoAccess(me) {
    current = { screen: 'noaccess', me };
    onSignedOut && onSignedOut();
    const requested = (me.requestedRoles || []).length > 0;
    card(`
      <div class="status-icon lock">${ICONS.lock}</div>
      <h1>${esc(t('a_noAccessTitle'))}</h1>
      <p class="sub">${esc(t('a_noAccessBody', appName()))}</p>
      <div class="confirm-box"><div class="row"><span>${esc(t(me.username ? 'a_username' : 'a_email'))}</span><span>${esc(me.username || me.email || '')}</span></div></div>
      ${requested ? `<div class="auth-notice ok">${esc(t('a_requested'))}</div>` : `<button class="login-btn" id="aReq" type="button">${esc(t('a_requestAccess'))}</button>`}
      <div class="auth-links"><a href="#" id="aOut">${esc(t('signOut'))}</a></div>`);
    $('#aOut', root).onclick = (e) => { e.preventDefault(); signOut(); };
    const req = $('#aReq', root);
    if (req) req.onclick = async () => {
      req.disabled = true;
      try { const r = await api.call('me.requestAccess'); toast(t('a_requestSent')); showNoAccess(r.me); }
      catch (err) { req.disabled = false; toast(errorText(err, i18n), true); }
    };
  }

  function showChangePassword(me, voluntary = false, onDone) {
    if (!voluntary) { current = { screen: 'change', me, voluntary }; onSignedOut && onSignedOut(); }
    const html = `
      <h1>${esc(t(voluntary ? 'a_accountTitle' : 'a_changeTitle'))}</h1>
      ${voluntary ? '' : `<p class="sub">${esc(t('a_changeSub'))}</p>`}
      <form id="aForm" novalidate>
        <div class="fg"><label for="cCur">${esc(t(voluntary ? 'a_currentVoluntary' : 'a_current'))}</label><input id="cCur" type="password" autocomplete="current-password" /></div>
        <div class="fg"><label for="cUser">${esc(t('a_username'))}</label><input id="cUser" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="30" value="${esc(me.username || '')}" placeholder="${esc(t('a_usernamePh'))}" /><small class="hint">${esc(t('a_usernameHint'))}</small></div>
        <div class="fg"><label for="cNew">${esc(t(voluntary ? 'a_newOptional' : 'a_new'))}</label><input id="cNew" type="password" autocomplete="new-password" /><small class="hint">${esc(t('a_passHint'))}</small></div>
        <div class="fg"><label for="cNew2">${esc(t('a_confirm'))}</label><input id="cNew2" type="password" autocomplete="new-password" /></div>
        <p class="field-err" id="aErr"></p>
        <button class="login-btn" id="aSubmit" type="submit">${esc(t('a_changeBtn'))}</button>
      </form>
      <div class="auth-links"><a href="#" id="aOut">${esc(voluntary ? t('cancel') : t('signOut'))}</a></div>`;
    let scope = root, sheetHandle = null;
    if (voluntary && onDone) {
      sheetHandle = onDone.openSheet(html);
      scope = sheetHandle.el;
    } else card(html);
    const ferr = (m) => { const e = $('#aErr', scope); e.textContent = m; e.style.display = m ? 'block' : 'none'; };
    $('#aOut', scope).onclick = (e) => { e.preventDefault(); if (sheetHandle) sheetHandle.close(); else signOut(); };
    $('#aForm', scope).onsubmit = async (e) => {
      e.preventDefault();
      const currentPassword = $('#cCur', scope).value, newPassword = $('#cNew', scope).value, username = $('#cUser', scope).value.trim();
      if (!currentPassword || !username || (!voluntary && !newPassword)) return ferr(t('a_required'));
      if (newPassword !== $('#cNew2', scope).value) return ferr(t('a_mismatch'));
      const btn = $('#aSubmit', scope);
      btn.disabled = true;
      try {
        const r = await api.call('me.changePassword', { currentPassword, newPassword, username });
        toast(newPassword ? t('a_changed') : t('a_saved'));
        Object.assign(me, { username: r.me.username, mustChangePassword: r.me.mustChangePassword });
        if (sheetHandle) sheetHandle.close(); else route(r.me);
      } catch (err) { btn.disabled = false; ferr(errorText(err, i18n)); }
    };
  }

  function route(me) {
    if (me.mustChangePassword) return showChangePassword(me);
    if (!me.hasAccess) return showNoAccess(me);
    current = { screen: 'app', me };
    root.style.display = 'none';
    root.innerHTML = '';
    onReady(me);
  }

  async function signOut(msgKey = 'a_signedOut') {
    try { if (api.hasSession()) await api.call('auth.logout'); } catch { /* the session may already be gone */ }
    api.clearSession();
    showLogin(t(msgKey), 'info');
  }

  function handleSessionEnded(err) {
    if (['ACCOUNT_SUSPENDED', 'ACCOUNT_BANNED', 'ACCOUNT_PENDING', 'ACCOUNT_REJECTED'].includes(err.code)) return showStatus(err.code, err.details);
    showLogin(t('a_sessionEnded'), 'warn');
  }

  async function start() {
    card(`<p class="sub" style="margin:24px 0">${esc(t('a_loading'))}</p>`);
    await loadInfo();
    if (!api.hasSession()) return allowSetup && systemInfo?.needsSetup ? showSetupForm() : showLogin();
    try {
      const r = await api.call('me.get');
      route(r.me);
    } catch (err) {
      if (err.code === 'NETWORK' || err.code === 'OFFLINE' || err.code === 'UNAVAILABLE' || err.code === 'HOST_LOCKED' || err.code === 'INTERNAL' || err.code === 'SERVER_NOT_CONFIGURED') {
        card(`<h1>${esc(appName())}</h1><div class="auth-notice warn">${esc(errorText(err, i18n))}</div><button class="login-btn" id="aRetry" type="button">${esc(t('a_retry'))}</button>`);
        $('#aRetry', root).onclick = () => start();
        return;
      }
      if (!api.hasSession()) return; // handled by onSessionEnded
      showLogin(errorText(err, i18n), 'warn');
    }
  }

  // Re-render the current auth screen after a language change.
  function rerender() {
    switch (current.screen) {
      case 'login': return showLogin(current.msg, current.kind);
      case 'register': return showRegister();
      case 'forgot': return showForgot();
      case 'setup': return showSetupForm();
      case 'status': return showStatus(current.code, current.details);
      case 'noaccess': return showNoAccess(current.me);
      case 'change': if (!current.voluntary) return showChangePassword(current.me); break;
      default: break;
    }
  }

  return { start, signOut, handleSessionEnded, rerender, changePassword: (me, opener) => showChangePassword(me, true, opener), info: () => systemInfo };
}
