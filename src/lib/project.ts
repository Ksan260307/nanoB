/** 図案データの型・初期値・保存形式 */
import { indexOfCode, PALETTE, PLATE_PEGS, type PaletteSetId } from '../data/palette';
import type { BgMode, BgOptions, BgPoint } from './background';
import type { OutlineMode, ResampleMode } from './convert';
import type { Crop, SourceImage } from './image';
import { compose, EMPTY, NO_EDIT } from './pattern';
import type { ProjectMeta } from './storage';

export type Mode = 'image' | 'free';

export interface Settings {
  sizeMode: 'plates' | 'beads';
  platesX: number;
  platesY: number;
  width: number;
  height: number;
  /** ビーズ数で決めるとき、縦横比を画像に合わせる */
  keepAspect: boolean;
  /** custom = トリミング画面で手動調整した */
  fit: 'contain' | 'cover' | 'custom';
  crop: Crop;
  mirror: boolean;
  resample: ResampleMode;
  paletteSet: PaletteSetId;
  useClear: boolean;
  useMetallic: boolean;
  maxColors: number;
  dither: number;
  brightness: number;
  contrast: number;
  saturation: number;
  /** 取り込んだ画像の背景を透明にする */
  bgMode: BgMode;
  bgTolerance: number;
  bgGlobal: boolean;
  bgPoints: BgPoint[];
  cleanup: number;
  outline: OutlineMode;
  outlineColor: number;
  /** 使わない色 (おまかせ差し替え) */
  excluded: number[];
  /** 色の差し替え from → to */
  replacements: Record<number, number>;
}

export interface Project {
  id: string;
  name: string;
  mode: Mode;
  createdAt: number;
  updatedAt: number;
  source: SourceImage | null;
  settings: Settings;
  width: number;
  height: number;
  /** 自動変換の結果 (フリーモードでは null) */
  base: Int16Array | null;
  /** 手動編集 (NO_EDIT = 変更なし) */
  overlay: Int16Array;
  /** つくるモードのチェック */
  done: Uint8Array;
}

export const BLACK = indexOfCode('80-15907');

export const DEFAULT_SETTINGS: Settings = {
  sizeMode: 'plates',
  platesX: 2,
  platesY: 2,
  width: PLATE_PEGS * 2,
  height: PLATE_PEGS * 2,
  keepAspect: true,
  fit: 'contain',
  crop: { x: 0, y: 0, w: 1, h: 1 },
  mirror: false,
  resample: 'average',
  paletteSet: 'all',
  useClear: false,
  useMetallic: false,
  maxColors: 0,
  dither: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  bgMode: 'off',
  bgTolerance: 14,
  bgGlobal: false,
  bgPoints: [],
  cleanup: 0,
  outline: 'none',
  outlineColor: BLACK,
  excluded: [],
  replacements: {},
};

export function bgOptions(s: Settings): BgOptions {
  return { mode: s.bgMode, tolerance: s.bgTolerance, global: s.bgGlobal, points: s.bgPoints };
}

export const MIN_SIZE = 4;
export const MAX_SIZE = 280;

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createProject(mode: Mode, width: number, height: number, source: SourceImage | null, settings?: Partial<Settings>): Project {
  const now = Date.now();
  const n = width * height;
  return {
    id: newId(),
    name: source?.name || (mode === 'free' ? 'じゆう図案' : '新しい図案'),
    mode,
    createdAt: now,
    updatedAt: now,
    source,
    settings: { ...DEFAULT_SETTINGS, ...settings, width, height },
    width,
    height,
    base: null,
    // フリーモードは手動のマスがすべて (何も無い = EMPTY)
    overlay: new Int16Array(n).fill(mode === 'free' ? EMPTY : NO_EDIT),
    done: new Uint8Array(n),
  };
}

/** マイ図案の一覧に出す情報 (大きさ・ビーズの数・色の数・置いた数) */
export function projectMeta(p: Project, cells: Int16Array): ProjectMeta {
  const used = new Set<number>();
  let beads = 0;
  let placed = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] < 0) continue;
    beads++;
    used.add(cells[i]);
    if (p.done[i]) placed++;
  }
  return { width: p.width, height: p.height, beads, colors: used.size, placed };
}

