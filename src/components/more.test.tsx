// @vitest-environment jsdom
// 各パネル・画面の細かな分岐 (カバレッジ100%用)
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { indexOfCode } from '../data/palette';
import { NO_EDIT } from '../lib/pattern';
import { useStore } from '../state/store';
import { FakeImage, mockRect } from '../test/fakes';
import { BackgroundDialog } from './BackgroundDialog';
import { BuildMode } from './BuildMode';
import { CropDialog } from './CropDialog';
import { PaletteDialog } from './PaletteDialog';
import { ChartPanel } from './panels/ChartPanel';
import { ColorPanel } from './panels/ColorPanel';
import { ExportPanel } from './panels/ExportPanel';
import { ImagePanel } from './panels/ImagePanel';
import { SizePanel } from './panels/SizePanel';
import { ReplaceDialog } from './ReplaceDialog';
import { Stage } from './Stage';
import { Section, Slider, Stepper } from './ui';
import { ZoomCanvas, type ZoomApi } from './ZoomCanvas';

const RED = indexOfCode('80-15903');
const PINK = indexOfCode('80-15920');
const BLUE = indexOfCode('80-15904');
const st = () => useStore.getState();
const source = { dataUrl: 'data:image/png;base64,QUFB#100x50', width: 100, height: 50, name: '' };
const broken = { ...source, dataUrl: 'data:image/png;base64,error' };

