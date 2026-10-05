import { useEffect, useMemo, useRef, useState } from 'react';
import { PALETTE } from '../data/palette';
import { bgKey } from '../lib/background';
import { backgroundRemoved, decodeSource, sourceKeyOf } from '../lib/image';
import { bgOptions } from '../lib/project';
import { EMPTY, lineCells } from '../lib/pattern';
import { DARK_THEME, LIGHT_THEME, makeBitmap, renderPattern, type Underlay, type ViewStyle } from '../lib/render';
import { useColorStats, usePrefersDark } from '../state/hooks';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { ZoomCanvas, type PointerPhase, type ZoomApi } from './ZoomCanvas';

function useSourceImage(dataUrl: string | undefined) {
  const [img, setImg] = useState<{ url: string; el: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!dataUrl) return;
    let alive = true;
    decodeSource(dataUrl).then(
      (el) => alive && setImg({ url: dataUrl, el }),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [dataUrl]);
  return img && img.url === dataUrl ? img.el : null;
}

const STYLE_OPTIONS: { value: ViewStyle; label: string; icon: 'bead' | 'square' | 'symbol' }[] = [
  { value: 'bead', label: 'ビーズ', icon: 'bead' },
  { value: 'flat', label: 'ドット', icon: 'square' },
  { value: 'symbol', label: '記号', icon: 'symbol' },
];

