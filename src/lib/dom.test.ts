// @vitest-environment jsdom
// 画像の読み込み・描画・書き出し・Worker まわり (ブラウザの API を使う部分)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexOfCode, PALETTE } from '../data/palette';
import { exportPdf, exportPng, renderSheet, downloadBlob, type ExportInput } from './exporters';
import { EMPTY } from './pattern';
import { LIGHT_THEME, renderPattern } from './render';
import { FakeImage, opaqueCanvas } from '../test/fakes';

const RED = indexOfCode('80-15903');

describe('画像の読み込み (image.ts)', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage);
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('大きな画像は長辺1600pxに縮小し、透明があれば PNG', async () => {
    const { importImage } = await import('./image');
    const src = await importImage('https://example.com/photo.png#3200x1600');
    expect([src.width, src.height]).toEqual([1600, 800]);
    expect(src.dataUrl).toMatch(/^data:image\/png/);
    expect(src.name).toBe('photo');
  });

  it('透明が無ければ JPEG / 名前を指定できる', async () => {
    const restore = opaqueCanvas();
    const { importImage } = await import('./image');
    const src = await importImage('https://example.com/a.jpg#200x100', '名前');
    restore();
    expect(src.name).toBe('名前');
    expect([src.width, src.height]).toEqual([200, 100]);
  });

  it('ファイルから読み込む (URL を後片付け)', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { importImage } = await import('./image');
    const file = new File(['x'], 'ねこ.webp', { type: 'image/webp' });
    const src = await importImage(file);
    expect(src.name).toBe('ねこ');
    expect(revoke).toHaveBeenCalled();
  });

  it('大きさの無い SVG は 512px として扱う', async () => {
    const { importImage } = await import('./image');
    const src = await importImage('/samples/x.svg#0x0');
    expect([src.width, src.height]).toEqual([512, 512]);
  });

  it('URL の末尾が空ならファイル名は「画像」', async () => {
    const { importImage } = await import('./image');
    const src = await importImage('https://example.com/');
    expect(src.name).toBe('画像');
  });

  it('読み込めない画像はエラー', async () => {
    const { importImage } = await import('./image');
    await expect(importImage('https://example.com/error.png')).rejects.toThrow('画像を読み込めませんでした');
  });

  it('decodeSource は同じ画像なら使い回す (たまったら捨てる)', async () => {
    const { decodeSource } = await import('./image');
    const a = decodeSource('data:a#1x1');
    expect(decodeSource('data:a#1x1')).toBe(a);
    for (let i = 0; i < 8; i++) decodeSource(`data:${i}#1x1`);
    expect(decodeSource('data:a#1x1')).not.toBe(a);
    expect((await a).naturalWidth).toBe(1);
  });

  it('prescale: 切り抜いて縮小 (左右反転も)', async () => {
    const { prescale } = await import('./image');
    const img = document.createElement('canvas');
    const data = prescale(img, 100, 100, { x: 0, y: 0, w: 1, h: 1 }, true, 4, 3, 2, true);
    expect([data.width, data.height]).toEqual([8, 6]);
    const plain = prescale(img, 100, 100, { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, false, 4, 4, 1, false);
    expect(plain.width).toBe(4);
  });

  it('sampleImageColor: 画像の外・透明は null、不透明なら色', async () => {
    const { sampleImageColor } = await import('./image');
    const img = document.createElement('canvas');
    expect(sampleImageColor(img, 10, 10, -0.1, 0.5)).toBeNull();
    expect(sampleImageColor(img, 10, 10, 0.5, 1.5)).toBeNull();
    expect(sampleImageColor(img, 10, 10, 0.5, 0.5)).toBeNull();
    const restore = opaqueCanvas([1, 2, 3]);
    expect(sampleImageColor(img, 10, 10, 0.5, 0.5)).toEqual([1, 2, 3]);
    restore();
  });

  it('背景の透明化: マスク計算用の縮小・マスクの適用・キャッシュ', async () => {
    const { workingImageData, applyMask, backgroundRemoved } = await import('./image');
    const img = document.createElement('canvas') as unknown as HTMLImageElement;
    expect(workingImageData(img, 960, 480).width).toBe(480);
    expect(workingImageData(img, 100, 50, 50).width).toBe(50);
    const masked = applyMask(img, 20, 10, new Uint8Array(8).fill(255), 4, 2);
    expect([masked.width, masked.height]).toEqual([20, 10]);
    const off = backgroundRemoved(img, 10, 10, { mode: 'off', tolerance: 10, global: false, points: [] }, 'k');
    expect(off).toBe(img);
    const opt = { mode: 'auto' as const, tolerance: 10, global: false, points: [] };
    const a = backgroundRemoved(img, 10, 10, opt, 'k');
    expect(a).not.toBe(img);
    expect(backgroundRemoved(img, 10, 10, opt, 'k')).toBe(a);
    expect(backgroundRemoved(img, 10, 10, opt, 'other')).not.toBe(a);
  });

  it('sourceKeyOf はキャッシュがたまったら捨てる', async () => {
    const { sourceKeyOf } = await import('./image');
    const keys = Array.from({ length: 12 }, (_, i) => sourceKeyOf(`data:${i}`));
    expect(new Set(keys).size).toBe(12);
    expect(sourceKeyOf('data:0')).toBe(keys[0]);
  });
});

