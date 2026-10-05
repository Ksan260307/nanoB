// @vitest-environment jsdom
// マイ図案の保存・削除 (元に戻す)・コピー・名前の変更・バックアップ
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../lib/project';

const downloadBlob = vi.fn<(blob: Blob, name: string) => void>();
vi.mock('../lib/exporters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/exporters')>()),
  downloadBlob: (blob: Blob, name: string) => downloadBlob(blob, name),
}));

const { addProject, deleteProjects, duplicateProject, exportBackup, importFile, importMessage, projectRecord, renameProject } = await import('./library');
const { useStore } = await import('./store');
const { createProject, serializeProject } = await import('../lib/project');
const { deleteProjectRecord, listProjectRecords, loadProjectRecord, saveProjectRecord } = await import('../lib/storage');
const st = () => useStore.getState();

function makeProject(name: string, updatedAt = 100): Project {
  const p = createProject('free', 2, 2, null);
  p.name = name;
  p.updatedAt = updatedAt;
  p.overlay[0] = 3;
  return p;
}

async function store(name: string, updatedAt = 100) {
  const p = makeProject(name, updatedAt);
  await saveProjectRecord(projectRecord(p));
  return p;
}

const names = async () => (await listProjectRecords()).map((r) => r.name).sort();

/** トーストの「元に戻す」を押す */
async function undoFromToast() {
  const action = st().toast?.action;
  expect(action?.label).toBe('元に戻す');
  action!.run();
  await vi.waitFor(() => expect(st().toast?.text).toBe('元に戻しました'));
}

