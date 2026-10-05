/**
 * カワダ「ナノビーズ」(nanobeads®) 単色カラー一覧。
 *
 * - 色名・品番: カワダ公式カタログ / カワダオンライン(卸サイト)の単色商品一覧より (全55色)
 * - 色の値: 公式商品ページの「ビーズ拡大写真」から中央値をサンプリングし、
 *   写真全体の露出・ホワイトバランスを補正した近似値です。実物とは多少異なります。
 * - 1袋 = 1,000個入り、希望小売価格 253円(税込) / φ2.6mm × H2.8mm
 *
 * 配列の並び(インデックス)は保存データの互換性のため、末尾に追加する以外は変更しないこと。
 */

export type ColorGroup = 'mono' | 'red' | 'orange' | 'green' | 'blue' | 'purple' | 'brown' | 'special';

export interface BeadColor {
  /** 品番 (例: 80-15901) */
  code: string;
  /** 色名 */
  name: string;
  /** 表示・計算用のおおよその色 */
  hex: string;
  group: ColorGroup;
  /** 透明ビーズ / メタリックビーズ (自動変換では初期状態で使わない) */
  kind?: 'clear' | 'metallic';
}

export const PALETTE: readonly BeadColor[] = [
  { code: '80-15901', name: 'しろ', hex: '#f1eee9', group: 'mono' },
  { code: '80-15902', name: 'きいろ', hex: '#ffe217', group: 'orange' },
  { code: '80-15903', name: 'あか', hex: '#f22830', group: 'red' },
  { code: '80-15904', name: 'あお', hex: '#004fa9', group: 'blue' },
  { code: '80-15905', name: 'みどり', hex: '#008d4b', group: 'green' },
  { code: '80-15906', name: 'はいいろ', hex: '#999594', group: 'mono' },
  { code: '80-15907', name: 'くろ', hex: '#212625', group: 'mono' },
  { code: '80-15908', name: 'ちゃいろ', hex: '#9b372b', group: 'brown' },
  { code: '80-15909', name: 'パステルむらさき', hex: '#a587c5', group: 'purple' },
  { code: '80-15910', name: 'やまぶきいろ', hex: '#ffc02e', group: 'orange' },
  { code: '80-15911', name: 'スカイブルー', hex: '#ace1e5', group: 'blue' },
  { code: '80-15912', name: 'きみどり', hex: '#90ce41', group: 'green' },
  { code: '80-15913', name: 'ラムネ', hex: '#06aed5', group: 'blue' },
  { code: '80-15914', name: 'さくらいろ', hex: '#ffd3e9', group: 'red' },
  { code: '80-15915', name: 'つつじいろ', hex: '#e44e9c', group: 'red' },
  { code: '80-15916', name: 'キャラメル', hex: '#fd9d56', group: 'orange' },
  { code: '80-15917', name: 'アプリコット', hex: '#ffc8a7', group: 'orange' },
  { code: '80-15918', name: 'クリーム', hex: '#f2f1d4', group: 'orange' },
  { code: '80-15919', name: 'オレンジ', hex: '#fb8431', group: 'orange' },
  { code: '80-15920', name: 'ピンク', hex: '#f579ab', group: 'red' },
  { code: '80-15921', name: 'むらさき', hex: '#6f449a', group: 'purple' },
  { code: '80-15922', name: 'みずいろ', hex: '#0084ca', group: 'blue' },
  { code: '80-15923', name: 'こげちゃいろ', hex: '#4f2e23', group: 'brown' },
  { code: '80-15924', name: 'とうめい', hex: '#e4f8ff', group: 'special', kind: 'clear' },
  { code: '80-15925', name: 'おうどいろ', hex: '#8a502c', group: 'brown' },
  { code: '80-15926', name: 'ピーチ', hex: '#ffcfc4', group: 'orange' },
  { code: '80-15928', name: 'こむぎいろ', hex: '#be8d77', group: 'brown' },
  { code: '80-15929', name: 'マゼンタ', hex: '#f23e84', group: 'red' },
  { code: '80-15930', name: 'パステルみどり', hex: '#70cb99', group: 'green' },
  { code: '80-15931', name: 'パステルきいろ', hex: '#fff580', group: 'orange' },
  { code: '80-15932', name: 'ぶどういろ', hex: '#9b439c', group: 'purple' },
  { code: '80-15933', name: 'ラズベリー', hex: '#bf3581', group: 'red' },
  { code: '80-15934', name: 'ダークグレイ', hex: '#333334', group: 'mono' },
  { code: '80-15935', name: 'クランベリー', hex: '#862231', group: 'red' },
  { code: '80-15936', name: 'うぐいすいろ', hex: '#66ccbd', group: 'green' },
  { code: '80-15937', name: 'パステルあお', hex: '#609cdd', group: 'blue' },
  { code: '80-15938', name: 'しゅいろ', hex: '#f54b2d', group: 'red' },
  { code: '80-15939', name: 'さんごいろ', hex: '#fd997c', group: 'orange' },
  { code: '80-15940', name: 'あおむらさき', hex: '#728acd', group: 'purple' },
  { code: '80-15941', name: 'ラベンダー', hex: '#b08fca', group: 'purple' },
  { code: '80-15942', name: 'よもぎいろ', hex: '#58ba63', group: 'green' },
  { code: '80-15943', name: 'オーシャンブルー', hex: '#2f43a2', group: 'blue' },
  { code: '80-15944', name: 'あおみどり', hex: '#078f85', group: 'green' },
  { code: '80-15945', name: 'ブルーベリー', hex: '#909ad5', group: 'purple' },
  { code: '80-15946', name: 'マスカット', hex: '#d0e640', group: 'green' },
  { code: '80-15947', name: 'ライトグレイ', hex: '#c6c4c6', group: 'mono' },
  { code: '80-15948', name: 'エバーグリーン', hex: '#1c433b', group: 'green' },
  { code: '80-14118K', name: 'シルバー', hex: '#b3bac4', group: 'special', kind: 'metallic' },
  { code: '80-14119K', name: 'ミッドナイトブルー', hex: '#1a3166', group: 'blue' },
  { code: '80-14120K', name: 'タンジェリン', hex: '#ff7a12', group: 'orange' },
  { code: '80-14121K', name: 'ゴールド', hex: '#dc8444', group: 'special', kind: 'metallic' },
  { code: '80-15974K', name: 'マシュマロ', hex: '#c5bbb1', group: 'mono' },
  { code: '80-15975K', name: 'ココア', hex: '#4a2c31', group: 'brown' },
  { code: '80-15976K', name: 'オリーブ', hex: '#787a1a', group: 'green' },
  { code: '80-15977K', name: 'ミント', hex: '#6ccbc0', group: 'green' },
];

