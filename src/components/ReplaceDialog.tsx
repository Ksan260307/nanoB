import { PALETTE } from '../data/palette';
import { useColorStats } from '../state/hooks';
import { nearestColors, useStore } from '../state/store';
import { ColorPickerDialog } from './ColorGrid';
import { Icon } from './Icon';
import { Bead } from './ui';

/** 図案の中の1色を、別の色にまとめて差し替える */
export function ReplaceDialog({ color, onClose }: { color: number; onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const replaceColor = useStore((s) => s.replaceColor);
  const undo = useStore((s) => s.undo);
  const showToast = useStore((s) => s.showToast);
  const { counts } = useColorStats();
  const all = PALETTE.map((_, i) => i).filter((i) => !PALETTE[i].kind);
  const near = nearestColors(color, all, 8);
  const from = PALETTE[color];

  const apply = (to: number | null) => {
    replaceColor(color, to);
    onClose();
    const label = to === null ? '近い色におまかせで差し替えました' : `「${from.name}」→「${PALETTE[to].name}」に差し替えました`;
    showToast(label, { label: '元に戻す', run: undo });
  };

  return (
    <ColorPickerDialog
      title={`「${from.name}」を別の色にする`}
      onClose={onClose}
      selected={color}
      near={near}
      onPick={(c) => (c === color ? onClose() : apply(c))}
      extra={
        <div className="replace-head">
          <Bead color={color} size={48} />
          <div>
            <strong>{from.name}</strong>
            <span>
              {from.code} ・ {counts[color].toLocaleString()}個
            </span>
          </div>
          {project.mode === 'image' ? (
            <button className="btn btn-small" onClick={() => apply(null)}>
              <Icon name="sparkles" size={16} /> おまかせ（この色を使わない）
            </button>
          ) : null}
        </div>
      }
    />
  );
}
