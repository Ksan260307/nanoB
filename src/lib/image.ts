/** 画像の読み込み・切り抜き計算・変換前の縮小・背景の透明化 */
import { bgEnabled, bgKey, computeMask, type BgOptions } from './background';

export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SourceImage {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
  /** ネットの画像の作者・ライセンス表示 */
  credit?: string;
  /** 元のページ */
  link?: string;
}

const MAX_SOURCE = 1600;

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // ネットの画像を canvas で読めるように (CORS)
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = src;
  });
}

/** ファイル/URL を読み込み、長辺 MAX_SOURCE px 以下に縮小した dataURL にする */
export async function importImage(input: File | string, name?: string): Promise<SourceImage> {
  const url = typeof input === 'string' ? input : URL.createObjectURL(input);
  try {
    const img = await loadHtmlImage(url);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) {
      // サイズ指定のない SVG
      w = 512;
      h = 512;
    }
    const scale = Math.min(1, MAX_SOURCE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    let hasAlpha = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) {
        hasAlpha = true;
        break;
      }
    }
    const dataUrl = hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
    const fileName = name ?? (typeof input === 'string' ? (input.split('/').pop() ?? '画像') : input.name);
    return { dataUrl, width: cw, height: ch, name: fileName.replace(/\.[^.]+$/, '') };
  } finally {
    if (typeof input !== 'string') URL.revokeObjectURL(url);
  }
}

const decoded = new Map<string, Promise<HTMLImageElement>>();

/** dataURL から HTMLImageElement を得る (キャッシュ付き) */
export function decodeSource(dataUrl: string): Promise<HTMLImageElement> {
  let p = decoded.get(dataUrl);
  if (!p) {
    if (decoded.size > 6) decoded.clear();
    p = loadHtmlImage(dataUrl);
    decoded.set(dataUrl, p);
  }
  return p;
}

/**
 * 図案の縦横比 (gw:gh) に合わせた切り抜き範囲。
 * contain: 画像全体が入る (余白は透明) / cover: 枠いっぱい (はみ出しはカット)
 */
export function fitCrop(imgW: number, imgH: number, gw: number, gh: number, mode: 'contain' | 'cover'): Crop {
  const gridAspect = gw / gh;
  const imgAspect = imgW / imgH;
  let w: number;
  let h: number;
  if ((mode === 'contain') === imgAspect > gridAspect) {
    w = 1;
    h = imgAspect / gridAspect;
  } else {
    h = 1;
    w = gridAspect / imgAspect;
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

/** 切り抜き範囲の縦横比を図案に合わせ直す (中心を保つ) */
export function reaspectCrop(crop: Crop, imgW: number, imgH: number, gw: number, gh: number): Crop {
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  const areaPx = crop.w * imgW * crop.h * imgH;
  const aspect = gw / gh;
  const wPx = Math.sqrt(areaPx * aspect);
  const hPx = wPx / aspect;
  const w = wPx / imgW;
  const h = hPx / imgH;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** 1ビーズあたり何px で縮小するか (大きすぎる計算を避ける) */
export function blockSize(imgW: number, imgH: number, crop: Crop, gw: number, gh: number): number {
  const pxPerCell = Math.min((crop.w * imgW) / gw, (crop.h * imgH) / gh);
  return Math.max(1, Math.min(8, Math.floor(pxPerCell)));
}

/**
 * 切り抜き範囲を gw*k × gh*k の画素に描いて返す (はみ出し部分は透明)
 */
export function prescale(
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  crop: Crop,
  mirror: boolean,
  gw: number,
  gh: number,
  k: number,
  smooth: boolean,
): ImageData {
  const W = gw * k;
  const H = gh * k;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = smooth;
  ctx.imageSmoothingQuality = 'high';
  const dw = W / crop.w;
  const dh = H / crop.h;
  const dx = -crop.x * dw;
  const dy = -crop.y * dh;
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, 0, 0, imgW, imgH, dx, dy, dw, dh);
  return ctx.getImageData(0, 0, W, H);
}

/** 画像上の1点の色 (背景色の指定用) */
export function sampleImageColor(img: CanvasImageSource, imgW: number, imgH: number, nx: number, ny: number): [number, number, number] | null {
  if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, nx * imgW - 0.5, ny * imgH - 0.5, 1, 1, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return d[3] < 128 ? null : [d[0], d[1], d[2]];
}

// ---- 背景の透明化 ----

/** マスク計算用に縮小した画素 */
export function workingImageData(img: CanvasImageSource, imgW: number, imgH: number, max = 480): ImageData {
  const scale = Math.min(1, max / Math.max(imgW, imgH));
  const w = Math.max(1, Math.round(imgW * scale));
  const h = Math.max(1, Math.round(imgH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, imgW, imgH, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** マスク (0..255) を、元の画像の大きさに合わせて画像に適用した canvas */
export function applyMask(img: CanvasImageSource, imgW: number, imgH: number, mask: Uint8Array, mw: number, mh: number): HTMLCanvasElement {
  const mc = document.createElement('canvas');
  mc.width = mw;
  mc.height = mh;
  const mctx = mc.getContext('2d')!;
  const md = mctx.createImageData(mw, mh);
  for (let i = 0; i < mask.length; i++) md.data[i * 4 + 3] = mask[i];
  mctx.putImageData(md, 0, 0);
  const out = document.createElement('canvas');
  out.width = imgW;
  out.height = imgH;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(img, 0, 0, imgW, imgH);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mc, 0, 0, imgW, imgH);
  return out;
}

let maskedCache: { key: string; canvas: HTMLCanvasElement } | null = null;

/** 背景を透明にした画像 (設定がオフなら元の画像) */
export function backgroundRemoved(img: HTMLImageElement, imgW: number, imgH: number, bg: BgOptions, sourceKey: string): CanvasImageSource {
  if (!bgEnabled(bg)) return img;
  const key = `${sourceKey}|${bgKey(bg)}`;
  if (maskedCache?.key === key) return maskedCache.canvas;
  const small = workingImageData(img, imgW, imgH);
  const mask = computeMask(small.data, small.width, small.height, bg);
  const canvas = applyMask(img, imgW, imgH, mask, small.width, small.height);
  maskedCache = { key, canvas };
  return canvas;
}

const hashCache = new Map<string, string>();

/** dataURL のハッシュ (キャッシュのキー用。全文字を使う FNV-1a を2通り) */
export function sourceKeyOf(dataUrl: string): string {
  let h = hashCache.get(dataUrl);
  if (h) return h;
  let x = 2166136261;
  let y = 5381;
  for (let i = 0; i < dataUrl.length; i++) {
    const c = dataUrl.charCodeAt(i);
    x = Math.imul(x ^ c, 16777619);
    y = (Math.imul(y, 33) + c) | 0;
  }
  h = `${(x >>> 0).toString(36)}${(y >>> 0).toString(36)}-${dataUrl.length}`;
  if (hashCache.size > 8) hashCache.clear();
  hashCache.set(dataUrl, h);
  return h;
}
