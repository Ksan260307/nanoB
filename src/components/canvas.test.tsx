// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexOfCode } from '../data/palette';
import { EMPTY } from '../lib/pattern';
import { useStore } from '../state/store';
import { answerConfirm } from '../test/dialog';
import { FakeImage, mockRect, opaqueCanvas } from '../test/fakes';
import { resizeObservers } from '../test/setup';
import { BackgroundDialog } from './BackgroundDialog';
import { BuildMode } from './BuildMode';
import { CropDialog } from './CropDialog';
import { Stage } from './Stage';
import { ZoomCanvas, type DrawArgs, type ZoomApi } from './ZoomCanvas';

const RED = indexOfCode('80-15903');
const BLUE = indexOfCode('80-15904');
const st = () => useStore.getState();
const source = { dataUrl: 'data:image/png;base64,QUFB#100x100', width: 100, height: 100, name: 'p' };

let rect: ReturnType<typeof mockRect>;

beforeEach(() => {
  rect = mockRect(400, 300);
  vi.stubGlobal('Image', FakeImage);
  st().closeProject();
  useStore.setState({ toast: null, focus: null, compare: false, converting: false, buildMode: false, symmetry: 'none' });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const down = (el: Element, id: number, x: number, y: number, button = 0) => fireEvent.pointerDown(el, { pointerId: id, clientX: x, clientY: y, button });
const move = (el: Element, id: number, x: number, y: number) => fireEvent.pointerMove(el, { pointerId: id, clientX: x, clientY: y });
const up = (el: Element, id: number, x: number, y: number) => fireEvent.pointerUp(el, { pointerId: id, clientX: x, clientY: y });

/** 10x10 マスを 400x300 に全体表示: 1マス 26.8px、左上 (66, 16) */
const CELL = 26.8;
const at = (cx: number, cy: number) => [66 + CELL * cx, 16 + CELL * cy] as const;

describe('ZoomCanvas (拡大縮小・移動・描く操作)', () => {
  function setup(props: Partial<Parameters<typeof ZoomCanvas>[0]> = {}) {
    const draw = vi.fn<(a: DrawArgs) => void>();
    const onPointerCell = vi.fn();
    const onTap = vi.fn();
    const api = createRef<ZoomApi>();
    const utils = render(
      <ZoomCanvas
        contentW={10}
        contentH={10}
        draw={draw}
        panWithSingle={false}
        onPointerCell={onPointerCell}
        onTap={onTap}
        fitKey="a"
        apiRef={api}
        {...props}
      />,
    );
    const canvas = utils.container.querySelector('canvas')!;
    return { draw, onPointerCell, onTap, api, canvas, ...utils };
  }

  it('全体表示して描く', async () => {
    const { draw } = setup();
    await waitFor(() => expect(draw).toHaveBeenCalled());
    const a = draw.mock.calls.at(-1)![0];
    expect(a.cell / a.dpr).toBeCloseTo(CELL, 1);
  });

  it('1本指で描く: down → move → up', () => {
    const { canvas, onPointerCell } = setup();
    down(canvas, 1, ...at(2.5, 3.5));
    move(canvas, 1, ...at(4.5, 3.5));
    up(canvas, 1, ...at(4.5, 3.5));
    expect(onPointerCell.mock.calls.map((c) => c[0])).toEqual(['down', 'move', 'up']);
    expect(onPointerCell.mock.calls[0][1]).toBeCloseTo(2.5, 1);
    expect(onPointerCell.mock.calls[0][2]).toBeCloseTo(3.5, 1);
  });

  it('途中で取り消されたら cancel', () => {
    const { canvas, onPointerCell } = setup();
    down(canvas, 1, 100, 100);
    fireEvent.pointerCancel(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onPointerCell.mock.calls.at(-1)![0]).toBe('cancel');
  });

  it('2本指でつまむと拡大 (描きかけは取り消し) → 1本残すと移動', () => {
    const { canvas, onPointerCell, draw } = setup();
    down(canvas, 1, 150, 150);
    down(canvas, 2, 250, 150);
    expect(onPointerCell.mock.calls.at(-1)![0]).toBe('cancel');
    // 3本目は無視
    down(canvas, 3, 10, 10);
    move(canvas, 2, 350, 150);
    up(canvas, 2, 350, 150);
    move(canvas, 1, 170, 170);
    up(canvas, 1, 170, 170);
    up(canvas, 3, 10, 10);
    expect(draw).toHaveBeenCalled();
    // つまんだ後は描かない
    expect(onPointerCell.mock.calls.filter((c) => c[0] === 'move')).toHaveLength(0);
  });

  it('2本とも同時に離すと終わり', () => {
    const { canvas } = setup();
    down(canvas, 1, 150, 150);
    down(canvas, 2, 250, 150);
    up(canvas, 1, 150, 150);
    up(canvas, 2, 250, 150);
    // 離した後の移動は無視
    move(canvas, 1, 100, 100);
    up(canvas, 9, 0, 0);
  });

  it('移動モード: 動かさずに離すとタップ、動かすと移動だけ', () => {
    const { canvas, onTap } = setup({ panWithSingle: true });
    down(canvas, 1, ...at(1.5, 1.5));
    up(canvas, 1, ...at(1.5, 1.5));
    expect(onTap).toHaveBeenCalledTimes(1);
    down(canvas, 1, 100, 100);
    move(canvas, 1, 160, 120);
    up(canvas, 1, 160, 120);
    expect(onTap).toHaveBeenCalledTimes(1);
    // キャンセルはタップにしない
    down(canvas, 1, 100, 100);
    fireEvent.pointerCancel(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('描くモードでも右ドラッグ・中ボタンは移動', () => {
    const { canvas, onPointerCell } = setup();
    down(canvas, 1, 100, 100, 2);
    move(canvas, 1, 120, 120);
    up(canvas, 1, 120, 120);
    down(canvas, 1, 100, 100, 1);
    up(canvas, 1, 100, 100);
    expect(onPointerCell).not.toHaveBeenCalled();
  });

  it('描く処理が無ければ移動', () => {
    const { canvas, onTap } = setup({ onPointerCell: undefined });
    down(canvas, 1, 100, 100);
    up(canvas, 1, 100, 100);
    expect(onTap).toHaveBeenCalled();
  });

  it('ホイールで拡大縮小・横スクロール・ピンチ (Ctrl)', () => {
    const { canvas, draw } = setup();
    const count = draw.mock.calls.length;
    fireEvent(canvas, new WheelEvent('wheel', { deltaY: -200, clientX: 200, clientY: 150, cancelable: true }));
    fireEvent(canvas, new WheelEvent('wheel', { deltaY: 5, ctrlKey: true, clientX: 200, clientY: 150, cancelable: true }));
    fireEvent(canvas, new WheelEvent('wheel', { deltaX: 50, deltaY: 1, clientX: 200, clientY: 150, cancelable: true }));
    expect(draw.mock.calls.length).toBeGreaterThanOrEqual(count);
  });

  it('ボタン用の操作 (拡大・全体表示・再描画)', async () => {
    const { api, draw } = setup();
    act(() => {
      api.current!.zoomBy(2);
      api.current!.fit();
      api.current!.redraw();
    });
    await waitFor(() => expect(draw).toHaveBeenCalled());
  });

  it('fitKey が変わると全体表示し直す', async () => {
    const { rerender, draw } = setup();
    rerender(<ZoomCanvas contentW={20} contentH={20} draw={draw} panWithSingle fitKey="b" />);
    await waitFor(() => expect(draw).toHaveBeenCalled());
  });

  it('画面の大きさが変わったとき: 拡大・移動していなければ全体表示、していれば中心を保つ', async () => {
    const { draw, canvas } = setup({ panWithSingle: true });
    const grow = (w: number, h: number) => {
      rect.mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, width: w, height: h, right: w, bottom: h, toJSON: () => ({}) }) as DOMRect);
      act(() => resizeObservers.forEach((o) => o.trigger()));
      return draw.mock.calls.at(-1)![0];
    };
    // まだ何もしていない → 全体表示 (600x600 なら 1マス 56.8px)
    expect(grow(600, 600).cell).toBeCloseTo(56.8, 0);
    // 移動したあとは、大きさが変わっても拡大率を保つ
    down(canvas, 1, 100, 100);
    move(canvas, 1, 150, 130);
    up(canvas, 1, 150, 130);
    expect(grow(800, 800).cell).toBeCloseTo(56.8, 0);
  });

  it('右クリックのメニューは出さない', () => {
    const { canvas } = setup();
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });
});

describe('Stage (図案の表示と編集)', () => {
  const canvasOf = (c: HTMLElement) => c.querySelector('canvas')!;
  // 4x4 を 400x300 に表示: 1マス 67px、左上 (66, 16)
  const cellAt = (x: number, y: number) => [66 + 67 * (x + 0.5), 16 + 67 * (y + 0.5)] as const;

  function freeProject() {
    st().newFreeProject(4, 4, 'beads');
    st().setTab('edit');
  }

  it('ペンで描き、消しゴムで消す', () => {
    freeProject();
    st().setColor(RED);
    const { container } = render(<Stage />);
    const c = canvasOf(container);
    down(c, 1, ...cellAt(0, 0));
    move(c, 1, ...cellAt(2, 0));
    // 図案の外へはみ出しても、はしまで描く
    move(c, 1, 600, 16 + 67 * 0.5);
    up(c, 1, 600, 16 + 67 * 0.5);
    expect(Array.from(st().cells.slice(0, 4))).toEqual([RED, RED, RED, RED]);
    expect(st().past).toHaveLength(1);
    act(() => st().setTool('eraser'));
    down(c, 1, ...cellAt(1, 0));
    up(c, 1, ...cellAt(1, 0));
    expect(st().cells[1]).toBe(EMPTY);
  });

  it('図案の外から描き始めても何もしない / 何も変わらなければ履歴に残さない', () => {
    freeProject();
    const { container } = render(<Stage />);
    const c = canvasOf(container);
    down(c, 1, 5, 5);
    move(c, 1, 6, 6);
    up(c, 1, 6, 6);
    act(() => st().setTool('eraser'));
    down(c, 1, ...cellAt(3, 3));
    up(c, 1, ...cellAt(3, 3));
    expect(st().past).toHaveLength(0);
  });

  it('対称に描く: 反対側にも置き、まん中の線を描く (元画像を表示中は線なし)', async () => {
    // 描いたときの canvas の命令を集める
    const contexts: { calls: string[] }[] = [];
    const original = HTMLCanvasElement.prototype.getContext;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, ...args: unknown[]) {
      const ctx = (original as unknown as (...a: unknown[]) => { calls: string[] }).apply(this, args);
      contexts.push(ctx);
      return ctx as unknown as RenderingContext;
    });
    const dashedDrawn = async () => {
      contexts.length = 0;
      await waitFor(() => expect(contexts.some((c) => c.calls.includes('setLineDash'))).toBe(true));
    };
    freeProject();
    st().setColor(RED);
    act(() => st().setUi({ symmetry: 'xy' }));
    const { container, unmount } = render(<Stage />);
    await dashedDrawn();
    const c = canvasOf(container);
    down(c, 1, ...cellAt(0, 0));
    up(c, 1, ...cellAt(0, 0));
    expect([0, 3, 12, 15].map((i) => st().cells[i])).toEqual([RED, RED, RED, RED]);
    expect(st().cells[1]).toBe(EMPTY);
    // 左右だけ
    act(() => st().setUi({ symmetry: 'x' }));
    await dashedDrawn();
    act(() => st().setTool('eraser'));
    down(c, 1, ...cellAt(0, 0));
    up(c, 1, ...cellAt(0, 0));
    expect([0, 3, 12, 15].map((i) => st().cells[i])).toEqual([EMPTY, EMPTY, RED, RED]);
    // 元画像を表示中は線を描かない
    act(() => st().setUi({ compare: true }));
    contexts.length = 0;
    await waitFor(() => expect(contexts.length).toBeGreaterThan(0));
    expect(contexts.some((ctx) => ctx.calls.includes('setLineDash'))).toBe(false);
    unmount();
    // 上下だけ (ダークモード)
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    act(() => st().setUi({ symmetry: 'y', compare: false }));
    render(<Stage />);
    await dashedDrawn();
  });

  it('2本指の操作が始まったら描きかけを取り消す', () => {
    freeProject();
    st().setColor(BLUE);
    const { container } = render(<Stage />);
    const c = canvasOf(container);
    down(c, 1, ...cellAt(0, 0));
    down(c, 2, ...cellAt(3, 3));
    expect(st().cells[0]).toBe(EMPTY);
    up(c, 2, ...cellAt(3, 3));
    up(c, 1, ...cellAt(0, 0));
  });

  it('塗りつぶし・スポイト (ビーズの無い所・図案の外は何もしない)', () => {
    freeProject();
    st().setColor(RED);
    act(() => st().setTool('fill'));
    const { container } = render(<Stage />);
    const c = canvasOf(container);
    down(c, 1, ...cellAt(1, 1));
    move(c, 1, ...cellAt(1, 1));
    up(c, 1, ...cellAt(1, 1));
    expect(st().cells.every((v) => v === RED)).toBe(true);
    act(() => st().setTool('picker'));
    down(c, 1, 5, 5);
    up(c, 1, 5, 5);
    down(c, 1, ...cellAt(0, 0));
    up(c, 1, ...cellAt(0, 0));
    expect(st().color).toBe(RED);
    expect(st().toast?.text).toContain('あか');
    act(() => {
      st().clearAll();
      st().setTool('picker');
    });
    down(c, 1, ...cellAt(0, 0));
    up(c, 1, ...cellAt(0, 0));
    // 移動ツールでは描かない
    act(() => st().setTool('move'));
  });

  it('移動モードでビーズをタップすると色を表示', () => {
    st().newFreeProject(4, 4, 'beads');
    st().fillAt(0, 0, RED);
    st().setTab('chart');
    const { container } = render(<Stage />);
    const c = canvasOf(container);
    down(c, 1, ...cellAt(1, 2));
    up(c, 1, ...cellAt(1, 2));
    expect(st().toast?.text).toContain('よこ2 たて3');
    act(() => st().clearAll());
    act(() => useStore.setState({ toast: null }));
    down(c, 1, ...cellAt(1, 2));
    up(c, 1, ...cellAt(1, 2));
    down(c, 1, 2, 2);
    up(c, 1, 2, 2);
    expect(st().toast).toBeNull();
  });

  it('表示の切り替え・元画像・ハイライト・変換中・拡大ボタン・ダークモード', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    st().newImageProject(source);
    st().setBase(new Int16Array(56 * 56).fill(RED));
    render(<Stage />);
    await userEvent.click(screen.getByRole('radio', { name: '記号で表示' }));
    expect(st().prefs.style).toBe('symbol');
    await userEvent.click(screen.getByRole('radio', { name: 'ビーズで表示' }));
    await userEvent.click(screen.getByRole('button', { name: '元の画像とくらべる' }));
    expect(screen.getByText('元の画像を表示中')).toBeInTheDocument();
    // 画像の読み込みを待つ
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    act(() => {
      st().setFocus(RED);
      st().setConverting(true);
    });
    expect(screen.getByText(/「あか」だけ表示中/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('図案を作っています');
    await userEvent.click(screen.getByRole('button', { name: '解除' }));
    expect(st().focus).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '拡大' }));
    await userEvent.click(screen.getByRole('button', { name: '縮小' }));
    await userEvent.click(screen.getByRole('button', { name: '全体を表示' }));
  });

  it('フリーモードの下絵', async () => {
    st().newFreeProject(28, 28, 'plates');
    act(() => st().setSource(source));
    render(<Stage />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(st().showUnderlay).toBe(true);
  });
});

