import { useEffect, useMemo, useRef, useState } from 'react';
import { computeMask, removedRatio, type BgMode, type BgPoint } from '../lib/background';
import { decodeSource, workingImageData } from '../lib/image';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { Modal, Segmented, Slider, Toggle } from './ui';

/** 取り込んだ画像の背景を透明にする範囲を、画像をタップして指定する */
export function BackgroundDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const updateSettings = useStore((s) => s.updateSettings);
  const source = project.source!;
  const s = project.settings;
  const [mode, setMode] = useState<Exclude<BgMode, 'off'>>(s.bgMode === 'off' ? 'auto' : s.bgMode);
  const [tolerance, setTolerance] = useState(s.bgTolerance);
  const [global, setGlobal] = useState(s.bgGlobal);
  const [points, setPoints] = useState<BgPoint[]>(s.bgPoints);
  const [tool, setTool] = useState<'erase' | 'keep'>('erase');
  const [showRed, setShowRed] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    decodeSource(source.dataUrl).then(setImg, () => {});
  }, [source.dataUrl]);

  const work = useMemo(() => (img ? workingImageData(img, source.width, source.height) : null), [img, source.width, source.height]);
  const mask = useMemo(
    () => (work ? computeMask(work.data, work.width, work.height, { mode, tolerance, global, points }) : null),
    [work, mode, tolerance, global, points],
  );

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !work || !mask) return;
    c.width = work.width;
    c.height = work.height;
    const ctx = c.getContext('2d')!;
    const out = ctx.createImageData(work.width, work.height);
    const d = work.data;
    for (let i = 0; i < mask.length; i++) {
      const o = i * 4;
      if (mask[i] === 0) {
        if (showRed && d[o + 3] >= 128) {
          out.data[o] = Math.round(d[o] * 0.35 + 255 * 0.65);
          out.data[o + 1] = Math.round(d[o + 1] * 0.35 + 40 * 0.65);
          out.data[o + 2] = Math.round(d[o + 2] * 0.35 + 80 * 0.65);
          out.data[o + 3] = 255;
        }
        continue;
      }
      out.data[o] = d[o];
      out.data[o + 1] = d[o + 1];
      out.data[o + 2] = d[o + 2];
      out.data[o + 3] = d[o + 3];
    }
    ctx.putImageData(out, 0, 0);
  }, [work, mask, showRed]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    setPoints((p) => [...p, { x, y, keep: tool === 'keep' }]);
  };

  const ratio = mask ? removedRatio(mask) : 0;

  const apply = () => {
    updateSettings({ bgMode: mode, bgTolerance: tolerance, bgGlobal: global, bgPoints: points });
    onClose();
  };

  return (
    <Modal
      title="背景を透明にする"
      onClose={onClose}
      wide
      footer={
        <>
          <button
            className="btn btn-ghost"
            onClick={() => {
              updateSettings({ bgMode: 'off' });
              onClose();
            }}
          >
            透明にしない
          </button>
          <button className="btn btn-primary" onClick={apply}>
            <Icon name="check" size={18} /> この設定にする
          </button>
        </>
      }
    >
      <Segmented
        label="背景の見つけ方"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'auto', label: '自動（ふちの色）' },
          { value: 'manual', label: '手動（タップした所）' },
        ]}
      />
      <div className="bg-tools">
        <Segmented
          small
          label="タップしたときの動作"
          value={tool}
          onChange={setTool}
          options={[
            { value: 'erase', label: '消す', icon: 'eraser' },
            { value: 'keep', label: '残す', icon: 'heart' },
          ]}
        />
        <button className="btn btn-small" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={!points.length}>
          <Icon name="undo" size={16} /> 1つ戻す
        </button>
        <button className="btn btn-small btn-ghost" onClick={() => setPoints([])} disabled={!points.length}>
          点を全部消す
        </button>
      </div>
      <p className="hint center">
        {mode === 'auto'
          ? '画像のふちとつながった背景を自動で消します。消えすぎた所は「残す」、残った背景は「消す」でタップしてください。'
          : '消したい背景をタップしてください。似た色でつながっている所がまとめて透明になります。'}
      </p>
      <div className="bg-preview">
        <canvas ref={canvasRef} onPointerDown={onTap} aria-label="背景を指定する画像" />
        {points.map((p, i) => (
          <span key={i} className={`bg-point ${p.keep ? 'keep' : 'erase'}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
        ))}
      </div>
      <p className="badge-line center">
        画像の <strong>{Math.round(ratio * 100)}%</strong> が透明になります（市松模様の部分）
      </p>
      <Slider label="似た色とみなす範囲" value={tolerance} min={2} max={60} onChange={setTolerance} leftLabel="せまい" rightLabel="ひろい" />
      <Toggle
        label="離れた所の同じ色も消す"
        hint="輪の内側やすき間から見えている背景も消します。絵の中に同じ色があると、そこも消えるので注意。"
        checked={global}
        onChange={setGlobal}
      />
      <Toggle label="消える部分を赤で表示" checked={showRed} onChange={setShowRed} />
    </Modal>
  );
}
