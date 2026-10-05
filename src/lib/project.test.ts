import { describe, expect, it } from 'vitest';
import { indexOfCode, PALETTE } from '../data/palette';
import { EMPTY, NO_EDIT } from './pattern';
import { bgOptions, createProject, DEFAULT_SETTINGS, deserializeProject, newId, serializeProject, type ProjectFile } from './project';

const source = { dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 20, name: 'テスト画像' };

describe('createProject', () => {
  it('画像モード', () => {
    const p = createProject('image', 28, 14, source);
    expect(p.mode).toBe('image');
    expect(p.name).toBe('テスト画像');
    expect(p.overlay).toHaveLength(28 * 14);
    expect(p.overlay.every((v) => v === NO_EDIT)).toBe(true);
    expect(p.done).toHaveLength(28 * 14);
    expect(p.settings.width).toBe(28);
    expect(p.settings.height).toBe(14);
    expect(p.base).toBeNull();
  });

  it('フリーモードは名前が「じゆう図案」', () => {
    const p = createProject('free', 4, 4, null, { maxColors: 3 });
    expect(p.name).toBe('じゆう図案');
    expect(p.settings.maxColors).toBe(3);
  });

  it('ID はそれぞれ違う', () => {
    expect(newId()).not.toBe(newId());
  });
});

describe('保存と読み込み', () => {
  it('同じ内容に戻る', () => {
    const p = createProject('image', 3, 2, source, {
      maxColors: 5,
      replacements: { 2: 3 },
      excluded: [4],
      bgMode: 'manual',
      bgPoints: [{ x: 0.5, y: 0.5, keep: false }],
    });
    p.base = new Int16Array([0, 1, 2, EMPTY, 4, 5]);
    p.overlay[1] = 7;
    p.done[2] = 1;
    const file = JSON.parse(JSON.stringify(serializeProject(p))) as ProjectFile;
    expect(file.app).toBe('nanobeads-pattern-maker');
    expect(file.palette).toHaveLength(PALETTE.length);
    const back = deserializeProject(file);
    expect(back.id).toBe(p.id);
    expect(Array.from(back.base!)).toEqual(Array.from(p.base));
    expect(Array.from(back.overlay)).toEqual(Array.from(p.overlay));
    expect(Array.from(back.done)).toEqual(Array.from(p.done));
    expect(back.settings.maxColors).toBe(5);
    expect(back.settings.replacements).toEqual({ 2: 3 });
    expect(back.settings.excluded).toEqual([4]);
    expect(back.settings.bgPoints).toEqual([{ x: 0.5, y: 0.5, keep: false }]);
    expect(back.source).toEqual(source);
  });

  it('保存時とパレットの並びが違っても品番で付け替える', () => {
    const p = createProject('free', 2, 1, null);
    p.overlay = new Int16Array([0, 1]);
    const file = serializeProject(p);
    // 保存時は 0 = くろ, 1 = しろ だったことにする
    file.palette = ['80-15907', '80-15901'];
    const back = deserializeProject(file);
    expect(back.overlay[0]).toBe(indexOfCode('80-15907'));
    expect(back.overlay[1]).toBe(indexOfCode('80-15901'));
  });

  it('知らない品番はビーズなしにする', () => {
    const p = createProject('free', 1, 1, null);
    p.overlay = new Int16Array([0]);
    const file = serializeProject(p);
    file.palette = ['99-99999'];
    expect(deserializeProject(file).overlay[0]).toBe(EMPTY);
  });

  it('古いデータに無い設定は初期値で補う', () => {
    const p = createProject('free', 1, 1, null);
    const file = serializeProject(p) as unknown as { settings: Record<string, unknown> };
    delete file.settings.bgPoints;
    delete file.settings.dither;
    const back = deserializeProject(file as unknown as ProjectFile);
    expect(back.settings.dither).toBe(DEFAULT_SETTINGS.dither);
    expect(back.settings.bgPoints).toEqual([]);
  });

  it('アプリのファイルでなければエラー', () => {
    expect(() => deserializeProject({ app: 'other' } as unknown as ProjectFile)).toThrow('ナノビーズ図案メーカーのファイルではありません');
  });

  it('大きさが合わなければエラー', () => {
    const file = serializeProject(createProject('free', 2, 2, null));
    file.width = 3;
    expect(() => deserializeProject(file)).toThrow('ファイルが壊れています');
    file.width = -1;
    expect(() => deserializeProject(file)).toThrow('ファイルが壊れています');
  });

  it('チェック情報の大きさが違えばリセット', () => {
    const file = serializeProject(createProject('free', 2, 2, null));
    file.done = btoa('\u0001');
    expect(deserializeProject(file).done).toHaveLength(4);
  });
});

describe('bgOptions', () => {
  it('設定から背景の透明化オプションを作る', () => {
    const s = { ...DEFAULT_SETTINGS, bgMode: 'auto' as const, bgTolerance: 20, bgGlobal: true };
    expect(bgOptions(s)).toEqual({ mode: 'auto', tolerance: 20, global: true, points: [] });
  });
});