beforeEach(async () => {
  st().closeProject();
  useStore.setState({ toast: null });
  for (const r of await listProjectRecords()) await deleteProjectRecord(r.id);
  downloadBlob.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('projectRecord', () => {
  it('サムネイルと一覧用の情報をつける', () => {
    const r = projectRecord(makeProject('A'));
    expect(r.name).toBe('A');
    expect(r.thumbnail).toMatch(/^data:image\/png/);
    expect(r.meta).toEqual({ width: 2, height: 2, beads: 1, colors: 1, placed: 0 });
  });
});

describe('deleteProjects', () => {
  it('削除して、トーストの「元に戻す」で戻せる', async () => {
    const a = await store('A');
    await store('B');
    const rev = st().libraryRev;
    await deleteProjects([a.id]);
    expect(await names()).toEqual(['B']);
    expect(st().toast?.text).toBe('「A」を削除しました');
    expect(st().libraryRev).toBe(rev + 1);
    await undoFromToast();
    expect(await names()).toEqual(['A', 'B']);
    expect(st().project).toBeNull();
  });

  it('いくつかをまとめて削除 / 見つからない図案', async () => {
    const a = await store('A');
    const b = await store('B');
    await deleteProjects([a.id, b.id]);
    expect(await names()).toEqual([]);
    expect(st().toast?.text).toBe('2件の図案を削除しました');
    await deleteProjects(['nothing']);
    expect(st().toast?.text).toBe('1件の図案を削除しました');
  });

  it('開いている図案は閉じてから削除し、元に戻すと最新の状態で開き直す', async () => {
    const p = await store('編集中');
    st().openProject(p);
    // 自動保存される前の変更
    st().setName('名前を変えた');
    await deleteProjects([p.id]);
    expect(st().project).toBeNull();
    expect(await loadProjectRecord(p.id)).toBeUndefined();
    await undoFromToast();
    expect(st().project?.id).toBe(p.id);
    expect(st().project?.name).toBe('名前を変えた');
    expect((await loadProjectRecord(p.id))?.name).toBe('名前を変えた');
  });

  it('元に戻すときにほかの図案を開いていたら、開き直さない', async () => {
    const p = await store('消す図案');
    st().openProject(p);
    await deleteProjects([p.id]);
    const other = makeProject('ほかの図案');
    st().openProject(other);
    await undoFromToast();
    expect(st().project?.id).toBe(other.id);
    expect(await loadProjectRecord(p.id)).toBeDefined();
  });
});

describe('duplicateProject / renameProject / addProject', () => {
  it('コピーを作る (見つからなければ false)', async () => {
    const a = await store('A');
    expect(await duplicateProject('nothing')).toBe(false);
    expect(await duplicateProject(a.id)).toBe(true);
    expect(await names()).toEqual(['A', 'A のコピー']);
  });

  it('開いている図案は、今の状態からコピーする', async () => {
    const a = await store('A');
    st().openProject(a);
    st().setName('今の名前');
    await duplicateProject(a.id);
    expect(await names()).toContain('今の名前 のコピー');
  });

  it('名前を変える (保存データの中身の名前も)', async () => {
    const a = await store('A');
    await renameProject(a.id, 'あたらしい');
    const rec = await loadProjectRecord(a.id);
    expect(rec?.name).toBe('あたらしい');
    expect((rec?.data as { name: string }).name).toBe('あたらしい');
    // 見つからない図案は何もしない
    const rev = st().libraryRev;
    await renameProject('nothing', 'x');
    expect(st().libraryRev).toBe(rev);
  });

  it('開いている図案は画面の名前も変えて、すぐ保存する', async () => {
    const a = await store('A');
    st().openProject(a);
    await renameProject(a.id, '開いている図案');
    expect(st().project?.name).toBe('開いている図案');
    expect((await loadProjectRecord(a.id))?.name).toBe('開いている図案');
  });

  it('1つの図案を新しい ID で加える', async () => {
    const p = makeProject('ファイルの図案');
    const added = await addProject(p);
    expect(added.id).not.toBe(p.id);
    expect((await loadProjectRecord(added.id))?.name).toBe('ファイルの図案');
  });
});

describe('exportBackup', () => {
  async function written() {
    const [blob, name] = downloadBlob.mock.calls.at(-1)!;
    expect(name).toMatch(/^nanobeads-backup-\d{8}\.json$/);
    return JSON.parse(await blob.text()) as { kind: string; projects: { name: string }[] };
  }

  it('すべて・えらんだ図案を1つのファイルに書き出す', async () => {
    const a = await store('A');
    await store('B');
    expect(await exportBackup()).toBe(2);
    const all = await written();
    expect(all.kind).toBe('backup');
    expect(all.projects.map((r) => r.name).sort()).toEqual(['A', 'B']);
    expect(await exportBackup([a.id])).toBe(1);
    expect((await written()).projects.map((r) => r.name)).toEqual(['A']);
  });

  it('開いている図案は今の状態で書き出す', async () => {
    const a = await store('A');
    st().openProject(a);
    st().setName('保存前の名前');
    await exportBackup([a.id]);
    expect((await written()).projects[0].name).toBe('保存前の名前');
  });
});

describe('importFile', () => {
  const file = (data: unknown) => new File([JSON.stringify(data)], 'x.json', { type: 'application/json' });
  const backupOf = (...projects: Project[]) => ({
    app: 'nanobeads-pattern-maker',
    kind: 'backup',
    version: 1,
    exportedAt: 1,
    projects: projects.map((p) => projectRecord(p)),
  });

  it('ファイルを読めないとき', async () => {
    const broken = { text: () => Promise.reject(new Error('io')) } as unknown as File;
    await expect(importFile(broken)).rejects.toThrow('ファイルを読み込めませんでした');
  });

  it('1つの図案はそのまま返す (マイ図案には加えない)', async () => {
    const p = makeProject('1つの図案');
    const r = await importFile(file(serializeProject(p)));
    expect(r.kind).toBe('project');
    expect(r.kind === 'project' && r.project.name).toBe('1つの図案');
    expect(await names()).toEqual([]);
  });

  it('バックアップは、新しい図案だけマイ図案に加える', async () => {
    const same = await store('同じ', 100);
    const older = await store('古い', 50);
    const open = await store('開いている', 100);
    st().openProject(open);
    const fresh = makeProject('新しい', 100);
    const newerOfOlder = { ...older, name: '新しくなった', updatedAt: 200 };
    const newerOfOpen = { ...open, updatedAt: 999 };
    const data = backupOf(same, fresh, newerOfOlder, newerOfOpen);
    (data.projects as unknown[]).push({ data: { app: 'nanobeads-pattern-maker', width: -1 } }, null);
    const r = await importFile(file(data));
    expect(r).toEqual({ kind: 'backup', added: 2, skipped: 2, failed: 2 });
    expect(await names()).toEqual(['同じ', '新しい', '新しくなった', '開いている']);
  });

  it('お知らせの文', () => {
    expect(importMessage({ added: 3, skipped: 0, failed: 0 })).toBe('3件の図案を読み込みました');
    expect(importMessage({ added: 0, skipped: 2, failed: 1 })).toBe(
      '新しく読み込む図案はありませんでした。2件は保存済みのため飛ばしました。1件は壊れていて読み込めませんでした',
    );
  });
});
