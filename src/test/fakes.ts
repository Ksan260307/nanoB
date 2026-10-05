/** テスト用の代用品 (jsdom に無いブラウザ機能) */
import { vi } from 'vitest';

/** 読み込みが非同期に終わる Image (#幅x高さ で大きさ、error を含むと失敗) */
export class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin: string | null = null;
  decoding = '';
  naturalWidth = 0;
  naturalHeight = 0;
  width = 0;
  height = 0;
  private _src = '';
  get src() {
    return this._src;
  }
  set src(v: string) {
    this._src = v;
    setTimeout(() => {
      if (v.includes('error')) {
        this.onerror?.();
        return;
      }
      const m = v.match(/#(\d+)x(\d+)/);
      this.naturalWidth = m ? Number(m[1]) : 100;
      this.naturalHeight = m ? Number(m[2]) : 100;
      this.onload?.();
    }, 0);
  }
}

/** getImageData が不透明な画素を返すようにする (戻り値で元に戻す) */
export function opaqueCanvas(rgb: [number, number, number] = [10, 20, 30]) {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
    const ctx = (original as unknown as (...a: unknown[]) => Record<string, unknown>).apply(this, args);
    return new Proxy(ctx, {
      get(target, prop) {
        if (prop === 'getImageData')
          return (_x: number, _y: number, w: number, h: number) => {
            const data = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
            return { width: w, height: h, data };
          };
        return Reflect.get(target, prop);
      },
    });
  } as unknown as typeof original;
  return () => {
    HTMLCanvasElement.prototype.getContext = original;
  };
}

/** すべての要素の大きさを固定する (jsdom はレイアウトしないため) */
export function mockRect(width = 400, height = 300) {
  return vi
    .spyOn(Element.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({ x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect);
}
