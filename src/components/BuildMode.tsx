import { useEffect, useMemo, useRef, useState } from 'react';
import { PALETTE } from '../data/palette';
import { EMPTY, plateLayout, plateRect } from '../lib/pattern';
import { DARK_THEME, LIGHT_THEME, renderPattern } from '../lib/render';
import { useColorStats, usePrefersDark } from '../state/hooks';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { Bead } from './ui';
import { ZoomCanvas, type ZoomApi } from './ZoomCanvas';

interface WakeLockLike {
  release: () => Promise<void>;
}

/** プレートごとに、色をえらんでビーズを置いていくモード */
export function BuildMode() {
  const project = useStore((s) => s.project)!;
  const cells = useStore((s) => s.cells);
  const rev = useStore((s) => s.rev);
  const setUi = useStore((s) => s.setUi);
  const toggleDone = useStore((s) => s.toggleDone);
  const setDone = useStore((s) => s.setDone);
  const clearDone = useStore((s) => s.clearDone);
  const showToast = useStore((s) => s.showToast);
  const { symbols } = useColorStats();
  const dark = usePrefersDark();
  const { width: W, height: H, done } = project;
  const { cols, rows } = plateLayout(W, H);
  const [plate, setPlate] = useState(() => firstPlateWithBeads(cells, W, H, cols, rows));
  const [focus, setFocus] = useState<number | null>(null);
  const [wake, setWake] = useState<WakeLockLike | null>(null);
  const api = useRef<ZoomApi>(null);
  const rect = plateRect(W, H, plate.c, plate.r);

  const stats = useMemo(() => {
    const perColor = new Map<number, { total: number; done: number }>();
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const i = y * W + x;
        const c = cells[i];
        if (c === EMPTY) continue;
        const e = perColor.get(c) ?? { total: 0, done: 0 };
        e.total++;
        if (done[i]) e.done++;
        perColor.set(c, e);
      }
    }
    const plateProgress: number[] = [];
    let allTotal = 0;
    let allDone = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const pr = plateRect(W, H, c, r);
        let t = 0;
        let d = 0;
        for (let y = pr.y; y < pr.y + pr.h; y++) {
          for (let x = pr.x; x < pr.x + pr.w; x++) {
            const i = y * W + x;
            if (cells[i] === EMPTY) continue;
            t++;
            if (done[i]) d++;
          }
        }
        allTotal += t;
        allDone += d;
        plateProgress.push(t ? d / t : -1);
      }
    }
    return { perColor, plateProgress, allTotal, allDone };
    // done は破壊的に更新されるので rev で検知する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, rev, rect.x, rect.y, rect.w, rect.h, W, H, cols, rows]);

  const colorList = [...stats.perColor.entries()].sort((a, b) => b[1].total - a[1].total);

  // 画面を消さない (対応ブラウザのみ)
  useEffect(() => {
    return () => {
      wake?.release().catch(() => {});
    };
  }, [wake]);

  const toggleWake = async () => {
    if (wake) {
      await wake.release().catch(() => {});
      setWake(null);
      return;
    }
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockLike> } };
      if (!nav.wakeLock) {
        showToast('このブラウザでは使えません');
        return;
      }
      setWake(await nav.wakeLock.request('screen'));
      showToast('画面をつけたままにします');
    } catch {
      showToast('画面をつけたままにできませんでした');
    }
  };

  const theme = dark ? DARK_THEME : LIGHT_THEME;
  const draw = ({
    ctx,
    cell,
    ox,
    oy,
    w,
    h,
    dpr,
  }: {
    ctx: CanvasRenderingContext2D;
    cell: number;
    ox: number;
    oy: number;
    w: number;
    h: number;
    dpr: number;
  }) => {
    const gox = ox - rect.x * cell;
    const goy = oy - rect.y * cell;
    renderPattern(ctx, {
      cells,
      width: W,
      height: H,
      cell,
      ox: gox,
      oy: goy,
      viewW: w,
      viewH: h,
      style: 'symbol',
      theme,
      symbols,
      showGrid: true,
      guideEvery: 7,
      showPlates: false,
      focus,
      done,
      region: rect,
    });
    // 座標 (プレート内の 1〜28)
    if (cell >= 7 * dpr) {
      ctx.fillStyle = dark ? '#bbb' : '#666';
      ctx.font = `600 ${Math.round(Math.min(cell * 0.5, 13 * dpr))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const step = cell < 12 * dpr ? 7 : 1;
      for (let i = 0; i < rect.w; i++) {
        if (step > 1 && (i + 1) % step !== 0 && i !== 0) continue;
        ctx.fillText(String(i + 1), ox + i * cell + cell / 2, oy - 10 * dpr);
      }
      ctx.textAlign = 'right';
      for (let j = 0; j < rect.h; j++) {
        if (step > 1 && (j + 1) % step !== 0 && j !== 0) continue;
        ctx.fillText(String(j + 1), ox - 6 * dpr, oy + j * cell + cell / 2);
      }
    }
  };

  const onTap = (fx: number, fy: number) => {
    const x = Math.floor(fx);
    const y = Math.floor(fy);
    if (x < 0 || y < 0 || x >= rect.w || y >= rect.h) return;
    const i = (rect.y + y) * W + rect.x + x;
    if (cells[i] === EMPTY) return;
    toggleDone(i);
  };

  // 色を選んでいるときだけボタンが出る
  const markFocus = (focus: number, v: boolean) => {
    const idx: number[] = [];
    for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (cells[y * W + x] === focus) idx.push(y * W + x);
    setDone(idx, v);
    if (v) showToast(`「${PALETTE[focus].name}」を置き終わりました`);
  };

  const pct = stats.allTotal ? Math.round((stats.allDone / stats.allTotal) * 100) : 0;
  const plateNo = plate.r * cols + plate.c + 1;
  const focusStat = focus !== null ? stats.perColor.get(focus) : null;

  return (
    <div className="build-mode" role="dialog" aria-label="つくるモード">
      <header className="build-head">
        <button className="btn btn-ghost" onClick={() => setUi({ buildMode: false })}>
          <Icon name="chevronLeft" size={18} /> もどる
        </button>
        <div className="build-title">
          <strong>つくるモード</strong>
          <span>
            {pct}% 完成（{stats.allDone.toLocaleString()} / {stats.allTotal.toLocaleString()}個）
          </span>
        </div>
        <div className="build-actions">
          <button className={`icon-btn ${wake ? 'active' : ''}`} onClick={toggleWake} aria-pressed={!!wake} title="画面をつけたままにする">
            <Icon name="sun" />
          </button>
          <button
            className="icon-btn"
            onClick={() => confirm('チェックを全部消しますか？') && clearDone()}
            title="チェックを全部消す"
            aria-label="チェックを全部消す"
          >
            <Icon name="trash" />
          </button>
        </div>
      </header>
      <div className="build-progress" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>

      {cols * rows > 1 ? (
        <nav className="plate-tabs" aria-label="プレート">
          {Array.from({ length: rows }).flatMap((_, r) =>
            Array.from({ length: cols }).map((__, c) => {
              const n = r * cols + c + 1;
              const p = stats.plateProgress[n - 1];
              const active = plate.c === c && plate.r === r;
              return (
                <button
                  key={n}
                  className={`plate-tab ${active ? 'active' : ''} ${p === 1 ? 'complete' : ''}`}
                  disabled={p < 0}
                  onClick={() => {
                    setPlate({ c, r });
                    setFocus(null);
                  }}
                  aria-current={active}
                >
                  <span>{n}</span>
                  {p >= 0 ? <i style={{ width: `${Math.round(p * 100)}%` }} /> : null}
                </button>
              );
            }),
          )}
        </nav>
      ) : null}

      <div className="build-stage">
        <ZoomCanvas
          apiRef={api}
          contentW={rect.w}
          contentH={rect.h}
          margin={30}
          draw={draw}
          panWithSingle
          onTap={onTap}
          fitKey={`build:${plateNo}:${W}x${H}`}
          ariaLabel={`プレート${plateNo}`}
        />
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
        <div className="build-plate-label">プレート {plateNo}</div>
      </div>

      <div className="build-colors">
        <p className="hint">
          {focus === null ? '色をえらぶと、その色の場所だけが光ります。置いたビーズをタップするとチェックが付きます。' : null}
          {focus !== null && focusStat ? (
            <>
              <strong>{PALETTE[focus].name}</strong>：あと {focusStat.total - focusStat.done}個（全{focusStat.total}個）
            </>
          ) : null}
        </p>
        <div className="build-color-row">
          {colorList.map(([c, st]) => {
            const left = st.total - st.done;
            return (
              <button
                key={c}
                className={`build-color ${focus === c ? 'active' : ''} ${left === 0 ? 'complete' : ''}`}
                onClick={() => setFocus(focus === c ? null : c)}
                aria-pressed={focus === c}
              >
                <Bead color={c} size={34} symbol={symbols.get(c)} />
                <span className="build-color-name">{PALETTE[c].name}</span>
                <span className="build-color-left">{left === 0 ? '完了' : `のこり${left}`}</span>
              </button>
            );
          })}
        </div>
        {focus !== null ? (
          <div className="btn-row center">
            <button className="btn btn-primary" onClick={() => markFocus(focus, true)}>
              <Icon name="check" size={18} /> この色をぜんぶ置いた
            </button>
            <button className="btn btn-ghost" onClick={() => markFocus(focus, false)}>
              チェックを外す
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function firstPlateWithBeads(cells: Int16Array, W: number, H: number, cols: number, rows: number) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const pr = plateRect(W, H, c, r);
      for (let y = pr.y; y < pr.y + pr.h; y++) for (let x = pr.x; x < pr.x + pr.w; x++) if (cells[y * W + x] !== EMPTY) return { c, r };
    }
  }
  return { c: 0, r: 0 };
}
