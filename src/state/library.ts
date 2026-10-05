/** マイ図案 (このブラウザに保存した図案) の保存・削除・コピー・名前の変更・バックアップ */
import { backupFileName, makeBackup, parseImport } from '../lib/backup';
import { downloadBlob } from '../lib/exporters';
import { compose } from '../lib/pattern';
import { deserializeProject, newId, projectMeta, serializeProject, type Project, type ProjectFile } from '../lib/project';
import { thumbnailDataUrl } from '../lib/render';
import { deleteProjectRecord, listProjectRecords, loadProjectRecord, saveProjectRecord, savePref, type StoredProject } from '../lib/storage';
import { useStore } from './store';

/** 図案から保存用のデータを作る */
export function projectRecord(p: Project, cells = compose(p.base, p.overlay)): StoredProject {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    thumbnail: thumbnailDataUrl(cells, p.width, p.height, 120),
    data: serializeProject(p),
    meta: projectMeta(p, cells),
  };
}

/** 今の図案をすぐに端末へ保存する */
export function saveNow(): Promise<void> {
  const { cells, project } = useStore.getState();
  const p = project!;
  return saveProjectRecord(projectRecord(p, cells))
    .then(() => savePref('lastProject', p.id))
    .catch((e) => console.warn('保存できませんでした', e));
}

/** 保存した図案 (開いている図案は、自動保存を待たずに今の状態で) */
async function freshRecords(ids: string[]): Promise<StoredProject[]> {
  const { project, cells } = useStore.getState();
  const records = await Promise.all(ids.map((id) => (project?.id === id ? projectRecord(project, cells) : loadProjectRecord(id))));
  return records.filter((r) => r !== undefined);
}

/** 図案を削除する。すぐあとならトーストの「元に戻す」で戻せる */
export async function deleteProjects(ids: string[]): Promise<void> {
  const records = await freshRecords(ids);
  const open = useStore.getState().project?.id;
  const reopen = open && ids.includes(open) ? open : null;
  // 開いている図案は先に閉じる (自動保存で、消した図案が戻ってこないように)
  if (reopen) useStore.getState().closeProject();
  await Promise.all(ids.map((id) => deleteProjectRecord(id)));
  const st = useStore.getState();
  st.bumpLibrary();
  st.showToast(records.length === 1 ? `「${records[0].name}」を削除しました` : `${ids.length}件の図案を削除しました`, {
    label: '元に戻す',
    run: () => void restoreRecords(records, reopen),
  });
}

async function restoreRecords(records: StoredProject[], reopen: string | null): Promise<void> {
  await Promise.all(records.map((r) => saveProjectRecord(r)));
  const st = useStore.getState();
  // 削除で閉じた図案は、ほかの図案を開いていなければ開き直す
  const rec = reopen && !st.project ? records.find((r) => r.id === reopen) : undefined;
  if (rec) st.openProject(deserializeProject(rec.data as ProjectFile));
  st.bumpLibrary();
  st.showToast('元に戻しました');
}

/** 図案のコピーを作る (見つからなければ false) */
export async function duplicateProject(id: string): Promise<boolean> {
  const [rec] = await freshRecords([id]);
  if (!rec) return false;
  const p = deserializeProject(rec.data as ProjectFile);
  const now = Date.now();
  const copy: Project = { ...p, id: newId(), name: `${p.name} のコピー`, createdAt: now, updatedAt: now };
  await saveProjectRecord({ ...rec, id: copy.id, name: copy.name, createdAt: now, updatedAt: now, data: serializeProject(copy) });
  useStore.getState().bumpLibrary();
  return true;
}

/** 名前を変える (開いている図案は画面の名前も変える) */
export async function renameProject(id: string, name: string): Promise<void> {
  const st = useStore.getState();
  if (st.project?.id === id) {
    st.setName(name);
    await saveNow();
  } else {
    const rec = await loadProjectRecord(id);
    if (!rec) return;
    await saveProjectRecord({ ...rec, name, data: { ...(rec.data as ProjectFile), name } });
  }
  useStore.getState().bumpLibrary();
}

/** 図案をまとめて1つのファイルに書き出す (ids を省くとすべて)。書き出した数を返す */
export async function exportBackup(ids?: string[]): Promise<number> {
  const records = await freshRecords(ids ?? (await listProjectRecords()).map((r) => r.id));
  downloadBlob(new Blob([JSON.stringify(makeBackup(records))], { type: 'application/json' }), backupFileName());
  return records.length;
}

/** 1つの図案をマイ図案に加える (同じ図案があっても上書きしないよう、新しい ID にする) */
export async function addProject(p: Project): Promise<Project> {
  const added = { ...p, id: newId() };
  await saveProjectRecord(projectRecord(added));
  useStore.getState().bumpLibrary();
  return added;
}

export type ImportResult = { kind: 'project'; project: Project } | { kind: 'backup'; added: number; skipped: number; failed: number };

/**
 * 図案ファイルを読む。1つの図案ならそのまま返し (開くか加えるかは呼び出し側で決める)、
 * バックアップならマイ図案に加える (同じ図案が同じか新しい状態で保存済みなら飛ばす)
 */
export async function importFile(file: File): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new Error('ファイルを読み込めませんでした');
  }
  const parsed = parseImport(text);
  if (parsed.kind === 'project') return { kind: 'project', project: deserializeProject(parsed.file) };
  const open = useStore.getState().project?.id;
  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const f of parsed.files) {
    let p: Project;
    try {
      p = deserializeProject(f);
    } catch {
      failed++;
      continue;
    }
    const existing = await loadProjectRecord(p.id);
    // 開いている図案は上書きしない (自動保存とぶつかるため)
    if (p.id === open || (existing && existing.updatedAt >= p.updatedAt)) {
      skipped++;
      continue;
    }
    await saveProjectRecord(projectRecord(p));
    added++;
  }
  useStore.getState().bumpLibrary();
  return { kind: 'backup', added, skipped, failed };
}

/** バックアップを読み込んだ結果のお知らせ */
export function importMessage(r: { added: number; skipped: number; failed: number }): string {
  const parts = [r.added ? `${r.added}件の図案を読み込みました` : '新しく読み込む図案はありませんでした'];
  if (r.skipped) parts.push(`${r.skipped}件は保存済みのため飛ばしました`);
  if (r.failed) parts.push(`${r.failed}件は壊れていて読み込めませんでした`);
  return parts.join('。');
}
