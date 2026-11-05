import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Renderer } from '../engine/renderer';
import { defaultRecipe, FULL_CROP, type Crop, type MaskShape } from '../engine/recipe';
import { outputSize, sourceToView, viewToSource } from '../engine/geometry';
import { brushLayers, commit, getState, preview, setState, subscribe, useStore } from '../store';
import { brushIndexFor, registerPreviewRenderer, renderSmall, statsFrom, type Stats } from '../output';
import { ASPECTS } from './Inspector';

type Pt = [number, number];

interface Props { onStats: (s: Stats) => void; aspect: string }

export function CanvasView({ onStats, aspect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const image = useStore(s => s.image);
  const mode = useStore(s => s.mode);
  const compare = useStore(s => s.compare);
  const recipe = useStore(s => s.recipe);
  const selectedId = useStore(s => s.selectedMask);
  const brush = useStore(s => s.brush);
  const [cursor, setCursor] = useState<Pt | null>(null);

  const cropMode = mode === 'crop';
  const viewCrop: Crop = cropMode ? FULL_CROP : recipe.geometry.crop;

  // Fit the output into the available area.
  useLayoutEffect(() => {
    const el = wrap.current!;
    setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [ow, oh] = image ? outputSize(image.width, image.height, recipe.geometry, viewCrop) : [1, 1];
  const pad = cropMode ? 32 : 16;
  const scale = Math.max(0.01, Math.min((box.w - pad * 2) / ow, (box.h - pad * 2) / oh));
  const cssW = Math.max(1, Math.round(ow * scale)), cssH = Math.max(1, Math.round(oh * scale));

  useEffect(() => {
    try {
      renderer.current = new Renderer(canvas.current!);
      registerPreviewRenderer(renderer.current);
    } catch (e) { setError((e as Error).message); }
    return () => registerPreviewRenderer(null);
  }, []);

  useEffect(() => {
    if (image && renderer.current) {
      renderer.current.setSource(image.proxy, image.proxy.width, image.proxy.height);
      uploaded.current = new Map();
      request();
    }
  }, [image]);

  // Render on any state change, at most once per frame.
  const uploaded = useRef(new Map<string, number>());
  const frame = useRef(0);
  const statsTimer = useRef<ReturnType<typeof setTimeout>>();
  const request = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(draw);
  };
  const draw = () => {
    frame.current = 0;
    const r = renderer.current, c = canvas.current;
    const s = getState();
    if (!r || !c || !s.image) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const crop = s.mode === 'crop' ? FULL_CROP : s.recipe.geometry.crop;
    const [w, h] = outputSize(s.image.width, s.image.height, s.recipe.geometry, crop);
    const k = Math.min((wrap.current!.clientWidth - 32) / w, (wrap.current!.clientHeight - 32) / h);
    const pw = Math.max(1, Math.round(w * k * dpr)), ph = Math.max(1, Math.round(h * k * dpr));
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const rec = s.compare ? { ...defaultRecipe(), geometry: s.recipe.geometry } : s.recipe;
    rec.masks.forEach((m, i) => {
      const layer = brushLayers.get(m.id);
      if (m.shape.type === 'brush' && layer && uploaded.current.get(m.id + ':' + i) !== layer.version) {
        r.setBrush(i, layer.canvas);
        uploaded.current.set(m.id + ':' + i, layer.version);
      }
    });
    const overlay = s.overlay && s.mode === 'mask' && !s.compare ? rec.masks.findIndex(m => m.id === s.selectedMask) : -1;
    r.render(rec, pw, ph, { crop, overlay }, brushIndexFor(rec));
    clearTimeout(statsTimer.current);
    statsTimer.current = setTimeout(() => {
      try {
        const cur = getState();
        if (!cur.image) return;
        const { px, w: sw, h: sh } = renderSmall(cur.recipe, 256);
        onStats(statsFrom(px, sw, sh));
        request(); // renderToPixels changed GL state; redraw the screen
      } catch { /* no photo */ }
    }, 160);
  };
  useEffect(() => { const off = subscribe(request); return () => { off(); }; }, []);
  useEffect(request, [box, cssW, cssH]);

  /* --------------------------------------------------------- pointer math */

  const toView = (e: { clientX: number; clientY: number }): Pt => {
    const b = canvas.current!.getBoundingClientRect();
    return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height];
  };
  const g = recipe.geometry;
  const srcToPx = (p: Pt): Pt => { const v = sourceToView(p, g, viewCrop); return [v[0] * cssW, v[1] * cssH]; };
  const pxToSrc = (e: { clientX: number; clientY: number }): Pt => viewToSource(toView(e), g, viewCrop);

  const mask = recipe.masks.find(m => m.id === selectedId);
  const showHandles = mode === 'mask' && !compare && mask && mask.shape.type !== 'brush';
  const painting = mode === 'mask' && !compare && mask?.shape.type === 'brush';

  const drag = useRef<null | { kind: string; start: Pt; shape?: MaskShape; crop?: Crop; moved: boolean }>(null);
  const pointers = useRef(new Set<number>());
  const lastPaint = useRef<Pt | null>(null);

  const setShape = (shape: MaskShape) => {
    const r = getState().recipe;
    preview({ ...r, masks: r.masks.map(m => (m.id === selectedId ? { ...m, shape } : m)) });
  };

  const onDown = (kind: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    pointers.current.add(e.pointerId);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind, start: kind.startsWith('crop') ? toView(e) : pxToSrc(e), shape: mask ? structuredClone(mask.shape) : undefined, crop: { ...g.crop }, moved: false };
    if (kind === 'paint') {
      if (pointers.current.size > 1) { drag.current = null; return; }
      const p = pxToSrc(e);
      brushLayers.get(selectedId!)?.dab(p[0], p[1], brush.size, brush.feather, brush.erase);
      brushLayers.get(selectedId!)!.version++;
      lastPaint.current = p;
      setState({ brushVersion: getState().brushVersion + 1 });
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (painting) setCursor(toView(e));
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    if (d.kind === 'paint') {
      const p = pxToSrc(e);
      brushLayers.get(selectedId!)?.segment(lastPaint.current ?? p, p, brush.size, brush.feather, brush.erase);
      lastPaint.current = p;
      setState({ brushVersion: getState().brushVersion + 1 });
      return;
    }
    if (d.kind.startsWith('crop')) return moveCrop(d, toView(e));
    const p = pxToSrc(e);
    const s = d.shape!;
    const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
    if (s.type === 'linear') {
      if (d.kind === 'from') setShape({ ...s, from: p });
      else if (d.kind === 'to') setShape({ ...s, to: p });
      else setShape({ ...s, from: [s.from[0] + dx, s.from[1] + dy], to: [s.to[0] + dx, s.to[1] + dy] });
    } else if (s.type === 'radial') {
      if (d.kind === 'center') setShape({ ...s, center: [s.center[0] + dx, s.center[1] + dy] });
      else if (d.kind === 'rx') setShape({ ...s, radius: [Math.max(0.01, Math.abs(p[0] - s.center[0])), s.radius[1]] });
      else if (d.kind === 'ry') setShape({ ...s, radius: [s.radius[0], Math.max(0.01, Math.abs(p[1] - s.center[1]))] });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    drag.current = null;
    lastPaint.current = null;
    if (!d) return;
    if (d.kind === 'paint') { commit(`Brush · ${mask?.name ?? 'mask'}`, 'You', [selectedId!]); return; }
    if (d.moved) commit(d.kind.startsWith('crop') ? 'Crop' : `Move ${mask?.name ?? 'mask'}`);
  };

  /* ----------------------------------------------------------------- crop */

  const ratio = (() => {
    if (!image) return null;
    const a = ASPECTS.find(x => x.id === aspect)?.ratio ?? null;
    if (a === null) return null;
    const [fw, fh] = outputSize(image.width, image.height, g, FULL_CROP);
    return (a === 'original' ? fw / fh : a) * (fh / fw); // ratio in normalized units
  })();

  const moveCrop = (d: NonNullable<typeof drag.current>, p: Pt) => {
    const c0 = d.crop!;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    let c: Crop;
    if (d.kind === 'crop-move') {
      const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
      c = { ...c0, x: Math.min(1 - c0.w, Math.max(0, c0.x + dx)), y: Math.min(1 - c0.h, Math.max(0, c0.y + dy)) };
    } else {
      const corner = d.kind.slice(5); // nw ne sw se
      const ax = corner.includes('w') ? c0.x + c0.w : c0.x;
      const ay = corner.includes('n') ? c0.y + c0.h : c0.y;
      let px = clamp(p[0]), py = clamp(p[1]);
      let w = Math.max(0.04, Math.abs(px - ax)), h = Math.max(0.04, Math.abs(py - ay));
      if (ratio) {
        if (w / h > ratio) w = h * ratio; else h = w / ratio;
        const maxW = corner.includes('w') ? ax : 1 - ax, maxH = corner.includes('n') ? ay : 1 - ay;
        if (w > maxW) { w = maxW; h = w / ratio; }
        if (h > maxH) { h = maxH; w = h * ratio; }
      } else {
        w = Math.min(w, corner.includes('w') ? ax : 1 - ax);
        h = Math.min(h, corner.includes('n') ? ay : 1 - ay);
      }
      c = { x: corner.includes('w') ? ax - w : ax, y: corner.includes('n') ? ay - h : ay, w, h };
    }
    const r = getState().recipe;
    preview({ ...r, geometry: { ...r.geometry, crop: c } });
  };

  /* --------------------------------------------------------------- render */

  const handle = (p: Pt, kind: string, label: string, cls = '') => (
    <g className={'handle ' + cls} onPointerDown={onDown(kind)} role="slider" aria-label={label} tabIndex={-1}>
      <circle cx={p[0]} cy={p[1]} r={22} className="handle-hit" />
      <circle cx={p[0]} cy={p[1]} r={8} className="handle-dot" />
    </g>
  );

  let overlay: React.ReactNode = null;
  if (showHandles && mask) {
    const s = mask.shape;
    if (s.type === 'linear') {
      const a = srcToPx(s.from), b = srcToPx(s.to);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 4000, ny = (dx / len) * 4000;
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      overlay = (
        <>
          <line x1={a[0] - nx} y1={a[1] - ny} x2={a[0] + nx} y2={a[1] + ny} className="guide" />
          <line x1={b[0] - nx} y1={b[1] - ny} x2={b[0] + nx} y2={b[1] + ny} className="guide dashed" />
          <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="guide" />
          {handle(mid, 'move', 'Move gradient', 'is-center')}
          {handle(a, 'from', 'Gradient start: full effect')}
          {handle(b, 'to', 'Gradient end: no effect')}
        </>
      );
    } else if (s.type === 'radial') {
      const pts = Array.from({ length: 65 }, (_, i) => {
        const t = (i / 64) * Math.PI * 2;
        return srcToPx([s.center[0] + s.radius[0] * Math.cos(t), s.center[1] + s.radius[1] * Math.sin(t)]);
      });
      const inner = Array.from({ length: 65 }, (_, i) => {
        const t = (i / 64) * Math.PI * 2, k = 1 - s.feather;
        return srcToPx([s.center[0] + s.radius[0] * k * Math.cos(t), s.center[1] + s.radius[1] * k * Math.sin(t)]);
      });
      const d = (q: Pt[]) => 'M' + q.map(p => p.join(',')).join('L') + 'Z';
      overlay = (
        <>
          <path d={d(pts)} className="guide" fill="none" />
          {s.feather > 0.02 && <path d={d(inner)} className="guide dashed" fill="none" />}
          {handle(srcToPx(s.center), 'center', 'Move radial mask', 'is-center')}
          {handle(srcToPx([s.center[0] + s.radius[0], s.center[1]]), 'rx', 'Radial width')}
          {handle(srcToPx([s.center[0], s.center[1] + s.radius[1]]), 'ry', 'Radial height')}
        </>
      );
    }
  }
  if (cropMode && image) {
    const c = g.crop;
    const x = c.x * cssW, y = c.y * cssH, w = c.w * cssW, h = c.h * cssH;
    overlay = (
      <>
        <path d={`M0,0H${cssW}V${cssH}H0Z M${x},${y}V${y + h}H${x + w}V${y}Z`} className="crop-shade" fillRule="evenodd" />
        <rect x={x} y={y} width={w} height={h} className="crop-frame" onPointerDown={onDown('crop-move')} />
        {[1, 2].map(i => (
          <g key={i} className="crop-thirds">
            <line x1={x + (w * i) / 3} y1={y} x2={x + (w * i) / 3} y2={y + h} />
            <line x1={x} y1={y + (h * i) / 3} x2={x + w} y2={y + (h * i) / 3} />
          </g>
        ))}
        {handle([x, y], 'crop-nw', 'Crop top-left corner')}
        {handle([x + w, y], 'crop-ne', 'Crop top-right corner')}
        {handle([x, y + h], 'crop-sw', 'Crop bottom-left corner')}
        {handle([x + w, y + h], 'crop-se', 'Crop bottom-right corner')}
      </>
    );
  }

  const brushR = (brush.size * Math.max(cssW / viewCrop.w, cssH / viewCrop.h)) / 2;

  return (
    <div ref={wrap} className="canvas-wrap">
      {error && <p className="canvas-error" role="alert">{error}</p>}
      <div className="canvas-box" style={{ width: cssW, height: cssH }}>
        <canvas ref={canvas} style={{ width: cssW, height: cssH }} aria-label="Edited photo" role="img" />
        <svg
          className={'canvas-overlay' + (painting ? ' is-painting' : '')}
          width={cssW}
          height={cssH}
          onPointerDown={painting ? onDown('paint') : undefined}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => setCursor(null)}
        >
          {overlay}
          {painting && cursor && (
            <circle cx={cursor[0] * cssW} cy={cursor[1] * cssH} r={brushR} className={'brush-cursor' + (brush.erase ? ' is-erase' : '')} />
          )}
        </svg>
        {compare && <span className="compare-badge">Original</span>}
      </div>
    </div>
  );
}
