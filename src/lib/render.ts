/** 図案を canvas に描く (画面表示・書き出し共通) */
import { PALETTE, PLATE_PEGS } from '../data/palette';
import { shade, textColorFor } from './color';
import { EMPTY } from './pattern';

export type ViewStyle = 'bead' | 'flat' | 'symbol';

export interface Theme {
  background: string;
  plate: string;
  peg: string;
  grid: string;
  guide: string;
  plateLine: string;
  veil: string;
}

export const LIGHT_THEME: Theme = {
  background: '#f4efe9',
  plate: '#dfd9d3',
  peg: '#c9c1b9',
  grid: 'rgba(60, 40, 30, 0.13)',
  guide: 'rgba(60, 40, 30, 0.38)',
  plateLine: 'rgba(230, 60, 110, 0.85)',
  veil: 'rgba(255, 255, 255, 0.82)',
};

export const DARK_THEME: Theme = {
  background: '#17161a',
  plate: '#25232a',
  peg: '#3a3740',
  grid: 'rgba(255, 255, 255, 0.10)',
  guide: 'rgba(255, 255, 255, 0.32)',
  plateLine: 'rgba(255, 110, 160, 0.9)',
  veil: 'rgba(23, 22, 26, 0.8)',
};

export interface Underlay {
  image: CanvasImageSource;
  imageWidth: number;
  imageHeight: number;
  /** 画像上の切り抜き範囲 (0..1、はみ出し可) */
  crop: { x: number; y: number; w: number; h: number };
  mirror: boolean;
  opacity: number;
}

export interface RenderOptions {
  cells: Int16Array;
  width: number;
  height: number;
  /** 1マスの大きさ (canvas の px) */
  cell: number;
  /** マス(0,0) の左上の位置 (canvas の px) */
  ox: number;
  oy: number;
  /** canvas の大きさ */
  viewW: number;
  viewH: number;
  style: ViewStyle;
  theme: Theme;
  symbols?: Map<number, string> | null;
  showGrid?: boolean;
  /** 補助線の間隔 (プレートごとに数える。0 = なし) */
  guideEvery?: number;
  showPlates?: boolean;
  /** この色だけを強調 */
  focus?: number | null;
  /** 完成チェック (1 = 置いた) */
  done?: Uint8Array | null;
  /** 描く範囲を制限 (プレート表示用) */
  region?: { x: number; y: number; w: number; h: number } | null;
  underlay?: Underlay | null;
  /** 1マス=1px の画像 (縮小表示の高速化用。無ければ作る) */
  bitmap?: HTMLCanvasElement | OffscreenCanvas | null;
  /** 透明ビーズを描かない (下絵の確認用など) */
  clearBackground?: boolean;
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h);
}

function ctx2d(c: AnyCanvas): CanvasRenderingContext2D {
  return c.getContext('2d') as CanvasRenderingContext2D;
}

/** 1マス=1px のビットマップ */
export function makeBitmap(cells: Int16Array, width: number, height: number): AnyCanvas {
  const c = createCanvas(width, height);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(width, height);
  const rgb = PALETTE.map((p) => [parseInt(p.hex.slice(1, 3), 16), parseInt(p.hex.slice(3, 5), 16), parseInt(p.hex.slice(5, 7), 16)]);
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v < 0) continue;
    const [r, g, b] = rgb[v];
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---- スプライト (色×大きさごとにキャッシュ) ----
const spriteCache = new Map<string, AnyCanvas>();

function beadSprite(color: number, size: number): AnyCanvas {
  const key = `b${color}:${size}`;
  let s = spriteCache.get(key);
  if (s) return s;
  if (spriteCache.size > 800) spriteCache.clear();
  s = createCanvas(size, size);
  const ctx = ctx2d(s);
  const p = PALETTE[color];
  const r = size / 2;
  const outer = r * 0.94;
  const hole = r * 0.36;
  ctx.beginPath();
  ctx.arc(r, r, outer, 0, Math.PI * 2);
  ctx.arc(r, r, hole, 0, Math.PI * 2, true);
  if (p.kind === 'metallic') {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, shade(p.hex, 0.45));
    g.addColorStop(0.5, p.hex);
    g.addColorStop(1, shade(p.hex, -0.3));
    ctx.fillStyle = g;
  } else if (p.kind === 'clear') {
    ctx.fillStyle = 'rgba(200, 230, 245, 0.55)';
  } else {
    ctx.fillStyle = p.hex;
  }
  ctx.fill('evenodd');
  if (size >= 8) {
    ctx.lineWidth = Math.max(1, size / 24);
    ctx.strokeStyle = p.kind === 'clear' ? 'rgba(120, 160, 190, 0.8)' : shade(p.hex, -0.22);
    ctx.beginPath();
    ctx.arc(r, r, outer - ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    // ハイライト
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, size / 14);
    ctx.beginPath();
    ctx.arc(r, r, (outer + hole) / 2, Math.PI * 1.05, Math.PI * 1.45);
    ctx.stroke();
  }
  spriteCache.set(key, s);
  return s;
}