export const PALETTE_SIZE = PALETTE.length;

/** 1袋あたりの個数と価格(税込) */
export const BEADS_PER_PACK = 1000;
export const PACK_PRICE_YEN = 253;

/** ナノビーズ プレート(80-26058): 28×28ピン、約8cm角、連結可能 */
export const PLATE_PEGS = 28;
/** ビーズ1個あたりのピッチ(mm)。完成サイズの目安計算用 */
export const BEAD_PITCH_MM = 80 / PLATE_PEGS;

export const GROUPS: { id: ColorGroup; label: string }[] = [
  { id: 'mono', label: 'しろ・グレー・くろ' },
  { id: 'red', label: 'あか・ピンク' },
  { id: 'orange', label: 'オレンジ・きいろ' },
  { id: 'green', label: 'みどり' },
  { id: 'blue', label: 'あお' },
  { id: 'purple', label: 'むらさき' },
  { id: 'brown', label: 'ちゃいろ' },
  { id: 'special', label: 'とくべつな色' },
];

const codeIndex = new Map(PALETTE.map((c, i) => [c.code, i]));

export function indexOfCode(code: string): number {
  return codeIndex.get(code) ?? -1;
}

function byNames(names: string[]): number[] {
  return names.map((n) => {
    const i = PALETTE.findIndex((c) => c.name === n);
    if (i < 0) throw new Error(`unknown color: ${n}`);
    return i;
  });
}

export type PaletteSetId = 'all' | 'set12' | 'set24' | 'set48' | 'mine';

export interface PaletteSet {
  id: Exclude<PaletteSetId, 'mine'>;
  label: string;
  note: string;
  /** セットに入っている1色あたりの個数 */
  perColor: number;
  colors: number[];
}

/** 透明・メタリック以外の色 */
const regularColors = PALETTE.map((_, i) => i).filter((i) => !PALETTE[i].kind);

export const PALETTE_SETS: PaletteSet[] = [
  {
    id: 'all',
    label: '全55色',
    note: '単色で売られている全ての色',
    perColor: 0,
    colors: PALETTE.map((_, i) => i),
  },
  {
    id: 'set12',
    label: '12色セット',
    note: '80-54360 (各色300個)',
    perColor: 300,
    colors: byNames(['しろ', 'きいろ', 'あか', 'あお', 'みどり', 'スカイブルー', 'きみどり', 'ちゃいろ', 'くろ', 'むらさき', 'オレンジ', 'ピンク']),
  },
  {
    id: 'set24',
    label: '24色セット',
    note: '80-63044 (各色300個)',
    perColor: 300,
    colors: byNames([
      'しろ',
      'きいろ',
      'やまぶきいろ',
      'オレンジ',
      'さんごいろ',
      'あか',
      'ピンク',
      'さくらいろ',
      'ピーチ',
      'パステルむらさき',
      'むらさき',
      'あお',
      'みずいろ',
      'ラムネ',
      'スカイブルー',
      'きみどり',
      'みどり',
      'エバーグリーン',
      'ちゃいろ',
      'クランベリー',
      'おうどいろ',
      'こげちゃいろ',
      'はいいろ',
      'くろ',
    ]),
  },
  {
    // 発売時(2020年)の定番47色 + ゴールド。公開情報からの推定を含みます。
    id: 'set48',
    label: '48色セット',
    note: '80-54359 (各色約240個) ※内容は推定',
    perColor: 240,
    colors: byNames(
      PALETTE.filter((c) => c.code.startsWith('80-159') && !c.code.endsWith('K'))
        .map((c) => c.name)
        .concat(['ゴールド']),
    ),
  },
];

export function defaultAutoColors(): number[] {
  return regularColors.slice();
}
