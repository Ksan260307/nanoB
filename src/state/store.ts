import { create } from 'zustand';
import { PALETTE, PALETTE_SETS, PLATE_PEGS, type PaletteSetId } from '../data/palette';
import { deltaE2000 } from '../lib/color';
import { fitCrop, reaspectCrop, type SourceImage } from '../lib/image';
import { PALETTE_LAB } from '../lib/paletteColors';
import { compose, EMPTY, floodRegion, NO_EDIT, resizeCells } from '../lib/pattern';
import { createProject, DEFAULT_SETTINGS, type Mode, type Project, type Settings } from '../lib/project';
import type { ViewStyle } from '../lib/render';
import { loadPref, savePref } from '../lib/storage';

export type Tab = 'image' | 'size' | 'color' | 'edit' | 'chart' | 'save';
export type Tool = 'move' | 'pen' | 'eraser' | 'fill' | 'picker';
export type OwnedSet = 'none' | 'set12' | 'set24' | 'set48';

export interface Prefs {
  style: ViewStyle;
  showGrid: boolean;
  guideEvery: number;
  showPlates: boolean;
  myColors: number[];
  ownedSet: OwnedSet;
  spare: boolean;
}

interface Snapshot {
  overlay: Int16Array;
  replacements: Record<number, number>;
  excluded: number[];
}

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

interface State {
  project: Project | null;
  /** 自動変換 + 手動編集を合成した、表示・集計用のマス */
  cells: Int16Array;
  /** マスやチェックが変わるたびに増える */
  rev: number;
  converting: boolean;
  past: Snapshot[];
  future: Snapshot[];

  tab: Tab;
  tool: Tool;
  lastEditTool: Tool;
  color: number;
  focus: number | null;
  showUnderlay: boolean;
  underlayOpacity: number;
  compare: boolean;
  buildMode: boolean;
  sheetOpen: boolean;
  prefs: Prefs;
  toast: Toast | null;