export function Stage() {
  const project = useStore((s) => s.project)!;
  const cells = useStore((s) => s.cells);
  const rev = useStore((s) => s.rev);
  const tool = useStore((s) => s.tool);
  const color = useStore((s) => s.color);
  const focus = useStore((s) => s.focus);
  const prefs = useStore((s) => s.prefs);
  const compare = useStore((s) => s.compare);
  const showUnderlay = useStore((s) => s.showUnderlay);
  const underlayOpacity = useStore((s) => s.underlayOpacity);
  const converting = useStore((s) => s.converting);
  const tab = useStore((s) => s.tab);
  const { symbols } = useColorStats();
  const dark = usePrefersDark();
  const api = useRef<ZoomApi>(null);
  const stroke = useRef<{ last: [number, number] | null; changed: boolean } | null>(null);
  const sourceEl = useSourceImage(project.source?.dataUrl);

  const { width, height } = project;
  const bitmap = useMemo(() => makeBitmap(cells, width, height), [cells, width, height, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const bg = bgOptions(project.settings);
  const bgk = bgKey(bg);
  const drawable = useMemo(
    () =>
      sourceEl && project.source && project.mode === 'image'
        ? backgroundRemoved(sourceEl, project.source.width, project.source.height, bg, sourceKeyOf(project.source.dataUrl))
        : sourceEl,
    // bg の中身は bgk で比較する
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceEl, project.source, project.mode, bgk],
  );
  const underlay: Underlay | null =
    drawable && project.source && (compare || showUnderlay)
      ? {
          image: drawable,
          imageWidth: project.source.width,
          imageHeight: project.source.height,
          crop: project.settings.crop,
          mirror: project.settings.mirror,
          opacity: compare ? 1 : underlayOpacity,
        }
      : null;

  const theme = dark ? DARK_THEME : LIGHT_THEME;
  const emptyCells = useMemo(() => new Int16Array(width * height).fill(EMPTY), [width, height]);
  const emptyBitmap = useMemo(() => makeBitmap(emptyCells, width, height), [emptyCells, width, height]);

  const draw = ({ ctx, cell, ox, oy, w, h }: { ctx: CanvasRenderingContext2D; cell: number; ox: number; oy: number; w: number; h: number }) => {
    renderPattern(ctx, {
      cells: compare ? emptyCells : cells,
      bitmap: compare ? emptyBitmap : bitmap,
      width,
      height,
      cell,
      ox,
      oy,
      viewW: w,
      viewH: h,
      style: prefs.style,
      theme,
      symbols,
      showGrid: prefs.showGrid,
      guideEvery: prefs.guideEvery,
      showPlates: prefs.showPlates,
      focus,
      underlay,
    });
  };

  const editing = tab === 'edit' && tool !== 'move';

  const onPointerCell = (phase: PointerPhase, fx: number, fy: number) => {
    const st = useStore.getState();
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    const inside = x >= 0 && y >= 0 && x < width && y < height;
    const idx = y * width + x;
    if (tool === 'pen' || tool === 'eraser') {
      const value = tool === 'pen' ? color : EMPTY;
      if (phase === 'down') {
        st.beginStroke();
        stroke.current = { last: null, changed: false };
      }
      // 描く操作は必ず down から始まる
      const s = stroke.current!;
      if (phase === 'down' || phase === 'move') {
        if (!inside && !s.last) return;
        const cx = Math.max(0, Math.min(width - 1, x));
        const cy = Math.max(0, Math.min(height - 1, y));
        const pts = s.last ? lineCells(s.last[0], s.last[1], cx, cy) : [[cx, cy] as [number, number]];
        if (inside || s.last) {
          const changed = st.paint(
            pts.map(([px, py]) => py * width + px),
            value,
          );
          s.changed ||= changed;
          s.last = [cx, cy];
        }
      } else if (phase === 'up') {
        st.endStroke(s.changed);
        stroke.current = null;
      } else {
        // cancel
        st.cancelStroke();
        stroke.current = null;
      }
      return;
    }
    if (phase !== 'up' || !inside) return;
    if (tool === 'fill') {
      st.fillAt(x, y, color);
    } else {
      // スポイト
      const c = st.cells[idx];
      if (c >= 0) {
        st.setColor(c);
        st.showToast(`「${PALETTE[c].name}」をえらびました`);
      }
    }
  };

  const onTap = (fx: number, fy: number) => {
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const c = useStore.getState().cells[y * width + x];
    const st = useStore.getState();
    if (c >= 0) {
      st.showToast(`${PALETTE[c].name}（${PALETTE[c].code}） ・ よこ${x + 1} たて${y + 1}`);
    }
  };

  const setPrefs = useStore((s) => s.setPrefs);
  const setUi = useStore((s) => s.setUi);
  const setFocus = useStore((s) => s.setFocus);

  return (
    <div className={`stage ${editing ? 'stage-editing' : ''}`}>
      <ZoomCanvas
        apiRef={api}
        contentW={width}
        contentH={height}
        draw={draw}
        panWithSingle={!editing}
        onPointerCell={editing ? onPointerCell : undefined}
        onTap={onTap}
        fitKey={`${project.id}:${width}x${height}`}
        ariaLabel={`ビーズ図案 よこ${width} たて${height}`}
      />
      <div className="stage-tools stage-tools-left">
        <div className="pill-group" role="radiogroup" aria-label="表示">
          {STYLE_OPTIONS.map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={prefs.style === o.value}
              className={prefs.style === o.value ? 'active' : ''}
              onClick={() => setPrefs({ style: o.value })}
              title={`${o.label}で表示`}
              aria-label={`${o.label}で表示`}
            >
              <Icon name={o.icon} size={18} />
              <span className="pill-label">{o.label}</span>
            </button>
          ))}
        </div>
        {project.source ? (
          <button
            className={`pill ${compare ? 'active' : ''}`}
            onClick={() => setUi({ compare: !compare })}
            aria-pressed={compare}
            title="元の画像とくらべる"
            aria-label="元の画像とくらべる"
          >
            <Icon name="eye" size={18} />
            <span className="pill-label">元画像</span>
          </button>
        ) : null}
      </div>
      <div className="stage-tools stage-tools-right">
        <button className="icon-btn floating" onClick={() => api.current?.zoomBy(1.4)} aria-label="拡大">
          <Icon name="zoomIn" />
        </button>
        <button className="icon-btn floating" onClick={() => api.current?.zoomBy(1 / 1.4)} aria-label="縮小">
          <Icon name="zoomOut" />
        </button>
        <button className="icon-btn floating" onClick={() => api.current?.fit()} aria-label="全体を表示">
          <Icon name="fit" />
        </button>
      </div>
      {focus !== null && PALETTE[focus] ? (
        <div className="focus-chip">
          <span className="focus-dot" style={{ background: PALETTE[focus].hex }} />「{PALETTE[focus].name}」だけ表示中
          <button className="link-btn" onClick={() => setFocus(null)}>
            解除
          </button>
        </div>
      ) : null}
      {converting ? (
        <div className="busy-chip" role="status">
          <span className="spinner" /> 図案を作っています…
        </div>
      ) : null}
      {compare ? <div className="compare-chip">元の画像を表示中</div> : null}
    </div>
  );
}