describe('描画の細かな分岐 (render.ts)', () => {
  const ctx = () => document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  const many = () => {
    const c = new Int16Array(PALETTE.length);
    for (let i = 0; i < c.length; i++) c[i] = i;
    return c;
  };

  it('小さめのビーズ (ふち・ハイライトなし)・補助線なし', () => {
    renderPattern(ctx(), { cells: many(), width: 11, height: 5, cell: 6, ox: 0, oy: 0, viewW: 100, viewH: 100, style: 'bead', theme: LIGHT_THEME });
  });

  it('いろいろな大きさで描くとスプライトのキャッシュを入れ替える', () => {
    for (let size = 8; size < 40; size++) {
      renderPattern(ctx(), { cells: many(), width: 11, height: 5, cell: size, ox: 0, oy: 0, viewW: 600, viewH: 300, style: 'bead', theme: LIGHT_THEME });
    }
  });

  it('記号表示で記号が無い色は「?」', () => {
    renderPattern(ctx(), {
      cells: new Int16Array([RED]),
      width: 1,
      height: 1,
      cell: 20,
      ox: 0,
      oy: 0,
      viewW: 20,
      viewH: 20,
      style: 'symbol',
      theme: LIGHT_THEME,
      symbols: new Map(),
    });
  });
});

describe('書き出しの細かな分岐 (exporters.ts)', () => {
  const cells = (w: number, h: number, colors = 1) => {
    const c = new Int16Array(w * h);
    for (let i = 0; i < c.length; i++) c[i] = i % colors;
    return c;
  };

  it('名前・作者表示なし、補助線なし', async () => {
    const input: ExportInput = { name: '', cells: cells(10, 10), width: 10, height: 10, guideEvery: 0 };
    expect(renderSheet(input, 'symbol').width).toBeGreaterThan(0);
    const blob = await exportPdf(input);
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain('/Title (nanobeads)');
    expect(text).toContain('/Count 2'); // 1プレート
  });

  it('色が多いとカラーチャートを4列に', async () => {
    const input: ExportInput = { name: 'many', cells: cells(56, 56, 50), width: 56, height: 56, guideEvery: 7 };
    const blob = await exportPdf(input);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('ビーズが1つも無ければ表紙だけ', async () => {
    const blob = await exportPdf({ name: 'empty', cells: new Int16Array(28 * 28).fill(EMPTY), width: 28, height: 28, guideEvery: 7 });
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain('/Count 1');
  });

  it('画像が作れなかったらエラー', async () => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(null);
    };
    await expect(exportPng({ name: 'x', cells: cells(4, 4), width: 4, height: 4, guideEvery: 7 }, 'flat')).rejects.toThrow('画像を作れませんでした');
    HTMLCanvasElement.prototype.toBlob = original;
  });

  it('ダウンロード後、しばらくして URL を片付ける', () => {
    vi.useFakeTimers();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadBlob(new Blob(['x']), 'x.txt');
    vi.advanceTimersByTime(31_000);
    expect(revoke).toHaveBeenCalled();
    click.mockRestore();
    vi.useRealTimers();
  });
});

