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

export interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  thumbnail: string;
  /** シリアライズした中身 (projectFile.ts の ProjectFile) */
  data: unknown;
}

export function saveProjectRecord(p: StoredProject): Promise<IDBValidKey> {
  return tx('readwrite', (s) => s.put(p));
}

export function loadProjectRecord(id: string): Promise<StoredProject | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<StoredProject | undefined>);
}

export function deleteProjectRecord(id: string): Promise<undefined> {
  return tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}

export async function listProjectRecords(): Promise<Omit<StoredProject, 'data'>[]> {
  const all = await tx('readonly', (s) => s.getAll() as IDBRequest<StoredProject[]>);
  return all.map(({ id, name, updatedAt, createdAt, thumbnail }) => ({ id, name, updatedAt, createdAt, thumbnail })).sort((a, b) => b.updatedAt - a.updatedAt);
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
