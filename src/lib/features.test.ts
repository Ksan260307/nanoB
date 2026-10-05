// 対称に描く・反転・移動・マイ図案の表示・バックアップの読み分け (純粋な関数)
import { describe, expect, it } from 'vitest';
import { backupFileName, makeBackup, parseImport } from './backup';
import { metaText, progressOf, searchKey } from './libraryText';
import { centerShift, contentBounds, EMPTY, flipCells, mirrorPoints, NO_EDIT, shiftCells } from './pattern';
import { createProject, deserializeProject, projectMeta, serializeProject } from './project';
import type { StoredProject } from './storage';

describe('mirrorPoints (対称に描く)', () => {
  it('しない・左右・上下・上下左右', () => {
    expect(mirrorPoints(1, 2, 5, 4, 'none')).toEqual([[1, 2]]);
    expect(mirrorPoints(1, 2, 5, 4, 'x')).toEqual([
      [1, 2],
      [3, 2],
    ]);
    expect(mirrorPoints(1, 2, 5, 4, 'y')).toEqual([
      [1, 2],
      [1, 1],
    ]);
    expect(mirrorPoints(1, 2, 5, 4, 'xy')).toEqual([
      [1, 2],
      [3, 2],
      [1, 1],
      [3, 1],
    ]);
  });

  it('まん中の線の上は同じマス', () => {
    expect(mirrorPoints(2, 0, 5, 1, 'x')).toEqual([
      [2, 0],
      [2, 0],
    ]);
  });
});

describe('flipCells / shiftCells (図案全体を動かす)', () => {
  // 3×2
  // 1 2 3
  // 4 5 6
  const src = new Int16Array([1, 2, 3, 4, 5, 6]);

  it('左右・上下に反転する (元はそのまま)', () => {
    expect(Array.from(flipCells(src, 3, 2, 'x'))).toEqual([3, 2, 1, 6, 5, 4]);
    expect(Array.from(flipCells(src, 3, 2, 'y'))).toEqual([4, 5, 6, 1, 2, 3]);
    expect(Array.from(src)).toEqual([1, 2, 3, 4, 5, 6]);
    const done = flipCells(new Uint8Array([1, 0, 0, 0, 0, 0]), 3, 2, 'x');
    expect(done).toBeInstanceOf(Uint8Array);
    expect(Array.from(done)).toEqual([0, 0, 1, 0, 0, 0]);
  });

  it('ずらす (はみ出した分はなくなり、空いた所は fill)', () => {
    expect(Array.from(shiftCells(src, 3, 2, 1, 0, EMPTY))).toEqual([EMPTY, 1, 2, EMPTY, 4, 5]);
    expect(Array.from(shiftCells(src, 3, 2, -1, 0, EMPTY))).toEqual([2, 3, EMPTY, 5, 6, EMPTY]);
    expect(Array.from(shiftCells(src, 3, 2, 0, 1, EMPTY))).toEqual([EMPTY, EMPTY, EMPTY, 1, 2, 3]);
    expect(Array.from(shiftCells(src, 3, 2, 0, -1, EMPTY))).toEqual([4, 5, 6, EMPTY, EMPTY, EMPTY]);
    expect(Array.from(shiftCells(new Uint8Array([1, 1, 1, 1, 1, 1]), 3, 2, 2, 1, 0))).toEqual([0, 0, 0, 0, 0, 1]);
  });
});

describe('contentBounds / centerShift', () => {
  it('ビーズが無ければ null・移動なし', () => {
    const empty = new Int16Array(9).fill(EMPTY);
    expect(contentBounds(empty, 3, 3)).toBeNull();
    expect(centerShift(empty, 3, 3)).toEqual([0, 0]);
  });

  it('ビーズのある範囲と、まん中に寄せる移動量', () => {
    // 5×4 の左上 2×1 にビーズ
    const cells = new Int16Array(20).fill(EMPTY);
    cells[0] = 3;
    cells[1] = 3;
    expect(contentBounds(cells, 5, 4)).toEqual({ x0: 0, y0: 0, x1: 1, y1: 0 });
    expect(centerShift(cells, 5, 4)).toEqual([1, 1]);
    // 右下の1粒
    const one = new Int16Array(20).fill(EMPTY);
    one[19] = 1;
    expect(contentBounds(one, 5, 4)).toEqual({ x0: 4, y0: 3, x1: 4, y1: 3 });
    expect(centerShift(one, 5, 4)).toEqual([-2, -2]);
  });
});

