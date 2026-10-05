/**
 * 画像 → ビーズ図案 の変換パイプライン (DOM 非依存。Web Worker からも使う)
 *
 * 1. resampleBlocks  : 前処理で W*k × H*k に縮小された画素を、1ビーズ=k×kブロックごとに代表色へ
 * 2. adjustColors    : 明るさ・コントラスト・あざやかさ
 * 3. quantize        : CIEDE2000 で最も近いナノビーズの色へ / 色数制限 / ディザリング
 * 4. 置き換え・ノイズ除去・ふちどり
 * (背景の透明化は変換前に画像そのものに対して行う: background.ts)
 */
import { deltaE2000, rgbToLab, type Lab } from './color';
import { PALETTE_LAB } from './paletteColors';
import { EMPTY } from './pattern';

export type ResampleMode = 'average' | 'sharp';
export type OutlineMode = 'none' | 'outer' | 'inner';

export interface ConvertOptions {
  /** 自動変換で使ってよい色 (パレットのインデックス) */
  allowed: number[];
  /** 最大色数 (0 = 制限なし) */
  maxColors: number;
  /** ディザリングの強さ 0..1 */
  dither: number;
  brightness: number;
  contrast: number;
  saturation: number;
  /** ノイズ除去の強さ 0..2 */
  cleanup: number;
  outline: OutlineMode;
  outlineColor: number;
  /** 色の置き換え: from → to */
  replacements: Record<number, number>;
}

/** セルごとの色: RGBA (RGB 0..255, A 0..1) */
export type CellColors = Float32Array;

/**
 * W*k × H*k の RGBA 画素から、W × H セルの代表色を求める。
 * average: 透明度を考慮した平均 / sharp: ブロック内で最も多い色 (イラスト・ドット絵向け)
 */
export function resampleBlocks(data: Uint8ClampedArray, srcW: number, srcH: number, W: number, H: number, mode: ResampleMode): CellColors {
  const out = new Float32Array(W * H * 4);
  const hist = new Int32Array(4096);
  const sumR = new Float64Array(4096);
  const sumG = new Float64Array(4096);
  const sumB = new Float64Array(4096);
  const touched: number[] = [];
  for (let cy = 0; cy < H; cy++) {
    const y0 = Math.floor((cy * srcH) / H);
    const y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * srcH) / H));
    for (let cx = 0; cx < W; cx++) {
      const x0 = Math.floor((cx * srcW) / W);
      const x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * srcW) / W));
      const n = (x1 - x0) * (y1 - y0);
      const o = (cy * W + cx) * 4;
      if (mode === 'average') {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let y = y0; y < y1; y++) {
          let p = (y * srcW + x0) * 4;
          for (let x = x0; x < x1; x++, p += 4) {
            const al = data[p + 3];
            r += data[p] * al;
            g += data[p + 1] * al;
            b += data[p + 2] * al;
            a += al;
          }
        }
        if (a > 0) {
          out[o] = r / a;
          out[o + 1] = g / a;
          out[o + 2] = b / a;
        }
        out[o + 3] = a / (255 * n);
      } else {
        let opaque = 0;
        for (let y = y0; y < y1; y++) {
          let p = (y * srcW + x0) * 4;
          for (let x = x0; x < x1; x++, p += 4) {
            if (data[p + 3] < 128) continue;
            opaque++;
            const key = ((data[p] >> 4) << 8) | ((data[p + 1] >> 4) << 4) | (data[p + 2] >> 4);
            if (hist[key] === 0) touched.push(key);
            hist[key]++;
            sumR[key] += data[p];
            sumG[key] += data[p + 1];
            sumB[key] += data[p + 2];
          }
        }
        let bestKey = -1;
        let bestCount = 0;
        for (const k of touched) {
          if (hist[k] > bestCount) {
            bestCount = hist[k];
            bestKey = k;
          }
        }
        if (bestKey >= 0) {
          out[o] = sumR[bestKey] / bestCount;
          out[o + 1] = sumG[bestKey] / bestCount;
          out[o + 2] = sumB[bestKey] / bestCount;
        }
        out[o + 3] = opaque / n;
        for (const k of touched) {
          hist[k] = 0;
          sumR[k] = 0;
          sumG[k] = 0;
          sumB[k] = 0;
        }
        touched.length = 0;
      }
    }
  }
  return out;
}

