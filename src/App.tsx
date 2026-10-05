import { useCallback, useEffect, useState } from 'react';
import { BuildMode } from './components/BuildMode';
import { HelpDialog, NewFreeDialog, ProjectsDialog } from './components/dialogs';
import { Icon, type IconName } from './components/Icon';
import { ChartPanel } from './components/panels/ChartPanel';
import { ColorPanel } from './components/panels/ColorPanel';
import { EditPanel } from './components/panels/EditPanel';
import { ExportPanel } from './components/panels/ExportPanel';
import { ImagePanel } from './components/panels/ImagePanel';
import { SizePanel } from './components/panels/SizePanel';
import { Stage } from './components/Stage';
import { BrandMark, StartScreen } from './components/StartScreen';
import { useImagePicker } from './components/useImagePicker';
import { importImage } from './lib/image';
import { useAutoConvert, useAutoSave } from './state/hooks';
import { useStore, type Tab, type Tool } from './state/store';

type DialogName = 'projects' | 'help' | 'free' | null;

const TAB_DEFS: { id: Tab; label: string; freeLabel?: string; icon: IconName }[] = [
  { id: 'image', label: '画像', freeLabel: '下絵', icon: 'image' },
  { id: 'size', label: 'サイズ', icon: 'size' },
  { id: 'color', label: '色', icon: 'palette' },
  { id: 'edit', label: '編集', icon: 'pencil' },
  { id: 'chart', label: 'チャート', icon: 'chart' },
  { id: 'save', label: '保存', icon: 'download' },
];

const TOOL_KEYS: Record<string, Tool> = { h: 'move', b: 'pen', p: 'pen', e: 'eraser', g: 'fill', i: 'picker' };

function Toasts() {
  const toast = useStore((s) => s.toast);
  const hideToast = useStore((s) => s.hideToast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hideToast, toast.action ? 6000 : 3200);
    return () => clearTimeout(t);
  }, [toast, hideToast]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.text}</span>
      {toast.action ? (
        <button
          className="link-btn"
          onClick={() => {
            toast.action!.run();
            hideToast();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}

function Header({ onProjects, onHelp }: { onProjects: () => void; onHelp: () => void }) {
  const project = useStore((s) => s.project);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const closeProject = useStore((s) => s.closeProject);
  const setName = useStore((s) => s.setName);
  return (
    <header className="topbar">
      <button className="brand" onClick={closeProject} title="トップへ">
        <BrandMark size={30} />
        <span className="brand-name">
          ナノビーズ<span className="brand-sub">図案メーカー</span>
        </span>
      </button>
      {project ? (
        <input className="title-input" aria-label="図案の名前" value={project.name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      ) : (
        <span className="topbar-spacer" />
      )}
      <div className="topbar-actions">
        {project ? (
          <>
            <button className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="元に戻す" title="元に戻す (Ctrl+Z)">
              <Icon name="undo" />
            </button>
            <button className="icon-btn" onClick={redo} disabled={!canRedo} aria-label="やり直し" title="やり直し (Ctrl+Y)">
              <Icon name="redo" />
            </button>
          </>
        ) : null}
        <button className="icon-btn" onClick={onProjects} aria-label="マイ図案" title="マイ図案">
          <Icon name="folder" />
        </button>
        <button className="icon-btn" onClick={onHelp} aria-label="使い方" title="使い方">
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
}

function Workspace({ onProjects }: { onProjects: () => void }) {
  const project = useStore((s) => s.project)!;
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const sheetOpen = useStore((s) => s.sheetOpen);
  const setUi = useStore((s) => s.setUi);
  const free = project.mode === 'free';
  const tabs = TAB_DEFS.filter((t) => !(free && t.id === 'color'));
  const activeTab = free && tab === 'color' ? 'edit' : tab;

  return (
    <main className={`workspace tab-${activeTab} ${sheetOpen ? 'sheet-open' : 'sheet-closed'}`}>
      <Stage />
      <aside className="panel" aria-label="設定">
        <nav className="tabs" role="tablist" aria-label="ステップ">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => {
                if (activeTab === t.id) setUi({ sheetOpen: !sheetOpen });
                else setTab(t.id);
              }}
            >
              <span className="tab-icon">
                <Icon name={t.icon} size={20} />
                <i className="tab-step">{i + 1}</i>
              </span>
              <span className="tab-label">{free && t.freeLabel ? t.freeLabel : t.label}</span>
            </button>
          ))}
        </nav>
        <button
          className="sheet-handle"
          onClick={() => setUi({ sheetOpen: !sheetOpen })}
          aria-expanded={sheetOpen}
          aria-label={sheetOpen ? '設定をたたむ' : '設定をひらく'}
        >
          <span />
        </button>
        <div className="panel-scroll" role="tabpanel">
          {activeTab === 'image' ? <ImagePanel /> : null}
          {activeTab === 'size' ? <SizePanel /> : null}
          {activeTab === 'color' ? <ColorPanel /> : null}
          {activeTab === 'edit' ? <EditPanel /> : null}
          {activeTab === 'chart' ? <ChartPanel /> : null}
          {activeTab === 'save' ? <ExportPanel onOpenProjects={onProjects} /> : null}
        </div>
      </aside>
    </main>
  );
}

export default function App() {
  const project = useStore((s) => s.project);
  const buildMode = useStore((s) => s.buildMode);
  const newImageProject = useStore((s) => s.newImageProject);
  const showToast = useStore((s) => s.showToast);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [dragging, setDragging] = useState(false);
  useAutoConvert();
  useAutoSave();

  const openImageFile = useCallback(
    async (file: File) => {
      try {
        newImageProject(await importImage(file));
        setDialog(null);
      } catch (e) {
        showToast(e instanceof Error ? e.message : '画像を読み込めませんでした');
      }
    },
    [newImageProject, showToast],
  );
  const picker = useImagePicker(openImageFile);

  // キーボード操作 (パソコン)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const st = useStore.getState();
      if (!st.project || document.querySelector('.modal')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (!mod && !e.altKey && st.tab === 'edit' && TOOL_KEYS[e.key.toLowerCase()]) {
        st.setTool(TOOL_KEYS[e.key.toLowerCase()]);
      } else if (e.key === 'Escape' && st.focus !== null) {
        st.setFocus(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 画像のドラッグ&ドロップ・貼り付け
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const onOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      // ウィンドウの外に出たとき (relatedTarget が無い)
      if (!e.relatedTarget) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDragging(false);
      const file = [...e.dataTransfer!.files].find((f) => f.type.startsWith('image/'));
      if (file) openImageFile(file);
    };
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        openImageFile(file);
      }
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, [openImageFile]);

  return (
    <div className={`app ${project ? 'has-project' : 'no-project'}`}>
      {picker.input}
      <Header onProjects={() => setDialog('projects')} onHelp={() => setDialog('help')} />
      {project ? (
        <Workspace onProjects={() => setDialog('projects')} />
      ) : (
        <StartScreen onOpenProjects={() => setDialog('projects')} onNewFree={() => setDialog('free')} onHelp={() => setDialog('help')} />
      )}
      {buildMode && project ? <BuildMode /> : null}
      {dialog === 'projects' ? <ProjectsDialog onClose={() => setDialog(null)} onNewImage={picker.open} onNewFree={() => setDialog('free')} /> : null}
      {dialog === 'free' ? <NewFreeDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'help' ? <HelpDialog onClose={() => setDialog(null)} /> : null}
      {dragging ? (
        <div className="drop-overlay">
          <Icon name="image" size={48} />
          <p>ここに画像をドロップ</p>
        </div>
      ) : null}
      <Toasts />
    </div>
  );
}
