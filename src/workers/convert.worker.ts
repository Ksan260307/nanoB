import { convertCells, resampleBlocks, type CellColors, type ConvertOptions, type ResampleMode } from '../lib/convert';

export interface ConvertRequest {
  id: number;
  /** 縮小済み画素のキー (同じなら画素の再送を省略) */
  key: string;
  pixels?: { data: Uint8ClampedArray; width: number; height: number };
  W: number;
  H: number;
  resample: ResampleMode;
  options: ConvertOptions;
}

export type ConvertResponse = { id: number; cells: Int16Array } | { id: number; error: string; needPixels?: boolean };

let cachedKey = '';
let cachedPixels: { data: Uint8ClampedArray; width: number; height: number } | null = null;
let cachedResample: { key: string; colors: CellColors } | null = null;

// DOM の型定義と衝突しないよう、必要な分だけ型を付ける
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ConvertRequest>) => void) | null;
  postMessage(message: ConvertResponse, transfer?: Transferable[]): void;
};

ctx.onmessage = (e: MessageEvent<ConvertRequest>) => {
  const req = e.data;
  try {
    if (req.pixels) {
      cachedKey = req.key;
      cachedPixels = req.pixels;
      cachedResample = null;
    }
    if (!cachedPixels || cachedKey !== req.key) {
      ctx.postMessage({ id: req.id, error: 'no pixels', needPixels: true } satisfies ConvertResponse);
      return;
    }
    const rkey = `${req.key}|${req.resample}`;
    if (!cachedResample || cachedResample.key !== rkey) {
      cachedResample = {
        key: rkey,
        colors: resampleBlocks(cachedPixels.data, cachedPixels.width, cachedPixels.height, req.W, req.H, req.resample),
      };
    }
    const cells = convertCells(cachedResample.colors, req.W, req.H, req.options);
    ctx.postMessage({ id: req.id, cells } satisfies ConvertResponse, [cells.buffer]);
  } catch (err) {
    ctx.postMessage({ id: req.id, error: String(err) } satisfies ConvertResponse);
  }
};
