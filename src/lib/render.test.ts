// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { indexOfCode } from '../data/palette';
import { downloadBlob, exportPdf, exportPng, renderSheet, safeFileName, shareBlob, type ExportInput } from './exporters';
import { EMPTY } from './pattern';
import { DARK_THEME, drawUnderlay, LIGHT_THEME, makeBitmap, renderPattern, thumbnailDataUrl, type RenderOptions } from './render';

const RED = indexOfCode('80-15903');
const GOLD = indexOfCode('80-14121K');
const CLEAR = indexOfCode('80-15924');

function cells(w: number, h: number) {
  const c = new Int16Array(w * h).fill(EMPTY);
  for (let i = 0; i < c.length; i += 3) c[i] = RED;
  c[1] = GOLD;
  c[2] = CLEAR;
  return c;
}

function ctx() {
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = 300;
  return c.getContext('2d') as CanvasRenderingContext2D & { calls: string[] };
}

const base = (o: Partial<RenderOptions> = {}): RenderOptions => ({
  cells: cells(30, 30),
  width: 30,
  height: 30,
  cell: 12,
  ox: 10,
  oy: 10,
  viewW: 400,
  viewH: 300,
  style: 'bead',
  theme: LIGHT_THEME,
  showGrid: true,
  guideEvery: 7,
  showPlates: true,
  ...o,
});

describe('renderPattern', () => {
  it.each(['bead', 'flat', 'symbol'] as const)('%s 表示で描ける', (style) => {
    const c = ctx();
    renderPattern(c, base({ style, symbols: new Map([[RED, 'A']]), cell: 20 }));
    expect(c.calls.length).toBeGreaterThan(10);
  });

  it('縮小表示 (1マスが小さい) はビットマップで描く', () => {
    const c = ctx();
    renderPattern(c, base({ cell: 2, theme: DARK_THEME }));
    expect(c.calls).toContain('drawImage');
  });

  it('ハイライト・チェック・範囲指定・下絵', () => {
    const c = ctx();
    const done = new Uint8Array(900);
    done[0] = 1;
    const img = document.createElement('canvas');
    renderPattern(
      c,
      base({
        focus: RED,
        done,
        region: { x: 0, y: 0, w: 28, h: 28 },
        underlay: { image: img, imageWidth: 10, imageHeight: 10, crop: { x: 0, y: 0, w: 1, h: 1 }, mirror: true, opacity: 0.5 },
      }),
    );
    renderPattern(c, base({ style: 'flat', focus: RED, done }));
    expect(c.calls).toContain('clip');
  });

  it('画面外なら図案のマスは描かない', () => {
    const c = ctx();
    renderPattern(c, base({ ox: 5000, oy: 5000 }));
    expect(c.calls).toContain('fillRect');
  });
});

describe('その他の描画', () => {
  it('ビットマップとサムネイル', () => {
    const bmp = makeBitmap(cells(4, 4), 4, 4);
    expect(bmp.width).toBe(4);
    expect(thumbnailDataUrl(cells(4, 4), 4, 4)).toMatch(/^data:image\/png/);
  });

  it('下絵 (反転なし)', () => {
    const c = ctx();
    drawUnderlay(
      c,
      { image: document.createElement('canvas'), imageWidth: 5, imageHeight: 5, crop: { x: 0, y: 0, w: 1, h: 1 }, mirror: false, opacity: 1 },
      4,
      4,
      10,
      0,
      0,
    );
    expect(c.calls).toContain('drawImage');
  });
});

describe('書き出し', () => {
  const input: ExportInput = { name: 'テスト/図案', cells: cells(60, 30), width: 60, height: 30, guideEvery: 7, credit: '作者A（CC BY 2.0）' };

  it('1枚画像の大きさ', () => {
    const sheet = renderSheet(input, 'symbol');
    expect(sheet.width).toBeGreaterThanOrEqual(960);
    expect(sheet.height).toBeGreaterThan(sheet.width / 2);
  });

  it('大きな図案でも canvas の上限を超えない', () => {
    const big = { ...input, cells: cells(280, 280), width: 280, height: 280 };
    const sheet = renderSheet(big, 'flat');
    expect(sheet.width * sheet.height).toBeLessThan(16_777_216);
  });

  it('PNG を作る', async () => {
    const blob = await exportPng(input, 'bead');
    expect(blob.type).toBe('image/png');
  });

  it('PDF を作る (ビーズのあるプレートのページだけ)', async () => {
    const progress: number[] = [];
    const blob = await exportPdf(input, (d) => progress.push(d));
    expect(blob.type).toBe('application/pdf');
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text.startsWith('%PDF')).toBe(true);
    // 60x30 → プレート 3x2 = 6枚 (どれもビーズあり) + 表紙
    expect(text).toContain('/Count 7');
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('空のプレートは省く', async () => {
    const c = new Int16Array(56 * 28).fill(EMPTY);
    c[0] = RED;
    const blob = await exportPdf({ ...input, cells: c, width: 56, height: 28 });
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain('/Count 2');
  });

  it('ファイル名に使えない文字を置き換える', () => {
    expect(safeFileName('a/b:c*d?"e<f>g|h i')).toBe('a_b_c_d_e_f_g_h_i');
    expect(safeFileName('')).toBe('nanobeads');
  });

  it('ダウンロード用のリンクを作ってクリックする', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadBlob(new Blob(['x']), 'a.txt');
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('共有できない環境では false', async () => {
    expect(await shareBlob(new Blob(['x'], { type: 'image/png' }), 'a.png', 't')).toBe(false);
  });

  it('共有できる環境では共有する (キャンセルも成功扱い)', async () => {
    const nav = navigator as Navigator & { share?: unknown; canShare?: unknown };
    nav.canShare = () => true;
    nav.share = vi.fn().mockResolvedValue(undefined);
    expect(await shareBlob(new Blob(['x'], { type: 'image/png' }), 'a.png', 't')).toBe(true);
    nav.share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
    expect(await shareBlob(new Blob(['x'], { type: 'image/png' }), 'a.png', 't')).toBe(true);
    nav.share = vi.fn().mockRejectedValue(new Error('fail'));
    expect(await shareBlob(new Blob(['x'], { type: 'image/png' }), 'a.png', 't')).toBe(false);
    Reflect.deleteProperty(nav, 'share');
    Reflect.deleteProperty(nav, 'canShare');
  });
});
