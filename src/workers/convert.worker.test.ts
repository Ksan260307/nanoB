import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ConvertRequest, ConvertResponse } from './convert.worker';

const posted: { msg: ConvertResponse; transfer?: Transferable[] }[] = [];
const fakeSelf = {
  onmessage: null as ((e: MessageEvent<ConvertRequest>) => void) | null,
  postMessage: (msg: ConvertResponse, transfer?: Transferable[]) => posted.push({ msg, transfer }),
};

const options = {
  allowed: [0, 6],
  maxColors: 0,
  dither: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  cleanup: 0,
  outline: 'none' as const,
  outlineColor: 6,
  replacements: {},
};

function send(req: Partial<ConvertRequest>) {
  fakeSelf.onmessage!({ data: { W: 2, H: 1, resample: 'average', options, key: 'k', id: 0, ...req } } as MessageEvent<ConvertRequest>);
  return posted[posted.length - 1].msg;
}

const pixels = () => ({ data: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), width: 2, height: 1 });

describe('変換 Worker', () => {
  beforeAll(async () => {
    vi.stubGlobal('self', fakeSelf);
    await import('./convert.worker');
  });

  it('画素が無いと送ってほしいと返す', () => {
    expect(send({ id: 1 })).toEqual({ id: 1, error: 'no pixels', needPixels: true });
  });

  it('画素を受け取ると変換して返す (結果は transfer)', () => {
    const res = send({ id: 2, pixels: pixels() });
    expect('cells' in res && Array.from(res.cells)).toEqual([0, 6]);
    expect(posted[posted.length - 1].transfer).toHaveLength(1);
  });

  it('同じキーなら画素を使い回す (縮小方法を変えても)', () => {
    const res = send({ id: 3, resample: 'sharp' });
    expect('cells' in res).toBe(true);
    const again = send({ id: 4, resample: 'sharp' });
    expect('cells' in again).toBe(true);
  });

  it('キーが違えば画素を送り直してもらう', () => {
    expect(send({ id: 5, key: 'other' })).toMatchObject({ id: 5, needPixels: true });
  });

  it('変換中のエラーを返す', () => {
    const res = send({ id: 6, options: null as never });
    expect(res).toMatchObject({ id: 6 });
    expect('error' in res && res.error).toBeTruthy();
  });
});
