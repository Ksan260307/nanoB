import { useEffect, useMemo, useRef, useState } from 'react';
import { BEAD_PITCH_MM, PALETTE, PLATE_PEGS } from '../data/palette';
import { deserializeProject, MAX_SIZE, MIN_SIZE, type ProjectFile } from '../lib/project';
import { metaText, progressOf, searchKey } from '../lib/libraryText';
import { listProjectRecords, loadPref, loadProjectRecord, savePref, type ProjectSummary } from '../lib/storage';
import { addProject, deleteProjects, duplicateProject, exportBackup, importFile, importMessage, renameProject } from '../state/library';
import { useStore } from '../state/store';
import { deleteConfirm, useConfirm } from './confirm';
import { Icon } from './Icon';
import { Modal, Segmented, Stepper } from './ui';

type LibrarySort = 'updated' | 'created' | 'name';

/** 一覧の中で名前を変える入力欄 (Enter・ほかの所をタップで決定、Esc でやめる) */
function RenameField({ name, onDone }: { name: string; onDone: (name: string | null) => void }) {
  const [text, setText] = useState(name);
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      className="text-input rename-input"
      value={text}
      maxLength={40}
      autoFocus
      aria-label="新しい名前"
      enterKeyHint="done"
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(text);
        else if (e.key === 'Escape') {
          // マイ図案の画面ごと閉じないように
          e.stopPropagation();
          finish(null);
        }
      }}
    />
  );
}

