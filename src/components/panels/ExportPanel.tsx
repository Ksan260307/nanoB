import { useRef, useState } from 'react';
import { downloadBlob, exportPdf, exportPng, safeFileName, shareBlob, type ExportInput } from '../../lib/exporters';
import { newId, serializeProject } from '../../lib/project';
import type { ViewStyle } from '../../lib/render';
import { deleteProjects, importFile, importMessage } from '../../state/library';
import { useStore } from '../../state/store';
import { deleteConfirm, useConfirm } from '../confirm';
import { Icon } from '../Icon';
import { Section, Segmented, Tip } from '../ui';

export function ExportPanel({ onOpenProjects }: { onOpenProjects: () => void }) {
  const project = useStore((s) => s.project)!;
  const cells = useStore((s) => s.cells);
  const prefs = useStore((s) => s.prefs);
  const setName = useStore((s) => s.setName);
  const setUi = useStore((s) => s.setUi);
  const showToast = useStore((s) => s.showToast);
  const openProject = useStore((s) => s.openProject);
  const [pngStyle, setPngStyle] = useState<ViewStyle>('symbol');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ask, confirmUi] = useConfirm();
  const empty = !cells.some((c) => c >= 0);

  const input = (): ExportInput => ({
    name: project.name,
    cells: cells.slice(),
    width: project.width,
    height: project.height,
    guideEvery: prefs.guideEvery,
    credit: project.source?.credit,
  });
  const base = safeFileName(project.name);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      showToast('書き出しに失敗しました');
    } finally {
      setBusy(null);
    }
  };

  const savePng = (share: boolean) =>
    run('png', async () => {
      const blob = await exportPng(input(), pngStyle);
      const name = `${base}_nanobeads.png`;
      if (share && (await shareBlob(blob, name, project.name))) return;
      downloadBlob(blob, name);
      showToast('画像を保存しました');
    });

  const savePdf = () =>
    run('pdf', async () => {
      const blob = await exportPdf(input(), (d, t) => setBusy(`pdf:${d}/${t}`));
      downloadBlob(blob, `${base}_nanobeads.pdf`);
      showToast('PDFを保存しました。印刷して使えます');
    });

  const saveFile = () => {
    const data = JSON.stringify(serializeProject(project));
    downloadBlob(new Blob([data], { type: 'application/json' }), `${base}.nanobeads.json`);
    showToast('図案ファイルを書き出しました');
  };

  const loadFile = async (file: File) => {
    try {
      const r = await importFile(file);
      if (r.kind === 'project') {
        openProject({ ...r.project, id: newId() });
        showToast(`「${r.project.name}」を読み込みました`);
      } else {
        // バックアップ (いくつもの図案) はマイ図案に加える
        showToast(importMessage(r));
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : '読み込めませんでした');
    }
  };

  const remove = async () => {
    if (!(await ask(deleteConfirm([project.name], true)))) return;
    try {
      await deleteProjects([project.id]);
    } catch {
      showToast('削除できませんでした');
    }
  };

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <div className="panel-content">
      <Section title="つくる" icon="hammer">
        <button className="btn btn-primary btn-large" onClick={() => setUi({ buildMode: true })} disabled={empty}>
          <Icon name="hammer" /> つくるモードをはじめる
        </button>
        <p className="hint">プレートごとに、色をえらぶとその色の場所だけが光ります。置いたところにチェックを付けて進めましょう。</p>
      </Section>

      <Section title="画像で保存" icon="image">
        <Segmented
          small
          label="画像の見た目"
          value={pngStyle}
          onChange={setPngStyle}
          options={[
            { value: 'symbol', label: '記号つき' },
            { value: 'bead', label: 'ビーズ風' },
            { value: 'flat', label: 'ドット' },
          ]}
        />
        <div className="btn-row wrap">
          <button className="btn" onClick={() => savePng(false)} disabled={!!busy || empty}>
            <Icon name="download" size={18} /> {busy === 'png' ? '作成中…' : '画像（PNG）を保存'}
          </button>
          {canShare ? (
            <button className="btn" onClick={() => savePng(true)} disabled={!!busy || empty}>
              <Icon name="share" size={18} /> 共有
            </button>
          ) : null}
        </div>
      </Section>

      <Section title="印刷用PDF" icon="printer">
        <button className="btn" onClick={savePdf} disabled={!!busy || empty}>
          <Icon name="printer" size={18} /> {busy?.startsWith('pdf') ? `作成中… ${busy.slice(4)}` : 'PDFを保存'}
        </button>
        <p className="hint">1ページ目に全体図とカラーチャート、2ページ目からプレートごとの拡大図（記号・座標つき）が入ります。A4で印刷できます。</p>
      </Section>

      <Section title="図案データ" icon="folder">
        <div className="field">
          <label className="field-head" htmlFor="project-name">
            図案の名前
          </label>
          <input id="project-name" className="text-input" value={project.name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="btn-row wrap">
          <button className="btn btn-small" onClick={onOpenProjects}>
            <Icon name="folder" size={16} /> マイ図案を開く
          </button>
          <button className="btn btn-small" onClick={saveFile}>
            <Icon name="file" size={16} /> ファイルに書き出す
          </button>
          <button className="btn btn-small" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> ファイルから読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) loadFile(f);
            }}
          />
        </div>
        <Tip>
          図案はこのブラウザに自動で保存されます。別の端末に移すときは「ファイルに書き出す」を使ってください。すべての図案をまとめてバックアップするときは、「マイ図案」の「すべてファイルに書き出す」が便利です。
        </Tip>
        <div className="danger-zone">
          <button className="btn btn-small btn-danger" onClick={remove}>
            <Icon name="trash" size={16} /> この図案を削除
          </button>
        </div>
      </Section>
      {confirmUi}
    </div>
  );
}
