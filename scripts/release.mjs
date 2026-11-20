// Sets the version number in every file that carries it, so each installed app sees the
// new /version.json, its service worker changes, and it updates itself on the next visit.
//
//   npm run release              2.0.0 -> 2.0.1
//   npm run release -- minor     2.0.0 -> 2.1.0
//   npm run release -- major     2.0.0 -> 3.0.0
//   npm run release -- 2.4.1     exact version
//   npm run release -- --check   only check that every file agrees (used by the tests)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_CONST = /(\bVERSION = ')([^']+)(')/;
const JSON_FIELD = /("version"\s*:\s*")([^"]+)(")/;
export const VERSION_FILES = [
  ['version.json', JSON_FIELD],
  ['package.json', JSON_FIELD],
  ['shared/core.js', JS_CONST],
  ['api/_lib/version.js', JS_CONST],
  ['service-worker.js', JS_CONST],
  ['library/sw.js', JS_CONST],
  ['supervisors/sw.js', JS_CONST]
];

export function readVersions(root = ROOT) {
  return VERSION_FILES.map(([file, re]) => {
    const m = fs.readFileSync(path.join(root, file), 'utf8').match(re);
    if (!m) throw new Error(`No version found in ${file}`);
    return { file, version: m[2] };
  });
}

export function nextVersion(current, arg = 'patch') {
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  const [ma, mi, pa] = current.split('.').map(Number);
  if (arg === 'major') return `${ma + 1}.0.0`;
  if (arg === 'minor') return `${ma}.${mi + 1}.0`;
  if (arg === 'patch') return `${ma}.${mi}.${pa + 1}`;
  throw new Error(`Unknown release type "${arg}". Use patch, minor, major or a version like 2.4.1.`);
}

function main() {
  const arg = process.argv[2] || 'patch';
  const found = readVersions();
  const distinct = [...new Set(found.map(f => f.version))];
  if (arg === '--check') {
    if (distinct.length !== 1) {
      console.error('Version numbers do not match:\n' + found.map(f => `  ${f.file}: ${f.version}`).join('\n'));
      process.exit(1);
    }
    console.log(`All ${found.length} files are at version ${distinct[0]}.`);
    return;
  }
  const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
  const next = nextVersion(current, arg);
  for (const [file, re] of VERSION_FILES) {
    const p = path.join(ROOT, file);
    const src = fs.readFileSync(p, 'utf8');
    fs.writeFileSync(p, src.replace(re, `$1${next}$3`));
  }
  console.log(`Version ${current} -> ${next} in:\n` + VERSION_FILES.map(([f]) => '  ' + f).join('\n'));
  console.log('Publish the site now. Installed apps update themselves the next time they are opened.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
