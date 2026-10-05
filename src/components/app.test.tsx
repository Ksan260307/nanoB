// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { indexOfCode, PALETTE } from '../data/palette';
import { EMPTY } from '../lib/pattern';
import { useStore } from '../state/store';
import { BackgroundDialog } from './BackgroundDialog';
import { BuildMode } from './BuildMode';
import { CropDialog } from './CropDialog';
import { HelpDialog, NewFreeDialog, ProjectsDialog } from './dialogs';
import { ImageSearchDialog } from './ImageSearchDialog';
import { PaletteDialog } from './PaletteDialog';
import { ChartPanel } from './panels/ChartPanel';
import { ColorPanel } from './panels/ColorPanel';
import { EditPanel } from './panels/EditPanel';
import { ExportPanel } from './panels/ExportPanel';
import { ImagePanel } from './panels/ImagePanel';
import { SizePanel } from './panels/SizePanel';
import { ReplaceDialog } from './ReplaceDialog';

const RED = indexOfCode('80-15903');
const BLUE = indexOfCode('80-15904');
const BLACK = indexOfCode('80-15907');
const source = {
  dataUrl: 'data:image/png;base64,AAAA',
  width: 200,
  height: 100,
  name: 'photo',
  credit: '「CAT」 someone（CC BY 2.0）',
  link: 'https://example.com/cat',
};
const st = () => useStore.getState();

function imageProject(fill = RED) {
  st().newImageProject(source);
  const p = st().project!;
  const base = new Int16Array(p.width * p.height).fill(EMPTY);
  for (let i = 0; i < base.length; i += 2) base[i] = fill;
  base[1] = BLUE;
  st().setBase(base);
}

beforeEach(() => {
  st().closeProject();
  useStore.setState({ toast: null, buildMode: false, tab: 'image', focus: null });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('アプリ全体', () => {
  it('トップ画面 → 白紙から作る → 編集画面', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'ナノビーズ図案メーカー' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /白紙から作る/ }));
    const dialog = screen.getByRole('dialog', { name: /白紙から作る/ });
    await userEvent.click(within(dialog).getByRole('button', { name: /よこ2枚/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'この大きさではじめる' }));
    expect(st().project?.mode).toBe('free');
    expect(st().project?.width).toBe(56);
    // フリーモードでは「色」タブは出ない
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs.join()).not.toMatch(/色$/);
    expect(screen.getByRole('tab', { name: /編集/ })).toHaveAttribute('aria-selected', 'true');
    // タブを切り替える
    await userEvent.click(screen.getByRole('tab', { name: /チャート/ }));
    expect(screen.getByText('まだビーズがありません。')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /保存/ }));
    expect(screen.getByRole('button', { name: /つくるモードをはじめる/ })).toBeDisabled();
    // 同じタブをもう一度押すと、パネルをたたむ
    await userEvent.click(screen.getByRole('tab', { name: /保存/ }));
    expect(st().sheetOpen).toBe(false);
  });

  it('使い方・マイ図案を開ける / ロゴでトップへ戻る', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: '使い方' }));
    expect(screen.getByRole('dialog', { name: '使い方' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    await userEvent.click(screen.getByRole('button', { name: 'マイ図案' }));
    expect(await screen.findByRole('dialog', { name: 'マイ図案' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    act(() => st().newFreeProject(4, 4, 'beads'));
    await userEvent.click(screen.getByTitle('トップへ'));
    expect(st().project).toBeNull();
  });

  it('キーボード操作: 元に戻す・やり直し・道具の切り替え', async () => {
    render(<App />);
    act(() => {
      st().newFreeProject(4, 4, 'beads');
      st().beginStroke();
      st().paint([0], RED);
      st().endStroke(true);
    });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(st().cells[0]).toBe(EMPTY);
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(st().cells[0]).toBe(RED);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'g' });
    expect(st().tool).toBe('fill');
    act(() => st().setFocus(RED));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(st().focus).toBeNull();
  });

  it('図案の名前をヘッダーで変えられる', async () => {
    render(<App />);
    act(() => st().newFreeProject(4, 4, 'beads'));
    const input = screen.getByLabelText('図案の名前');
    await userEvent.clear(input);
    await userEvent.type(input, 'ハート');
    expect(st().project?.name).toBe('ハート');
  });
});

