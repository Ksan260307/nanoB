/** 必要なビーズの数・袋数・金額の計算と表示用の整形 */
import { BEAD_PITCH_MM, BEADS_PER_PACK, PACK_PRICE_YEN, PALETTE, PALETTE_SETS } from '../data/palette';

export type OwnedSetId = 'none' | 'set12' | 'set24' | 'set48';

export interface ShoppingRow {
  color: number;
  /** 図案で使う数 */
  count: number;
  /** 予備を含めて用意したい数 */
  needed: number;
  /** 持っているセットに入っている数 */
  owned: number;
  /** 足りない数 */
  shortage: number;
  /** 買う袋数 */
  packs: number;
}

export interface ShoppingSummary {
  rows: ShoppingRow[];
  totalBeads: number;
  totalPacks: number;
  totalYen: number;
  colors: number;
}

export const SPARE_RATE = 0.1;

export function shoppingList(counts: ArrayLike<number>, ownedSet: OwnedSetId, spare: boolean): ShoppingSummary {
  const set = ownedSet === 'none' ? null : (PALETTE_SETS.find((s) => s.id === ownedSet) ?? null);
  const ownedColors = new Set(set?.colors ?? []);
  const rows: ShoppingRow[] = [];
  let totalBeads = 0;
  let totalPacks = 0;
  for (let c = 0; c < counts.length; c++) {
    const count = counts[c];
    if (!count) continue;
    const needed = spare ? Math.ceil(count * (1 + SPARE_RATE)) : count;
    const owned = set && ownedColors.has(c) ? set.perColor : 0;
    const shortage = Math.max(0, needed - owned);
    const packs = Math.ceil(shortage / BEADS_PER_PACK);
    rows.push({ color: c, count, needed, owned, shortage, packs });
    totalBeads += count;
    totalPacks += packs;
  }
  return { rows, totalBeads, totalPacks, totalYen: totalPacks * PACK_PRICE_YEN, colors: rows.length };
}

/** 買い物メモ (クリップボード用のテキスト) */
export function shoppingText(name: string, summary: ShoppingSummary): string {
  const lines = [`ナノビーズ 買い物メモ「${name}」`];
  const sorted = summary.rows.slice().sort((a, b) => b.count - a.count);
  for (const r of sorted) {
    const p = PALETTE[r.color];
    const tail = r.packs > 0 ? `${r.packs}袋` : '手持ちでOK';
    lines.push(`・${p.name}（${p.code}） ${r.count.toLocaleString()}個 → ${tail}`);
  }
  lines.push(`合計 ${summary.totalPacks}袋（1袋${BEADS_PER_PACK.toLocaleString()}個入り） 目安 ${yen(summary.totalYen)}`);
  return lines.join('\n');
}

export function yen(v: number): string {
  return `${v.toLocaleString()}円`;
}

/** ビーズの数 → 完成サイズの目安 (cm) */
export function formatCm(beads: number): string {
  return ((beads * BEAD_PITCH_MM) / 10).toFixed(1);
}