describe('BuildMode (つくるモードのタップ・プレート・画面スリープ防止)', () => {
  function project(w = 56, h = 28) {
    st().newFreeProject(w, h, 'plates');
    st().beginStroke();
    st().paint([0, 1, 40], RED);
    st().endStroke(true);
  }

  it('ビーズをタップしてチェック (ビーズの無い所・プレートの外は無視)', () => {
    project();
    const { container } = render(<BuildMode />);
    const c = container.querySelector('canvas')!;
    // 28x28 を 400x300 (余白30) に表示: 1マス 8.57px
    const cell = (300 - 60) / 28;
    const ox = (400 - 28 * cell) / 2;
    const oy = 30;
    down(c, 1, ox + cell * 0.5, oy + cell * 0.5);
    up(c, 1, ox + cell * 0.5, oy + cell * 0.5);
    expect(st().project!.done[0]).toBe(1);
    down(c, 1, ox + cell * 5.5, oy + cell * 5.5);
    up(c, 1, ox + cell * 5.5, oy + cell * 5.5);
    down(c, 1, 2, 2);
    up(c, 1, 2, 2);
    expect(st().project!.done.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('大きく表示すると座標をすべて書く / プレートを切り替える / 拡大ボタン', async () => {
    rect.mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, width: 1200, height: 1200, right: 1200, bottom: 1200, toJSON: () => ({}) }) as DOMRect);
    project();
    render(<BuildMode />);
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText('プレート 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '拡大' }));
    await userEvent.click(screen.getByRole('button', { name: '縮小' }));
    await userEvent.click(screen.getByRole('button', { name: '全体を表示' }));
  });

  it('ビーズの無いプレートから始まる図案は、ビーズのあるプレートを最初に表示', () => {
    st().newFreeProject(56, 56, 'plates');
    st().beginStroke();
    st().paint([56 * 30 + 30], BLUE);
    st().endStroke(true);
    render(<BuildMode />);
    expect(screen.getByText('プレート 4')).toBeInTheDocument();
  });

  it('ビーズが1つも無ければプレート1', () => {
    st().newFreeProject(28, 28, 'plates');
    render(<BuildMode />);
    expect(screen.getByText('プレート 1')).toBeInTheDocument();
    expect(screen.getByText(/0% 完成/)).toBeInTheDocument();
  });

  it('画面をつけたままにする (できる / 失敗 / 解除)', async () => {
    project(28, 28);
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValueOnce({ release }).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    const { unmount } = render(<BuildMode />);
    await userEvent.click(screen.getByTitle('画面をつけたままにする'));
    expect(st().toast?.text).toBe('画面をつけたままにします');
    await userEvent.click(screen.getByTitle('画面をつけたままにする'));
    expect(release).toHaveBeenCalled();
    await userEvent.click(screen.getByTitle('画面をつけたままにする'));
    expect(st().toast?.text).toBe('画面をつけたままにできませんでした');
    unmount();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('解除しないまま閉じても片付ける', async () => {
    project(28, 28);
    const release = vi.fn().mockRejectedValue(new Error('x'));
    Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn().mockResolvedValue({ release }) }, configurable: true });
    const { unmount } = render(<BuildMode />);
    await userEvent.click(screen.getByTitle('画面をつけたままにする'));
    unmount();
    expect(release).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('全部置いた色は「完了」・チェックを全部消すのをやめる', async () => {
    project(28, 28);
    act(() => st().setDone([0, 1, 40], true));
    render(<BuildMode />);
    expect(screen.getByText('完了')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'チェックを全部消す' }));
    await answerConfirm('キャンセル');
    expect(st().project!.done[0]).toBe(1);
  });
});

