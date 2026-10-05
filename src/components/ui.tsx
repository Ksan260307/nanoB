import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { PALETTE } from '../data/palette';
import { textColorFor } from '../lib/color';
import { Icon, type IconName } from './Icon';

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  className,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${className ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  small,
}: {
  value: T;
  options: { value: T; label: ReactNode; icon?: IconName; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
  small?: boolean;
}) {
  return (
    <div className={`segmented ${small ? 'segmented-small' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
          title={o.title}
        >
          {o.icon ? <Icon name={o.icon} size={18} /> : null}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  hint,
  leftLabel,
  rightLabel,
  defaultValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
  leftLabel?: string;
  rightLabel?: string;
  defaultValue?: number;
}) {
  const id = useId();
  // 動かしている間は表示だけ先に更新し、重い変換は間引く (ドラッグでもキー操作でも)
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = pending ?? value;
  const commit = (v: number) => {
    setPending(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChange(v);
      setPending(null);
    }, 60);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="field slider">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span className="field-value">
          {format ? format(shown) : shown}
          {defaultValue !== undefined && shown !== defaultValue ? (
            <button className="link-btn" onClick={() => onChange(defaultValue)}>
              もどす
            </button>
          ) : null}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={shown} onChange={(e) => commit(Number(e.target.value))} />
      {leftLabel || rightLabel ? (
        <div className="slider-ends">
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      ) : null}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="field toggle-field">
      <label className="toggle" htmlFor={id}>
        <span className="toggle-text">{label}</span>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
      </label>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
  step?: number;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)));
  const apply = () => {
    setEditing(false);
    const v = Number(text);
    if (Number.isFinite(v)) onChange(clamp(v));
  };
  return (
    <div className="stepper">
      <label htmlFor={id}>{label}</label>
      <div className="stepper-row">
        <button className="icon-btn" aria-label={`${label}を減らす`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>
          <Icon name="minus" size={18} />
        </button>
        <input
          id={id}
          inputMode="numeric"
          value={editing ? text : String(value)}
          onFocus={(e) => {
            setText(String(value));
            setEditing(true);
            e.currentTarget.select();
          }}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {suffix ? <span className="stepper-suffix">{suffix}</span> : null}
        <button className="icon-btn" aria-label={`${label}を増やす`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}

export function Bead({ color, size = 28, symbol, selected }: { color: number; size?: number; symbol?: string; selected?: boolean }) {
  const c = PALETTE[color];
  if (!c) return <span className="bead bead-empty" style={{ width: size, height: size }} />;
  const cls = `bead ${c.kind ? `bead-${c.kind}` : ''} ${selected ? 'bead-selected' : ''}`;
  return (
    <span className={cls} style={{ width: size, height: size, background: c.kind === 'clear' ? undefined : c.hex, color: textColorFor(c.hex) }}>
      {symbol ? <b style={{ fontSize: Math.max(10, size * 0.46) }}>{symbol}</b> : null}
    </span>
  );
}

export function Section({ title, children, icon, aside }: { title: ReactNode; children: ReactNode; icon?: IconName; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>
          {icon ? <Icon name={icon} size={18} /> : null}
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Tip({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`tip tip-${tone}`}>
      <Icon name={tone === 'warn' ? 'warning' : 'info'} size={18} />
      <div>{children}</div>
    </div>
  );
}
