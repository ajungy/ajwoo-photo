import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCEPT } from './engine/image';
import { canRedo, canUndo, closePhoto, getState, openFile, redo, restoreLastProject, setState, undo, useStore, type Mode, type Section } from './store';
import { CanvasView } from './ui/CanvasView';
import { HistogramView } from './ui/Histogram';
import { CropPanel, MaskPanel, SECTIONS, SectionBody, sectionChanged } from './ui/Inspector';
import { ExportDialog } from './ui/ExportDialog';
import type { Stats } from './output';

const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'edit', label: 'Edit', icon: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6' },
  { id: 'mask', label: 'Mask', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 3v18' },
  { id: 'crop', label: 'Crop', icon: 'M6 2v16h16M2 6h16v16' },
];

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const UNDO = 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3';
const REDO = 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3';

function SaveStatus() {
  const save = useStore(s => s.save);
  const text = { idle: '', saving: 'Saving…', saved: 'Saved in this browser', memory: 'Not saved: browser storage is unavailable. Export to keep your edit.', error: 'Could not save. Export to keep your edit.' }[save];
  return <span className={'save-status' + (save === 'memory' || save === 'error' ? ' status-warning' : '')} aria-live="polite">{text}</span>;
}

function StartScreen({ onPick }: { onPick: () => void }) {
  const error = useStore(s => s.error);
  const loading = useStore(s => s.loading);
  return (
    <main className="start">
      <div className="start-inner">
        <h1 className="display">ajwoo photo</h1>
        <p className="body-lg muted">Edit one photo at a time. Your original is never changed.</p>
        <button className="btn-primary lg" onClick={onPick} disabled={!!loading}>
          {loading ?? 'Open photo'}
        </button>
        <p className="caption muted">Or drop a photo anywhere, or paste one.</p>
        {error && <p className="status-danger" role="alert">{error}</p>}
        <dl className="start-facts caption">
          <dt>Opens</dt><dd>JPEG, PNG, WebP, AVIF, GIF (first frame), BMP. HEIC and TIFF in Safari.</dd>
          <dt>Not yet</dt><dd>Camera RAW and PDF.</dd>
          <dt>Privacy</dt><dd>Photos stay on this device. Nothing is uploaded.</dd>
          <dt>For agents</dt><dd>Use <code>window.ajwooPhoto</code> in this page. See <a href="./llms.txt">llms.txt</a>.</dd>
        </dl>
      </div>
    </main>
  );
}

function ConfirmReplace({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="replace-title">
      <h2 id="replace-title" className="title">Open a different photo?</h2>
      <p className="body muted">This browser keeps one photo at a time. Your current edit will be removed. Export it first if you want to keep it.</p>
      <div className="dialog-actions">
        <button className="btn-secondary" autoFocus onClick={() => ref.current?.close()}>Keep editing</button>
        <button className="btn-danger" onClick={() => { onConfirm(); ref.current?.close(); }}>Remove and open</button>
      </div>
    </dialog>
  );
}

function Toast() {
  const entry = useStore(s => s.entries[s.index]);
  const index = useStore(s => s.index);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (entry?.author !== 'Agent') return;
    setShown(index);
    const t = setTimeout(() => setShown(null), 6000);
    return () => clearTimeout(t);
  }, [entry, index]);
  if (shown === null || !entry || shown !== index) return null;
  return (
    <div className="toast" role="status">
      <span><strong>Agent</strong> · {entry.label}</span>
      <button className="btn-tertiary sm inverse" onClick={() => { undo(); setShown(null); }}>Undo</button>
    </div>
  );
}

function ScopeLabel() {
  const mask = useStore(s => s.recipe.masks.find(m => m.id === s.selectedMask));
  const mode = useStore(s => s.mode);
  if (mode !== 'mask') return null;
  return (
    <div className="scope">
      <span className="label">Editing: {mask ? mask.name : 'Choose or add a mask'}</span>
      {mask && <button className="btn-tertiary sm" onClick={() => setState({ selectedMask: null })}>Done</button>}
    </div>
  );
}

function DesktopEdit({ stats }: { stats: Stats | null }) {
  const [open, setOpen] = useState<Set<Section>>(() => new Set(['Light', 'Color']));
  return (
    <>
      {SECTIONS.map(sec => <Accordion key={sec} section={sec} open={open.has(sec)} stats={stats}
        toggle={() => setOpen(o => { const n = new Set(o); n.has(sec) ? n.delete(sec) : n.add(sec); return n; })} />)}
    </>
  );
}

