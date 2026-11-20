// Makes the ready-to-copy Windows install folders, one per app, in ready-for-pcs/.
// Copy a folder (or its .zip) to a USB stick, then on each PC double-click Install.cmd.
//
//   npm run kits                               links to the published site (DEFAULT_SITE)
//   npm run kits -- https://library.school.edu  links to another address, e.g. a custom domain
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKit, zip, APP_LIST } from '../download/kit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_SITE = 'https://school-library-project-nu.vercel.app';
export const FOLDERS = {
  teachers: 'Teachers App',
  library: 'Library Teachers App',
  supervisors: 'Floor Supervisors App'
};
const KIT_DIR = 'School Library Apps/';
const CRLF = (lines) => lines.join('\r\n') + '\r\n';

function checkSite(site) {
  let u;
  try { u = new URL(site); } catch { throw new Error(`"${site}" is not a web address. Example: npm run kits -- https://library.school.edu`); }
  const local = ['localhost', '127.0.0.1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !local) throw new Error('Use the https:// address of the site.');
  return u.origin;
}

function overview(site, version) {
  const list = APP_LIST.map(a => `  ${FOLDERS[a.key].padEnd(24)} ${site}${a.path}`);
  return String.fromCharCode(0xFEFF) + CRLF([
    'READY-TO-COPY INSTALL FOLDERS FOR SCHOOL PCs',
    `Version ${version}. The apps open ${site}`,
    '',
    'One folder per app (each also comes as a .zip with the same content):',
    ...list,
    '',
    'ON EACH PC',
    '  1. Copy the folder for the app that PC needs (for example from a USB stick).',
    '  2. Open the folder and double-click Install.cmd.',
    '     If Windows says "Windows protected your PC", choose More info, then Run anyway.',
    '  3. The app appears on the desktop and in the Start menu under "School Library".',
    '  A PC that needs two apps: run Install.cmd from both folders.',
    '  Uninstall.cmd in a folder removes only that app.',
    '',
    'Everyone chooses their own username and password the first time they sign in.',
    'The apps update themselves; there is no need to copy new folders after an update,',
    'unless the website address changes (then run: npm run kits -- https://new-address).',
    '',
    '------------------------------------------------------------',
    '',
    'مجلدات تثبيت جاهزة لأجهزة المدرسة',
    `الإصدار ${version}. تفتح التطبيقات الموقع ${site}`,
    '',
    'مجلد لكل تطبيق (ولكل مجلد ملف .zip بنفس المحتوى):',
    ...list,
    '',
    'على كل جهاز',
    '  1. انسخ مجلد التطبيق الذي يحتاجه الجهاز (مثلًا من ذاكرة USB).',
    '  2. افتح المجلد وانقر نقرًا مزدوجًا على Install.cmd.',
    '     إذا ظهرت رسالة "Windows protected your PC" فاختر More info ثم Run anyway.',
    '  3. يظهر التطبيق على سطح المكتب وفي قائمة ابدأ تحت "School Library".',
    '  إذا احتاج الجهاز تطبيقين، شغّل Install.cmd من المجلدين.',
    '  الملف Uninstall.cmd في أي مجلد يزيل ذلك التطبيق فقط.',
    '',
    'يختار كل شخص اسم المستخدم وكلمة المرور بنفسه عند أول تسجيل دخول.',
    'تُحدَّث التطبيقات تلقائيًا، ولا حاجة لنسخ المجلدات مرة أخرى إلا إذا تغيّر عنوان الموقع.'
  ]);
}

export function makeKits({ site = DEFAULT_SITE, outDir = path.join(ROOT, 'ready-for-pcs'), date = new Date() } = {}) {
  const origin = checkSite(site);
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
  const icons = {};
  for (const a of APP_LIST) {
    const p = path.join(ROOT, 'download', 'icons', `${a.key}.ico`);
    if (fs.existsSync(p)) icons[a.key] = new Uint8Array(fs.readFileSync(p));
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const made = [];
  for (const a of APP_LIST) {
    const folder = FOLDERS[a.key];
    const { files } = buildKit({ origin, keys: [a.key], icons, version, date });
    const renamed = files.map(f => ({ name: folder + '/' + f.name.slice(KIT_DIR.length), data: f.data }));
    for (const f of renamed) {
      const p = path.join(outDir, ...f.name.split('/'));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, typeof f.data === 'string' ? f.data : Buffer.from(f.data));
    }
    fs.writeFileSync(path.join(outDir, folder + '.zip'), zip(renamed, date));
    made.push({ folder, url: origin + a.path, files: renamed.length });
  }
  fs.writeFileSync(path.join(outDir, 'README.txt'), overview(origin, version));
  return { origin, outDir, made };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = makeKits({ site: process.argv[2] || DEFAULT_SITE });
    console.log(`Ready folders in ${path.relative(ROOT, r.outDir)}/ (apps open ${r.origin}):`);
    for (const m of r.made) console.log(`  ${m.folder}/  and  ${m.folder}.zip  ->  ${m.url}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
