// @vitest-environment jsdom
// マイ図案 (さがす・並べかえ・名前の変更・えらんで削除/書き出し・バックアップ)、
// トップ画面・保存タブからの削除、確認ダイアログ、編集パネルの対称・移動
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexOfCode } from '../data/palette';
import type { Project } from '../lib/project';
import { answerConfirm } from '../test/dialog';

const downloadBlob = vi.fn<(blob: Blob, name: string) => void>();
vi.mock('../lib/exporters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/exporters')>()),
  downloadBlob: (blob: Blob, name: string) => downloadBlob(blob, name),
}));

/** 次に呼ばれたときだけ失敗させる (それ以外は本物を呼ぶ) */
const fail = vi.hoisted(() => ({ name: '', error: undefined as unknown }));
vi.mock('../state/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../state/library')>();
  const guard =
    <A extends unknown[], R>(name: string, fn: (...a: A) => Promise<R>) =>
    (...a: A): Promise<R> => {
      if (fail.name === name) {
        fail.name = '';
        return Promise.reject(fail.error);
      }
      return fn(...a);
    };
  return {
    ...actual,
    deleteProjects: guard('deleteProjects', actual.deleteProjects),
    duplicateProject: guard('duplicateProject', actual.duplicateProject),
    renameProject: guard('renameProject', actual.renameProject),
    exportBackup: guard('exportBackup', actual.exportBackup),
    importFile: guard('importFile', actual.importFile),
  };
});

const { default: App } = await import('../App');
const { ProjectsDialog } = await import('./dialogs');
const { StartScreen } = await import('./StartScreen');
const { ExportPanel } = await import('./panels/ExportPanel');
const { EditPanel } = await import('./panels/EditPanel');
const { useConfirm } = await import('./confirm');
const { Modal } = await import('./ui');
const { useStore } = await import('../state/store');
const { projectRecord } = await import('../state/library');
const { createProject, serializeProject } = await import('../lib/project');
const { deleteProjectRecord, listProjectRecords, loadPref, saveProjectRecord } = await import('../lib/storage');

const RED = indexOfCode('80-15903');
const st = () => useStore.getState();
const noop = () => {};

function makeProject(name: string, opts: { created?: number; updated?: number; beads?: number; placed?: number } = {}): Project {
  const p = createProject('free', 10, 10, null);
  p.name = name;
  p.createdAt = opts.created ?? 1;
  p.updatedAt = opts.updated ?? 1;
  for (let i = 0; i < (opts.beads ?? 1); i++) p.overlay[i] = RED;
  for (let i = 0; i < (opts.placed ?? 0); i++) p.done[i] = 1;
  return p;
}

async function seed(name: string, opts: Parameters<typeof makeProject>[1] = {}) {
  const p = makeProject(name, opts);
  await saveProjectRecord(projectRecord(p));
  return p;
}

/** 一覧に出ている図案の名前 (上から) */
const listed = () => [...document.querySelectorAll('.project-list .project-meta strong')].map((s) => s.textContent);

function failNext(name: string, error: unknown = new Error('x')) {
  fail.name = name;
  fail.error = error;
}

const jsonFile = (data: unknown, name = 'a.json') => new File([JSON.stringify(data)], name, { type: 'application/json' });

