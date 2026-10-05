// @vitest-environment jsdom
// 保存先 (IndexedDB / localStorage) が使えない・失敗する場合
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Req = { result?: unknown; error?: unknown; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void };

function fakeIndexedDB(opts: { openFails?: boolean; storeExists?: boolean; opFails?: boolean }) {
  const created: string[] = [];
  const db = {
    objectStoreNames: { contains: () => !!opts.storeExists },
    createObjectStore: (name: string) => created.push(name),
    transaction: () => ({
      objectStore: () => {
        const op = () => {
          const req: Req = {};
          setTimeout(() => {
            if (opts.opFails) {
              req.error = new Error('op failed');
              req.onerror?.();
            } else {
              req.result = [];
              req.onsuccess?.();
            }
          }, 0);
          return req;
        };
        return { put: op, get: op, delete: op, getAll: op };
      },
    }),
  };
  return {
    created,
    api: {
      open: () => {
        const req: Req = {};
        setTimeout(() => {
          if (opts.openFails) {
            req.error = new Error('open failed');
            req.onerror?.();
            return;
          }
          req.result = db;
          req.onupgradeneeded?.();
          req.onsuccess?.();
        }, 0);
        return req;
      },
    },
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('IndexedDB が使えない・失敗する', () => {
  it('IndexedDB が無い環境ではエラー (次に呼ばれたらもう一度試す)', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const storage = await import('./storage');
    await expect(storage.listProjectRecords()).rejects.toThrow('IndexedDB is not available');
    await expect(storage.loadProjectRecord('x')).rejects.toThrow('IndexedDB is not available');
  });

  it('開けなければエラー', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB({ openFails: true }).api);
    const storage = await import('./storage');
    await expect(storage.deleteProjectRecord('x')).rejects.toThrow('open failed');
  });

  it('保存先が既にあれば作らない', async () => {
    const fake = fakeIndexedDB({ storeExists: true });
    vi.stubGlobal('indexedDB', fake.api);
    const storage = await import('./storage');
    await expect(storage.listProjectRecords()).resolves.toEqual([]);
    expect(fake.created).toEqual([]);
  });

  it('保存先が無ければ作る', async () => {
    const fake = fakeIndexedDB({});
    vi.stubGlobal('indexedDB', fake.api);
    const storage = await import('./storage');
    await storage.listProjectRecords();
    expect(fake.created).toEqual(['projects']);
  });

  it('読み書きの失敗はエラー', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDB({ storeExists: true, opFails: true }).api);
    const storage = await import('./storage');
    await expect(storage.saveProjectRecord({ id: 'a', name: 'a', createdAt: 0, updatedAt: 0, thumbnail: '', data: null })).rejects.toThrow('op failed');
  });
});

describe('localStorage が使えない', () => {
  it('保存できなくても止まらない', async () => {
    const storage = await import('./storage');
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => storage.savePref('x', 1)).not.toThrow();
    spy.mockRestore();
  });
});
