import { beforeEach, describe, expect, it } from 'vitest';
import { indexOfCode, PALETTE, PALETTE_SETS } from '../data/palette';
import { EMPTY, NO_EDIT } from '../lib/pattern';
import { DEFAULT_SETTINGS } from '../lib/project';
import { buildConvertOptions } from './hooks';
import { allowedColors, nearestColors, plateSizeLabel, useStore } from './store';

const RED = indexOfCode('80-15903');
const BLUE = indexOfCode('80-15904');
const BLACK = indexOfCode('80-15907');
const WHITE = indexOfCode('80-15901');
const CLEAR = indexOfCode('80-15924');
const GOLD = indexOfCode('80-14121K');
const source = { dataUrl: 'data:image/png;base64,AAAA', width: 200, height: 100, name: 'photo' };

const st = () => useStore.getState();

beforeEach(() => {
  st().closeProject();
  useStore.setState({ toast: null, tab: 'image', tool: 'move', lastEditTool: 'pen', color: 0 });
});

describe('新しい図案', () => {
  it('画像から: 4枚 (56×56)・全体が入る切り抜き・サイズタブ', () => {
    st().newImageProject(source);
    const p = st().project!;
    expect(p.mode).toBe('image');
    expect([p.width, p.height]).toEqual([56, 56]);
    expect(p.settings.crop.w).toBeCloseTo(1);
    expect(p.settings.crop.h).toBeCloseTo(2);
    expect(st().tab).toBe('size');
    expect(st().cells).toHaveLength(56 * 56);
  });

  it('白紙から: ペン・くろ・編集タブ', () => {
    st().newFreeProject(28, 14, 'beads');
    const p = st().project!;
    expect(p.mode).toBe('free');
    expect(p.settings.sizeMode).toBe('beads');
    expect(st().tool).toBe('pen');
    expect(st().color).toBe(BLACK);
    expect(st().tab).toBe('edit');
    expect(st().cells.every((c) => c === EMPTY)).toBe(true);
  });

  it('名前と設定を変える', () => {
    st().newFreeProject(4, 4, 'beads');
    st().setName('ハート');
    st().updateSettings({ maxColors: 7 });
    expect(st().project!.name).toBe('ハート');
    expect(st().project!.settings.maxColors).toBe(7);
  });
});

describe('ペンと履歴', () => {
  beforeEach(() => st().newFreeProject(4, 4, 'beads'));

  it('置く → 元に戻す → やり直し', () => {
    st().beginStroke();
    expect(st().paint([0, 1], RED)).toBe(true);
    st().endStroke(true);
    expect(st().cells[0]).toBe(RED);
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().cells[0]).toBe(EMPTY);
    expect(st().future).toHaveLength(1);
    st().redo();
    expect(st().cells[1]).toBe(RED);
  });

  it('何も変わらなければ履歴に残さない', () => {
    st().beginStroke();
    expect(st().paint([0], EMPTY)).toBe(false);
    st().endStroke(false);
    expect(st().past).toHaveLength(0);
  });

  it('範囲外のマスは無視', () => {
    st().beginStroke();
    expect(st().paint([-1, 999], RED)).toBe(false);
  });

  it('途中で取り消すと元に戻る (2本指の操作が始まったとき)', () => {
    st().beginStroke();
    st().paint([5], BLUE);
    st().cancelStroke();
    expect(st().cells[5]).toBe(EMPTY);
    expect(st().past).toHaveLength(0);
  });

  it('塗りつぶし', () => {
    st().fillAt(0, 0, BLUE);
    expect(st().cells.every((c) => c === BLUE)).toBe(true);
    st().beginStroke();
    st().paint([5], RED);
    st().endStroke(true);
    st().fillAt(1, 1, WHITE);
    expect(st().cells[5]).toBe(WHITE);
    expect(st().cells[0]).toBe(BLUE);
  });

  it('全部消す', () => {
    st().fillAt(0, 0, BLUE);
    st().clearAll();
    expect(st().cells.every((c) => c === EMPTY)).toBe(true);
  });

  it('履歴が無ければ何もしない', () => {
    st().undo();
    st().redo();
    expect(st().past).toHaveLength(0);
  });
});

