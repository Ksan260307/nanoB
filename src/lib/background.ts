/**
 * 取り込んだ画像の背景を透明にする (マスク計算は DOM 非依存)
 *
 * - 自動: 画像のふちで一番多い色を背景色とみなし、ふちからつながっている似た色の部分を消す
 * - 手動: タップした点と似た色でつながっている部分を「消す」/「残す」
 * - 「離れた同じ色も消す」: つながっていなくても、背景色に近い色を全部消す
 */
import { rgbToLab, type Lab } from './color';

export type BgMode = 'off' | 'auto' | 'manual';

export interface BgPoint {
  /** 画像上の位置 (0..1) */
  x: number;
  y: number;
  /** true = 残す, false = 消す */
  keep: boolean;
}

export interface BgOptions {
  mode: BgMode;
  /** 似た色とみなす範囲 (CIELAB の色差) */
  tolerance: number;
  /** つながっていない同じ色も消す */
  global: boolean;
  points: BgPoint[];
}

export function bgEnabled(o: Pick<BgOptions, 'mode' | 'points'>): boolean {
  return o.mode === 'auto' || (o.mode === 'manual' && o.points.length > 0);
}

const ALPHA_MIN = 128;

function labs(data: Uint8ClampedArray, n: number): Float32Array {
  const out = new Float32Array(n * 3);
  const cache = new Map<number, Lab>();
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    let lab = cache.get(key);
    if (!lab) {
      lab = rgbToLab(r, g, b);
      if (cache.size < 200000) cache.set(key, lab);
    }
    out[i * 3] = lab[0];
    out[i * 3 + 1] = lab[1];
    out[i * 3 + 2] = lab[2];
  }
  return out;
}

function dist2(L: Float32Array, i: number, ref: Lab): number {
  const dl = L[i * 3] - ref[0];
  const da = L[i * 3 + 1] - ref[1];
  const db = L[i * 3 + 2] - ref[2];
  return dl * dl + da * da + db * db;
}

/** 画像のふちで最も多い色 (不透明な画素が少なければ null) */
export function detectBorderColor(data: Uint8ClampedArray, w: number, h: number): [number, number, number] | null {
  const counts = new Map<number, { n: number; r: number; g: number; b: number }>();
  let opaque = 0;
  let total = 0;
  const visit = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    total++;
    if (data[i + 3] < ALPHA_MIN) return;
    opaque++;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const e = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += data[i];
    e.g += data[i + 1];
    e.b += data[i + 2];
    counts.set(key, e);
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    if (h > 1) visit(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(0, y);
    if (w > 1) visit(w - 1, y);
  }
  if (!opaque || opaque < total * 0.2) return null;
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n < opaque * 0.15) return null;
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

/**
 * 背景マスクを計算する。戻り値は画素ごとの不透明度 (0 = 消す, 255 = 残す)
 */
export function computeMask(data: Uint8ClampedArray, w: number, h: number, opt: BgOptions): Uint8Array {
  const n = w * h;
  const mask = new Uint8Array(n).fill(255);
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < ALPHA_MIN) mask[i] = 0;
  if (!bgEnabled(opt)) return mask;

  const L = labs(data, n);
  const tol2 = opt.tolerance * opt.tolerance;
  const remove = new Uint8Array(n);
  const keep = new Uint8Array(n);
  const queue = new Int32Array(n);

  /** ref に近い色で、seeds からつながっている範囲に印を付ける */
  const flood = (seeds: number[], ref: Lab, target: Uint8Array) => {
    const seen = new Uint8Array(n);
    let head = 0;
    let tail = 0;
    for (const s of seeds) {
      if (!seen[s] && (data[s * 4 + 3] < ALPHA_MIN || dist2(L, s, ref) <= tol2)) {
        seen[s] = 1;
        queue[tail++] = s;
      }
    }
    while (head < tail) {
      const i = queue[head++];
      target[i] = 1;
      const x = i % w;
      const y = (i - x) / w;
      const visit = (j: number) => {
        if (!seen[j] && (data[j * 4 + 3] < ALPHA_MIN || dist2(L, j, ref) <= tol2)) {
          seen[j] = 1;
          queue[tail++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < w - 1) visit(i + 1);
      if (y > 0) visit(i - w);
      if (y < h - 1) visit(i + w);
    }
  };

  const markGlobal = (ref: Lab) => {
    for (let i = 0; i < n; i++) if (dist2(L, i, ref) <= tol2) remove[i] = 1;
  };

  if (opt.mode === 'auto') {
    const bg = detectBorderColor(data, w, h);
    if (bg) {
      const ref = rgbToLab(bg[0], bg[1], bg[2]);
      const border: number[] = [];
      for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
      for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
      flood(border, ref, remove);
      if (opt.global) markGlobal(ref);
    }
  }

  for (const p of opt.points) {
    const x = Math.min(w - 1, Math.max(0, Math.floor(p.x * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor(p.y * h)));
    if (p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1) continue;
    const s = y * w + x;
    const ref: Lab = [L[s * 3], L[s * 3 + 1], L[s * 3 + 2]];
    if (p.keep) {
      flood([s], ref, keep);
    } else {
      flood([s], ref, remove);
      if (opt.global) markGlobal(ref);
    }
  }

  for (let i = 0; i < n; i++) if (remove[i] && !keep[i]) mask[i] = 0;
  return mask;
}

/** 消える画素の割合 (0..1) */
export function removedRatio(mask: Uint8Array): number {
  let removed = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] === 0) removed++;
  return mask.length ? removed / mask.length : 0;
}

export function bgKey(o: BgOptions): string {
  if (!bgEnabled(o)) return 'off';
  return `${o.mode}:${o.tolerance}:${o.global ? 1 : 0}:${o.points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.keep ? 1 : 0}`).join(';')}`;
}
