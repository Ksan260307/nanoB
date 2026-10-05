import { useMemo, useState } from 'react';
import { PALETTE } from '../../data/palette';
import { centerShift, contentBounds, EMPTY, findIslands, NO_EDIT, type Symmetry } from '../../lib/pattern';
import { useColorStats } from '../../state/hooks';
import { useStore, type Tool } from '../../state/store';
import { ColorGrid } from '../ColorGrid';
import { useConfirm } from '../confirm';
import { Icon, type IconName } from '../Icon';
import { Bead, Section, Segmented, Tip } from '../ui';

const TOOLS: { id: Tool; label: string; icon: IconName; key: string }[] = [
  { id: 'move', label: '移動', icon: 'hand', key: 'H' },
  { id: 'pen', label: 'ペン', icon: 'pencil', key: 'B' },
  { id: 'eraser', label: '消しゴム', icon: 'eraser', key: 'E' },
  { id: 'fill', label: '塗りつぶし', icon: 'bucket', key: 'G' },
  { id: 'picker', label: 'スポイト', icon: 'picker', key: 'I' },
];

export function ToolBar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <div className="tool-bar" role="radiogroup" aria-label="道具">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={tool === t.id}
          className={`tool ${tool === t.id ? 'active' : ''}`}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.key})`}
        >
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

const SYMMETRY_OPTIONS: { value: Symmetry; label: string }[] = [
  { value: 'none', label: 'しない' },
  { value: 'x', label: '左右' },
  { value: 'y', label: '上下' },
  { value: 'xy', label: '上下左右' },
];

/** 対称に描く (まん中の線をはさんだ反対側にも同時に描く) */
function SymmetryPicker() {
  const symmetry = useStore((s) => s.symmetry);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">
          <Icon name="flip" size={16} /> 対称に描く
        </span>
      </div>
      <Segmented small label="対称に描く" value={symmetry} onChange={(v) => setUi({ symmetry: v })} options={SYMMETRY_OPTIONS} />
    </div>
  );
}

/** フリーモードで図案全体を反転・移動する */
function MoveTools() {
  const project = useStore((s) => s.project)!;
  const cells = useStore((s) => s.cells);
  const rev = useStore((s) => s.rev);
  const flip = useStore((s) => s.flip);
  const shift = useStore((s) => s.shift);
  const centerPattern = useStore((s) => s.centerPattern);
  const { width: W, height: H } = project;
  const { bounds, centered } = useMemo(() => {
    const [dx, dy] = centerShift(cells, W, H);
    return { bounds: contentBounds(cells, W, H), centered: dx === 0 && dy === 0 };
    // rev でマスの変更を検知する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, rev, W, H]);
  const b = bounds ?? { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
  const nudges: { cls: string; label: string; icon: IconName; dx: number; dy: number; blocked: boolean }[] = [
    { cls: 'nudge-up', label: '上に1つずらす', icon: 'arrowUp', dx: 0, dy: -1, blocked: b.y0 === 0 },
    { cls: 'nudge-left', label: '左に1つずらす', icon: 'arrowLeft', dx: -1, dy: 0, blocked: b.x0 === 0 },
    { cls: 'nudge-right', label: '右に1つずらす', icon: 'arrowRight', dx: 1, dy: 0, blocked: b.x1 === W - 1 },
    { cls: 'nudge-down', label: '下に1つずらす', icon: 'arrowDown', dx: 0, dy: 1, blocked: b.y1 === H - 1 },
  ];
  return (
    <>
      <div className="move-tools">
        <div className="nudge-pad" role="group" aria-label="図案をずらす">
          {nudges.map((n) => (
            <button
              key={n.cls}
              className={'icon-btn ' + n.cls}
              onClick={() => shift(n.dx, n.dy)}
              disabled={!bounds || n.blocked}
              aria-label={n.label}
              title={n.label}
            >
              <Icon name={n.icon} size={20} />
            </button>
          ))}
          <span className="nudge-label" aria-hidden="true">
            ずらす
          </span>
        </div>
        <div className="move-buttons">
          <button className="btn btn-small" onClick={() => flip('x')} disabled={!bounds}>
            <Icon name="flip" size={16} /> 左右反転
          </button>
          <button className="btn btn-small" onClick={() => flip('y')} disabled={!bounds}>
            <Icon name="flipV" size={16} /> 上下反転
          </button>
          <button className="btn btn-small" onClick={centerPattern} disabled={!bounds || centered}>
            <Icon name="center" size={16} /> まん中に寄せる
          </button>
        </div>
      </div>
      <p className="hint">はしにビーズがあると、その向きにはずらせません。つくるモードのチェックも一緒に動きます。</p>
    </>
  );
}

/** 元に戻す・やり直し (編集パネルとキャンバスの上で使う) */
export function UndoRedo({ compact }: { compact?: boolean }) {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  return (
    <div className={compact ? 'pill-group undo-redo' : 'btn-row'}>
      <button className={compact ? '' : 'btn btn-small'} onClick={undo} disabled={!canUndo} aria-label="元に戻す" title="元に戻す (Ctrl+Z)">
        <Icon name="undo" size={18} />
        <span className={compact ? 'pill-label' : ''}>元に戻す</span>
      </button>
      <button className={compact ? '' : 'btn btn-small'} onClick={redo} disabled={!canRedo} aria-label="やり直し" title="やり直し (Ctrl+Y)">
        <Icon name="redo" size={18} />
        <span className={compact ? 'pill-label' : ''}>やり直し</span>
      </button>
    </div>
  );
}

export function EditPanel() {
  const project = useStore((s) => s.project)!;
  const color = useStore((s) => s.color);
  const setColor = useStore((s) => s.setColor);
  const cells = useStore((s) => s.cells);
  const rev = useStore((s) => s.rev);
  const clearEdits = useStore((s) => s.clearEdits);
  const clearAll = useStore((s) => s.clearAll);
  const bakeToFree = useStore((s) => s.bakeToFree);
  const beginStroke = useStore((s) => s.beginStroke);
  const paint = useStore((s) => s.paint);
  const endStroke = useStore((s) => s.endStroke);
  const showToast = useStore((s) => s.showToast);
  const { counts, symbols } = useColorStats();
  const [allOpen, setAllOpen] = useState(project.mode === 'free');
  const [ask, confirmUi] = useConfirm();

  const usedColors = useMemo(() => [...symbols.keys()].sort((a, b) => counts[b] - counts[a]), [symbols, counts]);

  const islands = useMemo(() => {
    const { labels, sizes } = findIslands(cells, project.width, project.height);
    const tiny = sizes.filter((s) => s <= 2).length;
    return { labels, sizes, tiny };
    // rev でマスの変更を検知する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, rev, project.width, project.height]);

  const hasEdits = project.overlay.some((v) => v !== NO_EDIT);
  const removeTiny = () => {
    const targets: number[] = [];
    for (let i = 0; i < islands.labels.length; i++) {
      const l = islands.labels[i];
      if (l >= 0 && islands.sizes[l] <= 2) targets.push(i);
    }
    beginStroke();
    const changed = paint(targets, EMPTY);
    endStroke(changed);
    showToast(`離れたビーズを${targets.length}個消しました`);
  };

  return (
    <div className="panel-content">
      <Section title="道具" icon="pencil">
        <ToolBar />
        <UndoRedo />
        <p className="hint">ペンでなぞるとビーズを置けます。2本指でつまむと拡大、2本指で動かすと移動できます（パソコンはホイール・右ドラッグ）。</p>
        <SymmetryPicker />
      </Section>

      <Section
        title="ペンの色"
        icon="palette"
        aside={
          <span className="current-color">
            <Bead color={color} size={24} /> {PALETTE[color]?.name}
          </span>
        }
      >
        {usedColors.length ? (
          <>
            <h4 className="sub-title">図案で使っている色</h4>
            <div className="chip-colors">
              {usedColors.map((c) => (
                <button key={c} className={`chip-color ${color === c ? 'active' : ''}`} onClick={() => setColor(c)} title={PALETTE[c].name}>
                  <Bead color={c} size={32} symbol={symbols.get(c)} selected={color === c} />
                  <span>{PALETTE[c].name}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <button className="btn btn-small btn-ghost" onClick={() => setAllOpen((v) => !v)} aria-expanded={allOpen}>
          <Icon name={allOpen ? 'chevronDown' : 'chevronRight'} size={16} /> すべての色（{PALETTE.length}色）から選ぶ
        </button>
        {allOpen ? <ColorGrid compact selected={color} onSelect={setColor} counts={counts} /> : null}
      </Section>

      <Section title="つながりチェック" icon="link">
        {islands.sizes.length <= 1 ? (
          <p className="ok-line">
            <Icon name="check" size={18} /> ビーズは全部つながっています。
          </p>
        ) : (
          <>
            <p>
              ビーズが <strong>{islands.sizes.length}個のかたまり</strong> に分かれています。
              {islands.tiny ? `そのうち${islands.tiny}個は1〜2粒だけ離れています。` : ''}
            </p>
            <p className="hint">
              アイロンでくっつくのは上下左右のとなり同士だけです。離れた部分は完成後にバラバラになります（パーツを分けて作る場合はそのままでOK）。
            </p>
            {islands.tiny ? (
              <button className="btn btn-small" onClick={removeTiny}>
                <Icon name="eraser" size={16} /> 離れた1〜2粒を消す
              </button>
            ) : null}
          </>
        )}
      </Section>

      <Section title="まとめて操作" icon="layers">
        {project.mode === 'free' ? <MoveTools /> : null}
        <div className="btn-row wrap">
          {project.mode === 'image' ? (
            <>
              <button
                className="btn btn-small"
                disabled={!hasEdits}
                onClick={async () => {
                  if (await ask({ title: '手直しを全部もどす', message: '手で直した部分を全部元に戻しますか？', ok: 'もどす' })) clearEdits();
                }}
              >
                <Icon name="undo" size={16} /> 手直しを全部もどす
              </button>
              <button
                className="btn btn-small"
                onClick={async () => {
                  const ok = await ask({
                    title: '図案を確定して自由に編集',
                    message: '今の図案を確定して、フリーモード（手で自由に編集）にします。以後、画像の設定を変えても図案は変わりません。',
                    ok: '確定する',
                  });
                  if (ok) bakeToFree();
                }}
              >
                <Icon name="lock" size={16} /> 図案を確定して自由に編集
              </button>
            </>
          ) : (
            <button
              className="btn btn-small btn-danger"
              onClick={async () => {
                if (await ask({ title: 'ビーズを全部消す', message: 'ビーズを全部消しますか？（「元に戻す」で戻せます）', ok: '全部消す', danger: true }))
                  clearAll();
              }}
            >
              <Icon name="trash" size={16} /> 全部消す
            </button>
          )}
        </div>
        {project.mode === 'image' ? <Tip>手で直した部分は、色や明るさの設定を変えてもそのまま残ります（大きさを変えるとリセットされます）。</Tip> : null}
      </Section>
      {confirmUi}
    </div>
  );
}