describe('サイズパネル', () => {
  it('プレート枚数のプリセットとステッパー', async () => {
    imageProject();
    render(<SizePanel />);
    expect(screen.getByText('よこ56 × たて56')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /9枚/ }));
    expect([st().project!.width, st().project!.height]).toEqual([84, 84]);
    await userEvent.click(screen.getAllByRole('button', { name: 'よこを減らす' })[0]);
    expect(st().project!.width).toBe(56);
  });

  it('ビーズの数で決める (縦横比を保つ)', async () => {
    imageProject();
    render(<SizePanel />);
    await userEvent.click(screen.getByRole('radio', { name: 'ビーズの数' }));
    expect(st().project!.settings.sizeMode).toBe('beads');
    const w = screen.getByLabelText('よこ');
    await userEvent.clear(w);
    await userEvent.type(w, '40{Enter}');
    expect(st().project!.width).toBe(40);
    expect(st().project!.height).toBe(20); // 200x100 の画像
    await userEvent.click(screen.getByLabelText('縦横の比率を画像に合わせる'));
    expect(st().project!.settings.keepAspect).toBe(false);
    await userEvent.click(screen.getByRole('radio', { name: 'プレートの枚数' }));
    expect(st().project!.settings.sizeMode).toBe('plates');
  });
});

describe('色パネル', () => {
  it('使う色・色の数・仕上がり・ふちどり', async () => {
    imageProject();
    render(<ColorPanel />);
    await userEvent.click(screen.getByRole('radio', { name: /12色セット/ }));
    expect(st().project!.settings.paletteSet).toBe('set12');
    await userEvent.click(screen.getByLabelText('色の数をしぼる'));
    expect(st().project!.settings.maxColors).toBe(12);
    await userEvent.click(screen.getByLabelText('とうめいビーズも使う'));
    expect(st().project!.settings.useClear).toBe(true);
    await userEvent.click(screen.getByLabelText('ゴールド・シルバーも使う'));
    expect(st().project!.settings.useMetallic).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: 'しっかり' }));
    expect(st().project!.settings.cleanup).toBe(2);
    await userEvent.click(screen.getByRole('radio', { name: '外側に付ける' }));
    expect(st().project!.settings.outline).toBe('outer');
    await userEvent.click(screen.getByRole('button', { name: 'こげちゃいろ' }));
    expect(st().project!.settings.outlineColor).toBe(indexOfCode('80-15923'));
    await userEvent.click(screen.getByRole('button', { name: 'ほかの色' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'ふちどりの色' })).getByTitle('しろ（80-15901）'));
    expect(st().project!.settings.outlineColor).toBe(indexOfCode('80-15901'));
  });

  it('マイカラーが空なら注意を出す / 差し替えた色をもどす', async () => {
    imageProject();
    act(() => {
      st().setPrefs({ myColors: [] });
      st().updateSettings({ paletteSet: 'mine', replacements: { [RED]: BLUE }, excluded: [BLACK] });
    });
    render(<ColorPanel />);
    expect(screen.getByText(/使える色がありません/)).toBeInTheDocument();
    const restore = screen.getAllByRole('button', { name: 'もどす' });
    await userEvent.click(restore[0]);
    await userEvent.click(screen.getAllByRole('button', { name: 'もどす' })[0]);
    expect(st().project!.settings.replacements).toEqual({});
    expect(st().project!.settings.excluded).toEqual([]);
    act(() => st().setPrefs({ myColors: [RED, BLUE] }));
  });

  it('フリーモードでは案内だけ', () => {
    st().newFreeProject(4, 4, 'beads');
    render(<ColorPanel />);
    expect(screen.getByText(/フリーモードでは、自分でえらんだ色/)).toBeInTheDocument();
  });

  it('マイカラーの設定 (全色カラーチャート)', async () => {
    render(<PaletteDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '全部はずす' }));
    expect(st().prefs.myColors).toEqual([]);
    await userEvent.click(screen.getByTitle('あか（80-15903）'));
    expect(st().prefs.myColors).toEqual([RED]);
    await userEvent.click(screen.getByTitle('あか（80-15903）'));
    expect(st().prefs.myColors).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: '12色セットと同じにする' }));
    expect(st().prefs.myColors).toHaveLength(12);
    await userEvent.click(screen.getByRole('button', { name: '全部チェック' }));
    expect(st().prefs.myColors).toHaveLength(PALETTE.length);
  });
});

