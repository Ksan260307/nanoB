import { describe, expect, it } from 'vitest';
import { blockSize, fitCrop, reaspectCrop, sourceKeyOf } from './image';

describe('fitCrop', () => {
  it('横長の画像を正方形の図案に: 全体を入れる', () => {
    const c = fitCrop(200, 100, 28, 28, 'contain');
    expect(c.w).toBeCloseTo(1);
    expect(c.h).toBeCloseTo(2);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(-0.5);
  });

  it('横長の画像を正方形の図案に: 枠いっぱい', () => {
    const c = fitCrop(200, 100, 28, 28, 'cover');
    expect(c.h).toBeCloseTo(1);
    expect(c.w).toBeCloseTo(0.5);
    expect(c.x).toBeCloseTo(0.25);
    expect(c.y).toBeCloseTo(0);
  });

  it('縦長の画像を横長の図案に', () => {
    const contain = fitCrop(100, 300, 56, 28, 'contain');
    expect(contain.h).toBeCloseTo(1);
    expect(contain.w).toBeCloseTo(6);
    const cover = fitCrop(100, 300, 56, 28, 'cover');
    expect(cover.w).toBeCloseTo(1);
    expect(cover.h).toBeCloseTo(1 / 6);
  });

  it('切り抜きの縦横比は図案と同じ', () => {
    for (const mode of ['contain', 'cover'] as const) {
      const c = fitCrop(640, 427, 84, 56, mode);
      expect((c.w * 640) / (c.h * 427)).toBeCloseTo(84 / 56);
    }
  });
});

describe('reaspectCrop', () => {
  it('中心と面積を保って縦横比を変える', () => {
    const before = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
    const after = reaspectCrop(before, 100, 100, 56, 28);
    expect(after.x + after.w / 2).toBeCloseTo(0.5);
    expect(after.y + after.h / 2).toBeCloseTo(0.5);
    expect(after.w / after.h).toBeCloseTo(2);
    expect(after.w * after.h).toBeCloseTo(0.36);
  });
});

describe('blockSize', () => {
  it('1ビーズあたりの画素数 (1〜8)', () => {
    expect(blockSize(1600, 1600, { x: 0, y: 0, w: 1, h: 1 }, 28, 28)).toBe(8);
    expect(blockSize(100, 100, { x: 0, y: 0, w: 1, h: 1 }, 28, 28)).toBe(3);
    expect(blockSize(10, 10, { x: 0, y: 0, w: 1, h: 1 }, 28, 28)).toBe(1);
  });
});

describe('sourceKeyOf', () => {
  it('同じ画像なら同じキー、違えば違うキー', () => {
    const a = 'data:image/png;base64,' + 'A'.repeat(10000);
    const b = 'data:image/png;base64,' + 'A'.repeat(9999) + 'B';
    expect(sourceKeyOf(a)).toBe(sourceKeyOf(a));
    expect(sourceKeyOf(a)).not.toBe(sourceKeyOf(b));
  });
});
