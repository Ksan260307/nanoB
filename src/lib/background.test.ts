import { describe, expect, it } from 'vitest';
import { bgEnabled, bgKey, computeMask, detectBorderColor, removedRatio, type BgOptions } from './background';

/** 文字で描いた画像: w=白 r=赤 b=青 .=透明 */
function img(rows: string[]) {
  const colors: Record<string, [number, number, number, number]> = {
    w: [255, 255, 255, 255],
    W: [245, 245, 240, 255],
    r: [230, 30, 40, 255],
    b: [20, 60, 200, 255],
    '.': [0, 0, 0, 0],
  };
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => data.set(colors[ch], (y * w + x) * 4)));
  return { data, w, h };
}

const opt = (o: Partial<BgOptions>): BgOptions => ({ mode: 'auto', tolerance: 10, global: false, points: [], ...o });
const removed = (mask: Uint8Array): number[] => Array.from(mask).map((v) => (v === 0 ? 1 : 0));

describe('detectBorderColor', () => {
  it('ふちで一番多い色', () => {
    const { data, w, h } = img(['wwww', 'wrrw', 'wwww']);
    expect(detectBorderColor(data, w, h)).toEqual([255, 255, 255]);
  });
  it('ふちが透明ばかりなら null', () => {
    const { data, w, h } = img(['....', '.rr.', '....']);
    expect(detectBorderColor(data, w, h)).toBeNull();
  });
});

describe('computeMask', () => {
  it('オフなら透明な画素だけが 0', () => {
    const { data, w, h } = img(['w.', 'rw']);
    expect(Array.from(computeMask(data, w, h, opt({ mode: 'off' })))).toEqual([255, 0, 255, 255]);
  });

  it('自動: ふちからつながる背景を消し、中の絵は残す', () => {
    const { data, w, h } = img(['wwwww', 'wrrrw', 'wrwrw', 'wrrrw', 'wwwww']);
    const m = removed(computeMask(data, w, h, opt({ mode: 'auto' })));
    expect(m[0]).toBe(1);
    expect(m[6]).toBe(0); // 赤は残る
    expect(m[12]).toBe(0); // 赤に囲まれた白は、つながっていないので残る
  });

  it('自動 + 離れた同じ色も消す', () => {
    const { data, w, h } = img(['wwwww', 'wrrrw', 'wrwrw', 'wrrrw', 'wwwww']);
    const m = removed(computeMask(data, w, h, opt({ mode: 'auto', global: true })));
    expect(m[12]).toBe(1);
    expect(m[6]).toBe(0);
  });

  it('似た色の範囲 (許容値) で消える範囲が変わる', () => {
    const { data, w, h } = img(['wwWWW', 'wrrrW', 'wwWWW']);
    const narrow = removed(computeMask(data, w, h, opt({ tolerance: 1 })));
    const wide = removed(computeMask(data, w, h, opt({ tolerance: 15 })));
    expect(wide.reduce((a, b) => a + b, 0)).toBeGreaterThan(narrow.reduce((a, b) => a + b, 0));
  });

  it('手動: タップした所とつながる似た色を消す', () => {
    const { data, w, h } = img(['rrbb', 'rrbb']);
    const m = removed(computeMask(data, w, h, opt({ mode: 'manual', points: [{ x: 0.9, y: 0.1, keep: false }] })));
    expect(m).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
  });

  it('手動で点が無ければ何も消さない', () => {
    const { data, w, h } = img(['rr', 'rr']);
    expect(removed(computeMask(data, w, h, opt({ mode: 'manual', points: [] })))).toEqual([0, 0, 0, 0]);
  });

  it('「残す」点は消す範囲より優先', () => {
    const { data, w, h } = img(['wwwww', 'wwrww', 'wwwww']);
    const m = removed(computeMask(data, w, h, opt({ mode: 'auto', points: [{ x: 0.1, y: 0.1, keep: true }] })));
    expect(m.every((v) => v === 0)).toBe(true);
  });

  it('画像の外の点は無視', () => {
    const { data, w, h } = img(['rr']);
    expect(removed(computeMask(data, w, h, opt({ mode: 'manual', points: [{ x: 1.5, y: 0.5, keep: false }] })))).toEqual([0, 0]);
  });

  it('手動 + 離れた同じ色も消す', () => {
    const { data, w, h } = img(['bwbwb']);
    const m = removed(computeMask(data, w, h, opt({ mode: 'manual', global: true, points: [{ x: 0.05, y: 0.5, keep: false }] })));
    expect(m).toEqual([1, 0, 1, 0, 1]);
  });
});

describe('補助関数', () => {
  it('bgEnabled', () => {
    expect(bgEnabled({ mode: 'off', points: [] })).toBe(false);
    expect(bgEnabled({ mode: 'auto', points: [] })).toBe(true);
    expect(bgEnabled({ mode: 'manual', points: [] })).toBe(false);
    expect(bgEnabled({ mode: 'manual', points: [{ x: 0, y: 0, keep: false }] })).toBe(true);
  });
  it('removedRatio', () => {
    expect(removedRatio(new Uint8Array([0, 255, 0, 255]))).toBe(0.5);
    expect(removedRatio(new Uint8Array(0))).toBe(0);
  });
  it('bgKey は設定が同じなら同じ', () => {
    expect(bgKey(opt({ mode: 'off' }))).toBe('off');
    expect(bgKey(opt({}))).toBe(bgKey(opt({})));
    expect(bgKey(opt({ tolerance: 11 }))).not.toBe(bgKey(opt({})));
  });
});
