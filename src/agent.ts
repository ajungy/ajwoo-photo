/**
 * The agent API: window.ajwooPhoto. It writes the same edit ops as the
 * interface, so every agent change appears in history and can be undone.
 * Documented for agents at /llms.txt.
 */
import { CONTROLS, defaultRecipe, value, type Recipe } from './engine/recipe';
import type { EditOp } from './engine/ops';
import { analyze, exportImage, previewDataUrl, type ExportOptions, type Stats } from './output';
import { edit, getState, openFile, redo, setState, undo } from './store';

export const API_VERSION = '0.1';

/** Proposes values for the global Light and Color controls. Applies nothing. */
export function suggestAuto(recipe: Recipe): EditOp[] {
  const base = { ...defaultRecipe(), geometry: recipe.geometry, curves: recipe.curves };
  const s = analyze(base);
  const target = 0.46;
  const exposure = Math.max(-2, Math.min(2, Math.log2(target / Math.max(0.02, s.medianLuminance)) * 0.8));
  const highlights = s.clippedHighlightsPct > 0.5 ? -Math.min(70, 15 + s.clippedHighlightsPct * 6) : -10;
  const shadows = s.clippedShadowsPct > 0.5 ? Math.min(60, 15 + s.clippedShadowsPct * 6) : 10;
  const temperature = Math.max(-40, Math.min(40, -s.warmth * 0.6));
  const tint = Math.max(-30, Math.min(30, s.greenMagenta * 0.8));
  const vibrance = s.meanSaturation < 0.25 ? 20 : 8;
  const r1 = (n: number) => Math.round(n);
  return [
    { op: 'set', control: 'light.exposure', value: +exposure.toFixed(2) },
    { op: 'set', control: 'light.contrast', value: 10 },
    { op: 'set', control: 'light.highlights', value: r1(highlights) },
    { op: 'set', control: 'light.shadows', value: r1(shadows) },
    { op: 'set', control: 'light.whites', value: s.clippedHighlightsPct > 0.2 ? 0 : 8 },
    { op: 'set', control: 'light.blacks', value: s.clippedShadowsPct > 0.2 ? 0 : -6 },
    { op: 'set', control: 'color.temperature', value: r1(temperature) },
    { op: 'set', control: 'color.tint', value: r1(tint) },
    { op: 'set', control: 'color.vibrance', value: vibrance },
  ];
}

function summary(recipe: Recipe) {
  const changed = Object.fromEntries(CONTROLS.filter(c => value(recipe, c.id) !== c.default).map(c => [c.id, value(recipe, c.id)]));
  return { changed, curves: recipe.curves, geometry: recipe.geometry, masks: recipe.masks };
}

function requireImage() {
  const s = getState();
  if (!s.image) throw new Error('No photo is open. Call openImage(blobOrUrl) first.');
  return s;
}

export const api = {
  version: API_VERSION,

  /** Every control: id, label, group, range, default, step, unit, whether masks can use it, and meaning. */
  describeControls(group?: string) {
    return CONTROLS.filter(c => !group || c.group === group).map(c => ({
      id: c.id, label: c.label, group: c.group, min: c.min, max: c.max, default: c.default, step: c.step,
      unit: c.unit ?? null, maskable: !!c.local, meaning: c.meaning,
    }));
  },

  /** Open a photo from a Blob/File or a same-origin / CORS-enabled URL. */
  async openImage(source: Blob | string, name?: string) {
    const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
    const img = await openFile(blob, name ?? (source instanceof File ? source.name : 'photo.jpg'));
    return { name: img.name, width: img.width, height: img.height, revision: getState().index, stats: analyze(getState().recipe) };
  },

  getState() {
    const s = getState();
    return {
      open: !!s.image,
      photo: s.image ? { name: s.image.name, type: s.image.type, width: s.image.width, height: s.image.height } : null,
      revision: s.index,
      recipe: summary(s.recipe),
      history: s.entries.map((e, i) => ({ revision: i, label: e.label, author: e.author, time: e.time })),
    };
  },

  getRecipe(): Recipe { return structuredClone(getState().recipe); },

  /** Measured on a small render of the current edit. Optional region in output (cropped) coordinates, 0–1. */
  analyze(region?: { x: number; y: number; w: number; h: number }): Stats {
    return analyze(requireImage().recipe, region);
  },

  /**
   * Apply a batch of ops as one history entry. Invalid batches change nothing and list every error.
   * Pass expectedRevision to avoid overwriting a newer human edit.
   */
  applyEdits(input: { ops: EditOp[]; label?: string; expectedRevision?: number }) {
    const s = requireImage();
    if (input.expectedRevision !== undefined && input.expectedRevision !== s.index) {
      return { ok: false, errors: [`Revision conflict: expected ${input.expectedRevision}, current is ${s.index}. Call getState() and retry.`], revision: s.index };
    }
    const res = edit(input.ops, input.label ?? 'Agent edit', 'Agent');
    if (res.ok) setState({ selectedMask: res.createdMasks.at(-1) ?? getState().selectedMask });
    return { ok: res.ok, errors: res.errors, changed: res.changed, createdMasks: res.createdMasks, revision: getState().index };
  },

  /** Proposed auto tone and white balance ops. Apply them with applyEdits if they look right. */
  suggest(intent: 'auto' = 'auto') {
    requireImage();
    if (intent !== 'auto') throw new Error('Only "auto" is available in this version.');
    return { intent, ops: suggestAuto(getState().recipe) };
  },

  /** JPEG data URL of the current edit. compare: 'original' renders without adjustments. overlay: mask id to tint red. */
  async renderPreview(opts: { maxEdge?: number; compare?: 'original'; overlay?: string } = {}) {
    const s = requireImage();
    const overlay = opts.overlay ? s.recipe.masks.findIndex(m => m.id === opts.overlay) : -1;
    return previewDataUrl(s.recipe, opts.maxEdge ?? 1024, { original: opts.compare === 'original', overlay });
  },

  undo() { undo(); return { revision: getState().index }; },
  redo() { redo(); return { revision: getState().index }; },

  /** Render at full resolution. Returns the Blob and what was actually produced. Location metadata is never written. */
  async export(opts: Partial<ExportOptions> = {}) {
    requireImage();
    const r = await exportImage({ format: opts.format ?? 'jpeg', quality: opts.quality ?? 0.92, maxEdge: opts.maxEdge });
    return { blob: r.blob, name: r.name, width: r.width, height: r.height, type: r.type, bytes: r.blob.size, warnings: r.warnings, revision: getState().index };
  },
};

declare global { interface Window { ajwooPhoto: typeof api } }
export function installAgentApi() { window.ajwooPhoto = api; }
