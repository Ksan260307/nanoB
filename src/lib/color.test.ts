import { describe, expect, it } from 'vitest';
import { deltaE2000, hexToLab, hexToRgb, labToRgb, rgbToHex, rgbToLab, shade, textColorFor, type Lab } from './color';

describe('hex と RGB', () => {
  it('相互に変換できる', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexToRgb('00ff7f')).toEqual([0, 255, 127]);
    expect(rgbToHex([255, 128, 0])).toBe('#ff8000');
  });

  it('範囲外の値は丸める', () => {
    expect(rgbToHex([300, -5, 12.6])).toBe('#ff000d');
  });
});

describe('CIELAB', () => {
  it('白・黒・灰色', () => {
    const w = rgbToLab(255, 255, 255);
    expect(w[0]).toBeCloseTo(100, 1);
    expect(Math.abs(w[1])).toBeLessThan(0.01);
    expect(Math.abs(w[2])).toBeLessThan(0.01);
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 5);
    const g = rgbToLab(119, 119, 119);
    expect(g[0]).toBeCloseTo(50, 0);
  });

  it('sRGB の赤・緑・青の既知の値', () => {
    const r = rgbToLab(255, 0, 0);
    expect(r[0]).toBeCloseTo(53.24, 1);
    expect(r[1]).toBeCloseTo(80.09, 0);
    expect(r[2]).toBeCloseTo(67.2, 0);
    const g = rgbToLab(0, 255, 0);
    expect(g[0]).toBeCloseTo(87.73, 1);
    const b = rgbToLab(0, 0, 255);
    expect(b[2]).toBeCloseTo(-107.86, 0);
  });

  it('小数の RGB も扱える', () => {
    const a = rgbToLab(127.5, 127.5, 127.5);
    const b = rgbToLab(127, 127, 127);
    expect(a[0]).toBeGreaterThan(b[0]);
  });

  it('Lab → RGB で元に戻る', () => {
    for (const hex of ['#f1eee9', '#ffe217', '#004fa9', '#212625', '#dc8444']) {
      const back = rgbToHex(labToRgb(hexToLab(hex)));
      expect(back).toBe(hex);
    }
  });
});

describe('CIEDE2000', () => {
  // Sharma, Wu, Dalal (2005) のテストデータより
  const cases: [Lab, Lab, number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [61, -5, 29], 22.8977],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    [[90.9257, -0.5406, -0.9208], [88.6381, -0.8985, -0.7239], 1.5381],
  ];

  it.each(cases)('%j と %j の色差は %f', (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 3);
  });

  it('対称で、同じ色なら 0', () => {
    const a: Lab = [40, 10, -20];
    const b: Lab = [45, -5, 30];
    expect(deltaE2000(a, b)).toBeCloseTo(deltaE2000(b, a), 10);
    expect(deltaE2000(a, a)).toBe(0);
  });
});

describe('表示用の補助', () => {
  it('背景に合わせて文字色を選ぶ', () => {
    expect(textColorFor('#ffffff')).toBe('#1d1d1f');
    expect(textColorFor('#ffe217')).toBe('#1d1d1f');
    expect(textColorFor('#212625')).toBe('#ffffff');
    expect(textColorFor('#004fa9')).toBe('#ffffff');
  });

  it('明るく・暗くする', () => {
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
    expect(shade('#808080', 0)).toBe('#808080');
  });
});
