// 細かな条件分岐まで確認するテスト (カバレッジ100%用)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexOfCode, PALETTE } from '../data/palette';
import { bgKey, computeMask, detectBorderColor } from './background';
import { deltaE2000, labToRgb, rgbToLab } from './color';
import { addOutline, adjustColors, cleanupNoise, quantize, resampleBlocks } from './convert';
import { searchImages } from './imageSearch';
import { EMPTY } from './pattern';
import { createProject, deserializeProject, serializeProject, type ProjectFile } from './project';
import { shoppingList } from './shopping';

const RED = indexOfCode('80-15903');
const BLUE = indexOfCode('80-15904');
const BLACK = indexOfCode('80-15907');
const ALL = PALETTE.map((_, i) => i);

afterEach(() => {
  vi.unstubAllGlobals();
});

function rgba(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fn(x, y), (y * w + x) * 4);
  return d;
}

describe('background の分岐', () => {
  it('1行・1列だけの画像でもふちの色を判定できる', () => {
    expect(
      detectBorderColor(
        rgba(5, 1, () => [10, 20, 30, 255]),
        5,
        1,
      ),
    ).toEqual([10, 20, 30]);
    expect(
      detectBorderColor(
        rgba(1, 5, () => [10, 20, 30, 255]),
        1,
        5,
      ),
    ).toEqual([10, 20, 30]);
  });

  it('ふちに複数の色があれば多いほう', () => {
    // 上の行だけ赤、残りのふちは白
    const d = rgba(6, 6, (_x, y) => (y === 0 ? [230, 20, 20, 255] : [255, 255, 255, 255]));
    expect(detectBorderColor(d, 6, 6)).toEqual([255, 255, 255]);
  });

  it('ふちの色がバラバラなら背景なし', () => {
    const d = rgba(10, 10, (x, y) => [(x * 53 + y * 97) % 256, (x * 31 + y * 17) % 256, (x * 71 + y * 13) % 256, 255]);
    expect(detectBorderColor(d, 10, 10)).toBeNull();
  });

  it('自動で背景が見つからなければ何も消さない', () => {
    const d = rgba(4, 4, (x, y) => (x === 0 || y === 0 || x === 3 || y === 3 ? [0, 0, 0, 0] : [200, 0, 0, 255]));
    const m = computeMask(d, 4, 4, { mode: 'auto', tolerance: 10, global: false, points: [] });
    expect(m[5]).toBe(255);
  });

  it('bgKey に点と「離れた所も」を含める', () => {
    const k = bgKey({ mode: 'manual', tolerance: 5, global: true, points: [{ x: 0.1, y: 0.2, keep: true }] });
    expect(k).toBe('manual:5:1:0.1000,0.2000,1');
    expect(bgKey({ mode: 'manual', tolerance: 5, global: false, points: [{ x: 0.1, y: 0.2, keep: false }] })).toContain(':0:');
  });
});

describe('color の分岐', () => {
  it('小数のとても暗い色', () => {
    expect(rgbToLab(2.5, 2.5, 2.5)[0]).toBeGreaterThan(0);
  });
  it('とても暗い Lab → RGB', () => {
    const [r] = labToRgb([2, 0, 0]);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(10);
  });
  it('片方が無彩色の色差', () => {
    expect(deltaE2000([50, 10, 10], [50, 0, 0])).toBeGreaterThan(0);
  });
});

describe('convert の分岐', () => {
  it('average: 完全に透明なブロック', () => {
    const out = resampleBlocks(
      rgba(2, 2, () => [0, 0, 0, 0]),
      2,
      2,
      1,
      1,
      'average',
    );
    expect(out[3]).toBe(0);
  });

  it('明るさを下げすぎても 0 未満にならない', () => {
    const out = adjustColors(new Float32Array([10, 20, 30, 1]), -100, 0, 0);
    expect(Array.from(out.slice(0, 3))).toEqual([0, 0, 0]);
  });

  it('ディザ: 透明なセルには誤差を広げない', () => {
    const W = 3;
    const cells = new Float32Array(W * 3 * 4);
    for (let i = 0; i < 9; i++) cells.set([120 + i * 10, 120, 120, i === 4 ? 0 : 1], i * 4);
    const out = quantize(cells, W, 3, ALL, 0, 1);
    expect(out[4]).toBe(EMPTY);
    expect(out[0]).not.toBe(EMPTY);
  });

  it('ノイズ除去: まわりがバラバラ (多数派なし) なら変えない', () => {
    // 中央の赤を、4色が2つずつ囲む
    const c = new Int16Array([BLUE, BLACK, 10, 11, RED, 10, 11, BLUE, BLACK]);
    const out = cleanupNoise(c, 3, 3, 1);
    expect(out[4]).toBe(RED);
  });

  it('外側のふちどり: 絵から離れたすき間はそのまま', () => {
    const c = new Int16Array(7 * 7).fill(EMPTY);
    c[3 * 7 + 3] = RED;
    const out = addOutline(c, 7, 7, 'outer', BLACK);
    expect(out[0]).toBe(EMPTY);
    expect(out[2 * 7 + 2]).toBe(BLACK);
  });
});

