import { describe, expect, it } from 'vitest';
import { indexOfCode, PALETTE } from '../data/palette';
import { hexToRgb } from './color';
import {
  addOutline,
  adjustColors,
  applyReplacements,
  cleanupNoise,
  convertCells,
  quantize,
  resampleBlocks,
  resolveReplacement,
  type CellColors,
  type ConvertOptions,
} from './convert';
import { EMPTY } from './pattern';

const WHITE = indexOfCode('80-15901');
const BLACK = indexOfCode('80-15907');
const RED = indexOfCode('80-15903');
const BLUE = indexOfCode('80-15904');
const YELLOW = indexOfCode('80-15902');
const ALL = PALETTE.map((_, i) => i).filter((i) => !PALETTE[i].kind);

/** パレット色の配列からセル色を作る */
function cellsOf(colors: (number | null)[]): CellColors {
  const out = new Float32Array(colors.length * 4);
  colors.forEach((c, i) => {
    if (c === null) return;
    const [r, g, b] = hexToRgb(PALETTE[c].hex);
    out.set([r, g, b, 1], i * 4);
  });
  return out;
}

function rgbaImage(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fn(x, y), (y * w + x) * 4);
  return d;
}

const baseOptions: ConvertOptions = {
  allowed: ALL,
  maxColors: 0,
  dither: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  cleanup: 0,
  outline: 'none',
  outlineColor: BLACK,
  replacements: {},
};

describe('resampleBlocks', () => {
  it('average: ブロックの平均色と不透明度', () => {
    // 4x2 の画素を 2x1 セルに (左は赤と青の半々、右は半分透明な白)
    const data = rgbaImage(4, 2, (x, y) => {
      if (x < 2) return y === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255];
      return y === 0 ? [255, 255, 255, 255] : [0, 0, 0, 0];
    });
    const out = resampleBlocks(data, 4, 2, 2, 1, 'average');
    expect(out[0]).toBeCloseTo(127.5);
    expect(out[2]).toBeCloseTo(127.5);
    expect(out[3]).toBeCloseTo(1);
    // 透明な画素は色の平均に入らない
    expect(out[4]).toBeCloseTo(255);
    expect(out[7]).toBeCloseTo(0.5);
  });

  it('sharp: ブロックで一番多い色を選ぶ', () => {
    const data = rgbaImage(3, 3, (x, y) => (x === 1 && y === 1 ? [0, 0, 0, 255] : [250, 10, 10, 255]));
    const out = resampleBlocks(data, 3, 3, 1, 1, 'sharp');
    expect(out[0]).toBeCloseTo(250);
    expect(out[1]).toBeCloseTo(10);
    expect(out[3]).toBe(1);
  });

  it('sharp: 透明だけのブロックは不透明度 0', () => {
    const data = rgbaImage(2, 2, () => [0, 0, 0, 0]);
    const out = resampleBlocks(data, 2, 2, 1, 1, 'sharp');
    expect(out[3]).toBe(0);
  });

  it('大きさが割り切れなくても全セルを埋める', () => {
    const data = rgbaImage(5, 5, () => [10, 20, 30, 255]);
    const out = resampleBlocks(data, 5, 5, 3, 3, 'average');
    for (let i = 0; i < 9; i++) expect(out[i * 4 + 3]).toBeCloseTo(1);
  });
});

describe('adjustColors', () => {
  const src = new Float32Array([100, 150, 200, 1]);
  it('0 なら変えない (コピーを返す)', () => {
    const out = adjustColors(src, 0, 0, 0);
    expect(Array.from(out)).toEqual(Array.from(src));
    expect(out).not.toBe(src);
  });
  it('明るさ', () => {
    expect(adjustColors(src, 50, 0, 0)[0]).toBeGreaterThan(100);
    expect(adjustColors(src, -50, 0, 0)[0]).toBeLessThan(100);
  });
  it('コントラスト', () => {
    const hi = adjustColors(src, 0, 50, 0);
    expect(hi[0]).toBeLessThan(100);
    expect(hi[2]).toBeGreaterThan(200);
  });
  it('あざやかさ -100 で灰色', () => {
    const g = adjustColors(src, 0, 0, -100);
    expect(g[0]).toBeCloseTo(g[1]);
    expect(g[1]).toBeCloseTo(g[2]);
  });
  it('0..255 に収める', () => {
    const out = adjustColors(new Float32Array([250, 5, 128, 1]), 100, 100, 100);
    for (let i = 0; i < 3; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(255);
    }
  });
});

