/**
 * テスト共通の準備。
 * jsdom 環境では canvas / ResizeObserver / matchMedia などが無いので最小限の代用品を入れる。
 */
import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
  installCanvasMock();

  if (!('ResizeObserver' in window)) {
    class RO {
      constructor(private cb: ResizeObserverCallback) {}
      observe(target: Element) {
        this.cb([{ target, contentRect: target.getBoundingClientRect() } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:mock';
    URL.revokeObjectURL = () => {};
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = () => {};
    HTMLElement.prototype.releasePointerCapture = () => {};
  }
}

/** 何もしない 2D コンテキスト (呼び出しは記録する) */
export function installCanvasMock() {
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  proto.getContext = function (this: HTMLCanvasElement) {
    const store: Record<string | symbol, unknown> = { canvas: this, calls: [] as string[] };
    return new Proxy(store, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (prop === 'createImageData') return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        if (prop === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => ({ addColorStop() {} });
        if (typeof prop === 'string')
          return (...args: unknown[]) => {
            (target.calls as string[]).push(prop);
            void args;
          };
        return undefined;
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  };
  proto.toDataURL = () => 'data:image/png;base64,AAAA';
  proto.toBlob = function (cb: BlobCallback, type?: string) {
    cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: type || 'image/png' }));
  };
}