/** 明るさ・コントラスト・あざやかさ (-100..100) を適用した新しい配列を返す */
export function adjustColors(cells: CellColors, brightness: number, contrast: number, saturation: number): CellColors {
  const out = new Float32Array(cells);
  if (brightness === 0 && contrast === 0 && saturation === 0) return out;
  const c = contrast * 2.55;
  const cf = (259 * (c + 255)) / (255 * (259 - c));
  const bAdd = brightness * 1.2;
  const sf = 1 + saturation / 100;
  for (let i = 0; i < out.length; i += 4) {
    let r = out[i];
    let g = out[i + 1];
    let b = out[i + 2];
    if (saturation !== 0) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * sf;
      g = gray + (g - gray) * sf;
      b = gray + (b - gray) * sf;
    }
    if (contrast !== 0) {
      r = cf * (r - 128) + 128;
      g = cf * (g - 128) + 128;
      b = cf * (b - 128) + 128;
    }
    r += bAdd;
    g += bAdd;
    b += bAdd;
    out[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    out[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    out[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  return out;
}

const ALPHA_THRESHOLD = 0.5;

function key6(r: number, g: number, b: number): number {
  return ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
}

function labOfKey6(k: number): Lab {
  const r = ((k >> 12) & 63) * 4 + 2;
  const g = ((k >> 6) & 63) * 4 + 2;
  const b = (k & 63) * 4 + 2;
  return rgbToLab(r, g, b);
}

/**
 * セルの色を、使ってよい色の中で最も近いナノビーズの色に置き換える。
 * maxColors を超える場合は「消したときに誤差が最も増えない色」から順に減らす。
 */
export function quantize(cells: CellColors, W: number, H: number, allowed: number[], maxColors: number, dither: number): Int16Array {
  const N = W * H;
  const result = new Int16Array(N).fill(EMPTY);
  if (allowed.length === 0) return result;

  // 1) 色を 6bit/ch に丸めてユニーク色を集計
  const keyOf = new Int32Array(N).fill(-1);
  const uniqueIndex = new Map<number, number>();
  const uniqueKeys: number[] = [];
  const uniqueCounts: number[] = [];
  for (let i = 0; i < N; i++) {
    if (cells[i * 4 + 3] < ALPHA_THRESHOLD) continue;
    const k = key6(cells[i * 4] | 0, cells[i * 4 + 1] | 0, cells[i * 4 + 2] | 0);
    let u = uniqueIndex.get(k);
    if (u === undefined) {
      u = uniqueKeys.length;
      uniqueIndex.set(k, u);
      uniqueKeys.push(k);
      uniqueCounts.push(0);
    }
    uniqueCounts[u]++;
    keyOf[i] = u;
  }
  const U = uniqueKeys.length;
  if (U === 0) return result;
  const P = allowed.length;

  // 2) ユニーク色 × 候補色 の色差表
  const D = new Float32Array(U * P);
  const uLab: Lab[] = new Array(U);
  for (let u = 0; u < U; u++) {
    const lab = labOfKey6(uniqueKeys[u]);
    uLab[u] = lab;
    for (let p = 0; p < P; p++) D[u * P + p] = deltaE2000(lab, PALETTE_LAB[allowed[p]]);
  }

  const active = new Uint8Array(P).fill(1);
  const best = new Int32Array(U);
  const second = new Int32Array(U);
  const recompute = (u: number) => {
    let b1 = -1;
    let b2 = -1;
    let d1 = Infinity;
    let d2 = Infinity;
    const row = u * P;
    for (let p = 0; p < P; p++) {
      if (!active[p]) continue;
      const d = D[row + p];
      if (d < d1) {
        d2 = d1;
        b2 = b1;
        d1 = d;
        b1 = p;
      } else if (d < d2) {
        d2 = d;
        b2 = p;
      }
    }
    best[u] = b1;
    second[u] = b2;
  };
  for (let u = 0; u < U; u++) recompute(u);

  // 3) 色数制限
  if (maxColors > 0) {
    const usage = new Float64Array(P);
    const cost = new Float64Array(P);
    for (;;) {
      usage.fill(0);
      cost.fill(0);
      for (let u = 0; u < U; u++) {
        const b = best[u];
        usage[b] += uniqueCounts[u];
        const s = second[u];
        cost[b] += uniqueCounts[u] * (s >= 0 ? D[u * P + s] - D[u * P + b] : 1e6);
      }
      let used = 0;
      for (let p = 0; p < P; p++) if (usage[p] > 0) used++;
      if (used <= maxColors) break;
      let victim = -1;
      for (let p = 0; p < P; p++) {
        if (usage[p] > 0 && (victim < 0 || cost[p] < cost[victim])) victim = p;
      }
      active[victim] = 0;
      // 使われていない候補も外して、以降の割り当てを使用中の色だけに絞る
      for (let p = 0; p < P; p++) if (usage[p] === 0) active[p] = 0;
      for (let u = 0; u < U; u++) if (!active[best[u]] || (second[u] >= 0 && !active[second[u]])) recompute(u);
    }
  }

  // 実際に使う色の集合
  const finalSet: number[] = [];
  const inFinal = new Uint8Array(P);
  for (let u = 0; u < U; u++) inFinal[best[u]] = 1;
  for (let p = 0; p < P; p++) if (inFinal[p]) finalSet.push(p);

  if (dither <= 0 || finalSet.length < 2) {
    for (let i = 0; i < N; i++) {
      const u = keyOf[i];
      if (u >= 0) result[i] = allowed[best[u]];
    }
    return result;
  }

  // 4) Floyd–Steinberg (Lab 空間・蛇行走査)
  const labs = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = keyOf[i];
    if (u < 0) continue;
    const l = uLab[u];
    labs[i * 3] = l[0];
    labs[i * 3 + 1] = l[1];
    labs[i * 3 + 2] = l[2];
  }
  const err = new Float32Array(N * 3);
  const finalLab = finalSet.map((p) => PALETTE_LAB[allowed[p]]);
  const spread = (j: number, e0: number, e1: number, e2: number, w: number) => {
    if (keyOf[j] < 0) return;
    err[j * 3] += e0 * w;
    err[j * 3 + 1] += e1 * w;
    err[j * 3 + 2] += e2 * w;
  };
  for (let y = 0; y < H; y++) {
    const ltr = y % 2 === 0;
    for (let n = 0; n < W; n++) {
      const x = ltr ? n : W - 1 - n;
      const i = y * W + x;
      if (keyOf[i] < 0) continue;
      const L = Math.min(100, Math.max(0, labs[i * 3] + err[i * 3]));
      const A = Math.min(127, Math.max(-128, labs[i * 3 + 1] + err[i * 3 + 1]));
      const B = Math.min(127, Math.max(-128, labs[i * 3 + 2] + err[i * 3 + 2]));
      let bi = 0;
      let bd = Infinity;
      for (let f = 0; f < finalLab.length; f++) {
        const t = finalLab[f];
        const dl = L - t[0];
        const da = A - t[1];
        const db = B - t[2];
        const d = dl * dl + da * da + db * db;
        if (d < bd) {
          bd = d;
          bi = f;
        }
      }
      const chosen = finalLab[bi];
      result[i] = allowed[finalSet[bi]];
      const e0 = (L - chosen[0]) * dither;
      const e1 = (A - chosen[1]) * dither;
      const e2 = (B - chosen[2]) * dither;
      const dx = ltr ? 1 : -1;
      const xr = x + dx;
      const xl = x - dx;
      if (xr >= 0 && xr < W) spread(i + dx, e0, e1, e2, 7 / 16);
      if (y + 1 < H) {
        if (xl >= 0 && xl < W) spread(i + W - dx, e0, e1, e2, 3 / 16);
        spread(i + W, e0, e1, e2, 5 / 16);
        if (xr >= 0 && xr < W) spread(i + W + dx, e0, e1, e2, 1 / 16);
      }
    }
  }
  return result;
}

/** 置き換えの連鎖 (A→B, B→C) をたどって最終的な色を返す */
export function resolveReplacement(map: Record<number, number>, color: number): number {
  let c = color;
  for (let guard = 0; guard < 64; guard++) {
    const next = map[c];
    if (next === undefined || next === c) return c;
    c = next;
  }
  return c;
}

export function applyReplacements(cells: Int16Array, map: Record<number, number>): void {
  if (Object.keys(map).length === 0) return;
  const memo = new Map<number, number>();
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c < 0) continue;
    let r = memo.get(c);
    if (r === undefined) {
      r = resolveReplacement(map, c);
      memo.set(c, r);
    }
    cells[i] = r;
  }
}

