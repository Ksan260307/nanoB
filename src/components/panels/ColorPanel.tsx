import { useState } from 'react';
import { PALETTE, PALETTE_SETS, type PaletteSetId } from '../../data/palette';
import { useColorStats } from '../../state/hooks';
import { allowedColors, useStore } from '../../state/store';
import { ColorPickerDialog } from '../ColorGrid';
import { Icon } from '../Icon';
import { PaletteDialog } from '../PaletteDialog';
import { Bead, Section, Segmented, Slider, Tip, Toggle } from '../ui';

const OUTLINE_QUICK = ['くろ', 'こげちゃいろ', 'ダークグレイ', 'しろ', 'ミッドナイトブルー'].map((n) => PALETTE.findIndex((c) => c.name === n));

export function ColorPanel() {
  const project = useStore((s) => s.project)!;
  const updateSettings = useStore((s) => s.updateSettings);
  const restoreColor = useStore((s) => s.restoreColor);
  const myColors = useStore((s) => s.prefs.myColors);
  const { used } = useColorStats();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [outlinePick, setOutlinePick] = useState(false);
  const s = project.settings;

  if (project.mode === 'free') {
    return (
      <div className="panel-content">
        <Tip>
          フリーモードでは、自分でえらんだ色でビーズを置いていきます。「編集」タブで色をえらんで描いてください。
          画像から自動で作りたいときは「画像」タブから下絵を読み込み、「この画像から自動で作る」を押します。
        </Tip>
      </div>
    );
  }

  const allowed = allowedColors(s, myColors);
  const sets: { id: PaletteSetId; label: string; note: string }[] = [
    ...PALETTE_SETS.map((p) => ({ id: p.id, label: p.label, note: p.note })),
    { id: 'mine', label: 'マイカラー', note: `持っている${myColors.length}色` },
  ];
  const limit = s.maxColors > 0;
  const maxAllowed = Math.max(2, allowed.length);
  const replacedEntries = Object.entries(s.replacements).map(([from, to]) => [Number(from), to] as const);

  return (
    <div className="panel-content">
      <Section title="使う色" icon="palette" aside={<span className="badge">今 {used}色</span>}>
        <div className="set-grid" role="radiogroup" aria-label="使う色">
          {sets.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={s.paletteSet === o.id}
              className={`set-card ${s.paletteSet === o.id ? 'active' : ''}`}
              onClick={() => updateSettings({ paletteSet: o.id })}
            >
              <strong>{o.label}</strong>
              <small>{o.note}</small>
            </button>
          ))}
        </div>
        <button className="btn btn-small btn-ghost" onClick={() => setPaletteOpen(true)}>
          <Icon name="edit" size={16} /> マイカラー（持っている色）を設定
        </button>
        {allowed.length === 0 ? <Tip tone="warn">使える色がありません。マイカラーに色を追加してください。</Tip> : null}
        <Toggle label="とうめいビーズも使う" checked={s.useClear} onChange={(useClear) => updateSettings({ useClear })} />
        <Toggle label="ゴールド・シルバーも使う" checked={s.useMetallic} onChange={(useMetallic) => updateSettings({ useMetallic })} />
      </Section>

      <Section title="色の数" icon="sparkles">
        <Toggle
          label="色の数をしぼる"
          hint="色を少なくすると、ビーズをそろえやすく、作るのも楽になります。"
          checked={limit}
          onChange={(v) => updateSettings({ maxColors: v ? Math.min(12, maxAllowed) : 0 })}
        />
        {limit ? (
          <Slider
            label="最大の色数"
            value={Math.min(s.maxColors, maxAllowed)}
            min={2}
            max={Math.min(40, maxAllowed)}
            onChange={(maxColors) => updateSettings({ maxColors })}
            format={(v) => `${v}色`}
            leftLabel="シンプル"
            rightLabel="くわしく"
          />
        ) : null}
      </Section>

      <Section title="仕上がり" icon="bead">
        <Slider
          label="グラデーション（ディザ）"
          value={s.dither}
          min={0}
          max={100}
          step={5}
          onChange={(dither) => updateSettings({ dither })}
          format={(v) => (v === 0 ? 'なし' : `${v}%`)}
          leftLabel="くっきり"
          rightLabel="なめらか"
          hint="色を細かく混ぜて、少ない色でも色の変化を表現します。写真向けです。"
        />
        <div className="field">
          <div className="field-head">
            <label>ポツンとしたビーズを減らす</label>
          </div>
          <Segmented
            label="ノイズを減らす"
            value={s.cleanup}
            onChange={(cleanup) => updateSettings({ cleanup })}
            options={[
              { value: 0, label: 'しない' },
              { value: 1, label: '少し' },
              { value: 2, label: 'しっかり' },
            ]}
          />
        </div>
      </Section>

      <Section title="明るさ・色味" icon="sun">
        <Slider label="明るさ" value={s.brightness} min={-100} max={100} onChange={(brightness) => updateSettings({ brightness })} defaultValue={0} />
        <Slider label="コントラスト" value={s.contrast} min={-100} max={100} onChange={(contrast) => updateSettings({ contrast })} defaultValue={0} />
        <Slider label="あざやかさ" value={s.saturation} min={-100} max={100} onChange={(saturation) => updateSettings({ saturation })} defaultValue={0} />
      </Section>

      <Section title="ふちどり" icon="heart">
        <Segmented
          label="ふちどり"
          value={s.outline}
          onChange={(outline) => updateSettings({ outline })}
          options={[
            { value: 'none', label: 'なし' },
            { value: 'outer', label: '外側に付ける' },
            { value: 'inner', label: 'ふちを塗る' },
          ]}
        />
        {s.outline !== 'none' ? (
          <div className="quick-colors">
            {OUTLINE_QUICK.map((c) => (
              <button
                key={c}
                className={`quick-color ${s.outlineColor === c ? 'active' : ''}`}
                onClick={() => updateSettings({ outlineColor: c })}
                aria-label={PALETTE[c].name}
              >
                <Bead color={c} size={30} selected={s.outlineColor === c} />
              </button>
            ))}
            <button className="btn btn-small" onClick={() => setOutlinePick(true)}>
              ほかの色
            </button>
            <span className="hint">{PALETTE[s.outlineColor]?.name}</span>
          </div>
        ) : null}
        <p className="hint">キーホルダーやシールのように、まわりをふちどると形がはっきりします。「画像」タブの「背景を透明にする」と合わせて使いましょう。</p>
      </Section>

      {s.excluded.length || replacedEntries.length ? (
        <Section title="差し替えた色" icon="swap">
          <ul className="replaced-list">
            {replacedEntries.map(([from, to]) => (
              <li key={`r${from}`}>
                <Bead color={from} size={22} /> {PALETTE[from]?.name} <Icon name="chevronRight" size={14} /> <Bead color={to} size={22} /> {PALETTE[to]?.name}
                <button className="link-btn" onClick={() => restoreColor(from)}>
                  もどす
                </button>
              </li>
            ))}
            {s.excluded.map((c) => (
              <li key={`e${c}`}>
                <Bead color={c} size={22} /> {PALETTE[c]?.name} を使わない
                <button className="link-btn" onClick={() => restoreColor(c)}>
                  もどす
                </button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {paletteOpen ? <PaletteDialog onClose={() => setPaletteOpen(false)} /> : null}
      {outlinePick ? (
        <ColorPickerDialog
          title="ふちどりの色"
          selected={s.outlineColor}
          onClose={() => setOutlinePick(false)}
          onPick={(outlineColor) => {
            updateSettings({ outlineColor });
            setOutlinePick(false);
          }}
        />
      ) : null}
    </div>
  );
}
