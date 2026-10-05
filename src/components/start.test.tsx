// @vitest-environment jsdom
// 画像の読み込み・保存データを差し替えて、トップ画面・検索・ドラッグ&ドロップの流れを確認する
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceImage } from '../lib/image';

const importImage = vi.fn<(input: File | string, name?: string) => Promise<SourceImage>>();
vi.mock('../lib/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/image')>()),
  importImage: (input: File | string, name?: string) => importImage(input, name),
}));

const storage = {
  listProjectRecords: vi.fn(),
  loadProjectRecord: vi.fn(),
  saveProjectRecord: vi.fn(),
  deleteProjectRecord: vi.fn(),
};
vi.mock('../lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/storage')>()),
  listProjectRecords: () => storage.listProjectRecords(),
  loadProjectRecord: (id: string) => storage.loadProjectRecord(id),
  saveProjectRecord: (r: unknown) => storage.saveProjectRecord(r),
  deleteProjectRecord: (id: string) => storage.deleteProjectRecord(id),
}));

const { default: App } = await import('../App');
const { StartScreen } = await import('./StartScreen');
const { ProjectsDialog } = await import('./dialogs');
const { ImagePanel } = await import('./panels/ImagePanel');
const { ImageSearchDialog } = await import('./ImageSearchDialog');
const { useStore } = await import('../state/store');
const { createProject, serializeProject } = await import('../lib/project');
const st = () => useStore.getState();
const img = (name = '画像'): SourceImage => ({ dataUrl: 'data:image/png;base64,AAAA', width: 50, height: 40, name });

function record(name: string, thumbnail = '') {
  const p = createProject('free', 2, 2, null);
  p.name = name;
  return { id: p.id, name, createdAt: 1, updatedAt: 2, thumbnail, data: serializeProject(p) };
}

