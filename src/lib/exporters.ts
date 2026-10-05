/** 図案を画像 (PNG) と印刷用 PDF に書き出す */
import { BEADS_PER_PACK, PALETTE, PLATE_PEGS } from '../data/palette';
import { textColorFor } from './color';
import { buildPdf, type PdfPage } from './pdf';
import { countColors, countInRect, plateLayout, plateRect } from './pattern';
import { LIGHT_THEME, renderPattern, type Theme, type ViewStyle } from './render';
import { formatCm } from './shopping';
import { assignSymbols } from './symbols';

export interface ExportInput {
  name: string;
  cells: Int16Array;
  width: number;
  height: number;
  guideEvery: number;
  /** 元画像の作者・ライセンス (ネットの画像を使ったとき) */
  credit?: string;
}

const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif';
const PRINT_THEME: Theme = { ...LIGHT_THEME, background: '#ffffff', plate: '#ffffff', peg: '#e6e2de', grid: 'rgba(0,0,0,0.22)', guide: 'rgba(0,0,0,0.55)' };

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  return [c, ctx];
}

function font(size: number, weight = 400) {
  return `${weight} ${size}px ${FONT}`;
}

/** 図案部分だけを描いた canvas */
function gridCanvas(input: ExportInput, cell: number, style: ViewStyle, symbols: Map<number, string>, region?: { x: number; y: number; w: number; h: number }) {
  const r = region ?? { x: 0, y: 0, w: input.width, h: input.height };
  const [c, ctx] = canvas(r.w * cell, r.h * cell);
  renderPattern(ctx, {
    cells: input.cells,
    width: input.width,
    height: input.height,
    cell,
    ox: -r.x * cell,
    oy: -r.y * cell,
    viewW: c.width,
    viewH: c.height,
    style,
    theme: PRINT_THEME,
    symbols,
    showGrid: true,
    guideEvery: input.guideEvery,
    showPlates: true,
    region: r,
  });
  return c;
}

interface LegendItem {
  color: number;
  count: number;
  symbol: string;
}

function legendItems(counts: Int32Array, symbols: Map<number, string>): LegendItem[] {
  const items: LegendItem[] = [];
  for (let i = 0; i < counts.length; i++) if (counts[i] > 0) items.push({ color: i, count: counts[i], symbol: symbols.get(i) ?? '' });
  return items.sort((a, b) => b.count - a.count);
}

function drawSwatch(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: number, symbol: string) {
  const p = PALETTE[color];
  ctx.fillStyle = p.kind === 'clear' ? '#e8f4fa' : p.hex;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = textColorFor(p.hex);
  ctx.font = font(Math.round(size * 0.6), 700);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x + size / 2, y + size / 2 + 1);
}

/** 凡例 (カラーチャート) を描き、使った高さを返す */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  items: LegendItem[],
  x: number,
  y: number,
  w: number,
  cols: number,
  rowH: number,
  withPacks: boolean,
): number {
  const colW = w / cols;
  const sw = Math.round(rowH * 0.72);
  items.forEach((it, k) => {
    const cx = x + (k % cols) * colW;
    const cy = y + Math.floor(k / cols) * rowH;
    drawSwatch(ctx, cx, cy + (rowH - sw) / 2, sw, it.color, it.symbol);
    const p = PALETTE[it.color];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#222';
    ctx.font = font(Math.round(rowH * 0.36), 700);
    ctx.fillText(p.name, cx + sw + 10, cy + rowH * 0.36, colW - sw - 20);
    ctx.fillStyle = '#666';
    ctx.font = font(Math.round(rowH * 0.28));
    const packs = Math.ceil(it.count / BEADS_PER_PACK);
    ctx.fillText(`${p.code}  ${it.count.toLocaleString()}個${withPacks ? `（${packs}袋）` : ''}`, cx + sw + 10, cy + rowH * 0.72, colW - sw - 20);
  });
  return Math.ceil(items.length / cols) * rowH;
}

