import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';

export interface View {
  /** 1マスの大きさ (CSS px) */
  cell: number;
  ox: number;
  oy: number;
}

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  /** canvas の px 単位 (devicePixelRatio 済み) */
  cell: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
  dpr: number;
}

export interface ZoomApi {
  zoomBy: (factor: number) => void;
  fit: () => void;
  redraw: () => void;
}

export type PointerPhase = 'down' | 'move' | 'up' | 'cancel';

interface Props {
  contentW: number;
  contentH: number;
  /** 全体表示のときの余白 (CSS px) */
  margin?: number;
  draw: (a: DrawArgs) => void;
  /** 1本指/マウスのドラッグで移動するか (false なら onPointerCell に渡す) */
  panWithSingle: boolean;
  onPointerCell?: (phase: PointerPhase, cx: number, cy: number) => void;
  onTap?: (cx: number, cy: number) => void;
  /** 変わると全体表示し直す */
  fitKey: string;
  maxCell?: number;
  apiRef?: Ref<ZoomApi>;
  className?: string;
  ariaLabel?: string;
}

interface PointerInfo {
  x: number;
  y: number;
}

export function ZoomCanvas({
  contentW,
  contentH,
  margin = 16,
  draw,
  panWithSingle,
  onPointerCell,
  onTap,
  fitKey,
  maxCell = 80,
  apiRef,
  className,
  ariaLabel,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ cell: 8, ox: 0, oy: 0 });
  const size = useRef({ w: 0, h: 0 });
  const frame = useRef(0);
  const drawRef = useRef(draw);
  const pointers = useRef(new Map<number, PointerInfo>());
  /** 指 (ポインター) が触れている間だけある操作の状態 */
  const gesture = useRef<
    | { kind: 'pan'; startX: number; startY: number; ox: number; oy: number; downX: number; downY: number; t: number; moved: boolean }
    | { kind: 'draw'; downX: number; downY: number; t: number; moved: boolean }
    | { kind: 'pinch'; dist: number; midX: number; midY: number; view: View }
    | null
  >(null);
  const fitted = useRef('');
  /** 拡大・移動したか (していなければ、画面の大きさが変わったときに全体表示し直す) */
  const userMoved = useRef(false);
  const propsRef = useRef({ onPointerCell, onTap, panWithSingle, contentW, contentH, margin, maxCell });

  useEffect(() => {
    drawRef.current = draw;
    propsRef.current = { onPointerCell, onTap, panWithSingle, contentW, contentH, margin, maxCell };
  });

  const minCell = useCallback(() => {
    const { w, h } = size.current;
    const { contentW: cw, contentH: ch } = propsRef.current;
    return Math.max(0.5, Math.min(w / cw, h / ch) * 0.4);
  }, []);

  const render = useCallback(() => {
    frame.current = 0;
    // アンマウント直後 (ref は外れたが、後片付けの前) に呼ばれることがある
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const v = view.current;
    drawRef.current({ ctx, cell: v.cell * dpr, ox: v.ox * dpr, oy: v.oy * dpr, w: canvas.width, h: canvas.height, dpr });
  }, []);

  const requestDraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(render);
  }, [render]);

  const clampView = useCallback(() => {
    const v = view.current;
    const { w, h } = size.current;
    const { contentW: cw, contentH: ch, maxCell: mx } = propsRef.current;
    v.cell = Math.min(mx, Math.max(minCell(), v.cell));
    // 図案が画面外に消えないようにする
    const gw = cw * v.cell;
    const gh = ch * v.cell;
    const keep = 60;
    v.ox = Math.min(w - keep, Math.max(keep - gw, v.ox));
    v.oy = Math.min(h - keep, Math.max(keep - gh, v.oy));
  }, [minCell]);

  const fit = useCallback(() => {
    const { w, h } = size.current;
    if (!w || !h) return;
    const { contentW: cw, contentH: ch, margin: m, maxCell: mx } = propsRef.current;
    const cell = Math.min(mx, Math.max(0.5, Math.min((w - m * 2) / cw, (h - m * 2) / ch)));
    view.current = { cell, ox: (w - cw * cell) / 2, oy: (h - ch * cell) / 2 };
    userMoved.current = false;
    requestDraw();
  }, [requestDraw]);

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      const v = view.current;
      const old = v.cell;
      const { maxCell: mx } = propsRef.current;
      const cell = Math.min(mx, Math.max(minCell(), old * factor));
      v.ox = px - ((px - v.ox) * cell) / old;
      v.oy = py - ((py - v.oy) * cell) / old;
      v.cell = cell;
      userMoved.current = true;
      clampView();
      requestDraw();
    },
    [clampView, minCell, requestDraw],
  );

  useImperativeHandle(
    apiRef,
    () => ({
      zoomBy: (f) => zoomAt(f, size.current.w / 2, size.current.h / 2),
      fit,
      redraw: requestDraw,
    }),
    [fit, requestDraw, zoomAt],
  );

  // 大きさの変化
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const prev = size.current;
      size.current = { w: r.width, h: r.height };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      if (!prev.w || !userMoved.current) {
        // 最初の表示・まだ拡大や移動をしていないとき (画面の回転など) は全体表示
        fit();
      } else {
        // 中心を保つ
        view.current.ox += (r.width - prev.w) / 2;
        view.current.oy += (r.height - prev.h) / 2;
        clampView();
      }
      render();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [clampView, fit, render]);

  useEffect(() => {
    if (fitted.current !== fitKey && size.current.w) {
      fitted.current = fitKey;
      fit();
    }
  }, [fitKey, fit]);

  useEffect(() => {
    requestDraw();
  });

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // ホイールでズーム (passive: false が必要)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
        zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
      } else {
        view.current.ox -= e.deltaX;
        userMoved.current = true;
        clampView();
        requestDraw();
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [clampView, requestDraw, zoomAt]);

  const toCell = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const v = view.current;
    return { cx: (clientX - r.left - v.ox) / v.cell, cy: (clientY - r.top - v.oy) / v.cell };
  };

  const startPinch = () => {
    const pts = [...pointers.current.values()];
    const [a, b] = pts;
    const r = canvasRef.current!.getBoundingClientRect();
    gesture.current = {
      kind: 'pinch',
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      midX: (a.x + b.x) / 2 - r.left,
      midY: (a.y + b.y) / 2 - r.top,
      view: { ...view.current },
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2) {
      if (g?.kind === 'draw') {
        const { cx, cy } = toCell(e.clientX, e.clientY);
        propsRef.current.onPointerCell?.('cancel', cx, cy);
      }
      startPinch();
      return;
    }
    if (pointers.current.size > 2) return;
    const { panWithSingle: pan, onPointerCell: cb } = propsRef.current;
    const usePan = pan || e.button === 1 || e.button === 2 || !cb;
    if (usePan) {
      gesture.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        ox: view.current.ox,
        oy: view.current.oy,
        downX: e.clientX,
        downY: e.clientY,
        t: performance.now(),
        moved: false,
      };
    } else {
      gesture.current = { kind: 'draw', downX: e.clientX, downY: e.clientY, t: performance.now(), moved: false };
      const { cx, cy } = toCell(e.clientX, e.clientY);
      cb('down', cx, cy);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // 触れている指があれば操作の状態もある
    const g = gesture.current!;
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      const r = canvasRef.current!.getBoundingClientRect();
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2 - r.left;
      const midY = (a.y + b.y) / 2 - r.top;
      const { maxCell: mx } = propsRef.current;
      const cell = Math.min(mx, Math.max(minCell(), (g.view.cell * dist) / g.dist));
      // ピンチ開始時に指の間にあった点が、今の指の間に来るように
      const contentX = (g.midX - g.view.ox) / g.view.cell;
      const contentY = (g.midY - g.view.oy) / g.view.cell;
      view.current = { cell, ox: midX - contentX * cell, oy: midY - contentY * cell };
      userMoved.current = true;
      clampView();
      requestDraw();
    } else if (g.kind === 'pan') {
      if (Math.hypot(e.clientX - g.downX, e.clientY - g.downY) > 6) g.moved = true;
      view.current.ox = g.ox + (e.clientX - g.startX);
      view.current.oy = g.oy + (e.clientY - g.startY);
      userMoved.current = true;
      clampView();
      requestDraw();
    } else {
      if (Math.hypot(e.clientX - g.downX, e.clientY - g.downY) > 6) g.moved = true;
      const { cx, cy } = toCell(e.clientX, e.clientY);
      propsRef.current.onPointerCell?.('move', cx, cy);
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current!;
    const { cx, cy } = toCell(e.clientX, e.clientY);
    if (g.kind === 'pinch') {
      if (pointers.current.size === 1) {
        // 残った指で移動を続ける
        const [p] = [...pointers.current.values()];
        gesture.current = {
          kind: 'pan',
          startX: p.x,
          startY: p.y,
          ox: view.current.ox,
          oy: view.current.oy,
          downX: p.x,
          downY: p.y,
          t: 0,
          moved: true,
        };
      }
      // 3本目の指が残っている場合は、残りの2本でピンチを続ける
      return;
    }
    if (g.kind === 'draw') {
      propsRef.current.onPointerCell?.(cancelled ? 'cancel' : 'up', cx, cy);
    } else if (!cancelled && !g.moved && performance.now() - g.t < 500) {
      propsRef.current.onTap?.(cx, cy);
    }
    // 移動・描く操作は指1本だけなので、離したら終わり
    gesture.current = null;
  };

  return (
    <div ref={wrapRef} className={`zoom-canvas ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
