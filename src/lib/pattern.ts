import { PALETTE_SIZE, PLATE_PEGS } from '../data/palette';

/** ビーズなし */
export const EMPTY = -1;
/** 手動編集レイヤーで「変更なし」 */
export const NO_EDIT = -2;

export interface PatternData {
  width: number;
  height: number;
  /** パレットのインデックス、EMPTY = ビーズなし */
  cells: Int16Array;
}

/** 自動変換の結果に手動編集を重ねる */
export function compose(base: Int16Array | null, overlay: Int16Array, out?: Int16Array): Int16Array {
  const n = overlay.length;
  const result = out && out.length === n ? out : new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const o = overlay[i];
    result[i] = o !== NO_EDIT ? o : base ? base[i] : EMPTY;
  }
  return result;
}

export function countColors(cells: Int16Array): Int32Array {
  const counts = new Int32Array(PALETTE_SIZE);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c >= 0) counts[c]++;
  }
  return counts;
}

export function countInRect(cells: Int16Array, width: number, x0: number, y0: number, w: number, h: number): Int32Array {
  const counts = new Int32Array(PALETTE_SIZE);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const c = cells[y * width + x];
      if (c >= 0) counts[c]++;
    }
  }
  return counts;
}

/** 同じ色でつながっている範囲 (上下左右) のインデックス一覧 */
export function floodRegion(cells: Int16Array, W: number, H: number, x: number, y: number): number[] {
  const start = y * W + x;
  const target = cells[start];
  const seen = new Uint8Array(W * H);
  const stack = [start];
  const region: number[] = [];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    region.push(i);
    const cx = i % W;
    const cy = (i - cx) / W;
    const visit = (j: number) => {
      if (!seen[j] && cells[j] === target) {
        seen[j] = 1;
        stack.push(j);
      }
    };
    if (cx > 0) visit(i - 1);
    if (cx < W - 1) visit(i + 1);
    if (cy > 0) visit(i - W);
    if (cy < H - 1) visit(i + W);
  }
  return region;
}

/**
 * ビーズのかたまり (上下左右でつながったもの) を調べる。
 * アイロンでくっつくのは隣り合ったビーズだけなので、
 * 斜めにしか接していない部分は完成後にバラバラになりやすい。
 */
export function findIslands(cells: Int16Array, W: number, H: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(W * H).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (cells[s] === EMPTY || labels[s] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    labels[s] = id;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % W;
      const y = (i - x) / W;
      const visit = (j: number) => {
        if (labels[j] < 0 && cells[j] !== EMPTY) {
          labels[j] = id;
          stack.push(j);
        }
      };
      if (x > 0) visit(i - 1);
      if (x < W - 1) visit(i + 1);
      if (y > 0) visit(i - W);
      if (y < H - 1) visit(i + W);
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

export function plateLayout(width: number, height: number): { cols: number; rows: number } {
  return { cols: Math.max(1, Math.ceil(width / PLATE_PEGS)), rows: Math.max(1, Math.ceil(height / PLATE_PEGS)) };
}

/** プレート (col,row) の範囲 */
export function plateRect(width: number, height: number, col: number, row: number) {
  const x = col * PLATE_PEGS;
  const y = row * PLATE_PEGS;
  return { x, y, w: Math.min(PLATE_PEGS, width - x), h: Math.min(PLATE_PEGS, height - y) };
}

/** 2点間のセルを Bresenham で列挙 */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 100000; guard++) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** サイズ変更時に、左上を基準に中身をコピーする */
export function resizeCells(src: Int16Array, sw: number, sh: number, dw: number, dh: number, fill: number): Int16Array {
  const out = new Int16Array(dw * dh).fill(fill);
  const w = Math.min(sw, dw);
  const h = Math.min(sh, dh);
  for (let y = 0; y < h; y++) {
    out.set(src.subarray(y * sw, y * sw + w), y * dw);
  }
  return out;
}

/** 対称に描くときの向き (x = 左右, y = 上下, xy = 上下左右) */
export type Symmetry = 'none' | 'x' | 'y' | 'xy';

/** 対称に描くとき、(x, y) と一緒に塗るマス (元のマスを含む) */
export function mirrorPoints(x: number, y: number, W: number, H: number, sym: Symmetry): [number, number][] {
  const pts: [number, number][] = [[x, y]];
  const mx = W - 1 - x;
  const my = H - 1 - y;
  if (sym === 'x' || sym === 'xy') pts.push([mx, y]);
  if (sym === 'y' || sym === 'xy') pts.push([x, my]);
  if (sym === 'xy') pts.push([mx, my]);
  return pts;
}

/** 左右 (x) または上下 (y) に反転したコピー */
export function flipCells<T extends Int16Array | Uint8Array>(src: T, W: number, H: number, axis: 'x' | 'y'): T {
  const out = src.slice() as T;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = axis === 'x' ? W - 1 - x : x;
      const sy = axis === 'y' ? H - 1 - y : y;
      out[y * W + x] = src[sy * W + sx];
    }
  }
  return out;
}

/** (dx, dy) だけずらしたコピー。はみ出した分はなくなり、空いた所は fill になる */
export function shiftCells<T extends Int16Array | Uint8Array>(src: T, W: number, H: number, dx: number, dy: number, fill: number): T {
  const out = src.slice() as T;
  out.fill(fill);
  for (let y = 0; y < H; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= H) continue;
    for (let x = 0; x < W; x++) {
      const sx = x - dx;
      if (sx >= 0 && sx < W) out[y * W + x] = src[sy * W + sx];
    }
  }
  return out;
}

/** ビーズのある範囲 (1つも無ければ null) */
export function contentBounds(cells: Int16Array, W: number, H: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (cells[y * W + x] < 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** ビーズのある範囲をまん中に寄せるための移動量 */
export function centerShift(cells: Int16Array, W: number, H: number): [number, number] {
  const b = contentBounds(cells, W, H);
  if (!b) return [0, 0];
  return [Math.floor((W - (b.x1 - b.x0 + 1)) / 2) - b.x0, Math.floor((H - (b.y1 - b.y0 + 1)) / 2) - b.y0];
}