  openProject: (p: Project, tab?: Tab) => void;
  closeProject: () => void;
  newImageProject: (source: SourceImage) => void;
  newFreeProject: (width: number, height: number, sizeMode: Settings['sizeMode']) => void;
  setName: (name: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resize: (width: number, height: number, patch?: Partial<Settings>) => void;
  setSource: (source: SourceImage | null) => void;
  setMode: (mode: Mode) => void;
  setBase: (cells: Int16Array) => void;
  setConverting: (v: boolean) => void;

  beginStroke: () => void;
  paint: (indices: number[], value: number) => boolean;
  endStroke: (changed: boolean) => void;
  cancelStroke: () => void;
  fillAt: (x: number, y: number, value: number) => void;
  replaceColor: (from: number, to: number | null) => void;
  restoreColor: (color: number) => void;
  clearEdits: () => void;
  clearAll: () => void;
  bakeToFree: () => void;
  undo: () => void;
  redo: () => void;

  toggleDone: (i: number) => void;
  setDone: (indices: number[], v: boolean) => void;
  clearDone: () => void;

  setTab: (tab: Tab) => void;
  setTool: (tool: Tool) => void;
  setColor: (color: number) => void;
  setFocus: (color: number | null) => void;
  setUi: (patch: Partial<Pick<State, 'showUnderlay' | 'underlayOpacity' | 'compare' | 'buildMode' | 'sheetOpen'>>) => void;
  setPrefs: (patch: Partial<Prefs>) => void;
  showToast: (text: string, action?: Toast['action']) => void;
  hideToast: () => void;
}

const DEFAULT_PREFS: Prefs = {
  style: 'bead',
  showGrid: true,
  guideEvery: 7,
  showPlates: true,
  myColors: PALETTE_SETS.find((s) => s.id === 'set24')!.colors,
  ownedSet: 'none',
  spare: true,
};

const HISTORY_LIMIT = 60;
let toastId = 0;

function snapshot(p: Project): Snapshot {
  return { overlay: p.overlay.slice(), replacements: { ...p.settings.replacements }, excluded: p.settings.excluded.slice() };
}

/** 近い色 (自分以外) */
export function nearestColors(color: number, candidates: number[], count: number): number[] {
  const lab = PALETTE_LAB[color];
  return candidates
    .filter((c) => c !== color)
    .map((c) => ({ c, d: deltaE2000(lab, PALETTE_LAB[c]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => x.c);
}

/** 自動変換で使う色 */
export function allowedColors(s: Settings, myColors: number[]): number[] {
  const set: PaletteSetId = s.paletteSet;
  const base = set === 'mine' ? myColors : (PALETTE_SETS.find((p) => p.id === set)?.colors ?? PALETTE_SETS[0].colors);
  return base.filter((i) => {
    const k = PALETTE[i]?.kind;
    if (!PALETTE[i]) return false;
    if (k === 'clear' && !s.useClear) return false;
    if (k === 'metallic' && !s.useMetallic) return false;
    return !s.excluded.includes(i);
  });
}

function sizeFromPlates(px: number, py: number) {
  return { width: px * PLATE_PEGS, height: py * PLATE_PEGS };
}

export const useStore = create<State>((set, get) => {
  const recompose = (p: Project) => {
    const cells = compose(p.base, p.overlay, get().cells);
    set({ cells, rev: get().rev + 1 });
  };

  const touch = (p: Project): Project => ({ ...p, updatedAt: Date.now() });

  return {
    project: null,
    cells: new Int16Array(0),
    rev: 0,
    converting: false,
    past: [],
    future: [],

    tab: 'image',
    tool: 'move',
    lastEditTool: 'pen',
    color: 0,
    focus: null,
    showUnderlay: false,
    underlayOpacity: 0.45,
    compare: false,
    buildMode: false,
    sheetOpen: true,
    prefs: { ...DEFAULT_PREFS, ...loadPref<Partial<Prefs>>('prefs', {}) },
    toast: null,

    openProject: (p, tab) => {
      const cells = compose(p.base, p.overlay);
      set({
        project: p,
        cells,
        rev: get().rev + 1,
        past: [],
        future: [],
        focus: null,
        compare: false,
        buildMode: false,
        tool: (tab ?? (p.mode === 'free' ? 'edit' : 'image')) === 'edit' ? 'pen' : 'move',
        showUnderlay: p.mode === 'free' && !!p.source,
        tab: tab ?? (p.mode === 'free' ? 'edit' : 'image'),
        sheetOpen: true,
      });
    },

    closeProject: () => set({ project: null, cells: new Int16Array(0), past: [], future: [], buildMode: false, focus: null }),

    newImageProject: (source) => {
      const { platesX, platesY } = DEFAULT_SETTINGS;
      const { width, height } = sizeFromPlates(platesX, platesY);
      const crop = fitCrop(source.width, source.height, width, height, 'contain');
      const p = createProject('image', width, height, source, { crop });
      get().openProject(p, 'size');
    },

    newFreeProject: (width, height, sizeMode) => {
      const p = createProject('free', width, height, null, {
        sizeMode,
        platesX: Math.max(1, Math.ceil(width / PLATE_PEGS)),
        platesY: Math.max(1, Math.ceil(height / PLATE_PEGS)),
        keepAspect: false,
      });
      get().openProject(p, 'edit');
      set({ tool: 'pen', lastEditTool: 'pen', color: PALETTE.findIndex((c) => c.name === 'くろ') });
    },

    setName: (name) => {
      const p = get().project;
      if (p) set({ project: touch({ ...p, name }) });
    },

    updateSettings: (patch) => {
      const p = get().project;
      if (!p) return;
      set({ project: touch({ ...p, settings: { ...p.settings, ...patch } }) });
    },

    resize: (width, height, patch) => {
      const p = get().project;
      if (!p) return;
      const n = width * height;
      let settings: Settings = { ...p.settings, ...patch, width, height };
      let overlay: Int16Array;
      let done: Uint8Array;
      if (p.mode === 'free') {
        overlay = resizeCells(p.overlay, p.width, p.height, width, height, EMPTY);
        const d = resizeCells(Int16Array.from(p.done), p.width, p.height, width, height, 0);
        done = Uint8Array.from(d);
      } else {
        overlay = new Int16Array(n).fill(NO_EDIT);
        done = new Uint8Array(n);
      }
      if (p.source) {
        const crop =
          settings.fit === 'custom'
            ? reaspectCrop(settings.crop, p.source.width, p.source.height, width, height)
            : fitCrop(p.source.width, p.source.height, width, height, settings.fit);
        settings = { ...settings, crop };
      }
      const next: Project = touch({ ...p, width, height, settings, overlay, done, base: null });
      set({ project: next, past: [], future: [], cells: new Int16Array(n).fill(EMPTY) });
      recompose(next);
    },

    setSource: (source) => {
      const p = get().project;
      if (!p) return;
      let settings = p.settings;
      if (source) {
        const fit = settings.fit === 'custom' ? 'contain' : settings.fit;
        settings = { ...settings, fit, crop: fitCrop(source.width, source.height, p.width, p.height, fit), bgPoints: [] };
      }
      const next = touch({ ...p, source, settings, name: p.source || !source ? p.name : source.name || p.name });
      set({ project: next, showUnderlay: p.mode === 'free' && !!source ? true : get().showUnderlay });
      if (!source && p.mode === 'image') get().setMode('free');
    },

    setMode: (mode) => {
      const p = get().project;
      if (!p || p.mode === mode) return;
      // フリーモードでは「変更なし」を「ビーズなし」として持つ
      const overlay = mode === 'free' ? p.overlay.map((v) => (v === NO_EDIT ? EMPTY : v)) : p.overlay;
      const next = touch({ ...p, mode, overlay, base: mode === 'free' ? null : p.base });
      set({ project: next });
      recompose(next);
    },

    setBase: (cells) => {
      const p = get().project;
      if (!p || p.mode !== 'image' || cells.length !== p.width * p.height) return;
      const next = { ...p, base: cells };
      set({ project: next, converting: false });
      recompose(next);
    },

    setConverting: (v) => set({ converting: v }),

    beginStroke: () => {
      const p = get().project;
      if (!p) return;
      set({ past: [...get().past.slice(-HISTORY_LIMIT + 1), snapshot(p)], future: [] });
    },

    paint: (indices, value) => {
      const p = get().project;
      if (!p) return false;
      const { cells } = get();
      let changed = false;
      for (const i of indices) {
        if (i < 0 || i >= cells.length) continue;
        const shown = value === NO_EDIT ? (p.base ? p.base[i] : EMPTY) : value;
        if (cells[i] === shown && p.overlay[i] === value) continue;
        p.overlay[i] = value;
        cells[i] = shown;
        changed = true;
      }
      if (changed) set({ rev: get().rev + 1, project: touch(p) });
      return changed;
    },

    endStroke: (changed) => {
      if (!changed) set({ past: get().past.slice(0, -1) });
    },

    cancelStroke: () => {
      const { past, project } = get();
      const last = past[past.length - 1];
      if (!project || !last) return;
      const next = { ...project, overlay: last.overlay };
      set({ project: next, past: past.slice(0, -1) });
      recompose(next);
    },

    fillAt: (x, y, value) => {
      const { project, cells } = get();
      if (!project) return;
      const region = floodRegion(cells, project.width, project.height, x, y);
      get().beginStroke();
      const changed = get().paint(region, value);
      get().endStroke(changed);
    },

    replaceColor: (from, to) => {
      const p = get().project;
      if (!p) return;
      get().beginStroke();
      const settings = { ...p.settings };
      let target = to;
      if (target === null) {
        const candidates = allowedColors({ ...settings, excluded: [...settings.excluded, from] }, get().prefs.myColors);
        // 自分以外の色は必ずあるので、いちばん近い色が見つかる
        target = nearestColors(from, candidates.length ? candidates : PALETTE.map((_, i) => i), 1)[0];
        if (p.mode === 'image') settings.excluded = [...settings.excluded.filter((c) => c !== from), from];
      } else if (p.mode === 'image') {
        const rep = { ...settings.replacements };
        for (const k of Object.keys(rep)) if (rep[Number(k)] === from) rep[Number(k)] = target;
        rep[from] = target;
        delete rep[target];
        settings.replacements = rep;
      }
      const overlay = p.overlay;
      for (let i = 0; i < overlay.length; i++) if (overlay[i] === from) overlay[i] = target;
      // 再変換が終わるまでの仮表示
      const base = p.base ? p.base.map((v) => (v === from ? target : v)) : null;
      const next = touch({ ...p, settings, overlay, base });
      set({ project: next, focus: get().focus === from ? null : get().focus, color: get().color === from ? target : get().color });
      recompose(next);
    },

    restoreColor: (color) => {
      const p = get().project;
      if (!p) return;
      get().beginStroke();
      const rep = { ...p.settings.replacements };
      delete rep[color];
      const settings = { ...p.settings, excluded: p.settings.excluded.filter((c) => c !== color), replacements: rep };
      set({ project: touch({ ...p, settings }) });
    },

    clearEdits: () => {
      const p = get().project;
      if (!p) return;
      get().beginStroke();
      const next = touch({ ...p, overlay: new Int16Array(p.overlay.length).fill(NO_EDIT) });
      set({ project: next });
      recompose(next);
    },

    clearAll: () => {
      const p = get().project;
      if (!p) return;
      get().beginStroke();
      const next = touch({ ...p, overlay: new Int16Array(p.overlay.length).fill(EMPTY) });
      set({ project: next });
      recompose(next);
    },

    bakeToFree: () => {
      const p = get().project;
      if (!p) return;
      const overlay = get().cells.slice();
      const next = touch({ ...p, mode: 'free' as Mode, base: null, overlay });
      set({ project: next, past: [], future: [], showUnderlay: false });
      recompose(next);
    },

    undo: () => {
      const { past, future, project } = get();
      if (!project || past.length === 0) return;
      const prev = past[past.length - 1];
      const cur = snapshot(project);
      const next = touch({
        ...project,
        overlay: prev.overlay,
        settings: { ...project.settings, replacements: prev.replacements, excluded: prev.excluded },
      });
      set({ project: next, past: past.slice(0, -1), future: [...future, cur] });
      recompose(next);
    },

    redo: () => {
      const { past, future, project } = get();
      if (!project || future.length === 0) return;
      const nxt = future[future.length - 1];
      const cur = snapshot(project);
      const next = touch({
        ...project,
        overlay: nxt.overlay,
        settings: { ...project.settings, replacements: nxt.replacements, excluded: nxt.excluded },
      });
      set({ project: next, future: future.slice(0, -1), past: [...past, cur] });
      recompose(next);
    },

    toggleDone: (i) => {
      const p = get().project;
      if (!p || i < 0 || i >= p.done.length) return;
      p.done[i] = p.done[i] ? 0 : 1;
      set({ rev: get().rev + 1, project: touch(p) });
    },

    setDone: (indices, v) => {
      const p = get().project;
      if (!p) return;
      for (const i of indices) p.done[i] = v ? 1 : 0;
      set({ rev: get().rev + 1, project: touch(p) });
    },

    clearDone: () => {
      const p = get().project;
      if (!p) return;
      p.done.fill(0);
      set({ rev: get().rev + 1, project: touch(p) });
    },

    setTab: (tab) => set({ tab, sheetOpen: true, tool: tab === 'edit' ? get().lastEditTool : 'move' }),
    setTool: (tool) => set(get().tab === 'edit' ? { tool, lastEditTool: tool } : { tool }),
    setColor: (color) => {
      const t = get().tool;
      const tool: Tool = t === 'fill' || t === 'pen' ? t : 'pen';
      set({ color, tool, lastEditTool: tool });
    },
    setFocus: (focus) => set({ focus }),
    setUi: (patch) => set(patch),
    setPrefs: (patch) => {
      const prefs = { ...get().prefs, ...patch };
      savePref('prefs', prefs);
      set({ prefs });
    },
    showToast: (text, action) => set({ toast: { id: ++toastId, text, action } }),
    hideToast: () => set({ toast: null }),
  };
});

export function plateSizeLabel(width: number, height: number): string {
  const cols = Math.ceil(width / PLATE_PEGS);
  const rows = Math.ceil(height / PLATE_PEGS);
  return `${cols * rows}枚 (よこ${cols}×たて${rows})`;
}