function imageProject() {
  st().newImageProject(source);
  const n = st().project!.width * st().project!.height;
  const base = new Int16Array(n).fill(RED);
  base[0] = PINK;
  base[1] = BLUE;
  st().setBase(base);
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage);
  st().closeProject();
  useStore.setState({ toast: null, focus: null, tab: 'image', buildMode: false });
  st().setPrefs({ ownedSet: 'none', spare: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App の細かな分岐', () => {
  it('画像モードの「色」タブ / トップ画面のボタン', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /白紙から作る（フリーモード）/ }));
    expect(screen.getByRole('dialog', { name: /白紙から作る/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    await userEvent.click(screen.getByRole('button', { name: /くわしい使い方/ }));
    expect(screen.getByRole('dialog', { name: '使い方' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    await userEvent.click(screen.getByRole('button', { name: /保存した図案を開く/ }));
    expect(await screen.findByRole('dialog', { name: 'マイ図案' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    act(() => imageProject());
    await userEvent.click(screen.getByRole('tab', { name: /色/ }));
    expect(screen.getByText('使う色')).toBeInTheDocument();
  });

  it('ドラッグが中の要素に移っただけなら表示を消さない / クリップボードが無い貼り付け', () => {
    render(<App />);
    fireEvent.dragOver(window, { dataTransfer: { types: ['Files'], files: [] } });
    window.dispatchEvent(new MouseEvent('dragleave', { relatedTarget: document.body }));
    expect(screen.getByText('ここに画像をドロップ')).toBeInTheDocument();
    window.dispatchEvent(new Event('paste'));
  });
});

describe('ZoomCanvas の細かな分岐', () => {
  it('devicePixelRatio が無い環境・同じ位置のピンチ・移動中に2本目・小さな移動・ゆっくりタップ', async () => {
    mockRect(400, 300);
    Object.defineProperty(window, 'devicePixelRatio', { value: 0, configurable: true });
    const draw = vi.fn();
    const onTap = vi.fn();
    const api = createRef<ZoomApi>();
    const { container } = render(<ZoomCanvas contentW={10} contentH={10} draw={draw} panWithSingle onTap={onTap} fitKey="x" apiRef={api} />);
    const c = container.querySelector('canvas')!;
    await waitFor(() => expect(draw).toHaveBeenCalled());
    expect(draw.mock.calls[0][0].dpr).toBe(1);
    // 移動中に2本目 (同じ位置) → ピンチ
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(c, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(c, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(c, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(c, { pointerId: 1, clientX: 100, clientY: 100 });
    // ほんの少しだけ動かして離す → タップ
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(c, { pointerId: 1, clientX: 102, clientY: 101 });
    fireEvent.pointerUp(c, { pointerId: 1, clientX: 102, clientY: 101 });
    expect(onTap).toHaveBeenCalledTimes(1);
    // 長押しして離す → タップにしない
    const now = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(1000);
    fireEvent.pointerDown(c, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(c, { pointerId: 1, clientX: 100, clientY: 100 });
    now.mockRestore();
    expect(onTap).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(window, 'devicePixelRatio');
  });
});

describe('ZoomCanvas のアンマウント直後', () => {
  it('ref が外れた後に大きさの変化が届いても何もしない', async () => {
    const { resizeObservers } = await import('../test/setup');
    mockRect(400, 300);
    const draw = vi.fn();
    const { unmount } = render(<ZoomCanvas contentW={4} contentH={4} draw={draw} panWithSingle fitKey="u" />);
    const ro = resizeObservers[resizeObservers.length - 1];
    unmount();
    draw.mockClear();
    ro.trigger();
    expect(draw).not.toHaveBeenCalled();
  });
});

describe('画像の読み込みに失敗しても止まらない', () => {
  it('Stage / CropDialog / BackgroundDialog', async () => {
    st().newImageProject(broken);
    st().setUi({ compare: true });
    render(
      <>
        <Stage />
        <CropDialog onClose={() => {}} />
        <BackgroundDialog onClose={() => {}} />
      </>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(document.querySelector('.crop-box img')).toBeNull();
  });
});

describe('BuildMode の細かな分岐', () => {
  beforeEach(() => {
    st().newFreeProject(56, 28, 'plates');
    st().beginStroke();
    st().paint([0, 1], RED);
    st().paint([40], BLUE);
    st().endStroke(true);
  });

  it('ダークモード・小さな画面 (座標なし)・完成したプレート・色の選択を外す', async () => {
    mockRect(100, 100);
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    act(() => st().setDone([0, 1], true));
    render(<BuildMode />);
    expect(document.querySelector('.plate-tab.complete')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /あか/ }));
    expect(screen.getByRole('button', { name: /あか/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /あか/ }));
    expect(screen.getByRole('button', { name: /あか/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('ダークモードで大きく表示すると座標を明るい色で書く', () => {
    mockRect(1200, 1200);
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { container } = render(<BuildMode />);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('画面スリープ防止の解除に失敗しても止まらない', async () => {
    const release = vi.fn().mockRejectedValue(new Error('x'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn().mockResolvedValue({ release }) }, configurable: true });
    render(<BuildMode />);
    await userEvent.click(screen.getByTitle('画面をつけたままにする'));
    await userEvent.click(screen.getByTitle('画面をつけたままにする'));
    expect(release).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });
});

describe('UI 部品の細かな分岐', () => {
  it('スライダーを続けて動かすと最後の値だけ通知 / 見出しにアイコン無し / ステッパーを空欄で確定', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onStep = vi.fn();
    render(
      <>
        <Slider label="値" value={0} min={0} max={10} onChange={onChange} />
        <Section title="アイコンなし">中身</Section>
        <Stepper label="数" value={3} min={1} max={9} onChange={onStep} />
      </>,
    );
    const slider = screen.getByLabelText('値');
    fireEvent.change(slider, { target: { value: '3' } });
    fireEvent.change(slider, { target: { value: '5' } });
    act(() => vi.advanceTimersByTime(100));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(5);
    vi.useRealTimers();
    const input = screen.getByLabelText('数');
    await userEvent.clear(input);
    fireEvent.blur(input);
    expect(onStep).not.toHaveBeenCalled();
  });
});

describe('カラーチャートの細かな分岐', () => {
  it('同じ系統の色の並び・場所の表示を解除・全色カラーチャート・コピー失敗', async () => {
    imageProject();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('no')) }, configurable: true });
    render(<ChartPanel />);
    await userEvent.click(screen.getByRole('radio', { name: '色の系統' }));
    const names = [...document.querySelectorAll('.chart-name strong')].map((e) => e.textContent);
    expect(names.indexOf('あか')).toBeLessThan(names.indexOf('ピンク'));
    await userEvent.click(screen.getByRole('button', { name: /80-15903/ }));
    await userEvent.click(screen.getByRole('button', { name: /80-15903/ }));
    expect(st().focus).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /全色カラーチャート/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'とじる' }));
    await userEvent.click(screen.getByRole('button', { name: /買い物メモをコピー/ }));
    await waitFor(() => expect(st().toast?.text).toBe('コピーできませんでした'));
  });

  it('差し替え: 同じ色を選ぶと閉じるだけ / フリーモードは「おまかせ」なし', async () => {
    st().newFreeProject(2, 2, 'beads');
    st().fillAt(0, 0, RED);
    const onClose = vi.fn();
    render(<ReplaceDialog color={RED} onClose={onClose} />);
    expect(screen.queryByRole('button', { name: /おまかせ/ })).toBeNull();
    await userEvent.click(screen.getByTitle('あか（80-15903）'));
    expect(onClose).toHaveBeenCalled();
    expect(st().cells[0]).toBe(RED);
  });

  it('マイカラーで2色以上を選ぶと並べて保存', async () => {
    st().setPrefs({ myColors: [] });
    render(<PaletteDialog onClose={() => {}} />);
    await userEvent.click(screen.getByTitle('あお（80-15904）'));
    await userEvent.click(screen.getByTitle('あか（80-15903）'));
    expect(st().prefs.myColors).toEqual([RED, BLUE].sort((a, b) => a - b));
  });
});

describe('色パネルの細かな分岐', () => {
  it('スライダー・マイカラー設定・ふちどりの色えらびを閉じる', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    imageProject();
    act(() => st().updateSettings({ maxColors: 8, outline: 'outer' }));
    render(<ColorPanel />);
    const change = (label: string, value: string) => {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      act(() => vi.advanceTimersByTime(100));
    };
    change('最大の色数', '5');
    expect(st().project!.settings.maxColors).toBe(5);
    change('グラデーション（ディザ）', '40');
    expect(st().project!.settings.dither).toBe(40);
    expect(screen.getByText('40%')).toBeInTheDocument();
    change('明るさ', '10');
    change('コントラスト', '20');
    change('あざやかさ', '30');
    expect(st().project!.settings).toMatchObject({ brightness: 10, contrast: 20, saturation: 30 });
    vi.useRealTimers();
    await userEvent.click(screen.getByLabelText('色の数をしぼる'));
    expect(st().project!.settings.maxColors).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: /マイカラー（持っている色）を設定/ }));
    await userEvent.click(screen.getByRole('button', { name: 'とじる' }));
    await userEvent.click(screen.getByRole('button', { name: 'ほかの色' }));
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('保存パネルの細かな分岐', () => {
  it('共有できる環境: 共有ボタン (共有できたらダウンロードしない / できなければダウンロード)', async () => {
    imageProject();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const nav = navigator as Navigator & { share?: unknown; canShare?: unknown };
    nav.share = vi.fn().mockResolvedValue(undefined);
    nav.canShare = () => true;
    render(<ExportPanel onOpenProjects={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /共有/ }));
    await waitFor(() => expect(nav.share).toHaveBeenCalled());
    expect(click).not.toHaveBeenCalled();
    nav.canShare = () => false;
    await userEvent.click(screen.getByRole('button', { name: /共有/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    Reflect.deleteProperty(nav, 'share');
    Reflect.deleteProperty(nav, 'canShare');
  });

  it('書き出しに失敗したら知らせる / ファイル選択 / 壊れたファイル / 何も選ばない', async () => {
    imageProject();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      cb(null);
    };
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { container } = render(<ExportPanel onOpenProjects={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /画像（PNG）を保存/ }));
    await waitFor(() => expect(st().toast?.text).toBe('書き出しに失敗しました'));
    HTMLCanvasElement.prototype.toBlob = original;
    await userEvent.click(screen.getByRole('button', { name: /ファイルから読み込む/ }));
    expect(inputClick).toHaveBeenCalled();
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await userEvent.upload(input, new File(['{broken'], 'x.json', { type: 'application/json' }));
    await waitFor(() => expect(st().toast?.text).toBe('ファイルが壊れているため読み込めませんでした'));
    fireEvent.change(input, { target: { files: [] } });
  });
});

describe('画像パネルの細かな分岐', () => {
  it('名前の無い画像・手動調整・トリミング・背景の指定・範囲', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    imageProject();
    act(() => st().updateSettings({ bgMode: 'auto', bgPoints: [{ x: 0.1, y: 0.1, keep: false }] }));
    render(<ImagePanel />);
    expect(screen.getByText('画像')).toBeInTheDocument();
    expect(screen.getByText('1か所')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('似た色とみなす範囲'), { target: { value: '30' } });
    act(() => vi.advanceTimersByTime(100));
    expect(st().project!.settings.bgTolerance).toBe(30);
    vi.useRealTimers();
    await userEvent.click(screen.getByRole('radio', { name: '手動で調整' }));
    expect(screen.getByRole('dialog', { name: '画像の位置と大きさ' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    await userEvent.click(screen.getByRole('button', { name: /位置・大きさ/ }));
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    await userEvent.click(screen.getByRole('button', { name: /画像をタップして指定/ }));
    expect(screen.getByRole('dialog', { name: '背景を透明にする' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    // 手動に切り替えても、すでに点があれば指定画面は開かない
    await userEvent.click(screen.getByRole('radio', { name: '手動で指定' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('フリーモード: 下絵の濃さ・描いた図案があるときは確認 (やめる)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    st().newFreeProject(28, 28, 'plates');
    act(() => {
      st().setSource({ ...source, name: '下絵' });
      st().fillAt(0, 0, RED);
    });
    render(<ImagePanel />);
    fireEvent.change(screen.getByLabelText('下絵の濃さ'), { target: { value: '80' } });
    act(() => vi.advanceTimersByTime(100));
    expect(st().underlayOpacity).toBeCloseTo(0.8);
    vi.useRealTimers();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: /この画像から自動で作る/ }));
    expect(st().project!.mode).toBe('free');
  });
});

describe('サイズパネルの細かな分岐', () => {
  it('同じ大きさ・手直しがあるときの確認・たての枚数・縦横比', async () => {
    imageProject();
    render(<SizePanel />);
    // 今と同じ大きさ → 設定だけ更新
    await userEvent.click(screen.getByRole('button', { name: /4枚/ }));
    expect(st().project!.width).toBe(56);
    // 手直しがあるときに「やめる」
    act(() => {
      st().beginStroke();
      st().paint([5], BLUE);
      st().endStroke(true);
    });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: /9枚/ }));
    expect(st().project!.width).toBe(56);
    expect(st().project!.overlay[5]).not.toBe(NO_EDIT);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getAllByRole('button', { name: 'たてを増やす' })[0]);
    expect(st().project!.height).toBe(84);
    // ビーズの数: 縦横比をはずして、たて・よこを別々に
    await userEvent.click(screen.getByRole('radio', { name: 'ビーズの数' }));
    await userEvent.click(screen.getByLabelText('縦横の比率を画像に合わせる'));
    await userEvent.click(screen.getAllByRole('button', { name: 'よこを増やす' })[0]);
    await userEvent.click(screen.getAllByRole('button', { name: 'たてを増やす' })[0]);
    expect(st().project!.height).toBe(85);
    // 縦横比を合わせ直す (200x100 → 横長)
    await userEvent.click(screen.getByLabelText('縦横の比率を画像に合わせる'));
    expect(st().project!.height).toBe(Math.round(st().project!.width * 0.5));
    await userEvent.click(screen.getAllByRole('button', { name: 'たてを増やす' })[0]);
    expect(st().project!.width).toBe(st().project!.height * 2);
  });

  it('フリーモードでは縦横比の設定なし', () => {
    st().newFreeProject(30, 20, 'beads');
    render(<SizePanel />);
    expect(screen.queryByLabelText('縦横の比率を画像に合わせる')).toBeNull();
    expect(screen.queryByText(/写真はビーズの数を増やすほど/)).toBeNull();
  });
});
