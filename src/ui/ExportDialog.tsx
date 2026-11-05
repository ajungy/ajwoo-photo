import { useEffect, useRef, useState } from 'react';
import { download, exportImage, type ExportFormat, type ExportResult } from '../output';
import { outputSize } from '../engine/geometry';
import { MAX_EXPORT_PIXELS } from '../engine/image';
import { useStore } from '../store';

const SIZES = [
  { id: 0, label: 'Full size' },
  { id: 4096, label: '4096 px' },
  { id: 2048, label: '2048 px' },
  { id: 1080, label: '1080 px' },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const image = useStore(s => s.image)!;
  const geometry = useStore(s => s.recipe.geometry);
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [quality, setQuality] = useState(92);
  const [size, setSize] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => { ref.current?.showModal(); }, []);

  let [w, h] = outputSize(image.width, image.height, geometry);
  if (size && Math.max(w, h) > size) { const k = size / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
  if (w * h > MAX_EXPORT_PIXELS) { const k = Math.sqrt(MAX_EXPORT_PIXELS / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k); }

  const run = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      await new Promise(r => setTimeout(r, 30)); // let the button show its working state
      const r = await exportImage({ format, quality: quality / 100, maxEdge: size || undefined });
      setResult(r);
      download(r.blob, r.name);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
  const share = async () => {
    if (!result) return;
    const file = new File([result.blob], result.name, { type: result.type });
    if (navigator.canShare({ files: [file] })) await navigator.share({ files: [file] }).catch(() => {});
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose} aria-labelledby="export-title">
      <h2 id="export-title" className="title">Export photo</h2>
      <p className="caption">A new file is created. Your original stays unchanged.</p>

      <p className="group-label">Format</p>
      <div className="segmented" role="radiogroup" aria-label="Format">
        {(['jpeg', 'png', 'webp'] as const).map(f => (
          <button key={f} role="radio" aria-checked={format === f} onClick={() => setFormat(f)}>{f === 'jpeg' ? 'JPEG' : f.toUpperCase()}</button>
        ))}
      </div>

      {format !== 'png' && (
        <label className="field">
          <span className="field-row"><span>Quality</span><span>{quality}</span></span>
          <input type="range" className="slider-range" min={50} max={100} value={quality} onChange={e => setQuality(+e.target.value)}
            style={{ background: `linear-gradient(90deg, var(--slider-fill) ${(quality - 50) * 2}%, var(--slider-track) ${(quality - 50) * 2}%)` }} />
        </label>
      )}

      <p className="group-label">Size</p>
      <div className="chips wrap" role="radiogroup" aria-label="Size">
        {SIZES.map(s => <button key={s.id} role="radio" aria-checked={size === s.id} className="chip" onClick={() => setSize(s.id)}>{s.label}</button>)}
      </div>
      <p className="caption">{w} × {h} px · sRGB · location and camera data removed</p>

      <div className="dialog-status" aria-live="polite">
        {error && <p className="status-danger">{error}</p>}
        {result && (
          <p className="status-success">
            Saved {result.name} · {result.width} × {result.height} · {(result.blob.size / 1e6).toFixed(1)} MB
          </p>
        )}
        {result?.warnings.map(w2 => <p key={w2} className="status-warning">{w2}</p>)}
      </div>

      <div className="dialog-actions">
        <button className="btn-secondary" onClick={() => ref.current?.close()}>Close</button>
        {result && canShare && <button className="btn-secondary" onClick={share}>Share</button>}
        <button className="btn-primary" onClick={run} disabled={busy} aria-busy={busy}>
          <span style={{ visibility: busy ? 'hidden' : 'visible' }}>{result ? 'Export again' : 'Export'}</span>
          {busy && <span className="spinner" aria-label="Exporting" />}
        </button>
      </div>
    </dialog>
  );
}
