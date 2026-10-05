import { BEADS_PER_PACK, PACK_PRICE_YEN, PALETTE, PALETTE_SETS } from '../data/palette';
import { useStore } from '../state/store';
import { ColorGrid } from './ColorGrid';
import { Modal } from './ui';

/** ナノビーズ全色のカラーチャート兼「マイカラー(持っている色)」の設定 */
export function PaletteDialog({ onClose }: { onClose: () => void }) {
  const myColors = useStore((s) => s.prefs.myColors);
  const setPrefs = useStore((s) => s.setPrefs);
  const checked = new Set(myColors);

  const toggle = (c: number) => {
    const next = new Set(checked);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setPrefs({ myColors: [...next].sort((a, b) => a - b) });
  };

  return (
    <Modal
      title="ナノビーズ 全色カラーチャート"
      onClose={onClose}
      wide
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          とじる
        </button>
      }
    >
      <p className="hint">
        カワダ「ナノビーズ」の単色は全{PALETTE.length}色（1袋{BEADS_PER_PACK.toLocaleString()}個入り・{PACK_PRICE_YEN}円）。タップすると
        <strong>マイカラー（持っている色）</strong>に追加/解除できます。「使う色」でマイカラーを選ぶと、持っている色だけで図案を作れます。
      </p>
      <div className="btn-row wrap">
        {PALETTE_SETS.filter((s) => s.id !== 'all').map((s) => (
          <button key={s.id} className="btn btn-small" onClick={() => setPrefs({ myColors: s.colors.slice().sort((a, b) => a - b) })}>
            {s.label}と同じにする
          </button>
        ))}
        <button className="btn btn-small" onClick={() => setPrefs({ myColors: PALETTE.map((_, i) => i) })}>
          全部チェック
        </button>
        <button className="btn btn-small btn-ghost" onClick={() => setPrefs({ myColors: [] })}>
          全部はずす
        </button>
      </div>
      <p className="badge-line">
        マイカラー: <strong>{myColors.length}色</strong>
      </p>
      <ColorGrid onSelect={toggle} checked={checked} />
      <p className="hint small">※ 画面の色は写真から作った目安です。実物の色とは少し異なります。</p>
    </Modal>
  );
}