describe('CropDialog (ドラッグ・ピンチ・ホイール)', () => {
  it('ドラッグで動かし、ピンチ・ホイールで拡大縮小', async () => {
    st().newImageProject(source);
    const before = st().project!.settings.crop;
    render(<CropDialog onClose={() => {}} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const box = document.querySelector('.crop-box')!;
    down(box, 1, 100, 100);
    move(box, 1, 140, 120);
    down(box, 2, 200, 100);
    move(box, 2, 260, 100);
    up(box, 2, 260, 100);
    move(box, 1, 150, 130);
    up(box, 1, 150, 130);
    // 押していない指の移動は無視
    move(box, 5, 10, 10);
    fireEvent.wheel(box, { deltaY: -300, clientX: 200, clientY: 150 });
    fireEvent.wheel(box, { deltaY: 300, clientX: -500, clientY: 900 });
    await userEvent.click(screen.getByRole('button', { name: /この位置にする/ }));
    const after = st().project!.settings.crop;
    expect(after).not.toEqual(before);
    expect(st().project!.settings.fit).toBe('custom');
  });
});

describe('BackgroundDialog (画像を読み込んでから・拡大して指定)', () => {
  // 100x100 の画像を 400x300 (余白12) に表示: 1画素 2.76px、左上 (62, 12)
  const tapAt = (canvas: Element, fx: number, fy: number) => {
    const x = 62 + 276 * fx;
    const y = 12 + 276 * fy;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: x, clientY: y });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: x, clientY: y });
  };
  const summary = () => document.querySelector('.badge-line.center')!.textContent!;

  it('タップで点を指定 (画像の外は無視)・1つ戻す・全部消す・赤で表示', async () => {
    const restore = opaqueCanvas([250, 250, 250]);
    st().newImageProject(source);
    render(<BackgroundDialog onClose={() => {}} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const canvas = document.querySelector('.bg-preview canvas')!;
    // 画像全体が同じ色 → 自動ですべて透明
    expect(summary()).toContain('100%');
    await userEvent.click(screen.getByLabelText('消える部分を赤で表示'));
    tapAt(canvas, 0.1, 0.1);
    tapAt(canvas, -0.1, 0.1);
    tapAt(canvas, 0.1, 1.2);
    expect(summary()).toContain('消す 1か所・残す 0か所');
    await userEvent.click(screen.getByRole('radio', { name: '残す' }));
    tapAt(canvas, 0.5, 0.5);
    expect(summary()).toContain('消す 1か所・残す 1か所');
    await userEvent.click(screen.getByRole('button', { name: /1つ戻す/ }));
    expect(summary()).toContain('消す 1か所・残す 0か所');
    await userEvent.click(screen.getByRole('button', { name: '点を全部消す' }));
    expect(summary()).not.toContain('指定:');
    await userEvent.click(screen.getByRole('radio', { name: '手動（タップした所）' }));
    expect(summary()).toContain('0%');
    restore();
  });

  it('拡大・縮小・全体表示ボタン、ドラッグで移動してもタップにならない、ダークモード', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    st().newImageProject(source);
    render(<BackgroundDialog onClose={() => {}} />);
    expect(screen.getByText(/画像を読み込んでいます/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '拡大' })).toBeDisabled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await userEvent.click(screen.getByRole('button', { name: '拡大' }));
    await userEvent.click(screen.getByRole('button', { name: '縮小' }));
    await userEvent.click(screen.getByRole('button', { name: '全体を表示' }));
    const canvas = document.querySelector('.bg-preview canvas')!;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 160, clientY: 140 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 160, clientY: 140 });
    expect(summary()).not.toContain('指定:');
    // ホイールで大きく拡大 (画素をくっきり表示)
    fireEvent(canvas, new WheelEvent('wheel', { deltaY: -2000, clientX: 200, clientY: 150, cancelable: true }));
  });
});