describe('画像パネル', () => {
  it('画像の情報・おさめ方・背景・種類', async () => {
    imageProject();
    render(<ImagePanel />);
    expect(screen.getByText('photo')).toBeInTheDocument();
    expect(screen.getByText(/CAT/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '枠いっぱい' }));
    expect(st().project!.settings.fit).toBe('cover');
    await userEvent.click(screen.getByLabelText('左右反転する'));
    expect(st().project!.settings.mirror).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: '自動' }));
    expect(st().project!.settings.bgMode).toBe('auto');
    await userEvent.click(screen.getByLabelText('離れた所の同じ色も消す'));
    expect(st().project!.settings.bgGlobal).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: 'イラスト・ドット絵' }));
    expect(st().project!.settings.resample).toBe('sharp');
    // 手動で指定 → 指定画面が開く
    await userEvent.click(screen.getByRole('radio', { name: '手動で指定' }));
    expect(screen.getByRole('dialog', { name: '背景を透明にする' })).toBeInTheDocument();
  });

  it('フリーモードでは下絵の設定', async () => {
    st().newFreeProject(28, 28, 'plates');
    act(() => st().setSource(source));
    render(<ImagePanel />);
    expect(screen.getByText(/なぞってビーズを置いていきましょう/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('下絵を表示する'));
    expect(st().showUnderlay).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /この画像から自動で作る/ }));
    expect(st().project!.mode).toBe('image');
  });

  it('下絵を外す', async () => {
    st().newFreeProject(28, 28, 'plates');
    act(() => st().setSource(source));
    render(<ImagePanel />);
    await userEvent.click(screen.getByRole('button', { name: /下絵を外す/ }));
    expect(st().project!.source).toBeNull();
  });
});

describe('背景・トリミングの画面', () => {
  it('背景: 自動/手動・消す/残す・設定を保存', async () => {
    imageProject();
    const onClose = vi.fn();
    render(<BackgroundDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole('radio', { name: '手動（タップした所）' }));
    await userEvent.click(screen.getByRole('radio', { name: '残す' }));
    await userEvent.click(screen.getByLabelText('消える部分を赤で表示'));
    await userEvent.click(screen.getByRole('button', { name: /この設定にする/ }));
    expect(st().project!.settings.bgMode).toBe('manual');
    expect(onClose).toHaveBeenCalled();
  });

  it('背景: 透明にしない', async () => {
    imageProject();
    act(() => st().updateSettings({ bgMode: 'auto' }));
    render(<BackgroundDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '透明にしない' }));
    expect(st().project!.settings.bgMode).toBe('off');
  });

  it('トリミング: 拡大して決定すると「手動で調整」になる', async () => {
    imageProject();
    const before = st().project!.settings.crop;
    render(<CropDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /大きく/ }));
    await userEvent.click(screen.getByRole('button', { name: /この位置にする/ }));
    const s = st().project!.settings;
    expect(s.fit).toBe('custom');
    expect(s.crop.w).toBeLessThan(before.w);
  });

  it('トリミング: 全体を入れる / 枠いっぱいに戻せる', async () => {
    imageProject();
    render(<CropDialog onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '枠いっぱい' }));
    await userEvent.click(screen.getByRole('button', { name: /小さく/ }));
    await userEvent.click(screen.getByRole('button', { name: '全体を入れる' }));
    await userEvent.click(screen.getByRole('button', { name: /この位置にする/ }));
    expect(st().project!.settings.crop.h).toBeCloseTo(2);
  });
});