beforeEach(async () => {
  st().closeProject();
  useStore.setState({ toast: null, symmetry: 'none' });
  for (const r of await listProjectRecords()) await deleteProjectRecord(r.id);
  downloadBlob.mockReset();
  fail.name = '';
  localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe('マイ図案', () => {
  it('名前でさがす・並べかえ・編集中と進み具合・開いている図案はそのまま', async () => {
    await seed('ネコの図案', { created: 1, updated: 300 });
    const dog = await seed('いぬ', { created: 3, updated: 100 });
    await seed('Apple', { created: 2, updated: 200, beads: 20, placed: 9 });
    st().openProject(dog);
    const onClose = vi.fn();
    render(<ProjectsDialog onClose={onClose} onNewImage={noop} onNewFree={noop} />);
    await waitFor(() => expect(listed()).toEqual(['ネコの図案', 'Apple', 'いぬ']));
    expect(screen.getByText('3件の図案を保存しています')).toBeInTheDocument();
    expect(screen.getByText('編集中')).toBeInTheDocument();
    expect(screen.getByText('45% 完成')).toBeInTheDocument();
    expect(screen.getByText('10×10・1色・20個')).toBeInTheDocument();
    // さがす (カタカナとひらがなは同じ)
    const search = screen.getByLabelText('図案を名前でさがす');
    await userEvent.type(search, 'ねこ');
    expect(listed()).toEqual(['ネコの図案']);
    expect(screen.getByText('1件見つかりました（全3件）')).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(screen.getByText('「zzz」に合う図案はありません。')).toBeInTheDocument();
    await userEvent.clear(search);
    // 並べかえ (次に開いたときも同じ順)
    await userEvent.click(screen.getByRole('radio', { name: '名前順' }));
    expect(listed()).toEqual(['ネコの図案', 'Apple', 'いぬ'].sort((a, b) => a.localeCompare(b, 'ja')));
    await userEvent.click(screen.getByRole('radio', { name: '作った順' }));
    expect(listed()).toEqual(['いぬ', 'Apple', 'ネコの図案']);
    expect(screen.getAllByText(/^作成 /)).toHaveLength(3);
    expect(loadPref('librarySort', '')).toBe('created');
    // 開いている図案を押すと、読み込み直さずに閉じる
    st().setName('保存前の名前');
    await userEvent.click(screen.getByText('いぬ'));
    expect(onClose).toHaveBeenCalled();
    expect(st().project?.name).toBe('保存前の名前');
  });

  it('えらんで書き出す・削除する・やめる', async () => {
    await seed('A', { updated: 3 });
    await seed('B', { updated: 2 });
    await seed('C', { updated: 1 });
    render(<ProjectsDialog onClose={noop} onNewImage={noop} onNewFree={noop} />);
    await waitFor(() => expect(listed()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: /えらんで削除・書き出し/ }));
    // えらぶモードでは、押すと選ぶ (開かない)・名前の変更などは出さない
    expect(screen.queryByRole('button', { name: 'Aを削除' })).toBeNull();
    const item = (name: string) => screen.getByText(name).closest('button')!;
    await userEvent.click(item('A'));
    await userEvent.click(item('B'));
    await userEvent.click(item('B'));
    expect(item('A')).toHaveAttribute('aria-pressed', 'true');
    expect(item('B')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('1件えらんでいます')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'すべてえらぶ' }));
    expect(screen.getByText('3件えらんでいます')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'えらぶのを解除' }));
    expect(screen.getByRole('button', { name: '書き出す' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^削除$/ })).toBeDisabled();
    // 書き出す
    await userEvent.click(item('C'));
    await userEvent.click(screen.getByRole('button', { name: '書き出す' }));
    await waitFor(() => expect(st().toast?.text).toBe('1件の図案をファイルに書き出しました'));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/えらんでいます/)).toBeNull();
    // 削除する
    await userEvent.click(screen.getByRole('button', { name: /えらんで削除・書き出し/ }));
    await userEvent.click(item('A'));
    await userEvent.click(item('C'));
    await userEvent.click(screen.getByRole('button', { name: /^削除$/ }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('えらんだ2件の図案を削除しますか？');
    await answerConfirm('削除する');
    await waitFor(() => expect(listed()).toEqual(['B']));
    expect(st().toast?.text).toBe('2件の図案を削除しました');
    // やめる
    await userEvent.click(screen.getByRole('button', { name: /えらんで削除・書き出し/ }));
    await userEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(screen.getByRole('button', { name: /えらんで削除・書き出し/ })).toBeInTheDocument();
  });

  it('編集中の図案を削除するときは、閉じることを知らせる', async () => {
    const p = await seed('編集中の図案');
    st().openProject(p);
    render(<ProjectsDialog onClose={noop} onNewImage={noop} onNewFree={noop} />);
    await userEvent.click(await screen.findByRole('button', { name: '編集中の図案を削除' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('いま編集中の図案も閉じます。');
    await answerConfirm('削除する');
    await waitFor(() => expect(st().project).toBeNull());
  });

  it('名前を変える (Enter・Esc・空欄・同じ名前・ほかの所をタップ)', async () => {
    await seed('A');
    const onClose = vi.fn();
    render(<ProjectsDialog onClose={onClose} onNewImage={noop} onNewFree={noop} />);
    const rename = async () => {
      await userEvent.click(await screen.findByRole('button', { name: /の名前を変える$/ }));
      return screen.getByLabelText('新しい名前') as HTMLInputElement;
    };
    let input = await rename();
    expect(input.value).toBe('A');
    await userEvent.clear(input);
    await userEvent.type(input, 'ぴかぴか{Enter}');
    await waitFor(() => expect(listed()).toEqual(['ぴかぴか']));
    expect(st().toast?.text).toBe('名前を変えました');
    // Esc はやめるだけ (マイ図案は閉じない)
    input = await rename();
    await userEvent.type(input, 'x{Escape}');
    expect(screen.queryByLabelText('新しい名前')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(listed()).toEqual(['ぴかぴか']);
    // 空欄・同じ名前は変えない
    useStore.setState({ toast: null });
    input = await rename();
    await userEvent.clear(input);
    fireEvent.blur(input);
    input = await rename();
    await userEvent.type(input, '{Enter}');
    expect(st().toast).toBeNull();
    // ほかの所をタップしても決まる
    input = await rename();
    await userEvent.clear(input);
    await userEvent.type(input, 'きらきら');
    fireEvent.blur(input);
    await waitFor(() => expect(listed()).toEqual(['きらきら']));
    // Enter のすぐあとに外れても、1回だけ決める
    input = await rename();
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.blur(input);
    });
    expect(screen.queryByLabelText('新しい名前')).toBeNull();
  });

  it('コピー・失敗したときのお知らせ', async () => {
    await seed('A');
    render(<ProjectsDialog onClose={noop} onNewImage={noop} onNewFree={noop} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aをコピー' }));
    await waitFor(() => expect(listed()).toContain('A のコピー'));
    expect(st().toast?.text).toBe('コピーしました');
    failNext('duplicateProject');
    await userEvent.click(screen.getByRole('button', { name: 'Aをコピー' }));
    await waitFor(() => expect(st().toast?.text).toBe('コピーできませんでした'));
    failNext('renameProject');
    await userEvent.click(screen.getByRole('button', { name: 'Aの名前を変える' }));
    await userEvent.type(screen.getByLabelText('新しい名前'), 'B{Enter}');
    await waitFor(() => expect(st().toast?.text).toBe('名前を変えられませんでした'));
    failNext('deleteProjects');
    await userEvent.click(screen.getByRole('button', { name: 'Aを削除' }));
    await answerConfirm('削除する');
    await waitFor(() => expect(st().toast?.text).toBe('削除できませんでした'));
    failNext('exportBackup');
    await userEvent.click(screen.getByRole('button', { name: /すべてファイルに書き出す/ }));
    await waitFor(() => expect(st().toast?.text).toBe('書き出しに失敗しました'));
  });

  it('バックアップ: すべて書き出す・ファイルから読み込む', async () => {
    await seed('A');
    await seed('B');
    render(<ProjectsDialog onClose={noop} onNewImage={noop} onNewFree={noop} />);
    await waitFor(() => expect(listed()).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: /すべてファイルに書き出す/ }));
    await waitFor(() => expect(st().toast?.text).toBe('2件の図案をファイルに書き出しました'));
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    await userEvent.click(screen.getByRole('button', { name: /ファイルから読み込む/ }));
    expect(click).toHaveBeenCalled();
    const input = screen.getByTestId('library-import') as HTMLInputElement;
    // バックアップ
    const backup = { app: 'nanobeads-pattern-maker', kind: 'backup', version: 1, exportedAt: 1, projects: [projectRecord(makeProject('バックアップの図案'))] };
    await userEvent.upload(input, jsonFile(backup));
    await waitFor(() => expect(st().toast?.text).toBe('1件の図案を読み込みました'));
    await waitFor(() => expect(listed()).toContain('バックアップの図案'));
    // 1つの図案
    await userEvent.upload(input, jsonFile(serializeProject(makeProject('1つの図案'))));
    await waitFor(() => expect(st().toast?.text).toBe('「1つの図案」を読み込みました'));
    await waitFor(() => expect(listed()).toHaveLength(4));
    // 壊れたファイル・失敗
    await userEvent.upload(input, new File(['{'], 'x.json', { type: 'application/json' }));
    await waitFor(() => expect(st().toast?.text).toBe('ファイルが壊れているため読み込めませんでした'));
    failNext('importFile', 'not error');
    await userEvent.upload(input, jsonFile({}));
    await waitFor(() => expect(st().toast?.text).toBe('読み込めませんでした'));
    // ファイルを選ばずに閉じた
    fireEvent.change(input, { target: { files: [] } });
  });

  it('Esc は一番上のダイアログだけを閉じる', async () => {
    await seed('A');
    const onClose = vi.fn();
    render(<ProjectsDialog onClose={onClose} onNewImage={noop} onNewFree={noop} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aを削除' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('確認ダイアログ', () => {
  function Asker({ onAnswer }: { onAnswer: (ok: boolean) => void }) {
    const [ask, ui] = useConfirm();
    return (
      <>
        <button onClick={async () => onAnswer(await ask({ title: 'たしかめる', message: '本当に？', ok: 'はい' }))}>聞く</button>
        {ui}
      </>
    );
  }

  it('はい・キャンセル・閉じるボタン・背景をタップ', async () => {
    const onAnswer = vi.fn();
    render(<Asker onAnswer={onAnswer} />);
    await userEvent.click(screen.getByRole('button', { name: '聞く' }));
    const dialog = screen.getByRole('alertdialog', { name: 'たしかめる' });
    expect(dialog).toHaveAccessibleDescription('本当に？');
    expect(within(dialog).getByRole('button', { name: 'はい' })).toHaveClass('btn-primary');
    await answerConfirm('はい');
    expect(onAnswer).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: '聞く' }));
    await answerConfirm('閉じる');
    expect(onAnswer).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: '聞く' }));
    fireEvent.pointerDown(document.querySelector('.modal-backdrop')!);
    await waitFor(() => expect(onAnswer).toHaveBeenCalledTimes(3));
    expect(onAnswer).toHaveBeenLastCalledWith(false);
  });

  it('ふつうのダイアログは dialog の役割', () => {
    render(
      <Modal title="ふつう" onClose={noop}>
        中身
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'ふつう' })).not.toHaveAttribute('aria-describedby');
  });
});