describe('quantize', () => {
  it('パレットと同じ色はその色になる', () => {
    const colors = [WHITE, BLACK, RED, BLUE];
    const out = quantize(cellsOf(colors), 2, 2, ALL, 0, 0);
    expect(Array.from(out)).toEqual(colors);
  });

  it('透明なセルはビーズなし', () => {
    const out = quantize(cellsOf([RED, null]), 2, 1, ALL, 0, 0);
    expect(out[0]).toBe(RED);
    expect(out[1]).toBe(EMPTY);
  });

  it('使える色が無いと全部ビーズなし', () => {
    const out = quantize(cellsOf([RED, BLUE]), 2, 1, [], 0, 0);
    expect(Array.from(out)).toEqual([EMPTY, EMPTY]);
  });

  it('使える色だけを使う', () => {
    const out = quantize(cellsOf([RED, BLUE, YELLOW]), 3, 1, [WHITE, BLACK], 0, 0);
    for (const c of out) expect([WHITE, BLACK]).toContain(c);
  });

  it('最大色数を守り、たくさん使われている色を残す', () => {
    const colors = [...Array(10).fill(RED), ...Array(10).fill(BLUE), ...Array(10).fill(WHITE), YELLOW];
    const out = quantize(cellsOf(colors), colors.length, 1, ALL, 3, 0);
    const used = new Set(Array.from(out));
    expect(used.size).toBeLessThanOrEqual(3);
    expect(used).toContain(RED);
    expect(used).toContain(BLUE);
    expect(used).toContain(WHITE);
  });

  it('最大色数 1 なら1色だけ', () => {
    const out = quantize(cellsOf([RED, BLUE, WHITE, BLACK]), 4, 1, ALL, 1, 0);
    expect(new Set(Array.from(out)).size).toBe(1);
  });

  it('ディザリングしても色数制限内・透明は透明のまま', () => {
    const W = 16;
    const H = 4;
    const cells = new Float32Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = (x / (W - 1)) * 255;
        cells.set([v, v, v, x === 0 && y === 0 ? 0 : 1], (y * W + x) * 4);
      }
    }
    const out = quantize(cells, W, H, ALL, 4, 1);
    const used = new Set(Array.from(out).filter((c) => c !== EMPTY));
    expect(used.size).toBeLessThanOrEqual(4);
    expect(out[0]).toBe(EMPTY);
    // グラデーションなので左右で色が変わる
    expect(out[1]).not.toBe(out[W - 1]);
  });

  it('全部透明なら全部ビーズなし', () => {
    const out = quantize(new Float32Array(8), 2, 1, ALL, 0, 1);
    expect(Array.from(out)).toEqual([EMPTY, EMPTY]);
  });
});

describe('色の置き換え', () => {
  it('連鎖をたどる', () => {
    expect(resolveReplacement({ 1: 2, 2: 3 }, 1)).toBe(3);
    expect(resolveReplacement({ 1: 2 }, 5)).toBe(5);
  });
  it('循環しても止まる', () => {
    const r = resolveReplacement({ 1: 2, 2: 1 }, 1);
    expect([1, 2]).toContain(r);
  });
  it('配列に適用 (ビーズなしは対象外)', () => {
    const cells = new Int16Array([RED, BLUE, EMPTY, RED]);
    applyReplacements(cells, { [RED]: YELLOW });
    expect(Array.from(cells)).toEqual([YELLOW, BLUE, EMPTY, YELLOW]);
  });
  it('置き換えが無ければそのまま', () => {
    const cells = new Int16Array([RED, BLUE]);
    applyReplacements(cells, {});
    expect(Array.from(cells)).toEqual([RED, BLUE]);
  });
});