/**
 * ポツンと孤立したビーズを周りの色にそろえる。
 * level 1: 8近傍に同じ色が1つもないもの / level 2: 上下左右に同じ色が1つ以下のものも
 */
export function cleanupNoise(cells: Int16Array, W: number, H: number, level: number): Int16Array {
  let cur = cells;
  const passes = level >= 2 ? 2 : level >= 1 ? 1 : 0;
  const counts = new Map<number, number>();
  for (let pass = 0; pass < passes; pass++) {
    const next = new Int16Array(cur);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = cur[i];
        counts.clear();
        let same8 = 0;
        let same4 = 0;
        let total = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const n = cur[yy * W + xx];
            total++;
            if (n === c) {
              same8++;
              if (dx === 0 || dy === 0) same4++;
            } else {
              counts.set(n, (counts.get(n) ?? 0) + 1);
            }
          }
        }
        const candidate = level >= 2 ? same4 <= 1 && same8 <= 2 : same8 === 0;
        if (!candidate || total < 3) continue;
        let major = c;
        let majorN = 0;
        for (const [k, v] of counts) {
          if (v > majorN) {
            majorN = v;
            major = k;
          }
        }
        if (majorN >= Math.ceil(total / 2)) next[i] = major;
      }
    }
    cur = next;
  }
  return cur;
}