/** マイ図案 (このブラウザに保存した図案) */
export function ProjectsDialog({ onClose, onNewImage, onNewFree }: { onClose: () => void; onNewImage: () => void; onNewFree: () => void }) {
  const openProject = useStore((s) => s.openProject);
  const current = useStore((s) => s.project?.id);
  const showToast = useStore((s) => s.showToast);
  const libraryRev = useStore((s) => s.libraryRev);
  const [items, setItems] = useState<ProjectSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<LibrarySort>(() => loadPref<LibrarySort>('librarySort', 'updated'));
  /** えらんでいる図案 (null = えらぶモードではない) */
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ask, confirmUi] = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listProjectRecords().then(setItems, () => setItems([]));
  }, [libraryRev]);

  const shown = useMemo(() => {
    const q = searchKey(query.trim());
    const list = (items ?? []).filter((it) => searchKey(it.name).includes(q));
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    else if (sort === 'created') list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }, [items, query, sort]);

  const open = async (id: string) => {
    // 開いている図案はそのまま (保存を待っている変更があるので読み込み直さない)
    if (id === current) {
      onClose();
      return;
    }
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
    try {
      if (await duplicateProject(id)) showToast('コピーしました');
    } catch {
      showToast('コピーできませんでした');
    }
  };

  const rename = async (it: ProjectSummary, name: string | null) => {
    setRenaming(null);
    const v = name?.trim();
    if (!v || v === it.name) return;
    try {
      await renameProject(it.id, v);
      showToast('名前を変えました');
    } catch {
      showToast('名前を変えられませんでした');
    }
  };

  const remove = async (ids: string[]) => {
    const names = ids.map((id) => items!.find((it) => it.id === id)!.name);
    if (!(await ask(deleteConfirm(names, !!current && ids.includes(current))))) return;
    try {
      await deleteProjects(ids);
      setSelected(null);
    } catch {
      showToast('削除できませんでした');
    }
  };

  const backup = async (ids?: string[]) => {
    setBusy(true);
    try {
      const n = await exportBackup(ids);
      showToast(`${n}件の図案をファイルに書き出しました`);
      setSelected(null);
    } catch {
      showToast('書き出しに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File) => {
    setBusy(true);
    try {
      const r = await importFile(file);
      if (r.kind === 'project') {
        const p = await addProject(r.project);
        showToast(`「${p.name}」を読み込みました`);
      } else {
        showToast(importMessage(r));
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '読み込めませんでした');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const count = selected?.size ?? 0;
  const allSelected = !!selected && shown.length > 0 && shown.every((it) => selected.has(it.id));

  return (
    <Modal
      title="マイ図案"
      onClose={onClose}
      wide
      footer={
        selected ? (
          <>
            <button className="btn btn-small btn-ghost" onClick={() => setSelected(null)}>
              やめる
            </button>
            <span className="foot-note">{count}件えらんでいます</span>
            <button className="btn btn-small" onClick={() => setSelected(allSelected ? new Set() : new Set(shown.map((it) => it.id)))}>
              {allSelected ? 'えらぶのを解除' : 'すべてえらぶ'}
            </button>
            <button className="btn btn-small" disabled={!count || busy} onClick={() => backup([...selected])}>
              <Icon name="download" size={16} /> 書き出す
            </button>
            <button className="btn btn-small btn-danger-fill" disabled={!count} onClick={() => remove([...selected])}>
              <Icon name="trash" size={16} /> 削除
            </button>
          </>
        ) : undefined
      }
    >
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
        <>
          <div className="library-tools">
            <input
              type="search"
              className="text-input library-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前でさがす"
              aria-label="図案を名前でさがす"
              enterKeyHint="search"
            />
            <Segmented
              small
              label="並び順"
              value={sort}
              onChange={(v) => {
                setSort(v);
                savePref('librarySort', v);
              }}
              options={[
                { value: 'updated', label: '新しい順' },
                { value: 'created', label: '作った順' },
                { value: 'name', label: '名前順' },
              ]}
            />
            {selected ? null : (
              <button className="btn btn-small" onClick={() => setSelected(new Set())}>
                <Icon name="check" size={16} /> えらんで削除・書き出し
              </button>
            )}
          </div>
          <p className="hint">{query.trim() ? `${shown.length}件見つかりました（全${items.length}件）` : `${items.length}件の図案を保存しています`}</p>
          {shown.length === 0 ? (
            <p className="empty-note">「{query.trim()}」に合う図案はありません。</p>
          ) : (
            <ul className="project-list">
              {shown.map((it) => {
                const checked = !!selected?.has(it.id);
                const progress = progressOf(it.meta);
                const thumb = it.thumbnail ? <img src={it.thumbnail} alt="" /> : <span className="recent-blank" />;
                const date = new Date(sort === 'created' ? it.createdAt : it.updatedAt).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });
                return (
                  <li key={it.id} className={`${it.id === current ? 'current' : ''} ${checked ? 'checked' : ''}`}>
                    {renaming === it.id ? (
                      <div className="project-open">
                        {thumb}
                        <span className="project-meta">
                          <RenameField name={it.name} onDone={(name) => rename(it, name)} />
                        </span>
                      </div>
                    ) : (
                      <button className="project-open" onClick={() => (selected ? toggle(it.id) : open(it.id))} aria-pressed={selected ? checked : undefined}>
                        {selected ? (
                          <span className={`check-box ${checked ? 'on' : ''}`} aria-hidden="true">
                            <Icon name="check" size={16} />
                          </span>
                        ) : null}
                        {thumb}
                        <span className="project-meta">
                          <strong>{it.name}</strong>
                          <small>
                            {sort === 'created' ? '作成' : '更新'} {date}
                          </small>
                          {it.meta ? <small>{metaText(it.meta)}</small> : null}
                          {it.id === current || progress ? (
                            <span className="project-badges">
                              {it.id === current ? <em>編集中</em> : null}
                              {progress ? <em className="badge-progress">{progress}% 完成</em> : null}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    )}
                    {selected ? null : (
                      <div className="project-actions">
                        <button className="icon-btn" onClick={() => setRenaming(it.id)} aria-label={`${it.name}の名前を変える`} title="名前を変える">
                          <Icon name="edit" size={18} />
                        </button>
                        <button className="icon-btn" onClick={() => duplicate(it.id)} aria-label={`${it.name}をコピー`} title="コピー">
                          <Icon name="copy" size={18} />
                        </button>
                        <button className="icon-btn danger" onClick={() => remove([it.id])} aria-label={`${it.name}を削除`} title="削除">
                          <Icon name="trash" size={18} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <section className="library-backup">
        <h3>
          <Icon name="folder" size={18} /> バックアップ・別の端末へ移す
        </h3>
        <p className="hint">
          図案はこのブラウザの中だけに保存されています。ブラウザのデータを消すと図案も消えてしまうので、大切な図案はファイルに書き出しておきましょう。書き出したファイルは、別の端末の「ファイルから読み込む」で読み込めます。
        </p>
        <div className="btn-row wrap">
          <button className="btn btn-small" disabled={!items?.length || busy} onClick={() => backup()}>
            <Icon name="download" size={16} /> すべてファイルに書き出す
          </button>
          <button className="btn btn-small" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> ファイルから読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="library-import"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void restore(f);
            }}
          />
        </div>
      </section>
      {confirmUi}
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
            <li>「対称に描く」をオンにすると、まん中の線をはさんで左右（上下）にも同時に描けます。ハートや顔など、左右対称の図案に便利です。</li>
            <li>「白紙から作る（フリーモード）」では、何もないところから自由に描けます。下絵の画像をうすく重ねてなぞることもできます。</li>
            <li>フリーモードでは、図案全体の左右反転・上下反転、1つずつずらす、まん中に寄せる、もできます。</li>
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
            <Icon name="folder" size={18} /> マイ図案（保存した図案）
          </h3>
          <ul>
            <li>名前でさがす・並べかえ・名前の変更・コピー・削除ができます。トップ画面の「つづきから」や、「保存」タブからも削除できます。</li>
            <li>「えらんで削除・書き出し」で、いくつかの図案をまとめて削除したり、1つのファイルに書き出したりできます。</li>
            <li>削除したあとすぐなら、画面下に出る「元に戻す」で戻せます。</li>
            <li>「すべてファイルに書き出す」でバックアップを作れます。機種変更のときは、新しい端末の「ファイルから読み込む」で戻せます。</li>
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
