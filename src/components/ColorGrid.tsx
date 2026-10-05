import type { ReactNode } from 'react';
import { GROUPS, PALETTE } from '../data/palette';
import { Icon } from './Icon';
import { Bead, Modal } from './ui';

interface GridProps {
  /** 選択中の色 */
  selected?: number | null;
  onSelect: (color: number) => void;
  /** チェック表示 (持っている色など) */
  checked?: Set<number>;
  /** 数を表示 (図案で使っている数など) */
  counts?: ArrayLike<number>;
  compact?: boolean;
}

export function ColorGrid({ selected, onSelect, checked, counts, compact }: GridProps) {
  return (
    <div className={`color-grid ${compact ? 'color-grid-compact' : ''}`}>
      {GROUPS.map((g) => {
        const colors = PALETTE.map((c, i) => ({ c, i })).filter(({ c }) => c.group === g.id);
        return (
          <div key={g.id} className="color-group">
            <h4>{g.label}</h4>
            <div className="color-group-items">
              {colors.map(({ c, i }) => (
                <button
                  key={c.code}
                  className={`color-item ${selected === i ? 'active' : ''} ${checked?.has(i) ? 'checked' : ''}`}
                  onClick={() => onSelect(i)}
                  aria-pressed={checked ? checked.has(i) : selected === i}
                  title={`${c.name}（${c.code}）`}
                >
                  <Bead color={i} size={compact ? 26 : 30} />
                  <span className="color-item-text">
                    <span className="color-name">{c.name}</span>
                    {!compact ? <span className="color-code">{c.code}</span> : null}
                  </span>
                  {counts && counts[i] > 0 ? <span className="color-count">{counts[i]}</span> : null}
                  {checked?.has(i) ? (
                    <span className="color-check">
                      <Icon name="check" size={14} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ColorPickerDialog({
  title,
  onClose,
  onPick,
  selected,
  near,
  extra,
}: {
  title: ReactNode;
  onClose: () => void;
  onPick: (color: number) => void;
  selected?: number | null;
  near?: number[];
  extra?: ReactNode;
}) {
  return (
    <Modal title={title} onClose={onClose} wide>
      {extra}
      {near && near.length ? (
        <div className="near-colors">
          <h4>近い色</h4>
          <div className="near-list">
            {near.map((i) => (
              <button key={i} className="near-item" onClick={() => onPick(i)}>
                <Bead color={i} size={40} />
                <span>{PALETTE[i].name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <ColorGrid selected={selected} onSelect={onPick} />
    </Modal>
  );
}