beforeEach(() => {
  st().closeProject();
  useStore.setState({ toast: null });
  importImage.mockReset();
  importImage.mockResolvedValue(img());
  storage.listProjectRecords.mockReset().mockResolvedValue([]);
  storage.loadProjectRecord.mockReset().mockResolvedValue(undefined);
  storage.saveProjectRecord.mockReset().mockResolvedValue(undefined);
  storage.deleteProjectRecord.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

const noop = () => {};

describe('トップ画面', () => {
  it('画像ファイルを選ぶと図案を作る / 失敗したら知らせる', async () => {
    const { container } = render(<StartScreen onOpenProjects={noop} onNewFree={noop} onHelp={noop} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await userEvent.upload(input, new File(['x'], 'a.png', { type: 'image/png' }));
    await waitFor(() => expect(st().project?.mode).toBe('image'));
    st().closeProject();
    importImage.mockRejectedValueOnce(new Error('こわれた画像'));
    await userEvent.upload(input, new File(['x'], 'b.png', { type: 'image/png' }));
    await waitFor(() => expect(st().toast?.text).toBe('こわれた画像'));
    importImage.mockRejectedValueOnce('not error');
    await userEvent.upload(input, new File(['x'], 'c.png', { type: 'image/png' }));
    await waitFor(() => expect(st().toast?.text).toBe('画像を読み込めませんでした'));
    // ファイルを選ばずに閉じた場合
    fireEvent.change(input, { target: { files: [] } });
  });

  it('「画像から作る」でファイル選択を開く', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<StartScreen onOpenProjects={noop} onNewFree={noop} onHelp={noop} />);
    await userEvent.click(screen.getByRole('button', { name: /画像から作る/ }));
    expect(click).toHaveBeenCalled();
  });

  it('サンプル: イラストは背景を自動で消す・写真風は消さない・失敗を知らせる', async () => {
    render(<StartScreen onOpenProjects={noop} onNewFree={noop} onHelp={noop} />);
    await userEvent.click(screen.getByRole('button', { name: /ねこ/ }));
    await waitFor(() => expect(st().project?.settings.bgMode).toBe('auto'));
    expect(st().project?.settings.resample).toBe('sharp');
    act(() => st().closeProject());
    await userEvent.click(screen.getByRole('button', { name: /ゆうやけ/ }));
    await waitFor(() => expect(st().project?.settings.resample).toBe('average'));
    expect(st().project?.settings.bgMode).toBe('off');
    act(() => st().closeProject());
    importImage.mockRejectedValueOnce(new Error('x'));
    await userEvent.click(screen.getByRole('button', { name: /いちご/ }));
    await waitFor(() => expect(st().toast?.text).toBe('サンプルを読み込めませんでした'));
  });

  it('読み込み中の表示', async () => {
    let resolve: (v: SourceImage) => void = () => {};
    importImage.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    render(<StartScreen onOpenProjects={noop} onNewFree={noop} onHelp={noop} />);
    await userEvent.click(screen.getByRole('button', { name: /ハート/ }));
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    await act(async () => resolve(img()));
  });

  it('「つづきから」: サムネイルあり/なし・開く・開けない', async () => {
    const a = record('図案A', 'data:image/png;base64,AA');
    const b = record('図案B');
    storage.listProjectRecords.mockResolvedValue([a, b]);
    render(<StartScreen onOpenProjects={noop} onNewFree={noop} onHelp={noop} />);
    expect(await screen.findByText('図案A')).toBeInTheDocument();
    expect(document.querySelector('.recent-list .recent-blank')).not.toBeNull();
    // 見つからない (消された) 場合は何もしない
    await userEvent.click(screen.getByText('図案B'));
    expect(st().project).toBeNull();
    storage.loadProjectRecord.mockResolvedValueOnce(a);
    await userEvent.click(screen.getByText('図案A'));
    await waitFor(() => expect(st().project?.name).toBe('図案A'));
    act(() => st().closeProject());
    storage.loadProjectRecord.mockResolvedValueOnce({ ...b, data: { app: 'x' } });
    await userEvent.click(screen.getByText('図案B'));
    await waitFor(() => expect(st().toast?.text).toMatch(/ファイルではありません/));
    storage.loadProjectRecord.mockRejectedValueOnce('?');
    await userEvent.click(screen.getByText('図案B'));
    await waitFor(() => expect(st().toast?.text).toBe('開けませんでした'));
  });

  it('保存データを読めなくてもトップ画面は表示する', async () => {
    storage.listProjectRecords.mockRejectedValue(new Error('no db'));
    render(<StartScreen onOpenProjects={noop} onNewFree={noop} onHelp={noop} />);
    await waitFor(() => expect(storage.listProjectRecords).toHaveBeenCalled());
    expect(screen.queryByText('つづきから')).toBeNull();
  });

  it('ネットの画像をさがす: 入力して検索 → 選んで作る / 閉じる', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ result_count: 1, results: [{ id: 'z1', title: 'ぞう', thumbnail: 'data:,', creator: 'C', license: 'by', license_version: '4.0' }] }),
          {
            status: 200,
          },
        ),
    );
    render(<StartScreen onOpenProjects={noop} onNewFree={noop} onHelp={noop} />);
    await userEvent.type(screen.getByPlaceholderText('例: ねこ、さくら、ケーキ'), 'ぞう');
    await userEvent.click(screen.getByRole('button', { name: 'さがす' }));
    await userEvent.click(await screen.findByTitle('ぞう / C'));
    await userEvent.click(screen.getByRole('button', { name: /この画像で作る/ }));
    await waitFor(() => expect(st().project?.mode).toBe('image'));
    expect(st().project?.source?.credit).toContain('ぞう');
    act(() => st().closeProject());
    await userEvent.click(screen.getByRole('button', { name: 'さがす' }));
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('画像検索ダイアログの細かな動き', () => {
  const result = (id: string, extra = {}) => ({
    id,
    title: `t${id}`,
    thumbnail: `https://ok/${id}#10x10`,
    creator: 'A',
    license: 'by',
    license_version: '2.0',
    ...extra,
  });

  it('大きい画像が読めなければ一覧用の画像で作る・どちらもだめならお知らせ', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ result_count: 2, results: [result('1'), result('2', { foreign_landing_url: 'https://e/2' })] })),
    );
    const onPicked = vi.fn();
    render(<ImageSearchDialog initialQuery="x" onClose={noop} onPicked={onPicked} />);
    await userEvent.click(await screen.findByTitle('t1 / A'));
    importImage.mockRejectedValueOnce(new Error('full')).mockResolvedValueOnce(img('t1'));
    await userEvent.click(screen.getByRole('button', { name: /この画像で作る/ }));
    await waitFor(() => expect(onPicked).toHaveBeenCalledWith(expect.objectContaining({ name: 't1', link: undefined })));
    await userEvent.click(screen.getByTitle('t2 / A'));
    expect(screen.getByRole('link', { name: '元のページ' })).toHaveAttribute('href', 'https://e/2');
    importImage.mockRejectedValueOnce(new Error('full')).mockRejectedValueOnce(new Error('thumb'));
    await userEvent.click(screen.getByRole('button', { name: /この画像で作る/ }));
    expect(await screen.findByText(/この画像は読み込めませんでした/)).toBeInTheDocument();
  });

  it('読み込み中は「読み込み中…」', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ result_count: 1, results: [result('1')] })));
    let resolve: (v: SourceImage) => void = () => {};
    importImage.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    render(<ImageSearchDialog initialQuery="x" onClose={noop} onPicked={noop} />);
    await userEvent.click(await screen.findByTitle('t1 / A'));
    await userEvent.click(screen.getByRole('button', { name: /この画像で作る/ }));
    expect(screen.getByRole('button', { name: /読み込み中/ })).toBeDisabled();
    await act(async () => resolve(img()));
  });

  it('一部だけ回数制限にかかったら注意を出す・検索中に件数を出す', async () => {
    const page = (p: number) => Array.from({ length: 20 }, (_, i) => result(`${p}-${i}`));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ result_count: 240, results: page(1) })))
      .mockImplementationOnce(async () => {
        await gate;
        return new Response('', { status: 429 });
      });
    render(<ImageSearchDialog initialQuery="x" onClose={noop} onPicked={noop} />);
    expect(await screen.findByText(/（20件）/)).toBeInTheDocument();
    await act(async () => release());
    expect(await screen.findByText(/一部の結果を読み込めませんでした/)).toBeInTheDocument();
  });

  it('新しい検索を始めたら前の検索の結果は使わない', async () => {
    let releaseFirst: () => void = () => {};
    const gate = new Promise<void>((r) => (releaseFirst = r));
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => {
        await gate;
        return new Response(JSON.stringify({ result_count: 1, results: [result('old')] }));
      })
      .mockImplementation(async () => new Response(JSON.stringify({ result_count: 1, results: [result('new')] })));
    render(<ImageSearchDialog initialQuery="first" onClose={noop} onPicked={noop} />);
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    const input = screen.getByLabelText('検索するキーワード');
    await userEvent.clear(input);
    await userEvent.type(input, 'second{Enter}');
    expect(await screen.findByTitle('tnew / A')).toBeInTheDocument();
    await act(async () => releaseFirst());
    expect(screen.queryByTitle('told / A')).toBeNull();
  });

  it('検索ワードが空なら何もしない / 種類を変えても検索しない', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    render(<ImageSearchDialog onClose={noop} onPicked={noop} />);
    fireEvent.submit(screen.getByRole('search'));
    await userEvent.click(screen.getByRole('radio', { name: '写真' }));
    expect(f).not.toHaveBeenCalled();
  });

  it('中止されたら何も表示しない', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('aborted', 'AbortError'));
    render(<ImageSearchDialog initialQuery="x" onClose={noop} onPicked={noop} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('マイ図案ダイアログの細かな動き', () => {
  it('一覧を読めない・開けない・消された図案・削除をやめる', async () => {
    storage.listProjectRecords.mockRejectedValueOnce(new Error('x'));
    const { unmount } = render(<ProjectsDialog onClose={noop} onNewImage={noop} onNewFree={noop} />);
    expect(await screen.findByText(/保存した図案はまだありません/)).toBeInTheDocument();
    unmount();

    const a = record('図案A', 'data:image/png;base64,AA');
    storage.listProjectRecords.mockResolvedValue([a]);
    render(<ProjectsDialog onClose={noop} onNewImage={noop} onNewFree={noop} />);
    expect(await screen.findByText('図案A')).toBeInTheDocument();
    expect(document.querySelector('.project-list img')).not.toBeNull();
    // 消された図案は開けない・コピーできない
    await userEvent.click(screen.getByText('図案A'));
    await userEvent.click(screen.getByRole('button', { name: '図案Aをコピー' }));
    expect(storage.saveProjectRecord).not.toHaveBeenCalled();
    storage.loadProjectRecord.mockRejectedValueOnce(new Error('壊れています'));
    await userEvent.click(screen.getByText('図案A'));
    await waitFor(() => expect(st().toast?.text).toBe('壊れています'));
    storage.loadProjectRecord.mockRejectedValueOnce('?');
    await userEvent.click(screen.getByText('図案A'));
    await waitFor(() => expect(st().toast?.text).toBe('開けませんでした'));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: '図案Aを削除' }));
    expect(storage.deleteProjectRecord).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /画像から新しく作る/ }));
    await userEvent.click(screen.getByRole('button', { name: /白紙から作る/ }));
  });
});

