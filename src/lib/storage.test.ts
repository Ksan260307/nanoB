// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { deleteProjectRecord, listProjectRecords, loadPref, loadProjectRecord, savePref, saveProjectRecord } from './storage';

const record = (id: string, updatedAt: number) => ({ id, name: `図案${id}`, createdAt: 1, updatedAt, thumbnail: 'data:,', data: { hello: id } });

describe('図案の保存 (IndexedDB)', () => {
  it('保存・読み込み・一覧・削除', async () => {
    await saveProjectRecord(record('a', 100));
    await saveProjectRecord(record('b', 300));
    await saveProjectRecord(record('c', 200));
    expect((await loadProjectRecord('a'))?.data).toEqual({ hello: 'a' });
    const list = await listProjectRecords();
    expect(list.map((r) => r.id)).toEqual(['b', 'c', 'a']); // 新しい順
    expect(list[0]).not.toHaveProperty('data');
    await deleteProjectRecord('b');
    expect(await loadProjectRecord('b')).toBeUndefined();
    expect((await listProjectRecords()).map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('同じ ID は上書き', async () => {
    await saveProjectRecord(record('x', 1));
    await saveProjectRecord({ ...record('x', 2), name: '新しい名前' });
    expect((await loadProjectRecord('x'))?.name).toBe('新しい名前');
  });
});

describe('設定 (localStorage)', () => {
  it('保存して読める', () => {
    savePref('test', { a: 1 });
    expect(loadPref('test', null)).toEqual({ a: 1 });
    expect(localStorage.getItem('nanob:test')).toBe('{"a":1}');
  });
  it('無ければ初期値', () => {
    expect(loadPref('missing', 42)).toBe(42);
  });
  it('壊れていても初期値', () => {
    localStorage.setItem('nanob:broken', '{');
    expect(loadPref('broken', 'x')).toBe('x');
  });
});