function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  cell: number,
  count: number,
  horizontal: boolean,
  start: number,
  every: number,
  size: number,
) {
  ctx.fillStyle = '#555';
  ctx.font = font(size, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < count; i++) {
    const n = start + i + 1;
    if (every > 1 && n !== 1 && n % every !== 0) continue;
    const pos = (horizontal ? x0 : y0) + i * cell + cell / 2;
    if (horizontal) ctx.fillText(String(n), pos, y0);
    else ctx.fillText(String(n), x0, pos);
  }
}

/** 1枚画像の図案 (タイトル・座標・カラーチャート付き) */
export function renderSheet(input: ExportInput, style: ViewStyle): HTMLCanvasElement {
  const { width: W, height: H } = input;
  const counts = countColors(input.cells);
  const symbols = assignSymbols(counts);
  const items = legendItems(counts, symbols);
  const maxSide = Math.max(W, H);
  let cell = Math.max(6, Math.min(28, Math.floor(2600 / maxSide)));
  // iOS の canvas 面積上限 (約1677万px) を超えないように
  while (cell > 4 && (W * cell + 200) * (H * cell + 900) > 15_000_000) cell--;
  const label = cell >= 10 ? 30 : 0;
  const pad = 36;
  const gw = W * cell;
  const gh = H * cell;
  const sheetW = Math.max(gw + label * 2 + pad * 2, 960);
  const cols = Math.max(1, Math.floor((sheetW - pad * 2) / 300));
  const rowH = 46;
  const legendH = 56 + Math.ceil(items.length / cols) * rowH;
  const titleH = 96;
  const sheetH = titleH + label + gh + label + 32 + legendH + 56;
  const [c, ctx] = canvas(sheetW, sheetH);

  ctx.fillStyle = '#222';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(30, 800);
  ctx.fillText(input.name || 'ナノビーズ図案', pad, 52);
  ctx.font = font(17);
  ctx.fillStyle = '#555';
  const total = items.reduce((a, b) => a + b.count, 0);
  const { cols: pc, rows: pr } = plateLayout(W, H);
  ctx.fillText(
    `よこ${W}×たて${H}ビーズ ・ 約${formatCm(W)}×${formatCm(H)}cm ・ プレート${pc * pr}枚 ・ ${items.length}色 ・ ${total.toLocaleString()}個`,
    pad,
    82,
  );

  const gx = (sheetW - gw) / 2;
  const gy = titleH + label;
  ctx.drawImage(gridCanvas(input, cell, style, symbols), gx, gy);
  if (label) {
    const every = input.guideEvery > 1 ? input.guideEvery : 5;
    drawAxisLabels(ctx, gx, gy - label / 2, cell, W, true, 0, every, 13);
    drawAxisLabels(ctx, gx, gy + gh + label / 2, cell, W, true, 0, every, 13);
    drawAxisLabels(ctx, gx - label / 2, gy, cell, H, false, 0, every, 13);
    drawAxisLabels(ctx, gx + gw + label / 2, gy, cell, H, false, 0, every, 13);
  }

  let y = gy + gh + label + 32;
  ctx.fillStyle = '#222';
  ctx.font = font(22, 800);
  ctx.textAlign = 'left';
  ctx.fillText('カラーチャート（カワダ ナノビーズ）', pad, y + 24);
  y += 44;
  drawLegend(ctx, items, pad, y, sheetW - pad * 2, cols, rowH, true);

  ctx.fillStyle = '#999';
  ctx.font = font(14);
  ctx.textAlign = 'right';
  ctx.fillText('ナノビーズ図案メーカーで作成 ・ 色は目安です', sheetW - pad, sheetH - 22);
  if (input.credit) {
    ctx.textAlign = 'left';
    ctx.fillText(`元画像: ${input.credit}`, pad, sheetH - 22, sheetW - pad * 2 - 360);
  }
  return c;
}

function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした'))), type, quality));
}

export async function exportPng(input: ExportInput, style: ViewStyle): Promise<Blob> {
  return toBlob(renderSheet(input, style), 'image/png');
}

