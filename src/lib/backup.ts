/** 図案のバックアップファイル (複数の図案をまとめた JSON) と、読み込むファイルの見分け */
import type { ProjectFile } from './project';
import type { StoredProject } from './storage';

export interface BackupFile {
  app: 'nanobeads-pattern-maker';
  kind: 'backup';
  version: 1;
  exportedAt: number;
  projects: StoredProject[];
}

export function makeBackup(records: StoredProject[]): BackupFile {
  return { app: 'nanobeads-pattern-maker', kind: 'backup', version: 1, exportedAt: Date.now(), projects: records };
}

export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `nanobeads-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}.json`;
}

/** 読み込んだファイル: 1つの図案、またはバックアップ (中身の確認は deserializeProject で行う) */
export type ParsedImport = { kind: 'project'; file: ProjectFile } | { kind: 'backup'; files: ProjectFile[] };

export function parseImport(text: string): ParsedImport {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('ファイルが壊れているため読み込めませんでした');
  }
  const j = json as { app?: unknown; kind?: unknown; projects?: unknown } | null;
  if (!j || typeof j !== 'object' || j.app !== 'nanobeads-pattern-maker') throw new Error('ナノビーズ図案メーカーのファイルではありません');
  if (j.kind !== 'backup') return { kind: 'project', file: j as ProjectFile };
  if (!Array.isArray(j.projects)) throw new Error('ファイルが壊れています');
  return { kind: 'backup', files: j.projects.map((r: { data?: ProjectFile } | null) => r?.data as ProjectFile) };
}
