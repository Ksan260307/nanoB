import { describe, expect, it } from 'vitest';
import { PALETTE_SIZE } from '../data/palette';
import { compose, countColors, countInRect, EMPTY, findIslands, floodRegion, lineCells, NO_EDIT, plateLayout, plateRect, resizeCells } from './pattern';

describe('compose', () => {
  it('手動編集を自動変換の上に重ねる', () => {
    const base = new Int16Array([1, 2, 3, 4]);
    const overlay = new Int16Array([NO_EDIT, 7, EMPTY, NO_EDIT]);
    expect(Array.from(compose(base, overlay))).toEqual([1, 7, EMPTY, 4]);
  });
  it('自動変換が無ければ空', () => {
    expect(Array.from(compose(null, new Int16Array([NO_EDIT, 5])))).toEqual([EMPTY, 5]);
  });
  it('出力先を再利用する', () => {
    const out = new Int16Array(2);
    expect(compose(null, new Int16Array([3, 4]), out)).toBe(out);
    expect(compose(null, new Int16Array([3, 4, 5]), out)).not.toBe(out);
  });
});

describe('数える', () => {
  it('色ごとの数', () => {
    const c = countColors(new Int16Array([0, 0, 5, EMPTY, 5, 5]));
    expect(c).toHaveLength(PALETTE_SIZE);
    expect(c[0]).toBe(2);
    expect(c[5]).toBe(3);
  });
  it('範囲内の色ごとの数', () => {
    // 3x2: [0 1 2 / 3 4 5]
    const cells = new Int16Array([0, 1, 2, 3, 4, 5]);
    const c = countInRect(cells, 3, 1, 0, 2, 2);
    expect(c[1] + c[2] + c[4] + c[5]).toBe(4);
    expect(c[0]).toBe(0);
  });
});

describe('floodRegion', () => {
  it('同じ色で上下左右につながる範囲', () => {
    // 1 1 2
    // 2 1 2
    // 1 2 2
    const cells = new Int16Array([1, 1, 2, 2, 1, 2, 1, 2, 2]);
    expect(floodRegion(cells, 3, 3, 0, 0).sort()).toEqual([0, 1, 4]);
    expect(floodRegion(cells, 3, 3, 2, 0).sort()).toEqual([2, 5, 7, 8]);
    expect(floodRegion(cells, 3, 3, 0, 2)).toEqual([6]);
  });
  it('ビーズなしの範囲も選べる', () => {
    const cells = new Int16Array([EMPTY, EMPTY, 1, EMPTY]);
    expect(floodRegion(cells, 2, 2, 0, 0).sort()).toEqual([0, 1, 3]);
  });
});

describe('findIslands', () => {
  it('斜めだけのつながりは別のかたまり', () => {
    // 1 . 1
    // . 1 .
    const cells = new Int16Array([1, EMPTY, 1, EMPTY, 1, EMPTY]);
    const { sizes, labels } = findIslands(cells, 3, 2);
    expect(sizes).toEqual([1, 1, 1]);
    expect(labels[1]).toBe(-1);
  });
  it('色が違ってもとなり合えば同じかたまり', () => {
    const cells = new Int16Array([1, 2, 3, EMPTY]);
    expect(findIslands(cells, 2, 2).sizes).toEqual([3]);
  });
  it('ビーズが無ければ0個', () => {
    expect(findIslands(new Int16Array(4).fill(EMPTY), 2, 2).sizes).toEqual([]);
  });
});

describe('プレート', () => {
  it('必要な枚数', () => {
    expect(plateLayout(28, 28)).toEqual({ cols: 1, rows: 1 });
    expect(plateLayout(56, 29)).toEqual({ cols: 2, rows: 2 });
    expect(plateLayout(1, 1)).toEqual({ cols: 1, rows: 1 });
  });
  it('プレートの範囲 (はしは切り詰め)', () => {
    expect(plateRect(56, 40, 1, 1)).toEqual({ x: 28, y: 28, w: 28, h: 12 });
    expect(plateRect(30, 30, 1, 0)).toEqual({ x: 28, y: 0, w: 2, h: 28 });
  });
});

describe('lineCells', () => {
  it('横・縦・斜め', () => {
    expect(lineCells(0, 0, 3, 0)).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(lineCells(2, 2, 2, 0)).toEqual([
      [2, 2],
      [2, 1],
      [2, 0],
    ]);
    expect(lineCells(0, 0, 2, 2)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
  });
  it('同じ点なら1マス', () => {
    expect(lineCells(4, 5, 4, 5)).toEqual([[4, 5]]);
  });
  it('すき間なくつながる', () => {
    const pts = lineCells(0, 0, 7, 3);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(1);
    }
    expect(pts[pts.length - 1]).toEqual([7, 3]);
  });
});

describe('resizeCells', () => {
  it('左上を基準に広げる・縮める', () => {
    const src = new Int16Array([1, 2, 3, 4]); // 2x2
    expect(Array.from(resizeCells(src, 2, 2, 3, 2, EMPTY))).toEqual([1, 2, EMPTY, 3, 4, EMPTY]);
    expect(Array.from(resizeCells(src, 2, 2, 1, 1, EMPTY))).toEqual([1]);
  });
});