describe('画像パネル: ファイル・ネットから画像を変える', () => {
  it('画像モード / フリーモード (下絵) / 失敗', async () => {
    st().newImageProject(img('元'));
    const { container, rerender } = render(<ImagePanel />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    importImage.mockResolvedValueOnce(img('新しい画像'));
    await userEvent.upload(input, new File(['x'], 'n.png', { type: 'image/png' }));
    await waitFor(() => expect(st().toast?.text).toBe('画像を読み込みました'));
    importImage.mockRejectedValueOnce(new Error('だめ'));
    await userEvent.upload(input, new File(['x'], 'n.png', { type: 'image/png' }));
    await waitFor(() => expect(st().toast?.text).toBe('だめ'));
    importImage.mockRejectedValueOnce(0);
    await userEvent.upload(input, new File(['x'], 'n.png', { type: 'image/png' }));
    await waitFor(() => expect(st().toast?.text).toBe('画像を読み込めませんでした'));
    act(() => st().newFreeProject(28, 28, 'plates'));
    rerender(<ImagePanel />);
    expect(screen.getByText('画像が選ばれていません。')).toBeInTheDocument();
    await userEvent.upload(container.querySelector('input[type=file]') as HTMLInputElement, new File(['x'], 'u.png', { type: 'image/png' }));
    await waitFor(() => expect(st().toast?.text).toBe('下絵を読み込みました'));
  });

  it('ネットで探した画像に変える (画像モード・フリーモード)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response(JSON.stringify({ result_count: 1, results: [{ id: 'q', title: 'きりん', thumbnail: 'data:,', creator: 'K', license: 'cc0' }] })),
    );
    st().newImageProject(img());
    const { rerender } = render(<ImagePanel />);
    for (const mode of ['image', 'free'] as const) {
      if (mode === 'free') {
        act(() => st().newFreeProject(28, 28, 'plates'));
        rerender(<ImagePanel />);
      }
      await userEvent.click(screen.getByRole('button', { name: /ネットでさがす/ }));
      await userEvent.type(screen.getByLabelText('検索するキーワード'), 'きりん{Enter}');
      await userEvent.click(await screen.findByTitle('きりん / K'));
      importImage.mockResolvedValueOnce(img('きりん'));
      await userEvent.click(screen.getByRole('button', { name: /この画像で作る/ }));
      await waitFor(() => expect(st().project?.source?.name).toBe('きりん'));
    }
    await userEvent.click(screen.getByRole('button', { name: /ネットでさがす/ }));
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
  });
});

