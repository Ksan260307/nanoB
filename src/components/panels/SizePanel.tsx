import { PLATE_PEGS } from '../../data/palette';
import { NO_EDIT } from '../../lib/pattern';
import { MAX_SIZE, MIN_SIZE, type Settings } from '../../lib/project';
import { formatCm } from '../../lib/shopping';
import { useColorStats } from '../../state/hooks';
import { useStore } from '../../state/store';
import { Section, Segmented, Stepper, Tip, Toggle } from '../ui';

const PRESETS = [
  { x: 1, y: 1, label: '1枚' },
  { x: 2, y: 1, label: 'よこ2枚' },
  { x: 1, y: 2, label: 'たて2枚' },
  { x: 2, y: 2, label: '4枚' },
  { x: 3, y: 2, label: '6枚' },
  { x: 3, y: 3, label: '9枚' },
  { x: 4, y: 4, label: '16枚' },
];

function PlateIcon({ x, y }: { x: number; y: number }) {
  const s = 30 / Math.max(x, y, 2);
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      {Array.from({ length: y }).flatMap((_, r) =>
        Array.from({ length: x }).map((__, c) => (
          <rect key={`${r}-${c}`} x={2 + c * s} y={2 + r * s} width={s - 2} height={s - 2} rx="2" className="plate-icon-cell" />
        )),
      )}
    </svg>
  );
}

export function SizePanel() {
  const project = useStore((s) => s.project)!;
  const resize = useStore((s) => s.resize);
  const updateSettings = useStore((s) => s.updateSettings);
  const { total } = useColorStats();
  const { settings, width, height, source, mode } = project;

  const apply = (w: number, h: number, patch: Partial<Settings>) => {
    w = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(w)));
    h = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(h)));
    if (w === width && h === height) {
      updateSettings(patch);
      return;
    }
    const hasEdits = project.overlay.some((v) => v !== NO_EDIT);
    if (mode === 'image' && hasEdits && !confirm('大きさを変えると、手で直した部分は元に戻ります。よろしいですか？')) return;
    resize(w, h, patch);
  };

  const aspect = source ? source.height / source.width : 1;
  const canKeepAspect = !!source && mode === 'image';
  const plates = Math.ceil(width / PLATE_PEGS) * Math.ceil(height / PLATE_PEGS);

  return (
    <div className="panel-content">
      <Section title="図案の大きさの決め方" icon="size">
        <Segmented
          label="大きさの決め方"
          value={settings.sizeMode}
          onChange={(sizeMode) => {
            if (sizeMode === 'plates') {
              const px = Math.max(1, Math.round(width / PLATE_PEGS));
              const py = Math.max(1, Math.round(height / PLATE_PEGS));
              apply(px * PLATE_PEGS, py * PLATE_PEGS, { sizeMode, platesX: px, platesY: py });
            } else {
              updateSettings({ sizeMode });
            }
          }}
          options={[
            { value: 'plates', label: 'プレートの枚数' },
            { value: 'beads', label: 'ビーズの数' },
          ]}
        />
      </Section>

      {settings.sizeMode === 'plates' ? (
        <Section title="プレートの枚数" icon="grid">
          <div className="preset-grid">
            {PRESETS.map((p) => {
              const active = settings.platesX === p.x && settings.platesY === p.y && width === p.x * PLATE_PEGS && height === p.y * PLATE_PEGS;
              return (
                <button
                  key={p.label}
                  className={`preset ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  onClick={() => apply(p.x * PLATE_PEGS, p.y * PLATE_PEGS, { platesX: p.x, platesY: p.y })}
                >
                  <PlateIcon x={p.x} y={p.y} />
                  <span>{p.label}</span>
                  <small>
                    {p.x * PLATE_PEGS}×{p.y * PLATE_PEGS}
                  </small>
                </button>
              );
            })}
          </div>
          <div className="stepper-pair">
            <Stepper
              label="よこ"
              value={settings.platesX}
              min={1}
              max={10}
              suffix="枚"
              onChange={(v) => apply(v * PLATE_PEGS, settings.platesY * PLATE_PEGS, { platesX: v })}
            />
            <Stepper
              label="たて"
              value={settings.platesY}
              min={1}
              max={10}
              suffix="枚"
              onChange={(v) => apply(settings.platesX * PLATE_PEGS, v * PLATE_PEGS, { platesY: v })}
            />
          </div>
        </Section>
      ) : (
        <Section title="ビーズの数" icon="grid">
          {canKeepAspect ? (
            <Toggle
              label="縦横の比率を画像に合わせる"
              checked={settings.keepAspect}
              onChange={(keepAspect) => {
                if (keepAspect) apply(width, width * aspect, { keepAspect, fit: 'contain' });
                else updateSettings({ keepAspect });
              }}
            />
          ) : null}
          <div className="stepper-pair">
            <Stepper
              label="よこ"
              value={width}
              min={MIN_SIZE}
              max={MAX_SIZE}
              suffix="個"
              onChange={(v) => apply(v, canKeepAspect && settings.keepAspect ? v * aspect : height, {})}
            />
            <Stepper
              label="たて"
              value={height}
              min={MIN_SIZE}
              max={MAX_SIZE}
              suffix="個"
              onChange={(v) => apply(canKeepAspect && settings.keepAspect ? v / aspect : width, v, {})}
            />
          </div>
        </Section>
      )}

      <div className="info-card">
        <div>
          <span>図案</span>
          <strong>
            よこ{width} × たて{height}
          </strong>
        </div>
        <div>
          <span>完成サイズ</span>
          <strong>
            約 {formatCm(width)} × {formatCm(height)} cm
          </strong>
        </div>
        <div>
          <span>プレート</span>
          <strong>
            {plates}枚 <small>（プレートセット{Math.ceil(plates / 2)}個分）</small>
          </strong>
        </div>
        <div>
          <span>使うビーズ</span>
          <strong>{total.toLocaleString()}個</strong>
        </div>
      </div>
      <Tip>
        ナノビーズのプレートは1枚が28×28ピン（約8cm角）で、つなげて大きな作品も作れます。
        {mode === 'image' ? '写真はビーズの数を増やすほど、くわしく表現できます。' : ''}
      </Tip>
    </div>
  );
}
