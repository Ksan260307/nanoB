import { deflateSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** テスト用の PNG 画像を作る */
export function makePng(w: number, h: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 白い背景に赤い丸と青い四角 (背景の透明化の確認用) */
export const shapesPng = () =>
  makePng(120, 120, (x, y) => {
    if ((x - 40) ** 2 + (y - 60) ** 2 < 25 ** 2) return [230, 30, 40, 255];
    if (x > 75 && x < 105 && y > 40 && y < 80) return [20, 70, 200, 255];
    return [255, 255, 255, 255];
  });

/** 図案の変換が終わるのを待つ */
export async function waitConverted(page: Page) {
  await expect(page.locator('.workspace')).toBeVisible();
  await expect(page.locator('.busy-chip')).toBeHidden({ timeout: 30_000 });
}

export async function openTab(page: Page, name: RegExp) {
  await page.getByRole('tab', { name }).click();
}

/** カラーチャートの「ビーズ」の合計 */
export async function totalBeads(page: Page): Promise<number> {
  await openTab(page, /チャート/);
  const text = await page.locator('.summary-card', { hasText: 'ビーズ' }).locator('strong').innerText();
  return Number(text.replace(/[^0-9]/g, ''));
}

export async function colorCount(page: Page): Promise<number> {
  await openTab(page, /チャート/);
  const text = await page.locator('.summary-card', { hasText: '色の数' }).locator('strong').innerText();
  return Number(text.replace(/[^0-9]/g, ''));
}

/** 図案のキャンバス上の位置 (割合) をタップ/クリック */
export async function tapCanvas(page: Page, fx: number, fy: number, isMobile: boolean) {
  const canvas = page.locator('.stage canvas');
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

/** 白紙から図案を作って名前を付け、トップ画面に戻る */
export async function makeFreePattern(page: Page, name: string) {
  await page
    .getByRole('button', { name: /白紙から作る/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'この大きさではじめる' }).click();
  await page.getByLabel('図案の名前').first().fill(name);
  await page.getByRole('button', { name: 'トップに戻る' }).click();
  await expect(page.locator('.recent-item', { hasText: name })).toBeVisible();
}

/** アプリ内の確認ダイアログでボタンを押す */
export async function answerConfirm(page: Page, button: string) {
  await page.getByRole('alertdialog').getByRole('button', { name: button, exact: true }).click();
}
