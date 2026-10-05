/** 変換処理を Web Worker で実行するクライアント (Worker が使えない環境では同期実行) */
import type { ConvertRequest, ConvertResponse } from '../workers/convert.worker';
import { convertCells, resampleBlocks, type ConvertOptions, type ResampleMode } from './convert';

export interface ConvertJob {
  key: string;
  getPixels: () => ImageData;
  W: number;
  H: number;
  resample: ResampleMode;
  options: ConvertOptions;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
let sentKey = '';
const pending = new Map<number, { resolve: (c: Int16Array) => void; reject: (e: Error) => void; job: ConvertJob }>();

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('../workers/convert.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<ConvertResponse>) => {
        const msg = e.data;
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        if ('cells' in msg) {
          p.resolve(msg.cells);
        } else if (msg.needPixels) {
          // Worker 側のキャッシュが無い → 画素を付けて再送
          sentKey = '';
          runInWorker(p.job).then(p.resolve, p.reject);
        } else {
          p.reject(new Error(msg.error));
        }
      };
      worker.onerror = () => {
        workerFailed = true;
        worker = null;
        for (const [, p] of pending) runSync(p.job).then(p.resolve, p.reject);
        pending.clear();
      };
    } catch {
      workerFailed = true;
      worker = null;
    }
  }
  return worker;
}

function runInWorker(job: ConvertJob): Promise<Int16Array> {
  const w = getWorker();
  if (!w) return runSync(job);
  const id = nextId++;
  const req: ConvertRequest = { id, key: job.key, W: job.W, H: job.H, resample: job.resample, options: job.options };
  const transfer: Transferable[] = [];
  if (sentKey !== job.key) {
    const img = job.getPixels();
    req.pixels = { data: img.data, width: img.width, height: img.height };
    transfer.push(img.data.buffer);
    sentKey = job.key;
  }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, job });
    w.postMessage(req, transfer);
  });
}

let syncCache: { key: string; img: ImageData } | null = null;

async function runSync(job: ConvertJob): Promise<Int16Array> {
  if (!syncCache || syncCache.key !== job.key) syncCache = { key: job.key, img: job.getPixels() };
  const { img } = syncCache;
  const colors = resampleBlocks(img.data, img.width, img.height, job.W, job.H, job.resample);
  return convertCells(colors, job.W, job.H, job.options);
}

export function convertAsync(job: ConvertJob): Promise<Int16Array> {
  return runInWorker(job);
}