describe('マイ図案の表示', () => {
  it('名前さがしの表記ゆれをそろえる', () => {
    expect(searchKey('ネコ')).toBe(searchKey('ねこ'));
    expect(searchKey('ＡＢＣ')).toBe('abc');
    expect(searchKey('ﾈｺ')).toBe('ねこ');
    expect(searchKey('ヴ')).toBe('ゔ');
  });

  it('大きさ・色の数・ビーズの数', () => {
    expect(metaText({ width: 56, height: 28, beads: 1234, colors: 5 })).toBe('56×28・5色・1,234個');
    expect(metaText({ width: 28, height: 28, beads: 0, colors: 0 })).toBe('28×28・ビーズなし');
    expect(metaText({ width: 10, height: 20 })).toBe('10×20');
  });

  it('つくるモードの進み具合', () => {
    expect(progressOf(undefined)).toBe(0);
    expect(progressOf({ width: 1, height: 1 })).toBe(0);
    expect(progressOf({ width: 1, height: 1, beads: 0, placed: 0 })).toBe(0);
    expect(progressOf({ width: 1, height: 1, beads: 100, placed: 0 })).toBe(0);
    expect(progressOf({ width: 1, height: 1, beads: 1000, placed: 1 })).toBe(1);
    expect(progressOf({ width: 1, height: 1, beads: 200, placed: 90 })).toBe(45);
    expect(progressOf({ width: 1, height: 1, beads: 3, placed: 3 })).toBe(100);
  });

  it('projectMeta は置いたビーズだけ数える', () => {
    const p = createProject('free', 2, 2, null);
    p.done[0] = 1;
    p.done[3] = 1; // ビーズの無い所のチェックは数えない
    expect(projectMeta(p, new Int16Array([5, 5, 7, EMPTY]))).toEqual({ width: 2, height: 2, beads: 3, colors: 2, placed: 1 });
  });
});

describe('バックアップファイル', () => {
  const rec = (id: string): StoredProject => ({ id, name: id, createdAt: 1, updatedAt: 2, thumbnail: '', data: { app: 'nanobeads-pattern-maker', id } });

  it('まとめて1つのファイルにする', () => {
    const b = makeBackup([rec('a'), rec('b')]);
    expect(b).toMatchObject({ app: 'nanobeads-pattern-maker', kind: 'backup', version: 1 });
    expect(b.projects).toHaveLength(2);
    expect(b.exportedAt).toBeGreaterThan(0);
  });

  it('ファイル名に日付を入れる', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe('nanobeads-backup-20260105.json');
    expect(backupFileName()).toMatch(/^nanobeads-backup-\d{8}\.json$/);
  });

  it('1つの図案・バックアップを見分ける', () => {
    const single = parseImport(JSON.stringify({ app: 'nanobeads-pattern-maker', version: 1, id: 'x' }));
    expect(single).toEqual({ kind: 'project', file: { app: 'nanobeads-pattern-maker', version: 1, id: 'x' } });
    const backup = parseImport(JSON.stringify({ ...makeBackup([rec('a')]), projects: [rec('a'), null, {}] }));
    expect(backup.kind).toBe('backup');
    expect(backup.kind === 'backup' && backup.files).toEqual([{ app: 'nanobeads-pattern-maker', id: 'a' }, undefined, undefined]);
  });

  it('読めないファイル', () => {
    expect(() => parseImport('{')).toThrow('ファイルが壊れているため読み込めませんでした');
    expect(() => parseImport('null')).toThrow('ナノビーズ図案メーカーのファイルではありません');
    expect(() => parseImport('5')).toThrow('ナノビーズ図案メーカーのファイルではありません');
    expect(() => parseImport('{"app":"other"}')).toThrow('ナノビーズ図案メーカーのファイルではありません');
    expect(() => parseImport('{"app":"nanobeads-pattern-maker","kind":"backup"}')).toThrow('ファイルが壊れています');
  });
});

describe('ファイルの中の画像・リンクの確認', () => {
  const source = { dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 20, name: '画像' };

  it('画像モードの図案はそのまま読める (リンクは http(s) だけ)', () => {
    const p = createProject('image', 2, 2, { ...source, link: 'https://example.com/a' });
    expect(deserializeProject(serializeProject(p)).source?.link).toBe('https://example.com/a');
    const evil = createProject('image', 2, 2, { ...source, link: 'javascript:alert(1)' });
    const q = deserializeProject(serializeProject(evil));
    expect(q.mode).toBe('image');
    expect(q.source?.link).toBeUndefined();
  });

  it('外部の URL の画像は読み込まず、今の見た目のままフリーモードにする', () => {
    const p = createProject('image', 2, 2, { ...source, dataUrl: 'https://example.com/a.png' });
    p.base = new Int16Array([1, 2, 3, 4]);
    p.overlay[1] = 9;
    p.overlay[2] = EMPTY;
    const q = deserializeProject(serializeProject(p));
    expect(q.mode).toBe('free');
    expect(q.source).toBeNull();
    expect(q.base).toBeNull();
    expect(Array.from(q.overlay)).toEqual([1, 9, EMPTY, 4]);
  });

  it('大きさの無い画像も受け付けない', () => {
    const p = createProject('image', 2, 2, { ...source, width: 0 });
    const q = deserializeProject(serializeProject(p));
    expect(q.mode).toBe('free');
    expect(Array.from(q.overlay)).toEqual([EMPTY, EMPTY, EMPTY, EMPTY]);
    expect(q.overlay.includes(NO_EDIT)).toBe(false);
  });

  it('フリーモードの下絵が読めなくても、描いたビーズはそのまま', () => {
    const p = createProject('free', 2, 1, { ...source, dataUrl: 'blob:x' });
    p.overlay[0] = 3;
    const q = deserializeProject(serializeProject(p));
    expect(q.mode).toBe('free');
    expect(q.source).toBeNull();
    expect(Array.from(q.overlay)).toEqual([3, EMPTY]);
  });
});
