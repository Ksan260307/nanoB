import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { ConvertOptions } from '../lib/convert';
import { convertAsync } from '../lib/converter';
import { bgKey } from '../lib/background';
import { backgroundRemoved, blockSize, decodeSource, prescale, sourceKeyOf } from '../lib/image';
import { countColors } from '../lib/pattern';
import { bgOptions, type Settings } from '../lib/project';
import { assignSymbols } from '../lib/symbols';
import { saveNow } from './library';
import { allowedColors, useStore } from './store';

export function buildConvertOptions(s: Settings, myColors: number[]): ConvertOptions {
  return {
    allowed: allowedColors(s, myColors),
    maxColors: s.maxColors,
    dither: s.dither / 100,
    brightness: s.brightness,
    contrast: s.contrast,
    saturation: s.saturation,
    cleanup: s.cleanup,
    outline: s.outline,
    outlineColor: s.outlineColor,
    replacements: s.replacements,
  };
}

/** 画像モードで設定が変わったら変換し直す */
export function useAutoConvert() {
  const project = useStore((s) => s.project);
  const myColors = useStore((s) => s.prefs.myColors);
  const setBase = useStore((s) => s.setBase);
  const setConverting = useStore((s) => s.setConverting);

  const mode = project?.mode;
  const source = project?.source ?? null;
  const settings = project?.settings;
  const width = project?.width ?? 0;
  const height = project?.height ?? 0;
  const id = project?.id;
  const hasBase = !!project?.base;
  const firstRun = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== 'image' || !source || !settings || !id) return;
    // 保存済みの変換結果がある状態で開いた直後は、変換し直さない
    if (firstRun.current !== id) {
      firstRun.current = id;
      if (hasBase) return;
    }
    let cancelled = false;
    setConverting(true);
    const timer = setTimeout(async () => {
      try {
        const img = await decodeSource(source.dataUrl);
        if (cancelled) return;
        const { crop, mirror, resample } = settings;
        const k = blockSize(source.width, source.height, crop, width, height);
        const srcKey = sourceKeyOf(source.dataUrl);
        const bg = bgOptions(settings);
        const key = [srcKey, bgKey(bg), crop.x, crop.y, crop.w, crop.h, width, height, mirror, k, resample].join('|');
        const cells = await convertAsync({
          key,
          getPixels: () => {
            const drawable = backgroundRemoved(img, source.width, source.height, bg, srcKey);
            return prescale(drawable, source.width, source.height, crop, mirror, width, height, k, resample === 'average');
          },
          W: width,
          H: height,
          resample,
          options: buildConvertOptions(settings, myColors),
        });
        if (!cancelled) setBase(cells);
      } catch (e) {
        console.error(e);
        if (!cancelled) setConverting(false);
      }
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // hasBase は初回判定にだけ使う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, source, settings, width, height, id, myColors, setBase, setConverting]);
}

/** 図案が変わったら少し待って端末に自動保存する */
export function useAutoSave() {
  const project = useStore((s) => s.project);
  const rev = useStore((s) => s.rev);
  useEffect(() => {
    if (!project) return;
    let pending = true;
    const save = () => {
      pending = false;
      void saveNow();
    };
    // 図案が変わると前のタイマーは取り消されるので、ここでは必ず図案がある
    const timer = setTimeout(save, 700);
    // ほかのアプリに切り替えた・タブを閉じるときは、待たずに保存する
    const onHide = () => {
      if (pending && document.visibilityState === 'hidden') {
        clearTimeout(timer);
        save();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [project, rev]);
}

/** 色ごとの数と記号 */
export function useColorStats() {
  const cells = useStore((s) => s.cells);
  const rev = useStore((s) => s.rev);
  return useMemo(() => {
    const counts = countColors(cells);
    const symbols = assignSymbols(counts);
    let total = 0;
    let used = 0;
    for (let i = 0; i < counts.length; i++) {
      total += counts[i];
      if (counts[i] > 0) used++;
    }
    return { counts, symbols, total, used, rev };
  }, [cells, rev]);
}

/** ダークモードかどうか */
function subscribeDark(cb: () => void) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribeDark, () => matchMedia('(prefers-color-scheme: dark)').matches);
}