describe('imageSearch の分岐', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('result_count や results が無い応答', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValue(ok({ results: [] }));
    const r = await searchImages('x', 'all', { fetchImpl: f as unknown as typeof fetch });
    expect(r.results).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('取り直しが失敗しても続ける / センシティブな結果は数えない', async () => {
    const item = (id: string, extra = {}) => ({ id, ...extra });
    const page1 = Array.from({ length: 20 }, (_, i) => item(`a${i}`, i === 0 ? { mature: true } : {}));
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok({ result_count: 100, results: page1 }))
      .mockResolvedValueOnce(ok({ result_count: 100, results: page1 })) // 2ページ目が1ページ目と同じ
      .mockResolvedValueOnce(new Response('', { status: 429 })); // 取り直しで回数制限
    const r = await searchImages('x', 'all', { fetchImpl: f as unknown as typeof fetch });
    expect(r.results).toHaveLength(19);
    expect(r.rateLimited).toBe(true);
  });
});

describe('project の分岐', () => {
  it('crypto.randomUUID が無い環境でも ID を作れる', async () => {
    vi.stubGlobal('crypto', {});
    const { newId } = await import('./project');
    expect(newId()).toMatch(/^[a-z0-9]+$/);
  });

  it('画像モードで画像の名前が無ければ「新しい図案」', () => {
    expect(createProject('image', 4, 4, null).name).toBe('新しい図案');
  });

  it('不完全なファイルでも読み込める', () => {
    const p = createProject('image', 2, 2, null);
    const f = serializeProject(p) as unknown as Record<string, unknown> & { settings: Record<string, unknown> };
    f.id = '';
    f.name = '';
    f.createdAt = 0;
    f.updatedAt = 0;
    f.mode = 'image';
    f.settings.bgPoints = 'broken';
    f.settings.excluded = undefined;
    f.settings.replacements = undefined;
    const back = deserializeProject(f as unknown as ProjectFile);
    expect(back.id).not.toBe('');
    expect(back.name).toBe('図案');
    expect(back.createdAt).toBeGreaterThan(0);
    expect(back.settings.bgPoints).toEqual([]);
    expect(back.settings.excluded).toEqual([]);
    expect(back.settings.replacements).toEqual({});
  });

  it('知らない色への置き換えは捨てる', () => {
    const p = createProject('image', 1, 1, null, { replacements: { 0: 1 } });
    const f = serializeProject(p);
    f.palette = ['80-15901', '99-99999'];
    expect(deserializeProject(f).settings.replacements).toEqual({});
  });
});

describe('shopping の分岐', () => {
  it('知らないセット名はセットなしと同じ', () => {
    const counts = new Int32Array(PALETTE.length);
    counts[RED] = 10;
    const s = shoppingList(counts, 'unknown' as never, false);
    expect(s.rows[0].owned).toBe(0);
  });
});

describe('残りの分岐', () => {
  it('セットの色名にまちがいがあればエラー', async () => {
    const { byNames } = await import('../data/palette');
    expect(byNames(['しろ', 'くろ'])).toEqual([0, 6]);
    expect(() => byNames(['みどりいろ'])).toThrow('unknown color: みどりいろ');
  });

  it('明るさを上げすぎても 255 を超えない', () => {
    const out = adjustColors(new Float32Array([200, 210, 220, 1]), 100, 0, 0);
    expect(Array.from(out.slice(0, 3))).toEqual([255, 255, 255]);
  });
});