/** ふちどり。outer: 絵の外側のすき間に1列追加 / inner: 絵の一番外側のビーズを置き換え */
export function addOutline(cells: Int16Array, W: number, H: number, mode: OutlineMode, color: number): Int16Array {
  if (mode === 'none') return cells;
  const out = new Int16Array(cells);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const c = cells[i];
      if (mode === 'outer') {
        if (c !== EMPTY) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            if (cells[yy * W + xx] !== EMPTY) {
              near = true;
              break;
            }
          }
        }
        if (near) out[i] = color;
      } else {
        if (c === EMPTY) continue;
        const edge =
          (x > 0 && cells[i - 1] === EMPTY) ||
          (x < W - 1 && cells[i + 1] === EMPTY) ||
          (y > 0 && cells[i - W] === EMPTY) ||
          (y < H - 1 && cells[i + W] === EMPTY);
        if (edge) out[i] = color;
      }
    }
  }
  return out;
}

/** パイプライン全体 */
export function convertCells(source: CellColors, W: number, H: number, opt: ConvertOptions): Int16Array {
  const cells = adjustColors(source, opt.brightness, opt.contrast, opt.saturation);
  let result = quantize(cells, W, H, opt.allowed, opt.maxColors, opt.dither);
  applyReplacements(result, opt.replacements);
  if (opt.cleanup > 0) result = cleanupNoise(result, W, H, opt.cleanup);
  if (opt.outline !== 'none') result = addOutline(result, W, H, opt.outline, opt.outlineColor);
  return result;
}
