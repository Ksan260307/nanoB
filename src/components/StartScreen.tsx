import { useEffect, useState } from 'react';
import { PALETTE } from '../data/palette';
import { SAMPLES, sampleUrl } from '../data/samples';
import { importImage } from '../lib/image';
import { deserializeProject, type ProjectFile } from '../lib/project';
import { listProjectRecords, loadProjectRecord, type ProjectSummary } from '../lib/storage';
import { deleteProjects } from '../state/library';
import { useStore } from '../state/store';
import { deleteConfirm, useConfirm } from './confirm';
import { Icon } from './Icon';
import { ImageSearchDialog } from './ImageSearchDialog';
import { useImagePicker } from './useImagePicker';

export function BrandMark({ size = 40 }: { size?: number }) {
  // ビーズで描いたハート
  const rows = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  const colors = ['#ff6f9c', '#ff8fb3', '#ffb3cc'];
  return (
    <svg width={size} height={size} viewBox="0 0 70 70" aria-hidden="true" className="brand-mark">
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) =>
          ch === 'X' ? (
            <g key={`${x}-${y}`}>
              <circle cx={5 + x * 10} cy={12 + y * 10} r={4.6} fill={colors[(x + y) % 3]} />
              <circle cx={5 + x * 10} cy={12 + y * 10} r={1.6} fill="#fff" opacity={0.85} />
            </g>
          ) : null,
        ),
      )}
    </svg>
  );
}