// ---- PDF ----
const PAGE_W = 1240;
const PAGE_H = 1754;

function pageHeader(ctx: CanvasRenderingContext2D, title: string, sub: string) {
  ctx.fillStyle = '#222';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(40, 800);
  ctx.fillText(title, 70, 100, PAGE_W - 360);
  ctx.font = font(22);
  ctx.fillStyle = '#555';
  ctx.fillText(sub, 70, 140, PAGE_W - 140);
}

function pageFooter(ctx: CanvasRenderingContext2D, page: number, total: number) {
  ctx.fillStyle = '#999';
  ctx.font = font(18);
  ctx.textAlign = 'center';
  ctx.fillText(`${page} / ${total}`, PAGE_W / 2, PAGE_H - 40);
  ctx.textAlign = 'right';
  ctx.fillText('ナノビーズ図案メーカー', PAGE_W - 70, PAGE_H - 40);
}

function drawMiniMap(ctx: CanvasRenderingContext2D, cols: number, rows: number, cur: { c: number; r: number } | null, x: number, y: number, size: number) {
  const s = Math.min(size / cols, size / rows);
  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++, n++) {
      const active = cur && cur.c === c && cur.r === r;
      ctx.fillStyle = active ? '#ff6f9c' : '#f1ece7';
      ctx.fillRect(x + c * s + 2, y + r * s + 2, s - 4, s - 4);
      ctx.fillStyle = active ? '#fff' : '#888';
      ctx.font = font(Math.max(10, Math.round(s * 0.42)), 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), x + c * s + s / 2, y + r * s + s / 2 + 1);
    }
  }
}

async function pageToPdf(c: HTMLCanvasElement): Promise<PdfPage> {
  const blob = await toBlob(c, 'image/jpeg', 0.9);
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height };
}

