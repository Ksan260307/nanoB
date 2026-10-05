/**
 * ネットの画像検索 (Openverse API: https://openverse.org)
 *
 * - API キー不要・ブラウザから直接使える (CORS 対応)
 * - クリエイティブ・コモンズ等の、自由に使えるライセンスの画像だけが対象
 * - 成人向けの画像は除外 (mature=false)
 * - 匿名利用の制限: 1回20件まで、20回/分、200回/日 (IP ごと)
 */

export type SearchCategory = 'all' | 'illustration' | 'photograph';

export interface SearchResult {
  id: string;
  title: string;
  /** 一覧用の小さな画像 */
  thumb: string;
  /** 図案に使う大きめの画像 (CORS 対応のプロキシ) */
  full: string;
  creator: string;
  license: string;
  licenseUrl: string;
  landingUrl: string;
  attribution: string;
  width: number;
  height: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  rateLimited: boolean;
  failed: boolean;
}

const API = 'https://api.openverse.org/v1/images/';
export const PAGE_SIZE = 20;
/** 目標の件数 (足りなければ MAX_PAGES まで続けて取得) */
export const TARGET_RESULTS = 100;
export const MAX_PAGES = 8;

interface OpenverseImage {
  id: string;
  title?: string | null;
  thumbnail?: string | null;
  creator?: string | null;
  license?: string | null;
  license_version?: string | null;
  license_url?: string | null;
  foreign_landing_url?: string | null;
  attribution?: string | null;
  width?: number | null;
  height?: number | null;
  mature?: boolean;
  unstable__sensitivity?: string[];
}

interface OpenverseResponse {
  result_count?: number;
  results?: OpenverseImage[];
}

export function licenseLabel(code: string | null | undefined, version: string | null | undefined): string {
  if (!code) return '不明';
  const c = code.toLowerCase();
  if (c === 'cc0') return 'CC0（パブリックドメイン）';
  if (c === 'pdm') return 'パブリックドメイン';
  return `CC ${c.toUpperCase()}${version ? ` ${version}` : ''}`;
}

export function toResult(r: OpenverseImage): SearchResult | null {
  if (!r?.id || r.mature || (r.unstable__sensitivity && r.unstable__sensitivity.length)) return null;
  const thumb = r.thumbnail || `${API}${r.id}/thumb/`;
  return {
    id: r.id,
    title: (r.title || '無題').slice(0, 80),
    thumb,
    full: `${API}${r.id}/thumb/?full_size=true`,
    creator: r.creator || '不明',
    license: licenseLabel(r.license, r.license_version),
    licenseUrl: r.license_url || '',
    landingUrl: r.foreign_landing_url || '',
    attribution: r.attribution || '',
    width: r.width || 0,
    height: r.height || 0,
  };
}

export function buildSearchUrl(query: string, page: number, category: SearchCategory, bust?: string): string {
  const p = new URLSearchParams({ q: query, page: String(page), page_size: String(PAGE_SIZE), mature: 'false' });
  if (category !== 'all') p.set('category', category);
  if (bust) p.set('_', bust);
  return `${API}?${p.toString()}`;
}

/**
 * 複数ページを順番に取得し、約 target 件 (既定 100件) の候補を返す。
 * (同時に投げると CDN でまとめられて同じページが返ってくることがあるため、1ページずつ取得する)
 */
export async function searchImages(
  query: string,
  category: SearchCategory,
  opts: {
    target?: number;
    maxPages?: number;
    startPage?: number;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
    /** ページを受け取るたびに、それまでの結果を通知 */
    onProgress?: (results: SearchResult[]) => void;
  } = {},
): Promise<SearchResponse> {
  const q = query.trim();
  if (!q) return { results: [], total: 0, rateLimited: false, failed: false };
  const target = opts.target ?? TARGET_RESULTS;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const start = opts.startPage ?? 1;
  const f = opts.fetchImpl ?? fetch;
  let rateLimited = false;
  let failed = false;
  let total = 0;
  const seen = new Set<string>();
  const results: SearchResult[] = [];

  /** null = これ以上取得しない */
  const fetchPage = async (page: number, bust?: string): Promise<OpenverseImage[] | null> => {
    try {
      const res = await f(buildSearchUrl(q, page, category, bust), { signal: opts.signal });
      if (res.status === 429) {
        rateLimited = true;
        return null;
      }
      if (!res.ok) {
        // 400/404 は結果の最後を超えた場合
        if (res.status !== 400 && res.status !== 404) failed = true;
        return null;
      }
      const json = (await res.json()) as OpenverseResponse;
      total = Math.max(total, json.result_count ?? 0);
      return json.results ?? [];
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      failed = true;
      return null;
    }
  };

  for (let i = 0; i < maxPages && results.length < target; i++) {
    const page = start + i;
    const items = await fetchPage(page);
    if (!items) break;
    let fresh = items.filter((r) => r?.id && !seen.has(r.id));
    if (items.length && !fresh.length) {
      // キャッシュに前のページが残っている → キャッシュを避けて取り直す
      const retry = await fetchPage(page, String(Date.now()));
      fresh = (retry ?? []).filter((r) => r?.id && !seen.has(r.id));
    }
    for (const r of fresh) {
      seen.add(r.id);
      const item = toResult(r);
      if (item) results.push(item);
    }
    opts.onProgress?.(results.slice());
    if (items.length < PAGE_SIZE || (total && page * PAGE_SIZE >= total)) break;
  }
  return { results: results.slice(0, target), total, rateLimited, failed: failed && results.length === 0 };
}

