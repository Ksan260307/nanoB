import { useEffect, useState } from 'react';
import { BEAD_PITCH_MM, PALETTE, PLATE_PEGS } from '../data/palette';
import { deserializeProject, MAX_SIZE, MIN_SIZE, newId, serializeProject, type ProjectFile } from '../lib/project';
import { deleteProjectRecord, listProjectRecords, loadProjectRecord, saveProjectRecord, type StoredProject } from '../lib/storage';
import { useStore } from '../state/store';
import { Icon } from './Icon';
import { Modal, Segmented, Stepper } from './ui';

/** マイ図案 (このブラウザに保存した図案) */
export function ProjectsDialog({ onClose, onNewImage, onNewFree }: { onClose: () => void; onNewImage: () => void; onNewFree: () => void }) {
  const openProject = useStore((s) => s.openProject);
  const current = useStore((s) => s.project?.id);
  const showToast = useStore((s) => s.showToast);
  const [items, setItems] = useState<Omit<StoredProject, 'data'>[] | null>(null);

  const reload = () =>
    listProjectRecords()
      .then(setItems)
      .catch(() => setItems([]));

  useEffect(() => {
    reload();
  }, []);

  const open = async (id: string) => {
    try {
      const rec = await loadProjectRecord(id);
      if (!rec) return;
      openProject(deserializeProject(rec.data as ProjectFile));
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : '開けませんでした');
    }
  };

  const duplicate = async (id: string) => {
    const rec = await loadProjectRecord(id);
    if (!rec) return;
    const p = deserializeProject(rec.data as ProjectFile);
    const copy = { ...p, id: newId(), name: `${p.name} のコピー`, createdAt: Date.now(), updatedAt: Date.now() };
    await saveProjectRecord({ ...rec, id: copy.id, name: copy.name, createdAt: copy.createdAt, updatedAt: copy.updatedAt, data: serializeProject(copy) });
    showToast('コピーしました');
    reload();
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？元に戻せません。`)) return;
    await deleteProjectRecord(id);
    showToast('削除しました');
    reload();
  };

  return (
    <Modal title="マイ図案" onClose={onClose} wide>
      <div className="btn-row wrap">
        <button className="btn btn-primary" onClick={onNewImage}>
          <Icon name="camera" size={18} /> 画像から新しく作る
        </button>
        <button className="btn" onClick={onNewFree}>
          <Icon name="pencil" size={18} /> 白紙から作る
        </button>
      </div>
      {items === null ? (
        <p className="hint">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="empty-note">保存した図案はまだありません。図案は作るとこのブラウザに自動で保存されます。</p>
      ) : (
        <ul className="project-list">
          {items.map((it) => (
            <li key={it.id} className={it.id === current ? 'current' : ''}>
              <button className="project-open" onClick={() => open(it.id)}>
                {it.thumbnail ? <img src={it.thumbnail} alt="" /> : <span className="recent-blank" />}
                <span className="project-meta">
                  <strong>{it.name}</strong>
                  <small>{new Date(it.updatedAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                  {it.id === current ? <em>編集中</em> : null}
                </span>
              </button>
              <div className="project-actions">
                <button className="icon-btn" onClick={() => duplicate(it.id)} aria-label={`${it.name}をコピー`} title="コピー">
                  <Icon name="copy" size={18} />
                </button>
                <button className="icon-btn danger" onClick={() => remove(it.id, it.name)} aria-label={`${it.name}を削除`} title="削除">
                  <Icon name="trash" size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

const FREE_PRESETS = [
  { x: 1, y: 1, label: 'プレート1枚' },
  { x: 2, y: 1, label: 'よこ2枚' },
  { x: 1, y: 2, label: 'たて2枚' },
  { x: 2, y: 2, label: '4枚' },
];

/** フリーモード (白紙から) の大きさを選ぶ */
export function NewFreeDialog({ onClose }: { onClose: () => void }) {
  const newFreeProject = useStore((s) => s.newFreeProject);
  const [mode, setMode] = useState<'plates' | 'beads'>('plates');
  const [px, setPx] = useState(1);
  const [py, setPy] = useState(1);
  const [w, setW] = useState(28);
  const [h, setH] = useState(28);
  const width = mode === 'plates' ? px * PLATE_PEGS : w;
  const height = mode === 'plates' ? py * PLATE_PEGS : h;

  return (
    <Modal
      title="白紙から作る（フリーモード）"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              newFreeProject(width, height, mode);
              onClose();
            }}
          >
            <Icon name="pencil" size={18} /> この大きさではじめる
          </button>
        </>
      }
    >
      <p className="hint">ペンで1粒ずつビーズを置いて、自由に図案を作れます。あとから大きさを変えたり、下絵の画像を重ねたりもできます。</p>
      <Segmented
        label="大きさの決め方"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'plates', label: 'プレートの枚数' },
          { value: 'beads', label: 'ビーズの数' },
        ]}
      />
      {mode === 'plates' ? (
        <>
          <div className="preset-grid">
            {FREE_PRESETS.map((p) => (
              <button
                key={p.label}
                className={`preset ${px === p.x && py === p.y ? 'active' : ''}`}
                onClick={() => {
                  setPx(p.x);
                  setPy(p.y);
                }}
              >
                <span>{p.label}</span>
                <small>
                  {p.x * PLATE_PEGS}×{p.y * PLATE_PEGS}
                </small>
              </button>
            ))}
          </div>
          <div className="stepper-pair">
            <Stepper label="よこ" value={px} min={1} max={10} suffix="枚" onChange={setPx} />
            <Stepper label="たて" value={py} min={1} max={10} suffix="枚" onChange={setPy} />
          </div>
        </>
      ) : (
        <div className="stepper-pair">
          <Stepper label="よこ" value={w} min={MIN_SIZE} max={MAX_SIZE} suffix="個" onChange={setW} />
          <Stepper label="たて" value={h} min={MIN_SIZE} max={MAX_SIZE} suffix="個" onChange={setH} />
        </div>
      )}
      <p className="badge-line">
        よこ{width}×たて{height}ビーズ（約{((width * BEAD_PITCH_MM) / 10).toFixed(1)}×{((height * BEAD_PITCH_MM) / 10).toFixed(1)}cm）
      </p>
    </Modal>
  );
}

/** 使い方 */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="使い方" onClose={onClose} wide>
      <div className="help">
        <section>
          <h3>
            <Icon name="camera" size={18} /> 画像から作る
          </h3>
          <ol>
            <li>「画像から作る」で写真やイラストをえらびます（ドラッグ＆ドロップ、コピーした画像の貼り付けもOK）。</li>
            <li>
              <b>サイズ</b>：プレートの枚数かビーズの数で大きさを決めます。ナノビーズのプレートは1枚28×28ピン（約8cm角）です。
            </li>
            <li>
              <b>色</b>：使う色（全{PALETTE.length}色・12/24/48色セット・マイカラー）、色の数、明るさ、背景を消す、ふちどりなどを調整します。
            </li>
            <li>
              <b>画像</b>：「位置・大きさ」で画像の写す範囲を調整できます。イラストは「イラスト・ドット絵」にするとくっきりします。
            </li>
          </ol>
        </section>
        <section>
          <h3>
            <Icon name="pencil" size={18} /> 手でビーズを置く（編集）
          </h3>
          <ul>
            <li>「編集」タブでペン・消しゴム・塗りつぶし・スポイトが使えます。</li>
            <li>スマホ・iPad：2本指でつまんで拡大、2本指で動かして移動。パソコン：ホイールで拡大、右ドラッグで移動。</li>
            <li>元に戻す/やり直しは上のボタン（パソコンは Ctrl+Z / Ctrl+Y）。</li>
            <li>「白紙から作る（フリーモード）」では、何もないところから自由に描けます。下絵の画像をうすく重ねてなぞることもできます。</li>
          </ul>
        </section>
        <section>
          <h3>
            <Icon name="chart" size={18} /> カラーチャートと色の差し替え
          </h3>
          <ul>
            <li>「チャート」タブに、使う色・個数・必要な袋数（1袋1,000個）と金額の目安が出ます。</li>
            <li>色をタップすると、その色の場所だけを表示します。</li>
            <li>
              <Icon name="swap" size={14} /> ボタンで、その色をまとめて別の色に差し替えられます。「おまかせ」にすると、その色を使わずに作り直します。
            </li>
            <li>「持っているセット」を選ぶと、足りない分だけを計算します。</li>
          </ul>
        </section>
        <section>
          <h3>
            <Icon name="printer" size={18} /> 保存・印刷・つくる
          </h3>
          <ul>
            <li>「保存」タブで画像（PNG）や印刷用PDF（全体図＋プレートごとの拡大図）を保存できます。</li>
            <li>「つくるモード」では、プレートごとに色をえらぶとその色の場所が光ります。置いたところをタップしてチェックを付けながら進められます。</li>
            <li>図案はこのブラウザに自動保存されます（マイ図案）。別の端末へは「ファイルに書き出す」で移せます。</li>
          </ul>
        </section>
        <section>
          <h3>
            <Icon name="info" size={18} /> ナノビーズのメモ
          </h3>
          <ul>
            <li>ビーズの大きさは約2.6mm（パーラービーズの約1/4）。細かい図案が作れます。</li>
            <li>アイロンでくっつくのは上下左右のとなり同士です。斜めだけでつながる部分は外れやすいので「つながりチェック」で確認しましょう。</li>
            <li>アイロンのかけ方は、商品に付いている説明書にしたがってください。</li>
            <li>画面の色は目安です。実物と少しちがう場合があります。</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