describe('Web Worker での変換 (converter.ts)', () => {
  type Behavior = 'ok' | 'needPixels' | 'error' | 'crash' | 'stray';
  let behavior: Behavior = 'ok';
  const created: FakeWorker[] = [];

  class FakeWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    sent: { id: number; pixels?: unknown; W: number; H: number }[] = [];
    constructor() {
      created.push(this);
    }
    postMessage(req: { id: number; pixels?: unknown; W: number; H: number }) {
      this.sent.push(req);
      setTimeout(() => {
        if (behavior === 'crash') this.onerror?.(new Event('error'));
        else if (behavior === 'needPixels' && !req.pixels) this.onmessage?.({ data: { id: req.id, error: 'no pixels', needPixels: true } });
        else if (behavior === 'error') this.onmessage?.({ data: { id: req.id, error: 'boom' } });
        else if (behavior === 'stray') {
          this.onmessage?.({ data: { id: 9999, cells: new Int16Array(1) } });
          this.onmessage?.({ data: { id: req.id, cells: new Int16Array(req.W * req.H).fill(1) } });
        } else this.onmessage?.({ data: { id: req.id, cells: new Int16Array(req.W * req.H).fill(7) } });
      }, 0);
    }
  }

  const job = (key = 'k') => ({
    key,
    getPixels: () => ({ data: new Uint8ClampedArray(4 * 4 * 4).fill(255), width: 4, height: 4, colorSpace: 'srgb' }) as ImageData,
    W: 2,
    H: 2,
    resample: 'average' as const,
    options: {
      allowed: [RED],
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
  });

  beforeEach(() => {
    vi.resetModules();
    created.length = 0;
    behavior = 'ok';
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Worker に画素を1回だけ送り、結果を受け取る', async () => {
    const { convertAsync } = await import('./converter');
    expect(Array.from(await convertAsync(job()))).toEqual([7, 7, 7, 7]);
    await convertAsync(job());
    expect(created).toHaveLength(1);
    expect(created[0].sent[0].pixels).toBeDefined();
    expect(created[0].sent[1].pixels).toBeUndefined();
  });

  it('関係ない応答は無視する', async () => {
    behavior = 'stray';
    const { convertAsync } = await import('./converter');
    expect(Array.from(await convertAsync(job()))).toEqual([1, 1, 1, 1]);
  });

  it('Worker が画素を持っていなければ送り直す', async () => {
    const { convertAsync } = await import('./converter');
    await convertAsync(job('a'));
    behavior = 'needPixels';
    // Worker 側のキャッシュが消えた状況 (同じキーなので画素を付けずに送る → 再送)
    const created0 = created[0];
    created0.sent.length = 0;
    const res = await convertAsync(job('a'));
    expect(res).toHaveLength(4);
    expect(created0.sent.some((r) => r.pixels)).toBe(true);
  });

  it('Worker のエラーを伝える', async () => {
    behavior = 'error';
    const { convertAsync } = await import('./converter');
    await expect(convertAsync(job())).rejects.toThrow('boom');
  });

  it('Worker が落ちたらその場で変換する', async () => {
    behavior = 'crash';
    const { convertAsync } = await import('./converter');
    const res = await convertAsync(job());
    expect(res).toHaveLength(4);
    // 以後は Worker を使わない
    await convertAsync(job('b'));
    expect(created).toHaveLength(1);
  });

  it('Worker を作れない環境ではその場で変換する', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('no worker');
        }
      },
    );
    const { convertAsync } = await import('./converter');
    expect(await convertAsync(job())).toHaveLength(4);
  });
});

describe('大きな図案の PDF', () => {
  it('全体図はドット表示 (記号は小さすぎるため)', async () => {
    const c = new Int16Array(112 * 112).fill(RED);
    const blob = await exportPdf({ name: 'big', cells: c, width: 112, height: 112, guideEvery: 7 });
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain('/Count 17');
  });
});