function pegSprite(size: number, theme: Theme): AnyCanvas {
  const key = `p:${size}:${theme.peg}`;
  let s = spriteCache.get(key);
  if (s) return s;
  s = createCanvas(size, size);
  const ctx = ctx2d(s);
  ctx.fillStyle = theme.peg;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, Math.max(1, size * 0.16), 0, Math.PI * 2);
  ctx.fill();
  spriteCache.set(key, s);
  return s;
}

function symbolSprite(color: number, symbol: string, size: number): AnyCanvas {
  const key = `s${color}:${symbol}:${size}`;
  let s = spriteCache.get(key);
  if (s) return s;
  s = createCanvas(size, size);
  const ctx = ctx2d(s);
  const p = PALETTE[color];
  ctx.fillStyle = p.hex;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = textColorFor(p.hex);
  ctx.font = `bold ${Math.round(size * 0.62)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, size / 2, size / 2 + size * 0.04);
  spriteCache.set(key, s);
  return s;
}

function checkSprite(size: number): AnyCanvas {
  const key = `c:${size}`;
  let s = spriteCache.get(key);
  if (s) return s;
  s = createCanvas(size, size);
  const ctx = ctx2d(s);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#1aa36f';
  ctx.lineWidth = Math.max(1.5, size / 8);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.24, size * 0.52);
  ctx.lineTo(size * 0.43, size * 0.7);
  ctx.lineTo(size * 0.77, size * 0.3);
  ctx.stroke();
  spriteCache.set(key, s);
  return s;
}

/** 下絵(元画像)を、図案のマス目に合わせて描く */
export function drawUnderlay(ctx: CanvasRenderingContext2D, u: Underlay, width: number, height: number, cell: number, ox: number, oy: number) {
  const gw = width * cell;
  const gh = height * cell;
  const dw = gw / u.crop.w;
  const dh = gh / u.crop.h;
  const dx = -u.crop.x * dw;
  const dy = -u.crop.y * dh;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, gw, gh);
  ctx.clip();
  ctx.globalAlpha = u.opacity;
  ctx.imageSmoothingEnabled = true;
  if (u.mirror) {
    ctx.translate(ox + gw, oy);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(ox, oy);
  }
  ctx.drawImage(u.image, 0, 0, u.imageWidth, u.imageHeight, dx, dy, dw, dh);
  ctx.restore();
}

export function renderPattern(ctx: CanvasRenderingContext2D, o: RenderOptions): void {
  const { cells, width, height, cell, ox, oy, viewW, viewH, theme } = o;
  const region = o.region ?? { x: 0, y: 0, w: width, h: height };

  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, viewW, viewH);

  // 表示範囲のマス
  const x0 = Math.max(region.x, Math.floor(-ox / cell));
  const y0 = Math.max(region.y, Math.floor(-oy / cell));
  const x1 = Math.min(region.x + region.w, Math.ceil((viewW - ox) / cell));
  const y1 = Math.min(region.y + region.h, Math.ceil((viewH - oy) / cell));

  // プレート面
  const rx = ox + region.x * cell;
  const ry = oy + region.y * cell;
  const rw = region.w * cell;
  const rh = region.h * cell;
  ctx.fillStyle = theme.plate;
  ctx.fillRect(rx, ry, rw, rh);

  if (o.underlay) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    ctx.clip();
    drawUnderlay(ctx, o.underlay, width, height, cell, ox, oy);
    ctx.restore();
  }

  if (x1 > x0 && y1 > y0) {
    const focus = o.focus ?? null;
    const done = o.done ?? null;
    const small = cell < 5;
    const useBitmap = small || o.style === 'flat';
    if (useBitmap) {
      const bmp = o.bitmap ?? makeBitmap(cells, width, height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bmp, region.x, region.y, region.w, region.h, rx, ry, rw, rh);
      if (focus !== null || done) {
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = y * width + x;
            const c = cells[i];
            if (focus !== null && c !== focus && c !== EMPTY) {
              ctx.fillStyle = theme.veil;
              ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
            } else if (done && done[i] && c !== EMPTY && !small) {
              ctx.drawImage(checkSprite(Math.ceil(cell)), ox + x * cell, oy + y * cell, cell, cell);
            }
          }
        }
      }
    } else {
      const size = Math.max(2, Math.round(cell));
      const peg = o.style === 'bead' ? pegSprite(size, theme) : null;
      const showSymbol = o.style === 'symbol' && !!o.symbols && cell >= 9;
      for (let y = y0; y < y1; y++) {
        const py = oy + y * cell;
        for (let x = x0; x < x1; x++) {
          const i = y * width + x;
          const c = cells[i];
          const px = ox + x * cell;
          if (c === EMPTY) {
            if (peg) ctx.drawImage(peg, px, py, cell, cell);
            continue;
          }
          const dim = focus !== null && c !== focus;
          if (dim) ctx.globalAlpha = 0.16;
          if (o.style === 'bead') {
            ctx.drawImage(beadSprite(c, size), px, py, cell, cell);
          } else if (showSymbol) {
            ctx.drawImage(symbolSprite(c, o.symbols!.get(c) ?? '?', size), px, py, cell, cell);
          } else {
            ctx.fillStyle = PALETTE[c].hex;
            ctx.fillRect(px, py, cell, cell);
          }
          if (dim) ctx.globalAlpha = 1;
          if (done && done[i]) ctx.drawImage(checkSprite(size), px, py, cell, cell);
        }
      }
    }

    // マス目
    const lineW = Math.max(1, Math.round(cell / 28));
    if (o.showGrid && cell >= 6) {
      ctx.fillStyle = theme.grid;
      for (let x = x0; x <= x1; x++) ctx.fillRect(Math.round(ox + x * cell), ry, lineW, rh);
      for (let y = y0; y <= y1; y++) ctx.fillRect(rx, Math.round(oy + y * cell), rw, lineW);
    }
    const guide = o.guideEvery ?? 0;
    if (guide > 0 && cell >= 3) {
      ctx.fillStyle = theme.guide;
      const gw = Math.max(1, lineW + (cell >= 14 ? 1 : 0));
      for (let x = x0; x <= x1; x++) {
        if (x % PLATE_PEGS !== 0 && (x % PLATE_PEGS) % guide === 0) ctx.fillRect(Math.round(ox + x * cell - gw / 2), ry, gw, rh);
      }
      for (let y = y0; y <= y1; y++) {
        if (y % PLATE_PEGS !== 0 && (y % PLATE_PEGS) % guide === 0) ctx.fillRect(rx, Math.round(oy + y * cell - gw / 2), rw, gw);
      }
    }
    if (o.showPlates) {
      ctx.fillStyle = theme.plateLine;
      const pw = Math.max(2, Math.round(cell / 9));
      for (let x = Math.ceil(x0 / PLATE_PEGS) * PLATE_PEGS; x <= x1; x += PLATE_PEGS) {
        if (x > region.x && x < region.x + region.w) ctx.fillRect(Math.round(ox + x * cell - pw / 2), ry, pw, rh);
      }
      for (let y = Math.ceil(y0 / PLATE_PEGS) * PLATE_PEGS; y <= y1; y += PLATE_PEGS) {
        if (y > region.y && y < region.y + region.h) ctx.fillRect(rx, Math.round(oy + y * cell - pw / 2), rw, pw);
      }
    }
  }

  // 外枠
  ctx.strokeStyle = theme.guide;
  ctx.lineWidth = Math.max(1, Math.round(cell / 20));
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.restore();
}

/** 指定サイズに収まるサムネイル (dataURL) */
export function thumbnailDataUrl(cells: Int16Array, width: number, height: number, max = 160): string {
  const cell = Math.max(1, Math.floor(max / Math.max(width, height)));
  const c = document.createElement('canvas');
  c.width = width * cell;
  c.height = height * cell;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(makeBitmap(cells, width, height), 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