// ---- シリアライズ ----

export interface ProjectFile {
  app: 'nanobeads-pattern-maker';
  version: 1;
  id: string;
  name: string;
  mode: Mode;
  createdAt: number;
  updatedAt: number;
  /** 保存時のパレット (インデックス → 品番) */
  palette: string[];
  source: SourceImage | null;
  settings: Settings;
  width: number;
  height: number;
  base: string | null;
  overlay: string;
  done: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function int16ToBase64(a: Int16Array): string {
  return bytesToBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}

function base64ToInt16(b64: string): Int16Array {
  const bytes = base64ToBytes(b64);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Int16Array(copy.buffer);
}

export function serializeProject(p: Project): ProjectFile {
  return {
    app: 'nanobeads-pattern-maker',
    version: 1,
    id: p.id,
    name: p.name,
    mode: p.mode,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    palette: PALETTE.map((c) => c.code),
    source: p.source,
    settings: p.settings,
    width: p.width,
    height: p.height,
    base: p.base ? int16ToBase64(p.base) : null,
    overlay: int16ToBase64(p.overlay),
    done: bytesToBase64(p.done),
  };
}

export function deserializeProject(f: ProjectFile): Project {
  if (!f || f.app !== 'nanobeads-pattern-maker') throw new Error('ナノビーズ図案メーカーのファイルではありません');
  try {
    return parseProject(f);
  } catch {
    throw new Error('ファイルが壊れています');
  }
}

function parseProject(f: ProjectFile): Project {
  const n = f.width * f.height;
  if (!Number.isInteger(n) || n <= 0 || f.width > MAX_SIZE * 2 || f.height > MAX_SIZE * 2) throw new Error('ファイルが壊れています');
  // 保存時と今のパレットで並びが違う場合に備えて、品番で付け替える
  const remap = f.palette.map((code) => indexOfCode(code));
  const fixColor = (v: number) => (v >= 0 ? (remap[v] ?? EMPTY) : v);
  const fixArray = (a: Int16Array) => {
    for (let i = 0; i < a.length; i++) a[i] = fixColor(a[i]);
    return a;
  };
  const base = f.base ? fixArray(base64ToInt16(f.base)) : null;
  const overlay = fixArray(base64ToInt16(f.overlay));
  if (overlay.length !== n || (base && base.length !== n)) throw new Error('ファイルが壊れています');
  const done = base64ToBytes(f.done);
  const s = { ...DEFAULT_SETTINGS, ...f.settings };
  s.bgPoints = Array.isArray(s.bgPoints) ? s.bgPoints.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
  s.outlineColor = fixColor(s.outlineColor);
  s.excluded = (s.excluded ?? []).map(fixColor).filter((v) => v >= 0);
  const rep: Record<number, number> = {};
  for (const [k, v] of Object.entries(s.replacements ?? {})) {
    const from = fixColor(Number(k));
    const to = fixColor(v);
    if (from >= 0 && to >= 0) rep[from] = to;
  }
  s.replacements = rep;
  const source = validSource(f.source);
  // 画像の無い画像モードの図案は、今の見た目のままフリーモードにする (アプリでは画像を外すとフリーモードになる)
  const free = f.mode === 'free' || !source;
  return {
    id: f.id || newId(),
    name: f.name || '図案',
    mode: free ? 'free' : 'image',
    createdAt: f.createdAt || Date.now(),
    updatedAt: f.updatedAt || Date.now(),
    source,
    settings: s,
    width: f.width,
    height: f.height,
    base: free ? null : base,
    overlay: free && f.mode !== 'free' ? compose(base, overlay) : overlay,
    done: done.length === n ? done : new Uint8Array(n),
  };
}

/** ファイルの中の画像は data: URL だけ、リンクは http(s) だけを受け付ける (外部から読み込ませない) */
function validSource(v: SourceImage | null | undefined): SourceImage | null {
  if (!v || typeof v.dataUrl !== 'string' || !v.dataUrl.startsWith('data:image/') || !(v.width > 0) || !(v.height > 0)) return null;
  return { ...v, link: typeof v.link === 'string' && /^https?:\/\//.test(v.link) ? v.link : undefined };
}