describe('トップ画面の「つづきから」', () => {
  it('削除 (やめる・削除する・失敗)・すべて見る', async () => {
    for (let i = 1; i <= 5; i++) await seed(`図案${i}`, { updated: i });
    const onOpenProjects = vi.fn();
    render(<StartScreen onOpenProjects={onOpenProjects} onNewFree={noop} onHelp={noop} />);
    await userEvent.click(await screen.findByRole('button', { name: 'すべて見る（5件）' }));
    expect(onOpenProjects).toHaveBeenCalled();
    expect(document.querySelectorAll('.recent-item')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: '図案5を削除' }));
    await answerConfirm('キャンセル');
    expect(await listProjectRecords()).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: '図案5を削除' }));
    await answerConfirm('削除する');
    await waitFor(() => expect(screen.getByRole('button', { name: 'マイ図案で管理' })).toBeInTheDocument());
    expect(st().toast?.text).toBe('「図案5」を削除しました');
    failNext('deleteProjects');
    await userEvent.click(screen.getByRole('button', { name: '図案4を削除' }));
    await answerConfirm('削除する');
    await waitFor(() => expect(st().toast?.text).toBe('削除できませんでした'));
  });
});

describe('保存タブ', () => {
  it('この図案を削除 (やめる・削除する・失敗)', async () => {
    const p = await seed('保存タブの図案');
    st().openProject(p, 'save');
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /この図案を削除/ }));
    await answerConfirm('キャンセル');
    expect(st().project).not.toBeNull();
    failNext('deleteProjects');
    await userEvent.click(screen.getByRole('button', { name: /この図案を削除/ }));
    await answerConfirm('削除する');
    await waitFor(() => expect(st().toast?.text).toBe('削除できませんでした'));
    await userEvent.click(screen.getByRole('button', { name: /この図案を削除/ }));
    await answerConfirm('削除する');
    await waitFor(() => expect(st().project).toBeNull());
    expect(await listProjectRecords()).toHaveLength(0);
  });

  it('ファイルから読み込む: バックアップはマイ図案に加える / 失敗', async () => {
    st().newFreeProject(4, 4, 'beads');
    const { container } = render(<ExportPanel onOpenProjects={noop} />);
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    const backup = { app: 'nanobeads-pattern-maker', kind: 'backup', version: 1, exportedAt: 1, projects: [projectRecord(makeProject('X'))] };
    await userEvent.upload(input, jsonFile(backup));
    await waitFor(() => expect(st().toast?.text).toBe('1件の図案を読み込みました'));
    failNext('importFile', 0);
    await userEvent.upload(input, jsonFile({}));
    await waitFor(() => expect(st().toast?.text).toBe('読み込めませんでした'));
  });
});