describe('編集パネル (手動でビーズを置く)', () => {
  it('道具と色をえらぶ', async () => {
    imageProject();
    act(() => st().setTab('edit'));
    render(<EditPanel />);
    await userEvent.click(screen.getByRole('radio', { name: /消しゴム/ }));
    expect(st().tool).toBe('eraser');
    await userEvent.click(screen.getByRole('radio', { name: /塗りつぶし/ }));
    expect(st().tool).toBe('fill');
    // 図案で使っている色
    await userEvent.click(screen.getByTitle('あお'));
    expect(st().color).toBe(BLUE);
    // すべての色から
    await userEvent.click(screen.getByRole('button', { name: /すべての色/ }));
    await userEvent.click(screen.getByTitle('くろ（80-15907）'));
    expect(st().color).toBe(BLACK);
  });

  it('つながりチェックと、離れたビーズを消す', async () => {
    st().newFreeProject(5, 1, 'beads');
    act(() => {
      st().beginStroke();
      st().paint([0, 2, 3], RED);
      st().endStroke(true);
    });
    render(<EditPanel />);
    expect(screen.getByText(/2個のかたまり/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /離れた1〜2粒を消す/ }));
    expect(Array.from(st().cells).every((c) => c === EMPTY)).toBe(true);
    expect(screen.getByText(/全部つながっています/)).toBeInTheDocument();
  });

  it('まとめて操作: 手直しを全部もどす・確定して自由に編集', async () => {
    imageProject();
    act(() => {
      st().beginStroke();
      st().paint([0], BLACK);
      st().endStroke(true);
    });
    render(<EditPanel />);
    await userEvent.click(screen.getByRole('button', { name: /手直しを全部もどす/ }));
    expect(st().cells[0]).toBe(RED);
    await userEvent.click(screen.getByRole('button', { name: /図案を確定して自由に編集/ }));
    expect(st().project!.mode).toBe('free');
  });

  it('フリーモード: 全部消す', async () => {
    st().newFreeProject(2, 2, 'beads');
    act(() => st().fillAt(0, 0, RED));
    render(<EditPanel />);
    await userEvent.click(screen.getByRole('button', { name: /全部消す/ }));
    expect(st().cells.every((c) => c === EMPTY)).toBe(true);
  });
});

