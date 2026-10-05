import { useState } from 'react';
import { fitCrop, importImage } from '../../lib/image';
import type { Project } from '../../lib/project';
import { useStore } from '../../state/store';
import { BackgroundDialog } from '../BackgroundDialog';
import { useConfirm } from '../confirm';
import { CropDialog } from '../CropDialog';
import { ImageSearchDialog } from '../ImageSearchDialog';
import { Icon } from '../Icon';
import { useImagePicker } from '../useImagePicker';
import { Section, Segmented, Slider, Tip, Toggle } from '../ui';

export function ImagePanel() {
  const project = useStore((s) => s.project)!;
  const setSource = useStore((s) => s.setSource);
  const updateSettings = useStore((s) => s.updateSettings);
  const setMode = useStore((s) => s.setMode);
  const showToast = useStore((s) => s.showToast);
  const showUnderlay = useStore((s) => s.showUnderlay);
  const underlayOpacity = useStore((s) => s.underlayOpacity);
  const setUi = useStore((s) => s.setUi);
  const cells = useStore((s) => s.cells);
  const [cropOpen, setCropOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ask, confirmUi] = useConfirm();
  const { settings, source, mode } = project;

  const picker = useImagePicker(async (file) => {
    setLoading(true);
    try {
      const src = await importImage(file);
      setSource(src);
      showToast(mode === 'free' ? '下絵を読み込みました' : '画像を読み込みました');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '画像を読み込めませんでした');
    } finally {
      setLoading(false);
    }
  });

  const hasDrawing = cells.some((c) => c >= 0);

  return (
    <div className="panel-content">
      {picker.input}
      {mode === 'free' ? (
        <Tip>
          フリーモードでは、画像を<strong>下絵</strong>として図案の下にうすく表示できます。なぞってビーズを置いていきましょう。
        </Tip>
      ) : null}
      <Section title={mode === 'free' ? '下絵の画像' : 'もとの画像'} icon="image">
        {source ? (
          <div className="source-card">
            <img src={source.dataUrl} alt="" />
            <div className="source-meta">
              <strong>{source.name || '画像'}</strong>
              <span>
                {source.width}×{source.height}px
              </span>
              {source.credit ? (
                <span className="credit">
                  {source.credit}
                  {source.link ? (
                    <>
                      {' '}
                      <a href={source.link} target="_blank" rel="noopener noreferrer">
                        出典
                      </a>
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="hint">画像が選ばれていません。</p>
        )}
        <div className="btn-row wrap">
          <button className="btn" onClick={picker.open} disabled={loading}>
            <Icon name={loading ? 'sparkles' : 'upload'} size={18} /> {source ? '画像を変える' : '画像をえらぶ'}
          </button>
          <button className="btn" onClick={() => setSearchOpen(true)}>
            <Icon name="zoomIn" size={18} /> ネットでさがす
          </button>
          {source ? (
            <button className="btn" onClick={() => setCropOpen(true)}>
              <Icon name="crop" size={18} /> 位置・大きさ
            </button>
          ) : null}
        </div>
      </Section>

      {source && mode === 'image' ? (
        <>
          <Section title="画像のおさめ方" icon="fit">
            <Segmented
              label="画像のおさめ方"
              value={settings.fit}
              onChange={(fit) => {
                if (fit === 'custom') {
                  setCropOpen(true);
                  return;
                }
                updateSettings({ fit, crop: fitCropFor(project, fit) });
              }}
              options={[
                { value: 'contain', label: '全体を入れる' },
                { value: 'cover', label: '枠いっぱい' },
                { value: 'custom', label: '手動で調整' },
              ]}
            />
            <Toggle label="左右反転する" checked={settings.mirror} onChange={(mirror) => updateSettings({ mirror })} />
          </Section>
          <Section title="背景を透明にする" icon="layers">
            <Segmented
              label="背景を透明にする"
              value={settings.bgMode}
              onChange={(bgMode) => {
                updateSettings({ bgMode });
                if (bgMode === 'manual' && settings.bgPoints.length === 0) setBgOpen(true);
              }}
              options={[
                { value: 'off', label: 'しない' },
                { value: 'auto', label: '自動' },
                { value: 'manual', label: '手動で指定' },
              ]}
            />
            {settings.bgMode !== 'off' ? (
              <>
                <Slider
                  label="似た色とみなす範囲"
                  value={settings.bgTolerance}
                  min={2}
                  max={60}
                  onChange={(bgTolerance) => updateSettings({ bgTolerance })}
                  leftLabel="せまい"
                  rightLabel="ひろい"
                />
                <Toggle label="離れた所の同じ色も消す" checked={settings.bgGlobal} onChange={(bgGlobal) => updateSettings({ bgGlobal })} />
              </>
            ) : null}
            <button className="btn" onClick={() => setBgOpen(true)}>
              <Icon name="eraser" size={18} /> 画像をタップして指定（消す・残す）
              {settings.bgPoints.length ? <span className="badge">{settings.bgPoints.length}か所</span> : null}
            </button>
            <p className="hint">
              {settings.bgMode === 'auto'
                ? '画像のふちの色を背景とみなして透明にします。透明な部分はビーズを置きません。'
                : settings.bgMode === 'manual'
                  ? 'タップした所と似た色でつながっている部分を透明にします。'
                  : '写真やイラストの背景を消して、モチーフだけを図案にできます（透過PNGはそのまま透明になります）。'}
            </p>
          </Section>
          <Section title="画像の種類" icon="sparkles">
            <Segmented
              label="変換のしかた"
              value={settings.resample}
              onChange={(resample) => updateSettings({ resample })}
              options={[
                { value: 'average', label: '写真・絵画' },
                { value: 'sharp', label: 'イラスト・ドット絵' },
              ]}
            />
            <p className="hint">
              {settings.resample === 'average'
                ? '色をなめらかに平均します。写真や色数の多い絵に向いています。'
                : 'ふちや線をくっきり残します。アイコン・キャラクター・ドット絵に向いています。'}
            </p>
          </Section>
        </>
      ) : null}

      {source && mode === 'free' ? (
        <Section title="下絵の表示" icon="layers">
          <Toggle label="下絵を表示する" checked={showUnderlay} onChange={(v) => setUi({ showUnderlay: v })} />
          <Slider
            label="下絵の濃さ"
            value={Math.round(underlayOpacity * 100)}
            min={10}
            max={100}
            onChange={(v) => setUi({ underlayOpacity: v / 100 })}
            format={(v) => `${v}%`}
          />
          <div className="btn-row">
            <button
              className="btn"
              onClick={async () => {
                const ok =
                  !hasDrawing ||
                  (await ask({
                    title: 'この画像から自動で作る',
                    message: '今の図案に、画像から自動で作った図案を重ねます。手で置いたビーズはそのまま残ります。',
                    ok: '自動で作る',
                  }));
                if (!ok) return;
                setMode('image');
                setUi({ showUnderlay: false });
              }}
            >
              <Icon name="sparkles" size={18} /> この画像から自動で作る
            </button>
            <button className="btn btn-ghost" onClick={() => setSource(null)}>
              <Icon name="trash" size={18} /> 下絵を外す
            </button>
          </div>
        </Section>
      ) : null}
      {cropOpen && source ? <CropDialog onClose={() => setCropOpen(false)} /> : null}
      {bgOpen && source ? <BackgroundDialog onClose={() => setBgOpen(false)} /> : null}
      {searchOpen ? (
        <ImageSearchDialog
          onClose={() => setSearchOpen(false)}
          onPicked={(src) => {
            setSearchOpen(false);
            setSource(src);
            showToast(mode === 'free' ? '下絵を読み込みました' : '画像を読み込みました');
          }}
        />
      ) : null}
      {confirmUi}
    </div>
  );
}

function fitCropFor(p: Project, fit: 'contain' | 'cover') {
  return fitCrop(p.source!.width, p.source!.height, p.width, p.height, fit);
}
