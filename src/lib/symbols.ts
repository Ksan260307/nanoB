/** 図案に印刷する記号 (見分けにくい I, O, l, 0, 1 などは使わない) */
export const SYMBOLS: readonly string[] = [...'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abdefghkmnqrtuy★●▲■◆♥♣♠'];

/** 使っている色に、多い順で記号を割り当てる */
export function assignSymbols(counts: Int32Array | number[]): Map<number, string> {
  const used: number[] = [];
  for (let i = 0; i < counts.length; i++) if (counts[i] > 0) used.push(i);
  used.sort((a, b) => counts[b] - counts[a] || a - b);
  const map = new Map<number, string>();
  used.forEach((c, k) => map.set(c, SYMBOLS[k % SYMBOLS.length]));
  return map;
}
