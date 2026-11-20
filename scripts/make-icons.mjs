// Generates the app icons (PNG for the web apps, ICO for the Windows USB shortcuts)
// with no external tools: shapes are rasterised with 4x4 supersampling. Every icon has
// a full-bleed background, so all pixels are opaque (safe for maskable icons).
//   node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const WHITE = hex('#ffffff');

/* ---- shapes in unit coordinates (0..1) ---- */
function inside(s, x, y) {
  switch (s.t) {
    case 'rect': return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
    case 'rrect': {
      if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) return false;
      const cx = Math.min(Math.max(x, s.x + s.r), s.x + s.w - s.r), cy = Math.min(Math.max(y, s.y + s.r), s.y + s.h - s.r);
      return (x - cx) ** 2 + (y - cy) ** 2 <= s.r * s.r;
    }
    case 'circle': return (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r * s.r;
    case 'line': {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = dx * dx + dy * dy;
      const k = Math.max(0, Math.min(1, ((x - s.x1) * dx + (y - s.y1) * dy) / len));
      return (x - (s.x1 + k * dx)) ** 2 + (y - (s.y1 + k * dy)) ** 2 <= (s.w / 2) ** 2;
    }
    case 'poly': { // point-in-polygon
      let c = false;
      for (let i = 0, j = s.p.length - 1; i < s.p.length; j = i++) {
        const [xi, yi] = s.p[i], [xj, yj] = s.p[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    }
    default: return false;
  }
}

function render(size, shapes) {
  const SS = 4, out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
          let col = null;
          for (const s of shapes) if (inside(s, x, y)) col = s.c;
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += col[3]; }
        }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      out[i] = Math.round(r / n); out[i + 1] = Math.round(g / n); out[i + 2] = Math.round(b / n); out[i + 3] = Math.round(a / n);
    }
  }
  return out;
}

/* ---- PNG & ICO encoders ---- */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(images) { // images: [{ size, png }]
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dirs = images.map(({ size, png: data }) => {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size; d[1] = size >= 256 ? 0 : size; d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(data.length, 8); d.writeUInt32LE(offset, 12);
    offset += data.length;
    return d;
  });
  return Buffer.concat([head, ...dirs, ...images.map(i => i.png)]);
}

/* ---- the icons ---- */
const ICONS = {
  // Teachers App: same look as the original icon (white open book on blue).
  teachers: (bg) => [
    { t: 'rect', x: 0, y: 0, w: 1, h: 1, c: bg },
    { t: 'rrect', x: 0.2, y: 0.22, w: 0.6, h: 0.6, r: 0.07, c: WHITE },
    { t: 'rect', x: 0.492, y: 0.22, w: 0.016, h: 0.6, c: bg }
  ],
  // Library Teachers App: books on a shelf.
  library: (bg) => [
    { t: 'rect', x: 0, y: 0, w: 1, h: 1, c: bg },
    { t: 'rrect', x: 0.24, y: 0.26, w: 0.12, h: 0.48, r: 0.02, c: WHITE },
    { t: 'rrect', x: 0.39, y: 0.32, w: 0.12, h: 0.42, r: 0.02, c: WHITE },
    { t: 'poly', p: [[0.54, 0.36], [0.64, 0.33], [0.77, 0.71], [0.67, 0.74]], c: WHITE },
    { t: 'rrect', x: 0.2, y: 0.75, w: 0.6, h: 0.045, r: 0.02, c: WHITE }
  ],
  // Floor Supervisors App: a permission slip with a tick.
  supervisors: (bg) => [
    { t: 'rect', x: 0, y: 0, w: 1, h: 1, c: bg },
    { t: 'rrect', x: 0.27, y: 0.2, w: 0.46, h: 0.6, r: 0.05, c: WHITE },
    { t: 'line', x1: 0.35, y1: 0.33, x2: 0.65, y2: 0.33, w: 0.035, c: bg },
    { t: 'line', x1: 0.35, y1: 0.42, x2: 0.58, y2: 0.42, w: 0.035, c: bg },
    { t: 'line', x1: 0.38, y1: 0.61, x2: 0.46, y2: 0.69, w: 0.055, c: bg },
    { t: 'line', x1: 0.46, y1: 0.69, x2: 0.64, y2: 0.52, w: 0.055, c: bg }
  ],
  // Download page: arrow into a tray.
  download: (bg) => [
    { t: 'rect', x: 0, y: 0, w: 1, h: 1, c: bg },
    { t: 'line', x1: 0.5, y1: 0.22, x2: 0.5, y2: 0.58, w: 0.075, c: WHITE },
    { t: 'poly', p: [[0.33, 0.5], [0.67, 0.5], [0.5, 0.68]], c: WHITE },
    { t: 'line', x1: 0.25, y1: 0.66, x2: 0.25, y2: 0.77, w: 0.06, c: WHITE },
    { t: 'line', x1: 0.75, y1: 0.66, x2: 0.75, y2: 0.77, w: 0.06, c: WHITE },
    { t: 'line', x1: 0.25, y1: 0.77, x2: 0.75, y2: 0.77, w: 0.06, c: WHITE }
  ]
};
const COLORS = { teachers: '#0f5d8a', library: '#1f7a5a', supervisors: '#b36b00', download: '#33415c' };

function write(path, data) { const p = join(ROOT, path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); console.log('wrote', path, data.length, 'bytes'); }

for (const [name, shapes] of Object.entries(ICONS)) {
  const s = shapes(hex(COLORS[name]));
  const pngs = Object.fromEntries([16, 32, 48, 64, 192, 256, 512].map(n => [n, png(n, render(n, s))]));
  if (name === 'library' || name === 'supervisors' || name === 'download') {
    write(`${name}/icons/icon-192.png`, pngs[192]);
    write(`${name}/icons/icon-512.png`, pngs[512]);
  }
  write(`download/icons/${name}.ico`, ico([256, 64, 48, 32, 16].map(n => ({ size: n, png: pngs[n] }))));
}