describe('画像モード', () => {
  beforeEach(() => {
    st().newImageProject(source);
    const n = 56 * 56;
    st().setBase(new Int16Array(n).fill(RED));
  });

  it('変換結果が表示され、手直しが上に重なる', () => {
    expect(st().cells[0]).toBe(RED);
    st().beginStroke();
    st().paint([0], BLUE);
    st().endStroke(true);
    expect(st().cells[0]).toBe(BLUE);
    st().setBase(new Int16Array(56 * 56).fill(WHITE));
    expect(st().cells[0]).toBe(BLUE);
    expect(st().cells[1]).toBe(WHITE);
  });

  it('大きさの違う変換結果は無視', () => {
    st().setBase(new Int16Array(10).fill(BLUE));
    expect(st().cells[0]).toBe(RED);
  });

  it('手直しを全部もどす', () => {
    st().beginStroke();
    st().paint([0], BLUE);
    st().endStroke(true);
    st().clearEdits();
    expect(st().cells[0]).toBe(RED);
    expect(st().project!.overlay.every((v) => v === NO_EDIT)).toBe(true);
  });

  it('色の差し替え: 設定に記録し、すぐに表示も変わる', () => {
    st().replaceColor(RED, BLUE);
    expect(st().project!.settings.replacements[RED]).toBe(BLUE);
    expect(st().cells[0]).toBe(BLUE);
    // 元に戻せる
    st().undo();
    expect(st().project!.settings.replacements[RED]).toBeUndefined();
  });

  it('差し替えの連鎖 (A→B のあと B→C) は A→C にまとめる', () => {
    st().replaceColor(RED, BLUE);
    st().replaceColor(BLUE, WHITE);
    const rep = st().project!.settings.replacements;
    expect(rep[RED]).toBe(WHITE);
    expect(rep[BLUE]).toBe(WHITE);
  });

  it('おまかせ差し替え: その色を使わない設定にする', () => {
    st().replaceColor(RED, null);
    const s = st().project!.settings;
    expect(s.excluded).toContain(RED);
    expect(st().cells[0]).not.toBe(RED);
    st().restoreColor(RED);
    expect(st().project!.settings.excluded).not.toContain(RED);
  });

  it('差し替えた色をもどす', () => {
    st().replaceColor(RED, BLUE);
    st().restoreColor(RED);
    expect(st().project!.settings.replacements[RED]).toBeUndefined();
  });

  it('図案を確定してフリーモードへ', () => {
    st().bakeToFree();
    const p = st().project!;
    expect(p.mode).toBe('free');
    expect(p.base).toBeNull();
    expect(p.overlay[0]).toBe(RED);
    expect(st().cells[0]).toBe(RED);
  });

  it('大きさを変えると手直しと変換結果はリセット', () => {
    st().beginStroke();
    st().paint([0], BLUE);
    st().endStroke(true);
    st().resize(28, 28, { platesX: 1, platesY: 1 });
    const p = st().project!;
    expect([p.width, p.height]).toEqual([28, 28]);
    expect(p.base).toBeNull();
    expect(p.overlay.every((v) => v === NO_EDIT)).toBe(true);
    expect(st().past).toHaveLength(0);
    expect(p.settings.platesX).toBe(1);
    // 切り抜きは新しい縦横比に合わせ直す
    expect((p.settings.crop.w * 200) / (p.settings.crop.h * 100)).toBeCloseTo(1);
  });

  it('手動で調整した切り抜きは、中心を保って縦横比だけ変える', () => {
    st().updateSettings({ fit: 'custom', crop: { x: 0.25, y: 0, w: 0.5, h: 1 } });
    st().resize(56, 28);
    const c = st().project!.settings.crop;
    expect(c.x + c.w / 2).toBeCloseTo(0.5);
    expect((c.w * 200) / (c.h * 100)).toBeCloseTo(2);
  });

  it('画像を変えると切り抜き・背景の指定をリセット', () => {
    st().updateSettings({ bgPoints: [{ x: 0.1, y: 0.1, keep: false }], fit: 'custom' });
    st().setSource({ ...source, width: 100, height: 100, name: 'new' });
    const s = st().project!.settings;
    expect(s.bgPoints).toEqual([]);
    expect(s.fit).toBe('contain');
    expect(s.crop.w).toBeCloseTo(1);
  });

  it('画像を外すとフリーモードになる', () => {
    st().setSource(null);
    expect(st().project!.mode).toBe('free');
    expect(st().project!.source).toBeNull();
  });

  it('モードを切り替える', () => {
    st().setMode('free');
    expect(st().project!.base).toBeNull();
    st().setMode('image');
    expect(st().project!.mode).toBe('image');
    st().setMode('image');
    expect(st().project!.mode).toBe('image');
  });

  it('変換中フラグ', () => {
    st().setConverting(true);
    expect(st().converting).toBe(true);
    st().setBase(new Int16Array(56 * 56).fill(RED));
    expect(st().converting).toBe(false);
  });
});

