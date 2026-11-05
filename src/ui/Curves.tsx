import { useRef, useState } from 'react';
import { curveFn } from '../engine/curves';
import { IDENTITY_CURVE, type CurveChannel, type CurvePoint } from '../engine/recipe';
import { commit, getState, preview, useStore } from '../store';
import type { Histogram } from '../output';

const CHANNELS: { id: CurveChannel; label: string; color: string }[] = [
  { id: 'rgb', label: 'RGB', color: 'var(--text-primary)' },
  { id: 'r', label: 'Red', color: '#E5484D' },
  { id: 'g', label: 'Green', color: '#30A46C' },
  { id: 'b', label: 'Blue', color: '#3E63DD' },
];

const S = 256;

export function Curves({ histogram }: { histogram: Histogram | null }) {
  const curves = useStore(s => s.recipe.curves);
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const [selected, setSelected] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; moved: boolean } | null>(null);
  const points = curves[channel];
  const ch = CHANNELS.find(c => c.id === channel)!;

  const setPoints = (pts: CurvePoint[]) => {
    const r = getState().recipe;
    preview({ ...r, curves: { ...r.curves, [channel]: pts } });
  };

  const toUnit = (e: { clientX: number; clientY: number }): CurvePoint => {
    const b = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), Math.min(1, Math.max(0, 1 - (e.clientY - b.top) / b.height))];
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toUnit(e);
    const b = svg.current!.getBoundingClientRect();
    const hit = points.findIndex(q => Math.hypot((q[0] - p[0]) * b.width, (q[1] - p[1]) * b.height) < 22);
    if (hit >= 0) { drag.current = { index: hit, moved: false }; setSelected(hit); return; }
    if (points.length >= 16) return;
    const pts = [...points, p].sort((a, c) => a[0] - c[0]);
    const index = pts.indexOf(p);
    setPoints(pts);
    drag.current = { index, moved: true };
    setSelected(index);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toUnit(e);
    const pts = [...getState().recipe.curves[channel]];
    const last = pts.length - 1;
    const lo = d.index === 0 ? 0 : pts[d.index - 1][0] + 0.01;
    const hi = d.index === last ? 1 : pts[d.index + 1][0] - 0.01;
    pts[d.index] = [Math.min(hi, Math.max(lo, p[0])), p[1]];
    d.moved = true;
    setPoints(pts);
  };

  const onUp = () => {
    if (drag.current?.moved) commit(`Curve ${ch.label}`);
    drag.current = null;
  };

  const removeSelected = () => {
    if (selected === null || selected === 0 || selected === points.length - 1) return;
    setPoints(points.filter((_, i) => i !== selected));
    setSelected(null);
    commit(`Curve ${ch.label}`);
  };

  const f = curveFn(points);
  const path = Array.from({ length: 65 }, (_, i) => {
    const x = i / 64;
    return `${i ? 'L' : 'M'}${(x * S).toFixed(1)},${((1 - Math.min(1, Math.max(0, f(x)))) * S).toFixed(1)}`;
  }).join('');
  const hist = histogram ? (channel === 'rgb' ? histogram.l : histogram[channel]) : null;
  const histPath = hist ? 'M0,' + S + hist.map((v, i) => `L${((i + 0.5) / hist.length) * S},${S - v * S * 0.9}`).join('') + `L${S},${S}Z` : '';
  const sel = selected !== null ? points[selected] : null;
  const isEnd = selected === 0 || selected === points.length - 1;

  return (
    <div className="curves">
      <div className="chips" role="tablist" aria-label="Curve channel">
        {CHANNELS.map(c => (
          <button key={c.id} role="tab" aria-selected={c.id === channel} className="chip" onClick={() => { setChannel(c.id); setSelected(null); }}>
            {c.id !== 'rgb' && <span className="dot" style={{ background: c.color }} />}
            {c.label}
          </button>
        ))}
      </div>
      <svg
        ref={svg}
        className="curve-graph"
        viewBox={`0 0 ${S} ${S}`}
        role="img"
        aria-label={`${ch.label} tone curve. Tap to add a point, drag to move it.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={removeSelected}
      >
        {histPath && <path d={histPath} className="curve-hist" />}
        {[0.25, 0.5, 0.75].map(t => (
          <g key={t} className="curve-grid">
            <line x1={t * S} y1={0} x2={t * S} y2={S} />
            <line x1={0} y1={t * S} x2={S} y2={t * S} />
          </g>
        ))}
        <line x1={0} y1={S} x2={S} y2={0} className="curve-diagonal" />
        <path d={path} fill="none" stroke={ch.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle key={i} cx={p[0] * S} cy={(1 - p[1]) * S} r={i === selected ? 7 : 5.5} className={'curve-point' + (i === selected ? ' is-selected' : '')} />
        ))}
      </svg>
      <div className="curve-foot">
        <span className="caption">
          {sel ? `Input ${Math.round(sel[0] * 255)} · Output ${Math.round(sel[1] * 255)}` : 'Tap the graph to add a point'}
        </span>
        <div className="row-gap">
          {sel && !isEnd && <button className="btn-tertiary sm" onClick={removeSelected}>Remove point</button>}
          {(points.length !== 2 || points[0][1] !== 0 || points[1][1] !== 1) && (
            <button className="btn-tertiary sm" onClick={() => { setPoints([...IDENTITY_CURVE]); setSelected(null); commit(`Reset curve ${ch.label}`); }}>Reset</button>
          )}
        </div>
      </div>
    </div>
  );
}
