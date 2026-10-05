import { describe, expect, it } from 'vitest';
import { indexOfCode, PALETTE_SIZE } from '../data/palette';
import { buildPdf } from './pdf';
import { formatCm, shoppingList, shoppingText, SPARE_RATE, yen } from './shopping';
import { assignSymbols, SYMBOLS } from './symbols';

const WHITE = indexOfCode('80-15901');
const RED = indexOfCode('80-15903');
const GOLD = indexOfCode('80-14121K');

describe('記号', () => {
  it('55色分の、重複しない記号がある', () => {
    expect(SYMBOLS).toHaveLength(55);
    expect(new Set(SYMBOLS).size).toBe(55);
    for (const s of ['I', 'O', 'l', '0', '1']) expect(SYMBOLS).not.toContain(s);
  });

  it('多く使う色から順に A, B, C…', () => {
    const counts = new Int32Array(PALETTE_SIZE);
    counts[3] = 5;
    counts[7] = 50;
    counts[1] = 5;
    const map = assignSymbols(counts);
    expect(map.get(7)).toBe('A');
    expect(map.get(1)).toBe('B'); // 同数ならインデックス順
    expect(map.get(3)).toBe('C');
    expect(map.has(0)).toBe(false);
  });
});

describe('買い物の計算', () => {
  const counts = new Int32Array(PALETTE_SIZE);
  counts[WHITE] = 1500;
  counts[RED] = 200;
  counts[GOLD] = 10;

  it('予備なし・セットなし', () => {
    const s = shoppingList(counts, 'none', false);
    expect(s.colors).toBe(3);
    expect(s.totalBeads).toBe(1710);
    const white = s.rows.find((r) => r.color === WHITE)!;
    expect(white.packs).toBe(2);
    expect(s.totalPacks).toBe(4);
    expect(s.totalYen).toBe(4 * 253);
  });

  it('予備を1割', () => {
    const s = shoppingList(counts, 'none', true);
    const red = s.rows.find((r) => r.color === RED)!;
    expect(red.needed).toBe(Math.ceil(200 * (1 + SPARE_RATE)));
  });

  it('持っているセットの分を引く', () => {
    const s = shoppingList(counts, 'set12', false);
    const red = s.rows.find((r) => r.color === RED)!;
    expect(red.owned).toBe(300);
    expect(red.shortage).toBe(0);
    expect(red.packs).toBe(0);
    const gold = s.rows.find((r) => r.color === GOLD)!;
    expect(gold.owned).toBe(0); // 12色セットにゴールドは無い
    const s48 = shoppingList(counts, 'set48', false);
    expect(s48.rows.find((r) => r.color === GOLD)!.owned).toBe(240);
  });

  it('買い物メモのテキスト', () => {
    const text = shoppingText('テスト', shoppingList(counts, 'set12', false));
    expect(text).toContain('「テスト」');
    expect(text).toContain('しろ（80-15901） 1,500個 → 2袋');
    expect(text).toContain('あか（80-15903） 200個 → 手持ちでOK');
    expect(text).toMatch(/合計 \d+袋/);
  });

  it('表示の整形', () => {
    expect(yen(1234)).toBe('1,234円');
    expect(formatCm(28)).toBe('8.0');
    expect(formatCm(56)).toBe('16.0');
  });
});

describe('PDF', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

  it('ページ数・構造・xref の位置が正しい', () => {
    const pdf = buildPdf(
      [
        { jpeg, width: 10, height: 20 },
        { jpeg, width: 30, height: 40, pageWidth: 100, pageHeight: 200 },
      ],
      'test',
    );
    const s = text(pdf);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Type /Pages /Count 2');
    expect(s).toContain('/MediaBox [0 0 100.00 200.00]');
    expect(s).toContain('/Width 30 /Height 40');
    expect(s).toContain('/Title (test)');
    // startxref が xref を指している
    const startxref = Number(s.match(/startxref\n(\d+)/)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe('xref');
    // 各オブジェクトの位置が正しい
    const entries = s
      .slice(startxref)
      .split('\n')
      .filter((l) => / 00000 n $/.test(l))
      .map((l) => Number(l.slice(0, 10)));
    entries.forEach((off, i) => expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it('日本語のタイトルは UTF-16 の16進文字列', () => {
    const s = text(buildPdf([{ jpeg, width: 1, height: 1 }], 'ねこ'));
    expect(s).toContain('/Title <FEFF306D3053>');
  });

  it('記号を含むタイトルはエスケープする', () => {
    const s = text(buildPdf([{ jpeg, width: 1, height: 1 }], 'a(b)\\c'));
    expect(s).toContain('/Title (a\\(b\\)\\\\c)');
  });
});