describe('フリーモードの大きさ変更', () => {
  it('左上を基準に中身を残す', () => {
    st().newFreeProject(4, 4, 'beads');
    st().beginStroke();
    st().paint([0, 5], RED);
    st().endStroke(true);
    st().toggleDone(5);
    st().resize(6, 2);
    const p = st().project!;
    expect(st().cells[0]).toBe(RED);
    expect(st().cells[7]).toBe(RED); // (1,1)
    expect(p.done[7]).toBe(1);
    expect(st().cells).toHaveLength(12);
  });
});

describe('つくるモードのチェック', () => {
  it('付ける・外す・まとめて・全部消す', () => {
    st().newFreeProject(2, 2, 'beads');
    st().toggleDone(0);
    expect(st().project!.done[0]).toBe(1);
    st().toggleDone(0);
    expect(st().project!.done[0]).toBe(0);
    st().toggleDone(99);
    st().setDone([1, 2], true);
    expect(Array.from(st().project!.done)).toEqual([0, 1, 1, 0]);
    st().clearDone();
    expect(Array.from(st().project!.done)).toEqual([0, 0, 0, 0]);
  });
});

describe('画面の状態', () => {
  beforeEach(() => st().newFreeProject(2, 2, 'beads'));

  it('編集タブ以外では移動ツールになり、戻ると前のツールに戻る', () => {
    st().setTab('edit');
    st().setTool('fill');
    st().setTab('chart');
    expect(st().tool).toBe('move');
    st().setTab('edit');
    expect(st().tool).toBe('fill');
  });

  it('色を選ぶとペンに (塗りつぶし中はそのまま)', () => {
    st().setTab('edit');
    st().setTool('eraser');
    st().setColor(RED);
    expect(st().tool).toBe('pen');
    st().setTool('fill');
    st().setColor(BLUE);
    expect(st().tool).toBe('fill');
  });

  it('色のハイライト・UI・トースト・設定', () => {
    st().setFocus(RED);
    expect(st().focus).toBe(RED);
    st().setUi({ compare: true, sheetOpen: false });
    expect(st().compare).toBe(true);
    st().showToast('こんにちは', { label: 'OK', run: () => {} });
    expect(st().toast?.text).toBe('こんにちは');
    st().hideToast();
    expect(st().toast).toBeNull();
    st().setPrefs({ guideEvery: 10 });
    expect(st().prefs.guideEvery).toBe(10);
  });

  it('図案を閉じる', () => {
    st().closeProject();
    expect(st().project).toBeNull();
    // 図案が無いときの操作は何もしない
    st().setName('x');
    st().updateSettings({ maxColors: 1 });
    st().beginStroke();
    expect(st().paint([0], RED)).toBe(false);
    st().fillAt(0, 0, RED);
    st().replaceColor(RED, BLUE);
    st().clearEdits();
    st().resize(4, 4);
    st().toggleDone(0);
    expect(st().project).toBeNull();
  });
});

describe('使う色', () => {
  it('セットとマイカラー', () => {
    const s = { ...DEFAULT_SETTINGS };
    expect(allowedColors({ ...s, paletteSet: 'set12' }, [])).toHaveLength(12);
    expect(allowedColors({ ...s, paletteSet: 'mine' }, [RED, BLUE])).toEqual([RED, BLUE]);
  });
  it('透明・メタリックは設定で切り替え', () => {
    const s = { ...DEFAULT_SETTINGS, paletteSet: 'all' as const };
    expect(allowedColors(s, [])).not.toContain(CLEAR);
    expect(allowedColors(s, [])).not.toContain(GOLD);
    expect(allowedColors({ ...s, useClear: true, useMetallic: true }, [])).toEqual(expect.arrayContaining([CLEAR, GOLD]));
  });
  it('使わない色は除く', () => {
    expect(allowedColors({ ...DEFAULT_SETTINGS, excluded: [RED] }, [])).not.toContain(RED);
  });
  it('マイカラーの不正な値は無視', () => {
    expect(allowedColors({ ...DEFAULT_SETTINGS, paletteSet: 'mine' }, [999, RED])).toEqual([RED]);
  });
});

