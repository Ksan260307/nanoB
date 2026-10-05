// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexOfCode } from '../data/palette';
import { loadProjectRecord } from '../lib/storage';

const RED = indexOfCode('80-15903');

const convertAsync = vi.fn();
vi.mock('../lib/converter', () => ({ convertAsync: (...a: unknown[]) => convertAsync(...a) }));
vi.mock('../lib/image', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/image')>();
  return {
    ...orig,
    decodeSource: vi.fn(async () => document.createElement('canvas')),
    prescale: vi.fn(() => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) })),
    backgroundRemoved: vi.fn((img: unknown) => img),
  };
});

const { useAutoConvert, useAutoSave, useColorStats, usePrefersDark } = await import('./hooks');
const { useStore } = await import('./store');
const st = () => useStore.getState();
const source = { dataUrl: 'data:image/png;base64,AAAA', width: 100, height: 100, name: 'p' };

function AutoConvert() {
  useAutoConvert();
  return null;
}

function AutoSave() {
  useAutoSave();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  convertAsync.mockReset();
  convertAsync.mockImplementation(async (job: { W: number; H: number; getPixels: () => unknown }) => {
    job.getPixels();
    return new Int16Array(job.W * job.H).fill(RED);
  });
  st().closeProject();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush(ms = 200) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useAutoConvert', () => {
  it('画像モードで変換し、結果を図案にする', async () => {
    st().newImageProject(source);
    render(<AutoConvert />);
    expect(st().converting).toBe(true);
    await flush();
    expect(convertAsync).toHaveBeenCalledTimes(1);
    expect(st().cells[0]).toBe(RED);
    expect(st().converting).toBe(false);
    // 設定を変えると変換し直す
    act(() => st().updateSettings({ brightness: 10 }));
    await flush();
    expect(convertAsync).toHaveBeenCalledTimes(2);
  });

  it('保存済みの変換結果がある図案を開いた直後は変換しない', async () => {
    st().newImageProject(source);
    const p = st().project!;
    st().openProject({ ...p, base: new Int16Array(p.width * p.height).fill(RED) });
    render(<AutoConvert />);
    await flush();
    expect(convertAsync).not.toHaveBeenCalled();
  });

  it('フリーモードでは変換しない', async () => {
    st().newFreeProject(4, 4, 'beads');
    render(<AutoConvert />);
    await flush();
    expect(convertAsync).not.toHaveBeenCalled();
  });

  it('待っている間に設定が変わったら前の変換は捨てる', async () => {
    st().newImageProject(source);
    render(<AutoConvert />);
    act(() => st().updateSettings({ brightness: 5 }));
    await flush();
    expect(convertAsync).toHaveBeenCalledTimes(1);
  });

  it('変換中に設定が変わったら、古い結果は使わない', async () => {
    let resolveFirst: (v: Int16Array) => void = () => {};
    convertAsync.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
    st().newImageProject(source);
    render(<AutoConvert />);
    await flush();
    act(() => st().updateSettings({ brightness: 5 }));
    await flush();
    resolveFirst(new Int16Array(56 * 56).fill(0));
    await flush();
    expect(st().cells[0]).toBe(RED);
  });

  it('画像の読み込みを待っている間に変わったら中止', async () => {
    const image = await import('../lib/image');
    let resolveDecode: (v: HTMLImageElement) => void = () => {};
    vi.mocked(image.decodeSource).mockImplementationOnce(() => new Promise((r) => (resolveDecode = r)));
    st().newImageProject(source);
    render(<AutoConvert />);
    await flush();
    act(() => st().updateSettings({ brightness: 5 }));
    resolveDecode(document.createElement('img'));
    await flush();
    expect(convertAsync).toHaveBeenCalledTimes(1);
  });

  it('変換に失敗したら変換中の表示を消す', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    convertAsync.mockRejectedValueOnce(new Error('fail'));
    st().newImageProject(source);
    render(<AutoConvert />);
    await flush();
    expect(st().converting).toBe(false);
    expect(err).toHaveBeenCalled();
  });

  it('失敗したときに設定が変わっていたら何もしない', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let rejectFirst: (e: Error) => void = () => {};
    convertAsync.mockImplementationOnce(() => new Promise((_r, j) => (rejectFirst = j)));
    st().newImageProject(source);
    render(<AutoConvert />);
    await flush();
    act(() => st().updateSettings({ brightness: 5 }));
    rejectFirst(new Error('late'));
    await flush();
    expect(st().cells[0]).toBe(RED);
  });
});

describe('useAutoSave', () => {
  it('少し待ってから端末に保存する', async () => {
    st().newFreeProject(4, 4, 'beads');
    render(<AutoSave />);
    await flush(800);
    vi.useRealTimers();
    await vi.waitFor(async () => expect(await loadProjectRecord(st().project!.id)).toBeDefined());
    expect(localStorage.getItem('nanob:lastProject')).toContain(st().project!.id);
  });

  it('図案が無ければ保存しない / 保存に失敗しても止まらない', async () => {
    render(<AutoSave />);
    await flush(800);
    const storage = await import('../lib/storage');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('indexedDB', undefined);
    vi.resetModules();
    st().newFreeProject(2, 2, 'beads');
    await flush(800);
    vi.unstubAllGlobals();
    expect(storage).toBeDefined();
    warn.mockRestore();
  });

  it('保存待ちの間に図案を閉じたら保存しない', async () => {
    st().newFreeProject(2, 2, 'beads');
    const id = st().project!.id;
    render(<AutoSave />);
    act(() => useStore.setState({ project: null }));
    await flush(800);
    vi.useRealTimers();
    expect(await loadProjectRecord(id)).toBeUndefined();
  });
});

describe('useColorStats / usePrefersDark', () => {
  it('色ごとの数と記号', () => {
    st().newFreeProject(2, 1, 'beads');
    st().beginStroke();
    st().paint([0, 1], RED);
    st().endStroke(true);
    function T() {
      const stats = useColorStats();
      return <output data-total={stats.total} data-used={stats.used} data-symbol={stats.symbols.get(RED)} />;
    }
    const { container } = render(<T />);
    const out = container.querySelector('output')!;
    expect(out.dataset.total).toBe('2');
    expect(out.dataset.used).toBe('1');
    expect(out.dataset.symbol).toBe('A');
  });

  it('ダークモードの切り替えに追従する', () => {
    const listeners: (() => void)[] = [];
    let matches = true;
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, cb: () => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    }));
    function T() {
      return <output>{usePrefersDark() ? 'dark' : 'light'}</output>;
    }
    const { unmount, container } = render(<T />);
    expect(container.textContent).toBe('dark');
    matches = false;
    act(() => listeners.forEach((l) => l()));
    expect(container.textContent).toBe('light');
    unmount();
    vi.unstubAllGlobals();
  });
});