describe('cleanupNoise', () => {
  const grid = (rows: string[], map: Record<string, number>) =>
    new Int16Array(
      rows
        .join('')
        .split('')
        .map((ch) => map[ch]),
    );
  const map = { r: RED, b: BLUE, '.': EMPTY };

  it('レベル0は何もしない', () => {
    const cells = grid(['rrr', 'rbr', 'rrr'], map);
    expect(cleanupNoise(cells, 3, 3, 0)).toBe(cells);
  });

  it('レベル1: ポツンと1粒だけ違う色を周りにそろえる', () => {
    const out = cleanupNoise(grid(['rrr', 'rbr', 'rrr'], map), 3, 3, 1);
    expect(out[4]).toBe(RED);
  });

  it('レベル1: 2粒つながっていれば残す', () => {
    const out = cleanupNoise(grid(['rrrr', 'rbbr', 'rrrr'], map), 4, 3, 1);
    expect(out[5]).toBe(BLUE);
    expect(out[6]).toBe(BLUE);
  });

  it('レベル2: 細い線状のノイズも減らす', () => {
    const out = cleanupNoise(grid(['rrrrr', 'rbbrr', 'rrrrr'], map), 5, 3, 2);
    expect(out[6]).toBe(RED);
  });

  it('背景にポツンとあるビーズも消える', () => {
    const out = cleanupNoise(grid(['...', '.r.', '...'], map), 3, 3, 1);
    expect(out[4]).toBe(EMPTY);
  });
});

describe('addOutline', () => {
  const rows = ['.....', '.rrr.', '.rrr.', '.....'];
  const cells = new Int16Array(
    rows
      .join('')
      .split('')
      .map((ch) => (ch === 'r' ? RED : EMPTY)),
  );

  it('none はそのまま', () => {
    expect(addOutline(cells, 5, 4, 'none', BLACK)).toBe(cells);
  });

  it('outer: 外側の1列 (斜めも) をふちどる', () => {
    const out = addOutline(cells, 5, 4, 'outer', BLACK);
    expect(out[0]).toBe(BLACK); // 角 (斜め)
    expect(out[5]).toBe(BLACK); // 左
    expect(out[6]).toBe(RED); // 中身はそのまま
    expect(Array.from(out).filter((c) => c === BLACK)).toHaveLength(14);
  });

  it('inner: いちばん外側のビーズを塗る', () => {
    const big = new Int16Array(25).fill(EMPTY);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) big[y * 5 + x] = RED;
    const out = addOutline(big, 5, 5, 'inner', BLACK);
    expect(out[6]).toBe(BLACK);
    expect(out[12]).toBe(RED); // 真ん中は残る
    expect(out[0]).toBe(EMPTY);
  });
});

describe('convertCells (パイプライン全体)', () => {
  it('置き換え・ノイズ除去・ふちどりを順に適用する', () => {
    const colors: (number | null)[] = [
      null,
      null,
      null,
      null,
      null,
      null,
      RED,
      RED,
      RED,
      null,
      null,
      RED,
      BLUE,
      RED,
      null,
      null,
      RED,
      RED,
      RED,
      null,
      null,
      null,
      null,
      null,
      null,
    ];
    const out = convertCells(cellsOf(colors), 5, 5, {
      ...baseOptions,
      replacements: { [RED]: YELLOW },
      cleanup: 1,
      outline: 'outer',
      outlineColor: BLACK,
    });
    expect(out[12]).toBe(YELLOW); // 真ん中の青はノイズとして周りの色に
    expect(out[6]).toBe(YELLOW);
    expect(out[0]).toBe(BLACK);
  });

  it('明るさを上げると明るい色になる', () => {
    const gray = new Float32Array([120, 120, 120, 1]);
    const dark = convertCells(gray, 1, 1, { ...baseOptions, brightness: -100 })[0];
    const light = convertCells(gray, 1, 1, { ...baseOptions, brightness: 100 })[0];
    expect(dark).not.toBe(light);
    expect(light).toBe(WHITE);
  });
});
