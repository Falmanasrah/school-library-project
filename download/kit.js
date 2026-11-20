// Builds the Windows USB install kit (.zip) in the browser.
// Pure module with no DOM access, so the same code is tested in Node (tests/download.test.mjs).

export const APP_LIST = [
  { key: 'teachers', path: '/', name: 'Library Booking', desc: 'Teachers App: book library periods for your classes.' },
  { key: 'library', path: '/library/', name: 'Library Teachers', desc: 'Library Teachers App: visits, visitors log, approvals, permission slips and administration.' },
  { key: 'supervisors', path: '/supervisors/', name: 'Floor Supervisors', desc: 'Floor Supervisors App: send digital permission slips to the library.' }
];

const enc = new TextEncoder();

/* ---------------- ZIP (stored entries, UTF-8 names) ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function zip(files, date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, a) => n + a.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

/* ---------------- kit files ---------------- */
const crlf = (lines) => lines.join('\r\n') + '\r\n';
const psq = (s) => "'" + String(s).replace(/'/g, "''") + "'";            // PowerShell single-quoted string
const safeUrl = (u) => String(u).replace(/[\r\n"'%^&|<>]/g, '');          // never let a URL break a script line

function installCmd(title, script, failHint) {
  return crlf([
    '@echo off',
    `title School Library Apps - ${title}`,
    'cd /d "%~dp0"',
    'echo.',
    `echo  ${title}: school library apps for this Windows user.`,
    'echo  No administrator rights are needed.',
    'echo.',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0files\\${script}"`,
    'if errorlevel 1 (',
    '  echo.',
    `  echo  ${failHint}`,
    ')',
    'echo.',
    'pause'
  ]);
}

const DIRS = [
  "if ($OutDir) {",
  "  $dataDir = Join-Path $OutDir 'AppData'",
  "  $menuDir = Join-Path $OutDir 'StartMenu'",
  "  $deskDir = Join-Path $OutDir 'Desktop'",
  "} else {",
  "  $dataDir = Join-Path $env:LOCALAPPDATA 'SchoolLibraryApps'",
  "  $menuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'School Library'",
  "  $deskDir = [Environment]::GetFolderPath('Desktop')",
  "}"
];

function installPs1(apps, origin, version, stamp) {
  return crlf([
    '# School Library Apps - installer for one Windows user (no administrator rights needed).',
    '# Creates Start menu and desktop shortcuts that open each app in its own window.',
    `# Made by ${safeUrl(origin)}/download/ on ${stamp} (version ${version}).`,
    '# -OutDir puts everything in one folder instead (used for testing).',
    "param([string]$OutDir = '')",
    "$ErrorActionPreference = 'Stop'",
    '$apps = @(',
    apps.map(a => `  @{ Key = ${psq(a.key)}; Name = ${psq(a.name)}; Url = ${psq(safeUrl(a.url))}; Desc = ${psq(a.desc)} }`).join(',\r\n'),
    ')',
    '$kitDir = Split-Path -Parent $MyInvocation.MyCommand.Path',
    ...DIRS,
    '',
    'function Find-Browser {',
    "  $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')",
    '  $list = @()',
    "  foreach ($base in @($pf86, $env:ProgramFiles, $env:LOCALAPPDATA)) { if ($base) { $list += (Join-Path $base 'Microsoft\\Edge\\Application\\msedge.exe') } }",
    "  foreach ($base in @($env:ProgramFiles, $pf86, $env:LOCALAPPDATA)) { if ($base) { $list += (Join-Path $base 'Google\\Chrome\\Application\\chrome.exe') } }",
    '  foreach ($p in $list) { if (Test-Path -LiteralPath $p) { return $p } }',
    "  foreach ($exe in @('msedge.exe', 'chrome.exe')) {",
    "    foreach ($root in @('HKCU:', 'HKLM:')) {",
    "      $item = Get-ItemProperty -LiteralPath ($root + '\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\' + $exe) -ErrorAction SilentlyContinue",
    "      if ($item) { $v = ([string]$item.'(default)').Trim('\"'); if ($v -and (Test-Path -LiteralPath $v)) { return $v } }",
    '    }',
    '  }',
    '  return $null',
    '}',
    '',
    'function Add-Shortcut([string]$dir, $app, [string]$icon) {',
    '  if ($script:browser) {',
    "    $lnk = $script:shell.CreateShortcut((Join-Path $dir ($app.Name + '.lnk')))",
    '    $lnk.TargetPath = $script:browser',
    "    $lnk.Arguments = '--app=' + $app.Url",
    '    $lnk.WorkingDirectory = Split-Path -Parent $script:browser',
    '    $lnk.Description = $app.Desc',
    "    if ($icon) { $lnk.IconLocation = $icon + ',0' }",
    '    $lnk.Save()',
    '  } else {',
    "    $lines = @('[InternetShortcut]', ('URL=' + $app.Url))",
    "    if ($icon) { $lines += ('IconFile=' + $icon); $lines += 'IconIndex=0' }",
    "    Set-Content -LiteralPath (Join-Path $dir ($app.Name + '.url')) -Value $lines -Encoding ASCII",
    '  }',
    '}',
    '',
    '$script:browser = Find-Browser',
    '$script:shell = New-Object -ComObject WScript.Shell',
    'foreach ($d in @($dataDir, $menuDir, $deskDir)) { if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null } }',
    'foreach ($app in $apps) {',
    "  $icon = ''",
    "  $src = Join-Path $kitDir ($app.Key + '.ico')",
    '  if (Test-Path -LiteralPath $src) {',
    "    $icon = Join-Path $dataDir ($app.Key + '.ico')",
    '    Copy-Item -LiteralPath $src -Destination $icon -Force',
    '  }',
    '  Add-Shortcut $menuDir $app $icon',
    '  Add-Shortcut $deskDir $app $icon',
    "  Write-Host ('  Installed: ' + $app.Name + '  ->  ' + $app.Url)",
    '}',
    'Write-Host ""',
    "if ($script:browser) { Write-Host ('  The apps open in their own window with ' + (Split-Path -Leaf $script:browser) + '.') }",
    "else { Write-Host '  Microsoft Edge or Google Chrome was not found, so the shortcuts open in the default browser.' }",
    "Write-Host '  Done. Look on the desktop and in the Start menu under \"School Library\".'"
  ]);
}

function uninstallPs1() {
  return crlf([
    '# School Library Apps - removes the shortcuts created by install.ps1 for this Windows user.',
    "param([string]$OutDir = '')",
    "$ErrorActionPreference = 'Continue'",
    `$names = @(${APP_LIST.map(a => psq(a.name)).join(', ')})`,
    ...DIRS,
    "foreach ($n in $names) { foreach ($ext in @('.lnk', '.url')) { $p = Join-Path $deskDir ($n + $ext); if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force } } }",
    'foreach ($d in @($menuDir, $dataDir)) { if (Test-Path -LiteralPath $d) { Remove-Item -LiteralPath $d -Recurse -Force } }',
    "Write-Host '  The school library app shortcuts were removed for this user.'",
    "Write-Host '  Apps installed from inside the browser are removed from the browser Apps page.'"
  ]);
}

function urlShortcut(url) {
  return crlf(['[InternetShortcut]', `URL=${safeUrl(url)}`]);
}

function readme(apps, origin, version, stamp) {
  const dl = `${origin}/download/`;
  const list = apps.map(a => `  ${a.name.padEnd(19)} ${a.url}`);
  return String.fromCharCode(0xFEFF) + crlf([
    'SCHOOL LIBRARY APPS - WINDOWS INSTALL KIT',
    `Version ${version}. Made ${stamp} from ${dl}`,
    '',
    'Apps in this kit:',
    ...list,
    '',
    'WHAT IS INSIDE',
    '  Install.cmd       Installs the app(s) for the current Windows user.',
    '  Uninstall.cmd     Removes the shortcuts again.',
    '  Open ... .url     Opens an app in the web browser without installing anything.',
    '  files\\            Installer scripts and app icons.',
    '',
    'HOW TO INSTALL FROM A USB STICK',
    '  1. Copy this whole folder to the USB stick (or unzip the kit straight onto it).',
    '  2. On each computer, open the folder and double-click Install.cmd.',
    '     If Windows says "Windows protected your PC", choose More info, then Run anyway.',
    '     (Windows shows this for any script copied from the internet or a USB stick.)',
    '  3. The apps appear on the desktop and in the Start menu under "School Library".',
    '     They open in their own window with Microsoft Edge or Google Chrome.',
    '  No administrator rights are needed, and installing does not need an account.',
    '',
    'IF SCRIPTS ARE BLOCKED ON THE COMPUTER',
    '  Double-click one of the "Open ... .url" files instead, then use the Install button',
    '  at the bottom of the page (or the browser menu: Apps > Install this site as an app).',
    '',
    'GOOD TO KNOW',
    `  - The apps load from ${origin} and need the internet or the school network.`,
    '  - They update themselves automatically. You never need to reinstall to update.',
    '  - Signing in needs a school account created or approved by the library administrator.',
    `  - Phones and tablets: scan the QR code on ${dl}`,
    '',
    '------------------------------------------------------------',
    '',
    'تطبيقات مكتبة المدرسة - حزمة التثبيت لأجهزة Windows',
    `الإصدار ${version}. أُنشئت بتاريخ ${stamp} من ${dl}`,
    '',
    'التطبيقات في هذه الحزمة:',
    ...list,
    '',
    'محتويات المجلد',
    '  Install.cmd       يثبّت التطبيقات لمستخدم Windows الحالي.',
    '  Uninstall.cmd     يزيل الاختصارات.',
    '  ملفات .url         تفتح التطبيق في المتصفح دون تثبيت أي شيء.',
    '  files\\            ملفات التثبيت وأيقونات التطبيقات.',
    '',
    'طريقة التثبيت من ذاكرة USB',
    '  1. انسخ هذا المجلد كاملًا إلى ذاكرة USB (أو فك ضغط الحزمة عليها مباشرة).',
    '  2. على كل جهاز، افتح المجلد وانقر نقرًا مزدوجًا على Install.cmd.',
    '     إذا ظهرت رسالة "Windows protected your PC" فاختر More info ثم Run anyway.',
    '  3. تظهر التطبيقات على سطح المكتب وفي قائمة ابدأ تحت "School Library"،',
    '     وتفتح في نافذة مستقلة عبر Microsoft Edge أو Google Chrome.',
    '  لا يحتاج التثبيت إلى صلاحيات المسؤول ولا إلى حساب.',
    '',
    'إذا كانت البرامج النصية محظورة على الجهاز',
    '  انقر نقرًا مزدوجًا على أحد ملفات .url ثم استخدم زر "تثبيت" أسفل الصفحة',
    '  (أو من قائمة المتصفح: التطبيقات > تثبيت هذا الموقع كتطبيق).',
    '',
    'معلومات مهمة',
    `  - تعمل التطبيقات من ${origin} وتحتاج إلى الإنترنت أو شبكة المدرسة.`,
    '  - تُحدَّث التطبيقات تلقائيًا، ولا حاجة لإعادة التثبيت عند صدور تحديث.',
    '  - يتطلب تسجيل الدخول حساب مدرسة ينشئه أو يعتمده مسؤول المكتبة.',
    `  - للهواتف والأجهزة اللوحية: امسح رمز QR في الصفحة ${dl}`
  ]);
}

// Returns { filename, bytes }. icons: { [appKey]: Uint8Array } (optional, from /download/icons/*.ico).
export function buildKit({ origin, keys, icons = {}, version = '', date = new Date() }) {
  const base = String(origin).replace(/\/+$/, '');
  const apps = APP_LIST.filter(a => keys.includes(a.key)).map(a => ({ ...a, url: base + a.path }));
  if (!apps.length) throw new Error('No apps chosen for the kit.');
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const dir = 'School Library Apps/';
  const files = [
    { name: dir + 'README.txt', data: readme(apps, base, version, stamp) },
    { name: dir + 'Install.cmd', data: installCmd('Install', 'install.ps1', 'The installer could not finish. Use the "Open ..." shortcuts in this folder instead.') },
    { name: dir + 'Uninstall.cmd', data: installCmd('Uninstall', 'uninstall.ps1', 'Some shortcuts could not be removed. Delete them from the desktop by hand.') },
    { name: dir + 'files/install.ps1', data: installPs1(apps, base, version, stamp) },
    { name: dir + 'files/uninstall.ps1', data: uninstallPs1() },
    ...apps.map(a => ({ name: `${dir}Open ${a.name}.url`, data: urlShortcut(a.url) })),
    ...apps.filter(a => icons[a.key]).map(a => ({ name: `${dir}files/${a.key}.ico`, data: icons[a.key] }))
  ];
  const which = apps.length === APP_LIST.length ? 'All-Apps' : apps.map(a => a.name.replace(/\s+/g, '-')).join('_');
  return { filename: `School-Library-${which}-Windows-Kit.zip`, bytes: zip(files, date), files };
}