export function StartScreen({ onOpenProjects, onNewFree, onHelp }: { onOpenProjects: () => void; onNewFree: () => void; onHelp: () => void }) {
  const newImageProject = useStore((s) => s.newImageProject);
  const openProject = useStore((s) => s.openProject);
  const updateSettings = useStore((s) => s.updateSettings);
  const showToast = useStore((s) => s.showToast);
  const libraryRev = useStore((s) => s.libraryRev);
  const [saved, setSaved] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [ask, confirmUi] = useConfirm();
  const recent = saved.slice(0, 4);

  useEffect(() => {
    listProjectRecords().then(setSaved, () => setSaved([]));
  }, [libraryRev]);

  const startFromFile = async (file: File) => {
    setLoading(true);
    try {
      newImageProject(await importImage(file));
    } catch (e) {
      showToast(e instanceof Error ? e.message : '画像を読み込めませんでした');
    } finally {
      setLoading(false);
    }
  };
  const picker = useImagePicker(startFromFile);

  const startSample = async (s: (typeof SAMPLES)[number]) => {
    setLoading(true);
    try {
      newImageProject(await importImage(sampleUrl(s.file), s.name));
      updateSettings({ resample: s.resample, bgMode: s.resample === 'sharp' ? 'auto' : 'off' });
    } catch {
      showToast('サンプルを読み込めませんでした');
    } finally {
      setLoading(false);
    }
  };

  const openRecent = async (id: string) => {
    try {
      const rec = await loadProjectRecord(id);
      if (rec) openProject(deserializeProject(rec.data as ProjectFile));
    } catch (e) {
      showToast(e instanceof Error ? e.message : '開けませんでした');
    }
  };

  const removeRecent = async (r: ProjectSummary) => {
    if (!(await ask(deleteConfirm([r.name], false)))) return;
    try {
      await deleteProjects([r.id]);
    } catch {
      showToast('削除できませんでした');
    }
  };

  return (
    <div className="start">
      {picker.input}
      <section className="hero">
        <BrandMark size={64} />
        <h1>ナノビーズ図案メーカー</h1>
        <p>
          カワダ「ナノビーズ」<strong>全{PALETTE.length}色</strong>に対応。写真やイラストをえらぶだけで、作れる図案とカラーチャートができあがります。
        </p>
      </section>

      <div className="start-cards">
        <button className="start-card start-card-primary" onClick={picker.open} disabled={loading}>
          <span className="start-icon">
            <Icon name="camera" size={30} />
          </span>
          <span className="start-text">
            <strong>{loading ? '読み込み中…' : '画像から作る'}</strong>
            <small>写真・イラストをえらぶと自動で図案に</small>
          </span>
          <Icon name="chevronRight" />
        </button>
        <button className="start-card" onClick={onNewFree}>
          <span className="start-icon">
            <Icon name="pencil" size={30} />
          </span>
          <span className="start-text">
            <strong>白紙から作る（フリーモード）</strong>
            <small>1粒ずつ自由にビーズを置いて描く</small>
          </span>
          <Icon name="chevronRight" />
        </button>
        <button className="start-card" onClick={onOpenProjects}>
          <span className="start-icon">
            <Icon name="folder" size={30} />
          </span>
          <span className="start-text">
            <strong>保存した図案を開く</strong>
            <small>このブラウザに自動保存されています</small>
          </span>
          <Icon name="chevronRight" />
        </button>
      </div>

      <form
        className="start-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearchOpen(true);
        }}
      >
        <label htmlFor="start-search-input">
          <Icon name="zoomIn" size={20} /> ネットで画像をさがして作る
        </label>
        <div className="start-search-row">
          <input
            id="start-search-input"
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="例: ねこ、さくら、ケーキ"
            enterKeyHint="search"
          />
          <button className="btn btn-primary" type="submit">
            さがす
          </button>
        </div>
        <small>自由に使えるライセンスの画像から、候補を約100件表示します。</small>
      </form>

      {recent.length ? (
        <section className="start-section">
          <div className="start-section-head">
            <h2>つづきから</h2>
            <button className="link-btn" onClick={onOpenProjects}>
              {saved.length > recent.length ? `すべて見る（${saved.length}件）` : 'マイ図案で管理'}
            </button>
          </div>
          <div className="recent-list">
            {recent.map((r) => (
              <div key={r.id} className="recent-card">
                <button className="recent-item" onClick={() => openRecent(r.id)}>
                  {r.thumbnail ? <img src={r.thumbnail} alt="" /> : <span className="recent-blank" />}
                  <span>{r.name}</span>
                </button>
                <button className="recent-delete" onClick={() => removeRecent(r)} aria-label={`${r.name}を削除`} title="削除">
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="start-section">
        <h2>サンプルで試す</h2>
        <div className="sample-list">
          {SAMPLES.map((s) => (
            <button key={s.file} className="sample-item" onClick={() => startSample(s)} disabled={loading}>
              <img src={sampleUrl(s.file)} alt="" />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="start-section howto">
        <h2>かんたん3ステップ</h2>
        <ol className="steps">
          <li>
            <b>1</b>
            <div>
              <strong>画像をえらぶ</strong>
              <span>スマホの写真やイラストでOK。画面にドラッグ＆ドロップや貼り付けでも読み込めます。</span>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>大きさと色を決める</strong>
              <span>プレートの枚数、使う色（持っているセットだけ等）、色の数を調整。手でビーズを置き直すこともできます。</span>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>印刷して作る</strong>
              <span>必要なビーズの数と袋数がわかるカラーチャート付き。PDFで印刷、または「つくるモード」でスマホを見ながら作れます。</span>
            </div>
          </li>
        </ol>
        <button className="btn btn-ghost" onClick={onHelp}>
          <Icon name="help" size={18} /> くわしい使い方
        </button>
      </section>

      <footer className="start-foot">
        <p>
          このアプリは非公式のファンメイドツールです。「ナノビーズ」「nanobeads」は株式会社カワダの商標です。画面の色は写真から作った目安で、実物とは異なる場合があります。
        </p>
        <p>画像や図案はお使いの端末の中だけで処理・保存され、外部には送信されません（画像検索を使ったときは、検索ワードが Openverse に送信されます）。</p>
      </footer>
      {searchOpen ? (
        <ImageSearchDialog
          initialQuery={searchText}
          onClose={() => setSearchOpen(false)}
          onPicked={(src) => {
            setSearchOpen(false);
            newImageProject(src);
          }}
        />
      ) : null}
      {confirmUi}
    </div>
  );
}
