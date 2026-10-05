import { useMemo, useState } from 'react';
import { BEADS_PER_PACK, GROUPS, PALETTE } from '../../data/palette';
import { yodobashiUrl } from '../../data/shops';
import { shoppingList, shoppingText, yen, type ShoppingRow } from '../../lib/shopping';
import { useColorStats } from '../../state/hooks';
import { useStore, type OwnedSet } from '../../state/store';
import { Icon } from '../Icon';
import { PaletteDialog } from '../PaletteDialog';
import { ReplaceDialog } from '../ReplaceDialog';
import { Bead, Section, Segmented, Tip, Toggle } from '../ui';

type Sort = 'count' | 'code' | 'group';

export function ChartPanel() {
  const project = useStore((s) => s.project)!;
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const showToast = useStore((s) => s.showToast);
  const { counts, symbols } = useColorStats();
  const [sort, setSort] = useState<Sort>('count');
  const [replacing, setReplacing] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const summary = useMemo(() => shoppingList(counts, prefs.ownedSet, prefs.spare), [counts, prefs.ownedSet, prefs.spare]);
  const rows = useMemo(() => {
    const r = summary.rows.slice();
    const groupOrder = (c: number) => GROUPS.findIndex((g) => g.id === PALETTE[c].group);
    if (sort === 'count') r.sort((a, b) => b.count - a.count);
    else if (sort === 'code') r.sort((a, b) => PALETTE[a.color].code.localeCompare(PALETTE[b.color].code));
    else r.sort((a, b) => groupOrder(a.color) - groupOrder(b.color) || a.color - b.color);
    return r;
  }, [summary, sort]);

  const copy = async () => {
    const text = shoppingText(project.name, summary);
    try {
      await navigator.clipboard.writeText(text);
      showToast('買い物メモをコピーしました');
    } catch {
      showToast('コピーできませんでした');
    }
  };

  return (
    <div className="panel-content">
      <div className="summary-grid">
        <div className="summary-card">
          <span>色の数</span>
          <strong>{summary.colors}色</strong>
        </div>
        <div className="summary-card">
          <span>ビーズ</span>
          <strong>{summary.totalBeads.toLocaleString()}個</strong>
        </div>
        <div className="summary-card">
          <span>買う袋</span>
          <strong>{summary.totalPacks}袋</strong>
        </div>
        <div className="summary-card">
          <span>目安の金額</span>
          <strong>{yen(summary.totalYen)}</strong>
        </div>
      </div>

      <Section title="カラーチャート（使う色）" icon="chart" aside={<span className="hint">タップで場所を表示</span>}>
        {rows.length === 0 ? (
          <Tip>まだビーズがありません。</Tip>
        ) : (
          <>
            <Segmented
              small
              label="並び順"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'count', label: '多い順' },
                { value: 'group', label: '色の系統' },
                { value: 'code', label: '品番順' },
              ]}
            />
            <ul className="chart-list">
              {rows.map((r) => (
                <ChartRow
                  key={r.color}
                  row={r}
                  symbol={symbols.get(r.color)!}
                  active={focus === r.color}
                  onFocus={() => setFocus(focus === r.color ? null : r.color)}
                  onReplace={() => setReplacing(r.color)}
                />
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title="買い物の計算" icon="star">
        <div className="field">
          <div className="field-head">
            <label>持っているセット</label>
          </div>
          <Segmented<OwnedSet>
            small
            label="持っているセット"
            value={prefs.ownedSet}
            onChange={(ownedSet) => setPrefs({ ownedSet })}
            options={[
              { value: 'none', label: 'なし' },
              { value: 'set12', label: '12色' },
              { value: 'set24', label: '24色' },
              { value: 'set48', label: '48色' },
            ]}
          />
        </div>
        <Toggle
          label="予備を1割多めに計算する"
          hint="ビーズはなくしやすいので、少し多めに用意すると安心です。"
          checked={prefs.spare}
          onChange={(spare) => setPrefs({ spare })}
        />
        <p className="hint">
          単色は1袋{BEADS_PER_PACK.toLocaleString()}個入りで計算しています。金額は希望小売価格（税込）からの目安です。
          <Icon name="cart" size={14} />
          ボタンで、ヨドバシ.comのその色の商品ページを開けます。
        </p>
        <div className="btn-row wrap">
          <button className="btn btn-small" onClick={copy} disabled={!rows.length}>
            <Icon name="copy" size={16} /> 買い物メモをコピー
          </button>
          <button className="btn btn-small" onClick={() => setPaletteOpen(true)}>
            <Icon name="palette" size={16} /> 全色カラーチャート
          </button>
        </div>
      </Section>
      {replacing !== null ? <ReplaceDialog color={replacing} onClose={() => setReplacing(null)} /> : null}
      {paletteOpen ? <PaletteDialog onClose={() => setPaletteOpen(false)} /> : null}
    </div>
  );
}

function ChartRow({
  row,
  symbol,
  active,
  onFocus,
  onReplace,
}: {
  row: ShoppingRow;
  symbol: string;
  active: boolean;
  onFocus: () => void;
  onReplace: () => void;
}) {
  const c = PALETTE[row.color];
  return (
    <li className={`chart-row ${active ? 'active' : ''}`}>
      <button className="chart-main" onClick={onFocus} aria-pressed={active} title="この色の場所を表示">
        <Bead color={row.color} size={34} symbol={symbol} />
        <span className="chart-name">
          <strong>{c.name}</strong>
          <small>{c.code}</small>
        </span>
        <span className="chart-count">
          <strong>{row.count.toLocaleString()}</strong>
          <small>個</small>
        </span>
        <span className={`chart-packs ${row.packs === 0 ? 'ok' : ''}`}>{row.packs === 0 ? '手持ちでOK' : `${row.packs}袋`}</span>
      </button>
      <a
        className="icon-btn chart-shop"
        href={yodobashiUrl(c.code)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${c.name}（${c.code}）をヨドバシ.comで見る`}
        title="ヨドバシ.comで見る"
      >
        <Icon name="cart" size={18} />
      </a>
      <button className="icon-btn chart-swap" onClick={onReplace} aria-label={`${c.name}を別の色に差し替える`} title="別の色に差し替え">
        <Icon name="swap" size={18} />
      </button>
    </li>
  );
}
