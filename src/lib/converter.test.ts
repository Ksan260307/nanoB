import { describe, expect, it } from 'vitest';
import { indexOfCode, PALETTE } from '../data/palette';
import { hexToRgb } from './color';
import { convertAsync } from './converter';

const RED = indexOfCode('80-15903');

function imageData(w: number, h: number, rgba: [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}

describe('convertAsync', () => {
  it('Worker が使えない環境ではその場で変換する', async () => {
    const [r, g, b] = hexToRgb(PALETTE[RED].hex);
    let calls = 0;
    const job = {
      key: 'k1',
      getPixels: () => {
        calls++;
        return imageData(4, 4, [r, g, b, 255]);
      },
      W: 2,
      H: 2,
      resample: 'average' as const,
      options: {
        allowed: PALETTE.map((_, i) => i),
        maxColors: 0,
        dither: 0,
        brightness: 0,
        contrast: 0,
        saturation: 0,
        cleanup: 0,
        outline: 'none' as const,
        outlineColor: 0,
        replacements: {},
      },
    };
    const cells = await convertAsync(job);
    expect(Array.from(cells)).toEqual([RED, RED, RED, RED]);
    // 同じキーなら画素を作り直さない
    await convertAsync({ ...job, options: { ...job.options, brightness: 10 } });
    expect(calls).toBe(1);
    await convertAsync({ ...job, key: 'k2' });
    expect(calls).toBe(2);
  });
});