describe('カラーチャートと色の差し替え', () => {
  it('使う色の一覧・場所の表示・並び替え・買い物の計算', async () => {
    imageProject();
    render(<ChartPanel />);
    expect(screen.getByText('あか')).toBeInTheDocument();
    expect(screen.getByText('あお')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /80-15903/ }));
    expect(st().focus).toBe(RED);
    await userEvent.click(screen.getByRole('radio', { name: '品番順' }));
    await userEvent.click(screen.getByRole('radio', { name: '色の系統' }));
    await userEvent.click(screen.getByRole('radio', { name: '24色' }));
    expect(st().prefs.ownedSet).toBe('set24');
    expect(screen.getAllByText('手持ちでOK').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText('予備を1割多めに計算する'));
    act(() => st().setPrefs({ ownedSet: 'none', spare: true }));
  });

  it('買い物メモをコピー', async () => {
    imageProject();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ChartPanel />);
    await userEvent.click(screen.getByRole('button', { name: /買い物メモをコピー/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('ナノビーズ 買い物メモ'));
    expect(st().toast?.text).toBe('買い物メモをコピーしました');
  });

  it('差し替えボタン → 別の色をえらぶ → 元に戻す', async () => {
    imageProject();
    render(<ChartPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'あかを別の色に差し替える' }));
    const dialog = screen.getByRole('dialog', { name: '「あか」を別の色にする' });
    await userEvent.click(within(dialog).getByTitle('ピンク（80-15920）'));
    expect(st().project!.settings.replacements[RED]).toBe(indexOfCode('80-15920'));
    expect(st().toast?.text).toContain('差し替えました');
    act(() => st().toast!.action!.run());
    expect(st().project!.settings.replacements[RED]).toBeUndefined();
  });

  it('おまかせ差し替え', async () => {
    imageProject();
    const onClose = vi.fn();
    render(<ReplaceDialog color={RED} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: /おまかせ/ }));
    expect(st().project!.settings.excluded).toContain(RED);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('保存パネル', () => {
  it('つくるモードを開く・名前・ファイルに書き出す', async () => {
    imageProject();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<ExportPanel onOpenProjects={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /つくるモードをはじめる/ }));
    expect(st().buildMode).toBe(true);
    const name = screen.getByLabelText('図案の名前');
    await userEvent.clear(name);
    await userEvent.type(name, 'ねこ');
    expect(st().project!.name).toBe('ねこ');
    await userEvent.click(screen.getByRole('button', { name: /ファイルに書き出す/ }));
    expect(click).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /画像（PNG）を保存/ }));
    await waitFor(() => expect(st().toast?.text).toBe('画像を保存しました'));
    await userEvent.click(screen.getByRole('button', { name: /PDFを保存/ }));
    await waitFor(() => expect(st().toast?.text).toMatch(/PDFを保存しました/), { timeout: 5000 });
  });

  it('ファイルから読み込む', async () => {
    imageProject();
    const { serializeProject, createProject } = await import('../lib/project');
    const p = createProject('free', 3, 3, null);
    p.name = '読み込みテスト';
    const file = new File([JSON.stringify(serializeProject(p))], 'a.json', { type: 'application/json' });
    const { container } = render(<ExportPanel onOpenProjects={() => {}} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await userEvent.upload(input, file);
    await waitFor(() => expect(st().project!.name).toBe('読み込みテスト'));
    const bad = new File(['{"app":"x"}'], 'b.json', { type: 'application/json' });
    await userEvent.upload(container.querySelector('input[type=file]') as HTMLInputElement, bad);
    await waitFor(() => expect(st().toast?.text).toMatch(/ファイルではありません/));
  });
});

describe('つくるモード', () => {
  it('プレートと色をえらび、置いたビーズにチェックを付ける', async () => {
    st().newFreeProject(56, 28, 'plates');
    act(() => {
      st().beginStroke();
      st().paint([0, 1, 30], RED);
      st().paint([2], BLUE);
      st().endStroke(true);
      st().setUi({ buildMode: true });
    });
    render(<BuildMode />);
    expect(screen.getByText(/0% 完成/)).toBeInTheDocument();
    // プレート2にはビーズがある (30 = よこ31列目)
    await userEvent.click(screen.getByRole('button', { name: /あか/ }));
    expect(screen.getByText(/あと 2個/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /この色をぜんぶ置いた/ }));
    expect(st().project!.done[0]).toBe(1);
    expect(st().project!.done[1]).toBe(1);
    expect(screen.getByText(/50% 完成/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'チェックを外す' }));
    expect(st().project!.done[0]).toBe(0);
    await userEvent.click(screen.getAllByRole('button', { name: /^2/ })[0]);
    await userEvent.click(screen.getByRole('button', { name: 'チェックを全部消す' }));
    await userEvent.click(screen.getByRole('button', { name: /もどる/ }));
    expect(st().buildMode).toBe(false);
  });

  it('画面をつけたまま (対応していない環境ではお知らせ)', async () => {
    st().newFreeProject(4, 4, 'beads');
    act(() => st().fillAt(0, 0, RED));
    render(<BuildMode />);
    await userEvent.click(screen.getByTitle('画面をつけたままにする'));
    expect(st().toast?.text).toBe('このブラウザでは使えません');
  });
});

