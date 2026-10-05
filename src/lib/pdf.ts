/**
 * JPEG 画像を1ページずつ貼り付けるだけの最小限の PDF 生成。
 * 日本語フォントを埋め込まずに済むよう、ページは canvas で描いた画像にする。
 */

export interface PdfPage {
  /** JPEG のバイト列 */
  jpeg: Uint8Array;
  /** 画像のピクセルサイズ */
  width: number;
  height: number;
  /** ページサイズ (pt)。省略時 A4 縦 */
  pageWidth?: number;
  pageHeight?: number;
}

export const A4 = { width: 595.28, height: 841.89 };

const enc = new TextEncoder();

export function buildPdf(pages: PdfPage[], title = 'nanobeads pattern'): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const b = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(b);
    length += b.length;
  };
  const startObj = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  // 1: Catalog, 2: Pages, 3: Info, 以降 1ページにつき 3オブジェクト (Page, Contents, Image)
  const pageObj = (i: number) => 4 + i * 3;
  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>\nendobj\n`);
  startObj(3);
  push(`<< /Title ${pdfText(title)} /Producer (nanobeads pattern maker) >>\nendobj\n`);

  pages.forEach((p, i) => {
    const pw = p.pageWidth ?? A4.width;
    const ph = p.pageHeight ?? A4.height;
    const n = pageObj(i);
    startObj(n);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(2)} ${ph.toFixed(2)}] ` +
        `/Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>\nendobj\n`,
    );
    const content = `q ${pw.toFixed(2)} 0 0 ${ph.toFixed(2)} 0 0 cm /Im0 Do Q`;
    startObj(n + 1);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    startObj(n + 2);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    );
    push(p.jpeg);
    push('\nendstream\nendobj\n');
  });

  const total = 4 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let n = 1; n < total; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/** PDF の文字列。ASCII 以外を含む場合は UTF-16BE (BOM付き) の16進文字列にする */
function pdfText(s: string): string {
  if (/^[ -~]*$/.test(s)) return '(' + s.replace(/[\\()]/g, (m) => '\\' + m) + ')';
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
  return '<' + hex.toUpperCase() + '>';
}