/** よく使うモチーフの日本語 → 英語 (英語のほうが候補が多く見つかる) */
const DICTIONARY: Record<string, string> = {
  ねこ: 'cat',
  猫: 'cat',
  ネコ: 'cat',
  いぬ: 'dog',
  犬: 'dog',
  イヌ: 'dog',
  うさぎ: 'rabbit',
  ウサギ: 'rabbit',
  くま: 'bear',
  クマ: 'bear',
  パンダ: 'panda',
  ペンギン: 'penguin',
  とり: 'bird',
  鳥: 'bird',
  ことり: 'bird',
  さかな: 'fish',
  魚: 'fish',
  きんぎょ: 'goldfish',
  金魚: 'goldfish',
  いるか: 'dolphin',
  イルカ: 'dolphin',
  くじら: 'whale',
  クジラ: 'whale',
  ぞう: 'elephant',
  ゾウ: 'elephant',
  きりん: 'giraffe',
  キリン: 'giraffe',
  ライオン: 'lion',
  とら: 'tiger',
  トラ: 'tiger',
  さる: 'monkey',
  サル: 'monkey',
  きつね: 'fox',
  キツネ: 'fox',
  たぬき: 'raccoon dog',
  ハムスター: 'hamster',
  かえる: 'frog',
  カエル: 'frog',
  かめ: 'turtle',
  カメ: 'turtle',
  ちょうちょ: 'butterfly',
  ちょう: 'butterfly',
  蝶: 'butterfly',
  てんとうむし: 'ladybug',
  きょうりゅう: 'dinosaur',
  恐竜: 'dinosaur',
  ひよこ: 'chick',
  にわとり: 'chicken',
  ふくろう: 'owl',
  フクロウ: 'owl',
  うま: 'horse',
  馬: 'horse',
  はな: 'flower',
  花: 'flower',
  さくら: 'cherry blossom',
  桜: 'cherry blossom',
  ひまわり: 'sunflower',
  バラ: 'rose',
  ばら: 'rose',
  チューリップ: 'tulip',
  き: 'tree',
  木: 'tree',
  くさ: 'grass',
  葉っぱ: 'leaf',
  はっぱ: 'leaf',
  くだもの: 'fruit',
  果物: 'fruit',
  いちご: 'strawberry',
  りんご: 'apple',
  リンゴ: 'apple',
  みかん: 'orange fruit',
  ぶどう: 'grapes',
  バナナ: 'banana',
  もも: 'peach',
  すいか: 'watermelon',
  スイカ: 'watermelon',
  メロン: 'melon',
  ケーキ: 'cake',
  ドーナツ: 'donut',
  アイス: 'ice cream',
  アイスクリーム: 'ice cream',
  パン: 'bread',
  おにぎり: 'onigiri',
  すし: 'sushi',
  寿司: 'sushi',
  ハンバーガー: 'hamburger',
  ピザ: 'pizza',
  クッキー: 'cookie',
  マカロン: 'macaron',
  くるま: 'car',
  車: 'car',
  でんしゃ: 'train',
  電車: 'train',
  しんかんせん: 'shinkansen',
  新幹線: 'shinkansen',
  ひこうき: 'airplane',
  飛行機: 'airplane',
  ふね: 'ship',
  船: 'ship',
  じてんしゃ: 'bicycle',
  自転車: 'bicycle',
  ロケット: 'rocket',
  ほし: 'star',
  星: 'star',
  つき: 'moon',
  月: 'moon',
  たいよう: 'sun',
  太陽: 'sun',
  にじ: 'rainbow',
  虹: 'rainbow',
  くも: 'cloud',
  雲: 'cloud',
  ゆき: 'snow',
  雪: 'snow',
  ゆきだるま: 'snowman',
  やま: 'mountain',
  山: 'mountain',
  うみ: 'sea',
  海: 'sea',
  ふじさん: 'Mount Fuji',
  富士山: 'Mount Fuji',
  ハート: 'heart',
  リボン: 'ribbon',
  かんむり: 'crown',
  王冠: 'crown',
  ダイヤ: 'diamond',
  ほうせき: 'gem',
  クリスマス: 'christmas',
  サンタ: 'santa claus',
  ハロウィン: 'halloween',
  かぼちゃ: 'pumpkin',
  おばけ: 'ghost',
  こいのぼり: 'koinobori',
  ひなまつり: 'hina doll',
  おしろ: 'castle',
  城: 'castle',
  いえ: 'house',
  家: 'house',
  ロボット: 'robot',
  かお: 'face',
  えがお: 'smile',
  ねこのかお: 'cat face',
  にんじゃ: 'ninja',
  忍者: 'ninja',
  ドット絵: 'pixel art',
  アイコン: 'icon',
  もよう: 'pattern',
  模様: 'pattern',
  おばけかぼちゃ: 'jack o lantern',
};

export function translateQuery(q: string): string | null {
  const t = q.trim();
  return DICTIONARY[t] ?? null;
}

export const SUGGESTIONS = ['ねこ', 'いぬ', 'うさぎ', 'ペンギン', 'はな', 'いちご', 'ケーキ', 'くるま', 'きょうりゅう', 'ほし', 'にじ', 'ドット絵'];