describe('編集パネル: 対称に描く・図案を動かす', () => {
  it('対称の向きをえらぶ', async () => {
    st().newFreeProject(4, 4, 'beads');
    render(<EditPanel />);
    await userEvent.click(screen.getByRole('radio', { name: '上下左右' }));
    expect(st().symmetry).toBe('xy');
    await userEvent.click(screen.getByRole('radio', { name: 'しない' }));
    expect(st().symmetry).toBe('none');
  });

  it('ずらす・反転・まん中に寄せる (はしにあると、その向きにはずらせない)', async () => {
    st().newFreeProject(5, 5, 'beads');
    render(<EditPanel />);
    const btn = (name: string) => screen.getByRole('button', { name });
    // ビーズが無いときは何もできない
    expect(btn('右に1つずらす')).toBeDisabled();
    expect(btn('左右反転')).toBeDisabled();
    act(() => {
      st().paint([0], RED);
    });
    expect(btn('上に1つずらす')).toBeDisabled();
    expect(btn('左に1つずらす')).toBeDisabled();
    await userEvent.click(btn('右に1つずらす'));
    await userEvent.click(btn('下に1つずらす'));
    expect(st().cells[1 * 5 + 1]).toBe(RED);
    await userEvent.click(btn('左に1つずらす'));
    await userEvent.click(btn('上に1つずらす'));
    expect(st().cells[0]).toBe(RED);
    await userEvent.click(btn('左右反転'));
    expect(st().cells[4]).toBe(RED);
    expect(btn('右に1つずらす')).toBeDisabled();
    await userEvent.click(btn('上下反転'));
    expect(st().cells[24]).toBe(RED);
    expect(btn('下に1つずらす')).toBeDisabled();
    await userEvent.click(btn('まん中に寄せる'));
    expect(st().cells[12]).toBe(RED);
    expect(btn('まん中に寄せる')).toBeDisabled();
  });

  it('画像モードでは図案を動かす道具は出さない / まとめて操作をやめる', async () => {
    st().newImageProject({ dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10, name: 'p' });
    act(() => {
      st().paint([0], RED);
    });
    const { unmount } = render(<EditPanel />);
    expect(screen.queryByRole('button', { name: '左右反転' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /手直しを全部もどす/ }));
    await answerConfirm('キャンセル');
    expect(st().cells[0]).toBe(RED);
    await userEvent.click(screen.getByRole('button', { name: /図案を確定して自由に編集/ }));
    await answerConfirm('キャンセル');
    expect(st().project!.mode).toBe('image');
    unmount();
    act(() => st().setMode('free'));
    render(<EditPanel />);
    await userEvent.click(screen.getByRole('button', { name: /全部消す/ }));
    await answerConfirm('キャンセル');
    expect(st().cells[0]).toBe(RED);
  });
});