function Accordion({ section, open, toggle, stats }: { section: Section; open: boolean; toggle: () => void; stats: Stats | null }) {
  const changed = useStore(sectionChanged(section));
  return (
    <section className="section">
      <button className="section-head" aria-expanded={open} onClick={toggle}>
        <span className="title-sm">{section}</span>
        {changed && <span className="edited" title="Edited">Edited</span>}
        <svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d={open ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
      </button>
      {open && <div className="section-body"><SectionBody section={section} histogram={stats?.histogram ?? null} /></div>}
    </section>
  );
}

function MobileEdit({ stats }: { stats: Stats | null }) {
  const section = useStore(s => s.section);
  return (
    <>
      <div className="chips scroll" role="tablist" aria-label="Adjustment group">
        {SECTIONS.map(sec => <SectionChip key={sec} section={sec} active={sec === section} />)}
      </div>
      <div className="sheet-body"><SectionBody section={section} histogram={stats?.histogram ?? null} /></div>
    </>
  );
}

function SectionChip({ section, active }: { section: Section; active: boolean }) {
  const changed = useStore(sectionChanged(section));
  return (
    <button role="tab" aria-selected={active} className="chip" onClick={() => setState({ section })}>
      {section}{changed && <span className="dot sm" aria-label="edited" />}
    </button>
  );
}

export function App() {
  const image = useStore(s => s.image);
  const mode = useStore(s => s.mode);
  const compare = useStore(s => s.compare);
  const undoable = useStore(canUndo);
  const redoable = useStore(canRedo);
  const compact = useMedia('(max-width: 839px)');
  const [stats, setStats] = useState<Stats | null>(null);
  const [exporting, setExporting] = useState(false);
  const [replace, setReplace] = useState<File | 'pick' | null>(null);
  const [aspect, setAspect] = useState('free');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();
  const held = useRef(false);

  useEffect(() => { void restoreLastProject(); }, []);

  const open = useCallback((f: File) => {
    if (getState().image) { setReplace(f); return; }
    openFile(f, f.name).catch(() => {});
  }, []);
  const pick = () => (getState().image ? setReplace('pick') : fileInput.current?.click());

  // Drop and paste anywhere.
  useEffect(() => {
    const over = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); setDragging(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault(); setDragging(false);
      const f = e.dataTransfer?.files[0];
      if (f) open(f);
    };
    const paste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])][0];
      if (f) open(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); window.removeEventListener('paste', paste); };
  }, [open]);

  // Keyboard shortcuts — never while typing.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input:not([type=range]):not([type=checkbox]), textarea, dialog') || !getState().image) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); setExporting(true); return; }
      if (mod || e.altKey) return;
      if (e.key === '\\') setState({ compare: !getState().compare });
      else if (e.key === 'o' || e.key === 'O') setState({ overlay: !getState().overlay });
      else if (e.key === '[' || e.key === ']') {
        const b = getState().brush;
        setState({ brush: { ...b, size: Math.min(0.4, Math.max(0.01, b.size + (e.key === ']' ? 0.01 : -0.01))) } });
      } else if (e.key === 'Escape') setState({ selectedMask: null });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const compareDown = () => {
    held.current = false;
    holdTimer.current = setTimeout(() => { held.current = true; setState({ compare: true }); }, 280);
  };
  const compareUp = () => {
    clearTimeout(holdTimer.current);
    if (held.current) setState({ compare: false });
    else setState({ compare: !getState().compare });
    held.current = false;
  };

  const fileField = (
    <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={e => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = ''; }} />
  );

  const dialogs = (
    <>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      {replace && (
        <ConfirmReplace
          onClose={() => setReplace(null)}
          onConfirm={() => {
            const r = replace;
            closePhoto();
            if (r === 'pick') setTimeout(() => fileInput.current?.click(), 0);
            else openFile(r, r.name).catch(() => {});
          }}
        />
      )}
      {dragging && <div className="drop-hint"><p className="title">Drop to open</p></div>}
    </>
  );

  if (!image) return <>{fileField}<StartScreen onPick={pick} />{dialogs}</>;

  const inspector = (
    <>
      <ScopeLabel />
      {mode === 'edit' && (compact ? <MobileEdit stats={stats} /> : <DesktopEdit stats={stats} />)}
      {mode === 'mask' && <div className={compact ? 'sheet-body' : ''}><MaskPanel /></div>}
      {mode === 'crop' && <div className={compact ? 'sheet-body' : ''}><CropPanel aspect={aspect} setAspect={setAspect} /></div>}
    </>
  );

  const modeButtons = MODES.map(m => (
    <button key={m.id} className="mode" aria-pressed={mode === m.id} onClick={() => setState({ mode: m.id, compare: false })}>
      <Icon d={m.icon} />
      <span>{m.label}</span>
    </button>
  ));

  return (
    <div className={'app' + (compact ? ' is-compact' : '')}>
      {fileField}
      <header className="header">
        <div className="header-left">
          <span className="wordmark">ajwoo photo</span>
          <span className="file-name" title={image.name}>{image.name}</span>
          {!compact && <SaveStatus />}
        </div>
        <div className="header-right">
          <button className="icon-btn" onClick={pick} aria-label="Open another photo" title="Open another photo">
            <Icon d="M4 20h16M12 4v12M7 9l5-5 5 5" />
          </button>
          <button className="icon-btn" onClick={undo} disabled={!undoable} aria-label="Undo" title="Undo (⌘Z)"><Icon d={UNDO} /></button>
          <button className="icon-btn" onClick={redo} disabled={!redoable} aria-label="Redo" title="Redo (⇧⌘Z)"><Icon d={REDO} /></button>
          <button
            className="btn-secondary sm compare-btn"
            aria-pressed={compare}
            title="Tap to toggle, hold to peek at the original (\)"
            onPointerDown={compareDown}
            onPointerUp={compareUp}
            onPointerLeave={() => { if (held.current) compareUp(); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setState({ compare: !getState().compare }); } }}
          >
            Compare
          </button>
          <button className="btn-primary sm" onClick={() => setExporting(true)}>Export</button>
        </div>
      </header>

      {compact ? (
        <>
          <CanvasView onStats={setStats} aspect={aspect} />
          <div className="sheet">{inspector}</div>
          <nav className="tabbar" aria-label="Tools">{modeButtons}</nav>
        </>
      ) : (
        <div className="editor">
          <nav className="rail" aria-label="Tools">{modeButtons}</nav>
          <CanvasView onStats={setStats} aspect={aspect} />
          <aside className="inspector" aria-label="Adjustments">
            <HistogramView stats={stats} />
            {inspector}
          </aside>
        </div>
      )}
      <Toast />
      {dialogs}
    </div>
  );
}
