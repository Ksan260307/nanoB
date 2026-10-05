import { describe, expect, it } from 'vitest';
import {
  BEAD_PITCH_MM,
  BEADS_PER_PACK,
  defaultAutoColors,
  GROUPS,
  indexOfCode,
  PACK_PRICE_YEN,
  PALETTE,
  PALETTE_SETS,
  PALETTE_SIZE,
  PLATE_PEGS,
} from './palette';
import { SAMPLES, sampleUrl } from './samples';

describe('ナノビーズのパレット', () => {
  it('単色で売られている全55色がある', () => {
    expect(PALETTE).toHaveLength(55);
    expect(PALETTE_SIZE).toBe(55);
  });

  it('品番・色名が重複していない', () => {
    expect(new Set(PALETTE.map((c) => c.code)).size).toBe(55);
    expect(new Set(PALETTE.map((c) => c.name)).size).toBe(55);
  });

  it('品番の形式と色の値が正しい', () => {
    for (const c of PALETTE) {
      expect(c.code).toMatch(/^80-1\d{4}K?$/);
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(GROUPS.map((g) => g.id)).toContain(c.group);
    }
  });

  it('透明・メタリックは「とくべつな色」', () => {
    const special = PALETTE.filter((c) => c.kind);
    expect(special.map((c) => c.name).sort()).toEqual(['ゴールド', 'シルバー', 'とうめい'].sort());
    for (const c of special) expect(c.group).toBe('special');
  });

  it('品番からインデックスを引ける', () => {
    expect(indexOfCode('80-15901')).toBe(0);
    expect(PALETTE[indexOfCode('80-15977K')].name).toBe('ミント');
    expect(indexOfCode('00-00000')).toBe(-1);
  });

  it('セット商品の色数と1色あたりの数', () => {
    const byId = Object.fromEntries(PALETTE_SETS.map((s) => [s.id, s]));
    expect(byId.all.colors).toHaveLength(55);
    expect(byId.set12.colors).toHaveLength(12);
    expect(byId.set24.colors).toHaveLength(24);
    expect(byId.set48.colors).toHaveLength(48);
    expect(byId.set12.perColor).toBe(300);
    expect(byId.set24.perColor).toBe(300);
    expect(byId.set48.perColor).toBe(240);
    for (const s of PALETTE_SETS) {
      expect(new Set(s.colors).size).toBe(s.colors.length);
      for (const c of s.colors) expect(PALETTE[c]).toBeDefined();
    }
  });

  it('12色セットは24色セットにすべて含まれる…わけではないが基本色は共通', () => {
    const set12 = PALETTE_SETS.find((s) => s.id === 'set12')!.colors.map((i) => PALETTE[i].name);
    expect(set12).toEqual(expect.arrayContaining(['しろ', 'くろ', 'あか', 'あお', 'きいろ', 'みどり']));
  });

  it('48色セットにはゴールドが入っている', () => {
    const set48 = PALETTE_SETS.find((s) => s.id === 'set48')!.colors.map((i) => PALETTE[i].name);
    expect(set48).toContain('ゴールド');
    expect(set48).not.toContain('マシュマロ');
  });

  it('自動変換の初期色は透明・メタリックを除く52色', () => {
    const auto = defaultAutoColors();
    expect(auto).toHaveLength(52);
    for (const i of auto) expect(PALETTE[i].kind).toBeUndefined();
  });

  it('商品の基本情報', () => {
    expect(PLATE_PEGS).toBe(28);
    expect(BEADS_PER_PACK).toBe(1000);
    expect(PACK_PRICE_YEN).toBe(253);
    expect(BEAD_PITCH_MM * PLATE_PEGS).toBeCloseTo(80);
  });
});

describe('サンプル画像', () => {
  it('4種類あり、URL がベースパス付きで作られる', () => {
    expect(SAMPLES).toHaveLength(4);
    expect(sampleUrl('heart.svg')).toMatch(/samples\/heart\.svg$/);
  });
});