export async function exportPdf(input: ExportInput, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { width: W, height: H } = input;
  const counts = countColors(input.cells);
  const symbols = assignSymbols(counts);
  const items = legendItems(counts, symbols);
  const { cols, rows } = plateLayout(W, H);
  const plates: { c: number; r: number; n: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rect = plateRect(W, H, c, r);
      const pc = countInRect(input.cells, W, rect.x, rect.y, rect.w, rect.h);
      if (pc.some((v) => v > 0)) plates.push({ c, r, n: r * cols + c + 1 });
    }
  }
  const totalPages = 1 + plates.length;
  const pages: PdfPage[] = [];
  const total = items.reduce((a, b) => a + b.count, 0);

  // 1ページ目: 全体図とカラーチャート
  {
    const [c, ctx] = canvas(PAGE_W, PAGE_H);
    pageHeader(
      ctx,
      input.name || 'ナノビーズ図案',
      `よこ${W}×たて${H}ビーズ ・ 約${formatCm(W)}×${formatCm(H)}cm ・ ${items.length}色 ・ ${total.toLocaleString()}個`,
    );
    const area = { x: 70, y: 180, w: PAGE_W - 140, h: 860 };
    const cell = Math.min(area.w / W, area.h / H);
    const style: ViewStyle = cell >= 12 ? 'symbol' : 'flat';
    const g = gridCanvas(input, Math.max(1, Math.floor(cell * 2) / 2), style, symbols);
    const scale = Math.min(area.w / g.width, area.h / g.height);
    const dw = g.width * scale;
    const dh = g.height * scale;
    const dx = area.x + (area.w - dw) / 2;
    const dy = area.y;
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(g, dx, dy, dw, dh);
    // プレート番号
    if (cols * rows > 1) {
      const pw = (PLATE_PEGS * dw) / W;
      const ph = (PLATE_PEGS * dh) / H;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < rows; r++) {
        for (let cc = 0; cc < cols; cc++) {
          const x = dx + cc * pw + Math.min(pw, dw - cc * pw) / 2;
          const y = dy + r * ph + Math.min(ph, dh - r * ph) / 2;
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.beginPath();
          ctx.arc(x, y, 26, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e04b7c';
          ctx.font = font(30, 800);
          ctx.fillText(String(r * cols + cc + 1), x, y + 1);
        }
      }
    }
    let y = dy + dh + 50;
    ctx.fillStyle = '#222';
    ctx.font = font(28, 800);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('カラーチャート', 70, y);
    y += 24;
    const lcols = items.length > 36 ? 4 : 3;
    const rowH = Math.min(52, Math.floor((PAGE_H - 110 - y) / Math.max(1, Math.ceil(items.length / lcols))));
    drawLegend(ctx, items, 70, y, PAGE_W - 140, lcols, rowH, true);
    if (plates.length) {
      ctx.fillStyle = '#777';
      ctx.font = font(18);
      ctx.textAlign = 'left';
      ctx.fillText(`次のページから、プレートごとの拡大図です（ビーズのないプレートは省略）。`, 70, PAGE_H - 80);
    }
    if (input.credit) {
      ctx.fillStyle = '#777';
      ctx.font = font(18);
      ctx.textAlign = 'left';
      ctx.fillText(`元画像: ${input.credit}`, 70, PAGE_H - 110, PAGE_W - 140);
    }
    pageFooter(ctx, 1, totalPages);
    pages.push(await pageToPdf(c));
    onProgress?.(1, totalPages);
  }

  // プレートごとの拡大図
  for (let k = 0; k < plates.length; k++) {
    const pl = plates[k];
    const rect = plateRect(W, H, pl.c, pl.r);
    const pc = countInRect(input.cells, W, rect.x, rect.y, rect.w, rect.h);
    const plateItems = legendItems(pc, symbols);
    const [c, ctx] = canvas(PAGE_W, PAGE_H);
    pageHeader(ctx, `プレート ${pl.n}`, `よこ${pl.c + 1}枚目・たて${pl.r + 1}枚目 ／ ${rect.x + 1}〜${rect.x + rect.w}列・${rect.y + 1}〜${rect.y + rect.h}行`);
    drawMiniMap(ctx, cols, rows, pl, PAGE_W - 70 - 150, 50, 150);
    const label = 30;
    const cell = Math.floor((PAGE_W - 140 - label * 2) / PLATE_PEGS);
    const g = gridCanvas(input, cell, 'symbol', symbols, rect);
    const gx = (PAGE_W - g.width) / 2;
    const gy = 210;
    ctx.drawImage(g, gx, gy);
    drawAxisLabels(ctx, gx, gy - label / 2, cell, rect.w, true, 0, 1, 15);
    drawAxisLabels(ctx, gx, gy + g.height + label / 2, cell, rect.w, true, 0, 1, 15);
    drawAxisLabels(ctx, gx - label / 2, gy, cell, rect.h, false, 0, 1, 15);
    drawAxisLabels(ctx, gx + g.width + label / 2, gy, cell, rect.h, false, 0, 1, 15);
    let y = gy + g.height + label + 40;
    ctx.fillStyle = '#222';
    ctx.font = font(26, 800);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`このプレートで使う色（${plateItems.reduce((a, b) => a + b.count, 0).toLocaleString()}個）`, 70, y);
    y += 18;
    const lcols = 4;
    const rowH = Math.min(46, Math.floor((PAGE_H - 90 - y) / Math.max(1, Math.ceil(plateItems.length / lcols))));
    drawLegend(ctx, plateItems, 70, y, PAGE_W - 140, lcols, rowH, false);
    pageFooter(ctx, k + 2, totalPages);
    pages.push(await pageToPdf(c));
    onProgress?.(k + 2, totalPages);
  }
  const bytes = buildPdf(pages, input.name || 'nanobeads');
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

export function safeFileName(name: string): string {
  return (name || 'nanobeads').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** スマホの共有シート (使えない場合は false) */
export async function shareBlob(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!nav.share || !nav.canShare?.({ files: [file] })) return false;
  try {
    await nav.share({ files: [file], title });
    return true;
  } catch (e) {
    // キャンセルされた場合も true (ダウンロードに切り替えない)
    return e instanceof DOMException && e.name === 'AbortError';
  }
}
