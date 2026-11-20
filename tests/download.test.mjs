// Tests for the public download page helpers: the QR code it draws and the Windows USB kit (.zip).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildKit, zip, crc32, APP_LIST } from '../download/kit.js';

const require = createRequire(import.meta.url);
// Run the exact file the page loads, as a classic script (like the browser does).
const qrSandbox = {};
vm.runInNewContext(fs.readFileSync(new URL('../download/vendor/qrcode.js', import.meta.url), 'utf8'), qrSandbox);
const qrcode = qrSandbox.qrcode;
const jsQR = require('jsqr');                              // independent decoder (dev dependency only)

function decodeQr(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount(), margin = 4, cell = 4, size = (n + margin * 2) * cell;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!q.isDark(r, c)) continue;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const i = (((r + margin) * cell + y) * size + (c + margin) * cell + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  return jsQR(px, size, size)?.data;
}

// Minimal ZIP reader: walks the central directory and checks every entry against its local header.
function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const eocd = buf.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50, 'end of central directory');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50, 'central header');
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 24, true), nameLen = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    assert.equal(dv.getUint32(local, true), 0x04034b50, 'local header');
    const lNameLen = dv.getUint16(local + 26, true), lExtra = dv.getUint16(local + 28, true);
    const data = buf.subarray(local + 30 + lNameLen + lExtra, local + 30 + lNameLen + lExtra + size);
    assert.equal(crc32(data), crc, `crc of ${name}`);
    assert.equal(zlib.crc32(data), crc, `crc of ${name} (zlib)`);
    out[name] = data;
    p += 46 + nameLen;
  }
  return out;
}

test('QR codes from the vendored generator decode back to the exact URL', () => {
  for (const url of [
    'https://school-library-project.vercel.app/download/',
    'https://library.my-school-district.example.org/supervisors/',
    'http://localhost:8080/library/'
  ]) assert.equal(decodeQr(url), url);
});

test('crc32 matches zlib for text and binary data', () => {
  const bin = new Uint8Array(1000).map((_, i) => (i * 37) & 255);
  assert.equal(crc32(new TextEncoder().encode('School Library')), zlib.crc32('School Library'));
  assert.equal(crc32(bin), zlib.crc32(bin));
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('the all-apps USB kit contains every file, with links to this website', () => {
  const ico = new Uint8Array([0, 0, 1, 0, 1, 0, 9, 9, 9]);
  const { filename, bytes } = buildKit({
    origin: 'https://school.example.org/', keys: APP_LIST.map(a => a.key),
    icons: { teachers: ico, library: ico }, version: '2.0.0', date: new Date(2026, 10, 20, 10, 30)
  });
  assert.equal(filename, 'School-Library-All-Apps-Windows-Kit.zip');
  const files = readZip(bytes);
  const dir = 'School Library Apps/';
  for (const f of ['README.txt', 'Install.cmd', 'Uninstall.cmd', 'files/install.ps1', 'files/uninstall.ps1',
    'Open Library Booking.url', 'Open Library Teachers.url', 'Open Floor Supervisors.url', 'files/teachers.ico', 'files/library.ico']) {
    assert.ok(files[dir + f], `missing ${f}`);
  }
  assert.ok(!files[dir + 'files/supervisors.ico'], 'icons that were not supplied are left out');
  const text = (f) => new TextDecoder().decode(files[dir + f]);
  const ps1 = text('files/install.ps1');
  assert.match(ps1, /Url = 'https:\/\/school\.example\.org\/'/);
  assert.match(ps1, /Url = 'https:\/\/school\.example\.org\/library\/'/);
  assert.match(ps1, /Url = 'https:\/\/school\.example\.org\/supervisors\/'/);
  assert.match(ps1, /--app=/);
  assert.ok(!/[^\x00-\x7f]/.test(ps1), 'install.ps1 stays ASCII so Windows PowerShell 5.1 reads it correctly');
  assert.ok(!/[^\x00-\x7f]/.test(text('Install.cmd')), 'Install.cmd stays ASCII');
  assert.ok(text('Install.cmd').includes('\r\n') && !/[^\r]\n/.test(text('Install.cmd')), 'batch files use CRLF line endings');
  assert.match(text('Open Library Teachers.url'), /^\[InternetShortcut\]\r\nURL=https:\/\/school\.example\.org\/library\/\r\n$/);
  const readme = files[dir + 'README.txt'];
  assert.deepEqual([...readme.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'README starts with a UTF-8 BOM for Notepad');
  assert.match(text('README.txt'), /المكتبة/);
  assert.deepEqual([...files[dir + 'files/teachers.ico']], [...ico]);
});

test('a one-app kit only installs that app', () => {
  const { filename, bytes } = buildKit({ origin: 'https://school.example.org', keys: ['supervisors'], version: '2.0.0' });
  assert.equal(filename, 'School-Library-Floor-Supervisors-Windows-Kit.zip');
  const files = readZip(bytes);
  const ps1 = new TextDecoder().decode(files['School Library Apps/files/install.ps1']);
  assert.match(ps1, /Key = 'supervisors'/);
  assert.doesNotMatch(ps1, /Key = 'teachers'|Key = 'library'/);
  assert.ok(!files['School Library Apps/Open Library Booking.url']);
});

test('characters that could break the generated scripts are removed from the URL', () => {
  const { bytes } = buildKit({ origin: "https://evil.example'\r\n&calc", keys: ['teachers'] });
  const ps1 = new TextDecoder().decode(readZip(bytes)['School Library Apps/files/install.ps1']);
  assert.match(ps1, /Url = 'https:\/\/evil\.examplecalc\/'/);
  assert.throws(() => buildKit({ origin: 'https://x', keys: [] }), /No apps/);
});

test('zip() handles UTF-8 file names', () => {
  const files = readZip(zip([{ name: 'مجلد/ملف.txt', data: 'نص' }]));
  assert.equal(new TextDecoder().decode(files['مجلد/ملف.txt']), 'نص');
});
