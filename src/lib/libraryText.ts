/** マイ図案の一覧の表示に使う小さな関数 */
import type { ProjectMeta } from './storage';

/** 名前でさがすときの表記ゆれ (全角/半角・大文字/小文字・カタカナ/ひらがな) をそろえる */
export function searchKey(s: string): string {
  // カタカナ (ァ〜ヶ) はひらがなに
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 一覧に出す「56×56・12色・2,345個」 */
export function metaText(m: ProjectMeta): string {
  const parts = [`${m.width}×${m.height}`];
  if (m.beads === 0) {
    parts.push('ビーズなし');
  } else {
    if (m.colors !== undefined) parts.push(`${m.colors}色`);
    if (m.beads !== undefined) parts.push(`${m.beads.toLocaleString()}個`);
  }
  return parts.join('・');
}

/** つくるモードの進み具合 (%)。まだ置いていなければ 0 */
export function progressOf(m: ProjectMeta | undefined): number {
  return m?.beads && m.placed ? Math.max(1, Math.round((m.placed / m.beads) * 100)) : 0;
}
