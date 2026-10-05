/** IndexedDB に図案を保存する (端末内のみ。サーバーには送らない) */

const DB_NAME = 'nanobeads-pattern-maker';
const STORE = 'projects';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** 一覧に出す図案の情報 (古い保存データには大きさしか無い) */
export interface ProjectMeta {
  width: number;
  height: number;
  /** ビーズの数 */
  beads?: number;
  /** 色の数 */
  colors?: number;
  /** つくるモードで置いたビーズの数 */
  placed?: number;
}

export interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  thumbnail: string;
  /** シリアライズした中身 (project.ts の ProjectFile) */
  data: unknown;
  meta?: ProjectMeta;
}

export type ProjectSummary = Omit<StoredProject, 'data'>;

export function saveProjectRecord(p: StoredProject): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(p));
}

export function loadProjectRecord(id: string): Promise<StoredProject | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<StoredProject | undefined>);
}

export function deleteProjectRecord(id: string): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}

/** 古い保存データは、中身から大きさだけを読む */
function metaFromData(data: unknown): ProjectMeta | undefined {
  const d = data as { width?: unknown; height?: unknown } | null;
  return d && typeof d.width === 'number' && typeof d.height === 'number' ? { width: d.width, height: d.height } : undefined;
}

/** 保存した図案の一覧 (更新が新しい順) */
export async function listProjectRecords(): Promise<ProjectSummary[]> {
  const all = await tx('readonly', (s) => s.getAll() as IDBRequest<StoredProject[]>);
  return all
    .map(({ id, name, updatedAt, createdAt, thumbnail, meta, data }) => ({ id, name, updatedAt, createdAt, thumbnail, meta: meta ?? metaFromData(data) }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---- 小さな設定は localStorage ----
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`nanob:${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`nanob:${key}`, JSON.stringify(value));
  } catch {
    // 保存できなくても動作は続ける
  }
}