describe('近い色', () => {
  it('自分以外で近い順', () => {
    const near = nearestColors(
      RED,
      PALETTE.map((_, i) => i),
      3,
    );
    expect(near).toHaveLength(3);
    expect(near).not.toContain(RED);
    expect(PALETTE[near[0]].group).toBe('red');
  });
});

describe('変換オプション', () => {
  it('設定から変換用のオプションを作る', () => {
    const o = buildConvertOptions({ ...DEFAULT_SETTINGS, paletteSet: 'set24', dither: 50, maxColors: 8 }, []);
    expect(o.allowed).toEqual(PALETTE_SETS.find((x) => x.id === 'set24')!.colors);
    expect(o.dither).toBe(0.5);
    expect(o.maxColors).toBe(8);
  });
});

it('プレート枚数の表示', () => {
  expect(plateSizeLabel(56, 28)).toBe('2枚 (よこ2×たて1)');
});

describe('ストアの細かな分岐', () => {
  it('知らない「使う色」はすべての色として扱う', () => {
    expect(allowedColors({ ...DEFAULT_SETTINGS, paletteSet: 'nope' as never }, [])).toHaveLength(52);
  });

  it('図案が無いときの操作は何もしない', () => {
    st().closeProject();
    st().setSource(source);
    st().cancelStroke();
    st().restoreColor(RED);
    st().clearAll();
    st().bakeToFree();
    st().setDone([0], true);
    st().clearDone();
    st().setMode('free');
    st().setBase(new Int16Array(4));
    expect(st().project).toBeNull();
  });

  it('取り消す履歴が無ければ cancelStroke は何もしない', () => {
    st().newFreeProject(2, 2, 'beads');
    st().cancelStroke();
    expect(st().past).toHaveLength(0);
  });

  it('画像の無い図案に画像を付けると、画像の名前を付ける (名前が無ければそのまま)', () => {
    st().newFreeProject(2, 2, 'beads');
    st().setSource({ ...source, name: '' });
    expect(st().project!.name).toBe('じゆう図案');
    st().setSource(null);
    st().setSource({ ...source, name: '花' });
    expect(st().project!.name).toBe('花');
    // 2回目以降は名前を変えない
    st().setSource({ ...source, name: '木' });
    expect(st().project!.name).toBe('花');
  });

  it('画像モード → フリーモード: 手直しは残し、それ以外はビーズなし', () => {
    st().newImageProject(source);
    st().setBase(new Int16Array(56 * 56).fill(RED));
    st().beginStroke();
    st().paint([0], BLUE);
    st().endStroke(true);
    st().setMode('free');
    expect(st().cells[0]).toBe(BLUE);
    expect(st().cells[1]).toBe(EMPTY);
  });

  it('「変更なし」で塗ると自動変換の色に戻る (自動変換が無ければビーズなし)', () => {
    st().newImageProject(source);
    st().setBase(new Int16Array(56 * 56).fill(RED));
    st().beginStroke();
    st().paint([0], BLUE);
    st().paint([0], NO_EDIT);
    st().endStroke(true);
    expect(st().cells[0]).toBe(RED);
    st().newFreeProject(2, 2, 'beads');
    st().beginStroke();
    st().paint([0], BLUE);
    st().paint([0], NO_EDIT);
    expect(st().cells[0]).toBe(EMPTY);
  });

  it('おまかせ差し替えで使える色が無ければ、全色から近い色にする', () => {
    st().newImageProject(source);
    st().setPrefs({ myColors: [RED] });
    st().updateSettings({ paletteSet: 'mine' });
    st().setBase(new Int16Array(56 * 56).fill(RED));
    st().replaceColor(RED, null);
    expect(st().cells[0]).not.toBe(RED);
    expect(st().cells[0]).toBeGreaterThanOrEqual(0);
  });

  it('フリーモードの差し替え: 設定は変えず、置いたビーズだけを置き換える', () => {
    st().newFreeProject(2, 2, 'beads');
    st().fillAt(0, 0, RED);
    st().setColor(RED);
    st().setFocus(RED);
    st().replaceColor(RED, BLUE);
    expect(st().cells.every((c) => c === BLUE)).toBe(true);
    expect(st().project!.settings.replacements).toEqual({});
    expect(st().focus).toBeNull();
    expect(st().color).toBe(BLUE);
    st().replaceColor(BLUE, null);
    expect(st().project!.settings.excluded).toEqual([]);
    expect(st().cells[0]).not.toBe(BLUE);
  });

  it('差し替え: 別の色の置き換えはそのまま・選んでいない色は変えない', () => {
    st().newImageProject(source);
    st().setBase(new Int16Array(56 * 56).fill(RED));
    st().updateSettings({ replacements: { [WHITE]: BLACK } });
    st().setColor(WHITE);
    st().setFocus(WHITE);
    st().replaceColor(RED, BLUE);
    expect(st().project!.settings.replacements).toEqual({ [WHITE]: BLACK, [RED]: BLUE });
    expect(st().color).toBe(WHITE);
    expect(st().focus).toBe(WHITE);
  });

  it('編集タブ以外で道具を変えても「前の道具」は覚えない', () => {
    st().newFreeProject(2, 2, 'beads');
    st().setTab('chart');
    st().setTool('fill');
    expect(st().lastEditTool).toBe('pen');
  });
});

