/** Export, previews, and analysis. All render from the recipe; nothing is a screenshot of the screen. */
import { Renderer } from './engine/renderer';
import { MAX_EXPORT_PIXELS } from './engine/image';
import { defaultRecipe, type Recipe } from './engine/recipe';
import { viewToSource } from './engine/geometry';
import { brushLayers, getState } from './store';

let preview: Renderer | null = null;
/** The on-screen renderer registers itself so analysis can reuse its proxy texture. */
export function registerPreviewRenderer(r: Renderer | null) { preview = r; }

export function brushIndexFor(recipe: Recipe) {
  return (id: string) => recipe.masks.findIndex(m => m.id === id);
}

export function uploadBrushes(r: Renderer, recipe: Recipe) {
  recipe.masks.forEach((m, i) => {
    if (m.shape.type === 'brush') r.setBrush(i, brushLayers.get(m.id)?.canvas ?? null);
  });
}

function fit(w: number, h: number, maxEdge: number): [number, number] {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

export interface Histogram { r: number[]; g: number[]; b: number[]; l: number[] }
export interface Stats {
  histogram: Histogram;
  meanLuminance: number;
  medianLuminance: number;
  clippedShadowsPct: number;
  clippedHighlightsPct: number;
  /** Mean of R−B and G−(R+B)/2 in 0–255 terms; positive = warm / green. Estimates only. */
  warmth: number;
  greenMagenta: number;
  meanSaturation: number;
  sampleSize: [number, number];
}

export function statsFrom(px: Uint8ClampedArray, w: number, h: number, region?: { x: number; y: number; w: number; h: number }): Stats {
  const bins = 64;
  const H: Histogram = { r: Array(bins).fill(0), g: Array(bins).fill(0), b: Array(bins).fill(0), l: Array(bins).fill(0) };
  const lumHist = new Array(256).fill(0);
  let n = 0, sumL = 0, lo = 0, hi = 0, warm = 0, gm = 0, sat = 0;
  const x0 = region ? Math.floor(region.x * w) : 0, y0 = region ? Math.floor(region.y * h) : 0;
  const x1 = region ? Math.ceil((region.x + region.w) * w) : w, y1 = region ? Math.ceil((region.y + region.h) * h) : h;
  for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(w, x1); x++) {
    const i = (y * w + x) * 4;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    H.r[r >> 2]++; H.g[g >> 2]++; H.b[b >> 2]++; H.l[l >> 2]++;
    lumHist[l]++;
    sumL += l; n++;
    if (r <= 2 && g <= 2 && b <= 2) lo++;
    if (r >= 253 || g >= 253 || b >= 253) hi++;
    warm += r - b; gm += g - (r + b) / 2;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx === 0 ? 0 : (mx - mn) / mx;
  }
  let acc = 0, median = 0;
  for (let i = 0; i < 256; i++) { acc += lumHist[i]; if (acc >= n / 2) { median = i; break; } }
  const N = Math.max(1, n);
  const norm = (a: number[]) => { const m = Math.max(...a, 1); return a.map(v => +(v / m).toFixed(3)); };
  return {
    histogram: { r: norm(H.r), g: norm(H.g), b: norm(H.b), l: norm(H.l) },
    meanLuminance: +(sumL / N / 255).toFixed(3),
    medianLuminance: +(median / 255).toFixed(3),
    clippedShadowsPct: +((lo / N) * 100).toFixed(2),
    clippedHighlightsPct: +((hi / N) * 100).toFixed(2),
    warmth: +(warm / N).toFixed(1),
    greenMagenta: +(gm / N).toFixed(1),
    meanSaturation: +(sat / N).toFixed(3),
    sampleSize: [w, h],
  };
}

/** Render the current edit small, from the screen proxy. */
export function renderSmall(recipe: Recipe, maxEdge: number, opts: { original?: boolean; overlay?: number } = {}) {
  if (!preview?.hasSource) throw new Error('No photo is open.');
  const r = opts.original ? { ...defaultRecipe(), geometry: recipe.geometry } : recipe;
  const [ow, oh] = preview.outputSize(r);
  const [w, h] = fit(ow, oh, maxEdge);
  uploadBrushes(preview, r);
  const px = preview.renderToPixels(r, w, h, { overlay: opts.overlay }, brushIndexFor(r));
  return { px, w, h };
}

export function analyze(recipe: Recipe, region?: { x: number; y: number; w: number; h: number }): Stats {
  const { px, w, h } = renderSmall(recipe, 384);
  return statsFrom(px, w, h, region);
}

function toCanvas(px: Uint8ClampedArray, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  return c;
}

function canvasBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('The browser could not encode this image.'))), type, quality));
}

export async function previewDataUrl(recipe: Recipe, maxEdge = 1024, opts: { original?: boolean; overlay?: number } = {}) {
  const { px, w, h } = renderSmall(recipe, Math.min(2048, maxEdge), opts);
  return toCanvas(px, w, h).toDataURL('image/jpeg', 0.85);
}

export type ExportFormat = 'jpeg' | 'png' | 'webp';
export interface ExportOptions { format: ExportFormat; quality: number; maxEdge?: number }
export interface ExportResult { blob: Blob; name: string; width: number; height: number; type: string; warnings: string[] }

export async function exportImage(opts: ExportOptions): Promise<ExportResult> {
  const s = getState();
  if (!s.image) throw new Error('No photo is open.');
  const recipe = s.recipe;
  const warnings: string[] = [];
  const canvas = document.createElement('canvas');
  const r = new Renderer(canvas);
  try {
    let src: ImageBitmap = s.image.full;
    let [sw, sh] = [src.width, src.height];
    const limit = Math.min(r.maxTexture, 16384);
    if (Math.max(sw, sh) > limit) {
      const k = limit / Math.max(sw, sh);
      src = await createImageBitmap(src, { resizeWidth: Math.round(sw * k), resizeHeight: Math.round(sh * k), resizeQuality: 'high' });
      [sw, sh] = [src.width, src.height];
      warnings.push(`This device's graphics limit is ${limit}px, so the export was reduced.`);
    }
    r.setSource(src, sw, sh);
    uploadBrushes(r, recipe);
    let [w, h] = r.outputSize(recipe);
    if (opts.maxEdge && Math.max(w, h) > opts.maxEdge) [w, h] = fit(w, h, opts.maxEdge);
    if (w * h > MAX_EXPORT_PIXELS) {
      const k = Math.sqrt(MAX_EXPORT_PIXELS / (w * h));
      w = Math.floor(w * k); h = Math.floor(h * k);
      warnings.push(`Exports are limited to 16.7 megapixels in this version, so the size was reduced to ${w} × ${h}.`);
    }
    const px = r.renderToPixels(recipe, w, h, {}, brushIndexFor(recipe));
    const type = `image/${opts.format}`;
    const blob = await canvasBlob(toCanvas(px, w, h), type, opts.format === 'png' ? undefined : opts.quality);
    if (blob.type !== type) warnings.push(`This browser cannot encode ${opts.format.toUpperCase()}; the file was saved as ${blob.type}.`);
    const ext = blob.type.split('/')[1].replace('jpeg', 'jpg');
    const base = s.image.name.replace(/\.[^.]+$/, '');
    return { blob, name: `${base}-edited.${ext}`, width: w, height: h, type: blob.type, warnings };
  } finally {
    r.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** For handles: is a view point inside the photo? Used by mask tools. */
export { viewToSource };
