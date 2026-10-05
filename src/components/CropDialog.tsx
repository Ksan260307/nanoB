import { useEffect, useRef, useState } from 'react';
import { decodeSource, fitCrop, type Crop } from '../lib/image';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { Modal } from './ui';

/** 画像の位置と大きさを、図案の枠に合わせて調整する */
export function CropDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const updateSettings = useStore((s) => s.updateSettings);
  const source = project.source!;
  const { width: gw, height: gh } = project;
  const [crop, setCrop] = useState<Crop>(project.settings.crop);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 300, h: 300 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ crop: Crop; x: number; y: number; dist: number } | null>(null);

  useEffect(() => {
    decodeSource(source.dataUrl).then(setImg, () => {});
  }, [source.dataUrl]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 枠 (図案) の表示サイズ
  const pad = 28;
  const frameScale = Math.min((box.w - pad * 2) / gw, (box.h - pad * 2) / gh);
  const fw = gw * frameScale;
  const fh = gh * frameScale;
  const fx = (box.w - fw) / 2;
  const fy = (box.h - fh) / 2;
  // 画像の表示位置
  const iw = fw / crop.w;
  const ih = fh / crop.h;
  const ix = fx - crop.x * iw;
  const iy = fy - crop.y * ih;

  const zoom = (factor: number, cx = 0.5, cy = 0.5) => {
    setCrop((c) => {
      const w = Math.min(20, Math.max(0.02, c.w / factor));
      const h = (w * c.h) / c.w;
      const px = c.x + c.w * cx;
      const py = c.y + c.h * cy;
      return { x: px - w * cx, y: py - h * cy, w, h };
    });
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const mid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    drag.current = { crop, x: mid.x, y: mid.y, dist };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !drag.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const mid = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    const d = drag.current;
    let { w, h } = d.crop;
    if (pts.length >= 2 && d.dist > 0) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const f = dist / d.dist;
      w = Math.min(20, Math.max(0.02, d.crop.w / f));
      h = (w * d.crop.h) / d.crop.w;
    }
    // 中心を基準にズームし、指の移動ぶんずらす
    const cx = d.crop.x + d.crop.w / 2;
    const cy = d.crop.y + d.crop.h / 2;
    const dx = ((mid.x - d.x) / fw) * w;
    const dy = ((mid.y - d.y) / fh) * h;
    setCrop({ x: cx - w / 2 - dx, y: cy - h / 2 - dy, w, h });
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) drag.current = null;
    else {
      const pts = [...pointers.current.values()];
      drag.current = { crop, x: pts[0].x, y: pts[0].y, dist: 0 };
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    const cx = (e.clientX - r.left - fx) / fw;
    const cy = (e.clientY - r.top - fy) / fh;
    zoom(Math.exp(-e.deltaY * 0.0015), Math.min(1, Math.max(0, cx)), Math.min(1, Math.max(0, cy)));
  };

  const apply = () => {
    updateSettings({ crop, fit: 'custom' });
    onClose();
  };

  const reset = (mode: 'contain' | 'cover') => {
    setCrop(fitCrop(source.width, source.height, gw, gh, mode));
  };

  return (
    <Modal
      title="画像の位置と大きさ"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={apply}>
            <Icon name="check" size={18} /> この位置にする
          </button>
        </>
      }
    >
      <p className="hint center">ドラッグで移動、ピンチ・ホイールで拡大縮小できます。枠の中が図案になります。</p>
      <div ref={boxRef} className="crop-box" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
        {img ? <img src={source.dataUrl} alt="" draggable={false} style={{ left: ix, top: iy, width: iw, height: ih }} /> : null}
        <div className="crop-frame" style={{ left: fx, top: fy, width: fw, height: fh }}>
          <div className="crop-grid" style={{ backgroundSize: `${(fw / gw) * 7}px ${(fh / gh) * 7}px` }} />
        </div>
      </div>
      <div className="crop-actions">
        <button className="btn btn-small" onClick={() => zoom(1 / 1.25)}>
          <Icon name="zoomOut" size={18} /> 小さく
        </button>
        <button className="btn btn-small" onClick={() => zoom(1.25)}>
          <Icon name="zoomIn" size={18} /> 大きく
        </button>
        <button className="btn btn-small" onClick={() => reset('contain')}>
          全体を入れる
        </button>
        <button className="btn btn-small" onClick={() => reset('cover')}>
          枠いっぱい
        </button>
      </div>
    </Modal>
  );
}