describe('自動保存の失敗', () => {
  it('保存に失敗しても止まらず、コンソールに知らせる', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.saveProjectRecord.mockRejectedValue(new Error('disk full'));
    render(<App />);
    act(() => st().newFreeProject(2, 2, 'beads'));
    await waitFor(() => expect(warn).toHaveBeenCalledWith('保存できませんでした', expect.any(Error)), { timeout: 3000 });
  });
});

describe('アプリ全体: ドラッグ&ドロップ・貼り付け・トースト', () => {
  const dataTransfer = (files: File[], types = ['Files']) => ({ types, files });

  it('画像をドロップすると新しい図案 (画像以外・ファイル以外は無視)', async () => {
    render(<App />);
    fireEvent.dragOver(window, { dataTransfer: dataTransfer([]) });
    expect(screen.getByText('ここに画像をドロップ')).toBeInTheDocument();
    fireEvent.dragLeave(window, { relatedTarget: document.body });
    fireEvent.dragLeave(window, { relatedTarget: null });
    expect(screen.queryByText('ここに画像をドロップ')).toBeNull();
    fireEvent.dragOver(window, { dataTransfer: dataTransfer([], ['text/plain']) });
    fireEvent.dragOver(window, {});
    expect(screen.queryByText('ここに画像をドロップ')).toBeNull();
    fireEvent.drop(window, { dataTransfer: dataTransfer([], ['text/plain']) });
    fireEvent.drop(window, { dataTransfer: dataTransfer([new File(['x'], 'a.txt', { type: 'text/plain' })]) });
    expect(importImage).not.toHaveBeenCalled();
    fireEvent.drop(window, { dataTransfer: dataTransfer([new File(['x'], 'a.png', { type: 'image/png' })]) });
    await waitFor(() => expect(st().project?.mode).toBe('image'));
  });

  it('画像を貼り付けると新しい図案 (入力欄では普通に貼り付け)', async () => {
    render(<App />);
    const file = new File(['x'], 'p.png', { type: 'image/png' });
    const paste = (target: EventTarget, files: File[]) => {
      const e = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
      e.clipboardData = { files };
      target.dispatchEvent(e);
      return e;
    };
    paste(screen.getByPlaceholderText('例: ねこ、さくら、ケーキ'), [file]);
    paste(window, []);
    expect(importImage).not.toHaveBeenCalled();
    const e = paste(window, [file]);
    expect(e.defaultPrevented).toBe(true);
    await waitFor(() => expect(st().project?.mode).toBe('image'));
    // 読み込めなかったとき
    importImage.mockRejectedValueOnce(new Error('ペースト失敗'));
    paste(window, [file]);
    await waitFor(() => expect(st().toast?.text).toBe('ペースト失敗'));
    importImage.mockRejectedValueOnce(1);
    paste(window, [file]);
    await waitFor(() => expect(st().toast?.text).toBe('画像を読み込めませんでした'));
  });

  it('トーストは時間がたつと消える (操作つきは長め)・操作ボタン', async () => {
    vi.useFakeTimers();
    render(<App />);
    act(() => st().showToast('こんにちは'));
    expect(screen.getByRole('status')).toHaveTextContent('こんにちは');
    act(() => vi.advanceTimersByTime(3300));
    expect(screen.queryByText('こんにちは')).toBeNull();
    const run = vi.fn();
    act(() => st().showToast('もどせます', { label: '元に戻す', run }));
    act(() => vi.advanceTimersByTime(3300));
    expect(screen.getByText('もどせます')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }));
    expect(run).toHaveBeenCalled();
    expect(screen.queryByText('もどせます')).toBeNull();
    vi.useRealTimers();
  });

  it('キーボード: 入力中・ダイアログ表示中・図案が無いときは無視', async () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    act(() => {
      st().newFreeProject(2, 2, 'beads');
      st().beginStroke();
      st().paint([0], 3);
      st().endStroke(true);
    });
    fireEvent.keyDown(screen.getByLabelText('図案の名前'), { key: 'z', ctrlKey: true });
    expect(st().cells[0]).toBe(3);
    await userEvent.click(screen.getByRole('button', { name: '使い方' }));
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(st().cells[0]).toBe(3);
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    // 編集タブ以外では道具のキーは効かない・知らないキー・Alt付き
    act(() => st().setTab('chart'));
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'q' });
    act(() => st().setTab('edit'));
    fireEvent.keyDown(window, { key: 'e', altKey: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(st().tool).not.toBe('fill');
  });

  it('マイ図案から画像で新しく作る / 白紙から作る / つくるモード', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'マイ図案' }));
    await userEvent.click(await screen.findByRole('button', { name: /画像から新しく作る/ }));
    expect(click).toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'マイ図案' })).getByRole('button', { name: /白紙から作る/ }));
    expect(screen.getByRole('dialog', { name: /白紙から作る/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    await userEvent.click(screen.getByRole('button', { name: /^使い方$/ }));
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    act(() => {
      st().newFreeProject(2, 2, 'beads');
      st().fillAt(0, 0, 3);
      st().setUi({ buildMode: true });
    });
    expect(screen.getByRole('dialog', { name: 'つくるモード' })).toBeInTheDocument();
    // フリーモードで「色」タブが選ばれていたら編集タブを表示 / パネルの開閉ボタン
    act(() => useStore.setState({ tab: 'color', buildMode: false }));
    expect(screen.getByRole('tab', { name: /編集/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: '設定をたたむ' }));
    expect(st().sheetOpen).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: '設定をひらく' }));
    // 画像タブ・サイズタブ
    await userEvent.click(screen.getByRole('tab', { name: /下絵/ }));
    await userEvent.click(screen.getByRole('tab', { name: /サイズ/ }));
    // マイ図案を保存パネルから開く
    await userEvent.click(screen.getByRole('tab', { name: /保存/ }));
    await userEvent.click(screen.getByRole('button', { name: /マイ図案を開く/ }));
    expect(await screen.findByRole('dialog', { name: 'マイ図案' })).toBeInTheDocument();
  });

  it('マイ図案から画像を選ぶとダイアログを閉じて新しい図案', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'マイ図案' }));
    const inputs = document.querySelectorAll('input[type=file]');
    await userEvent.upload(inputs[0] as HTMLInputElement, new File(['x'], 'm.png', { type: 'image/png' }));
    await waitFor(() => expect(st().project?.mode).toBe('image'));
    expect(screen.queryByRole('dialog', { name: 'マイ図案' })).toBeNull();
  });
});