describe('ダイアログ', () => {
  it('白紙から作る: ビーズの数で決める', async () => {
    const onClose = vi.fn();
    render(<NewFreeDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole('radio', { name: 'ビーズの数' }));
    const w = screen.getByLabelText('よこ');
    await userEvent.clear(w);
    await userEvent.type(w, '10{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'この大きさではじめる' }));
    expect(st().project!.width).toBe(10);
    expect(onClose).toHaveBeenCalled();
  });

  it('マイ図案: 一覧・開く・コピー・削除', async () => {
    const { saveProjectRecord } = await import('../lib/storage');
    const { serializeProject, createProject } = await import('../lib/project');
    const p = createProject('free', 2, 2, null);
    p.name = '保存した図案';
    await saveProjectRecord({ id: p.id, name: p.name, createdAt: 1, updatedAt: Date.now(), thumbnail: '', data: serializeProject(p) });
    const onClose = vi.fn();
    render(<ProjectsDialog onClose={onClose} onNewImage={() => {}} onNewFree={() => {}} />);
    expect(await screen.findByText('保存した図案')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '保存した図案をコピー' }));
    expect(await screen.findByText('保存した図案 のコピー')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '保存した図案 のコピーを削除' }));
    await waitFor(() => expect(screen.queryByText('保存した図案 のコピー')).not.toBeInTheDocument());
    await userEvent.click(screen.getByText('保存した図案'));
    await waitFor(() => expect(st().project?.name).toBe('保存した図案'));
    expect(onClose).toHaveBeenCalled();
  });

  it('使い方', () => {
    render(<HelpDialog onClose={() => {}} />);
    expect(screen.getByText('手でビーズを置く（編集）')).toBeInTheDocument();
  });
});

describe('ネットの画像検索', () => {
  it('キーワードで約100件の候補を表示する', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const p = Number(new URL(String(url)).searchParams.get('page'));
      const results = Array.from({ length: 20 }, (_, i) => ({
        id: `id${(p - 1) * 20 + i}`,
        title: `ねこ${(p - 1) * 20 + i}`,
        thumbnail: 'data:,',
        creator: 'A',
        license: 'by',
        license_version: '2.0',
      }));
      return new Response(JSON.stringify({ result_count: 240, results }), { status: 200 });
    });
    const onPicked = vi.fn();
    render(<ImageSearchDialog initialQuery="ねこ" onClose={() => {}} onPicked={onPicked} />);
    expect(await screen.findByText(/100件見つかりました/)).toBeInTheDocument();
    expect(screen.getByText(/「ねこ」→「cat」で検索/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(screen.getAllByRole('button', { pressed: false }).filter((b) => b.classList.contains('search-item'))).toHaveLength(100);
    await userEvent.click(screen.getByTitle('ねこ3 / A'));
    expect(screen.getByText(/作者: A ・ CC BY 2.0/)).toBeInTheDocument();
    // 種類をかえて検索し直す
    await userEvent.click(screen.getByRole('radio', { name: 'イラスト' }));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('category=illustration'));
  });

  it('回数制限・エラーを知らせる / おすすめのことば', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 429 }));
    render(<ImageSearchDialog onClose={() => {}} onPicked={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'いぬ' }));
    expect(await screen.findByText(/検索の回数が多すぎます/)).toBeInTheDocument();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    const input = screen.getByLabelText('検索するキーワード');
    await userEvent.clear(input);
    await userEvent.type(input, 'xyz{Enter}');
    expect(await screen.findByText(/うまく検索できませんでした/)).toBeInTheDocument();
  });

  it('見つからないとき', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ result_count: 0, results: [] }), { status: 200 }));
    render(<ImageSearchDialog initialQuery="zzzz" onClose={() => {}} onPicked={() => {}} />);
    expect(await screen.findByText(/見つかりませんでした/)).toBeInTheDocument();
  });
});
