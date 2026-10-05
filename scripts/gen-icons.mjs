// アプリアイコン (PNG / SVG) を生成する: node scripts/gen-icons.mjs
// 依存ライブラリなしで、ビーズのハートを描いて PNG に書き出す。
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
const BG_TOP = [255, 128, 168];
const BG_BOTTOM = [255, 92, 140];
const BEADS = [
  [255, 255, 255],
  [255, 236, 243],
  [255, 214, 228],
];

/** ハートのビーズ (中心と半径) を 0..1 の座標で返す */
function beads(padding) {
  const cols = 7;
  const rows = HEART.length;
  const area = 1 - padding * 2;
  const pitch = area / cols;
  const offY = padding + (area - rows * pitch) / 2 + pitch * 0.15;
  const list = [];
  HEART.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === 'X') list.push({ cx: padding + (x + 0.5) * pitch, cy: offY + (y + 0.5) * pitch, r: pitch * 0.44, hole: pitch * 0.15, c: BEADS[(x + y) % 3] });
    }),
  );
  return list;
}

function render(size, { padding, rounded }) {
  const data = Buffer.alloc(size * size * 4);
  const list = beads(padding);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          if (rounded && !insideRounded(x, y, 0.22)) continue;
          let col = BG_TOP.map((v, i) => v + (BG_BOTTOM[i] - v) * y);
          for (const bd of list) {
            const d = Math.hypot(x - bd.cx, y - bd.cy);
            if (d <= bd.r && d > bd.hole) col = bd.c;
          }
          r += col[0];
          g += col[1];
          b += col[2];
          a += 255;
        }
      }
      const n = ss * ss;
      const o = (py * size + px) * 4;
      data[o] = Math.round(r / Math.max(1, a / 255));
      data[o + 1] = Math.round(g / Math.max(1, a / 255));
      data[o + 2] = Math.round(b / Math.max(1, a / 255));
      data[o + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, data);
}

function insideRounded(x, y, rad) {
  const cx = Math.min(Math.max(x, rad), 1 - rad);
  const cy = Math.min(Math.max(y, rad), 1 - rad);
  return Math.hypot(x - cx, y - cy) <= rad;
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const list = beads(0.12);
  const circles = list
    .map((b) => {
      const fill = `rgb(${b.c.join(',')})`;
      return `<circle cx="${(b.cx * 64).toFixed(2)}" cy="${(b.cy * 64).toFixed(2)}" r="${(b.r * 64).toFixed(2)}" fill="${fill}"/><circle cx="${(b.cx * 64).toFixed(2)}" cy="${(b.cy * 64).toFixed(2)}" r="${(b.hole * 64).toFixed(2)}" fill="#ff6f9c"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#ff6f9c"/>${circles}</svg>\n`;
}

mkdirSync(join(root, 'icons'), { recursive: true });
writeFileSync(join(root, 'favicon.svg'), svg());
writeFileSync(join(root, 'icons', 'icon-192.png'), render(192, { padding: 0.12, rounded: true }));
writeFileSync(join(root, 'icons', 'icon-512.png'), render(512, { padding: 0.12, rounded: true }));
writeFileSync(join(root, 'icons', 'maskable-512.png'), render(512, { padding: 0.22, rounded: false }));
writeFileSync(join(root, 'icons', 'apple-touch-icon.png'), render(180, { padding: 0.14, rounded: false }));
console.log('icons generated');
