import { useMemo, useState } from 'react';
import { PALETTE } from '../../data/palette';
import { EMPTY, findIslands, NO_EDIT } from '../../lib/pattern';
import { useColorStats } from '../../state/hooks';
import { useStore, type Tool } from '../../state/store';
import { ColorGrid } from '../ColorGrid';
import { Icon, type IconName } from '../Icon';
import { Bead, Section, Tip } from '../ui';

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
        <div className="btn-row wrap">
          {project.mode === 'image' ? (
            <>
              <button className="btn btn-small" disabled={!hasEdits} onClick={() => confirm('手で直した部分を全部元に戻しますか？') && clearEdits()}>
                <Icon name="undo" size={16} /> 手直しを全部もどす
              </button>
              <button
                className="btn btn-small"
                onClick={() =>
                  confirm('今の図案を確定して、フリーモード（手で自由に編集）にします。以後、画像の設定を変えても図案は変わりません。よろしいですか？') &&
                  bakeToFree()
                }
              >
                <Icon name="lock" size={16} /> 図案を確定して自由に編集
              </button>
            </>
          ) : (
            <button className="btn btn-small btn-danger" onClick={() => confirm('ビーズを全部消しますか？') && clearAll()}>
              <Icon name="trash" size={16} /> 全部消す
            </button>
          )}
        </div>
        {project.mode === 'image' ? <Tip>手で直した部分は、色や明るさの設定を変えてもそのまま残ります（大きさを変えるとリセットされます）。</Tip> : null}
      </Section>
    </div>
  );
}