it('おまかせ差し替え: すでに使わない色があれば、それも残す', () => {
  st().newImageProject(source);
  st().setBase(new Int16Array(56 * 56).fill(RED));
  st().updateSettings({ excluded: [WHITE] });
  st().replaceColor(RED, null);
  expect(st().project!.settings.excluded).toEqual([WHITE, RED]);
});

describe('対称に描く・図案全体を動かす', () => {
  it('対称のときは塗りつぶしも反対側から塗る', () => {
    st().newFreeProject(4, 1, 'beads');
    // [赤][空][空][青] → 左のはしを左右対称で塗る
    st().paint([0], RED);
    st().paint([3], BLUE);
    st().setUi({ symmetry: 'x' });
    st().fillAt(0, 0, BLACK);
    expect(Array.from(st().cells)).toEqual([BLACK, EMPTY, EMPTY, BLACK]);
    // 1回の操作として元に戻せる
    st().undo();
    expect(Array.from(st().cells)).toEqual([RED, EMPTY, EMPTY, BLUE]);
    st().setUi({ symmetry: 'none' });
  });

  it('左右・上下に反転し、つくるモードのチェックも一緒に動く (元に戻す・やり直しも)', () => {
    st().newFreeProject(3, 2, 'beads');
    st().paint([0], RED);
    st().setDone([0], true);
    st().flip('x');
    expect(st().cells[2]).toBe(RED);
    expect(st().cells[0]).toBe(EMPTY);
    expect(Array.from(st().project!.done)).toEqual([0, 0, 1, 0, 0, 0]);
    st().flip('y');
    expect(st().cells[5]).toBe(RED);
    expect(st().project!.done[5]).toBe(1);
    st().undo();
    expect(st().cells[2]).toBe(RED);
    expect(st().project!.done[2]).toBe(1);
    expect(st().project!.done[5]).toBe(0);
    st().redo();
    expect(st().project!.done[5]).toBe(1);
    // ふつうの操作の「元に戻す」は、チェックを変えない
    st().beginStroke();
    st().paint([0], BLUE);
    st().endStroke(true);
    st().undo();
    expect(st().project!.done[5]).toBe(1);
    st().redo();
    expect(st().project!.done[5]).toBe(1);
  });

  it('ずらす・まん中に寄せる', () => {
    st().newFreeProject(5, 5, 'beads');
    st().paint([0], RED);
    st().shift(1, 0);
    expect(st().cells[1]).toBe(RED);
    st().centerPattern();
    expect(st().cells[2 * 5 + 2]).toBe(RED);
    // まん中にあるときは何もしない (履歴も増やさない)
    const before = st().past.length;
    st().centerPattern();
    expect(st().past.length).toBe(before);
  });

  it('画像モード・図案が無いときは動かさない', () => {
    st().centerPattern();
    st().flip('x');
    expect(st().project).toBeNull();
    st().newImageProject(source);
    st().flip('x');
    st().shift(1, 1);
    expect(st().past).toHaveLength(0);
  });

  it('マイ図案の変更を知らせる', () => {
    const rev = st().libraryRev;
    st().bumpLibrary();
    expect(st().libraryRev).toBe(rev + 1);
  });
});
