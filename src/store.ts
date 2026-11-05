import { useSyncExternalStore } from 'react';
import { applyOps, type EditOp, type OpResult } from './engine/ops';
import { cloneRecipe, defaultRecipe, normalizeRecipe, type Recipe } from './engine/recipe';
import { BrushLayer } from './engine/brush';
import { decode, type LoadedImage } from './engine/image';
import * as db from './storage';

export type Mode = 'edit' | 'mask' | 'crop';
export type Section = 'Light' | 'Color' | 'Curve' | 'Color mixer' | 'Grading' | 'Effects';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'memory' | 'error';

export interface HistoryEntry {
  recipe: Recipe;
  brushes: Record<string, ImageData>;
  label: string;
  author: 'You' | 'Agent';
  time: number;
}

export interface State {
  image: LoadedImage | null;
  /** The live recipe: equals the current history entry except mid-gesture. */
  recipe: Recipe;
  entries: HistoryEntry[];
  index: number;
  mode: Mode;
  section: Section;
  selectedMask: string | null;
  overlay: boolean;
  compare: boolean;
  brush: { size: number; feather: number; erase: boolean };
  save: SaveStatus;
  loading: string | null;
  error: string | null;
  /** Bumped whenever brush pixels change, so views re-render. */
  brushVersion: number;
}

const MAX_HISTORY = 60;

let state: State = {
  image: null,
  recipe: defaultRecipe(),
  entries: [],
  index: -1,
  mode: 'edit',
  section: 'Light',
  selectedMask: null,
  overlay: false,
  compare: false,
  brush: { size: 0.06, feather: 0.6, erase: false },
  save: 'idle',
  loading: null,
  error: null,
  brushVersion: 0,
};

const listeners = new Set<() => void>();
export const brushLayers = new Map<string, BrushLayer>();
let original: Blob | null = null;

export function getState() { return state; }
export function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}
export function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

function snapshotBrushes(prev: Record<string, ImageData> | undefined, recipe: Recipe, changed: Set<string>): Record<string, ImageData> {
  const out: Record<string, ImageData> = {};
  for (const m of recipe.masks) {
    if (m.shape.type !== 'brush') continue;
    const layer = brushLayers.get(m.id);
    if (!layer) continue;
    out[m.id] = !changed.has(m.id) && prev?.[m.id] ? prev[m.id] : layer.snapshot();
  }
  return out;
}

function ensureBrushLayers(recipe: Recipe) {
  const img = state.image;
  if (!img) return;
  for (const m of recipe.masks) if (m.shape.type === 'brush' && !brushLayers.has(m.id)) brushLayers.set(m.id, new BrushLayer(img.width, img.height));
}

/** Show a recipe without recording it (mid-drag). */
export function preview(recipe: Recipe) {
  setState({ recipe });
}

/** Record the live recipe (and any brush changes) as one history entry. */
export function commit(label: string, author: HistoryEntry['author'] = 'You', changedBrushes: string[] = []) {
  const s = state;
  ensureBrushLayers(s.recipe);
  const prev = s.entries[s.index];
  if (prev && changedBrushes.length === 0 && JSON.stringify(prev.recipe) === JSON.stringify(s.recipe)) return;
  const entry: HistoryEntry = {
    recipe: cloneRecipe(s.recipe),
    brushes: snapshotBrushes(prev?.brushes, s.recipe, new Set(changedBrushes)),
    label, author, time: Date.now(),
  };
  const entries = [...s.entries.slice(0, s.index + 1), entry].slice(-MAX_HISTORY);
  setState({ entries, index: entries.length - 1 });
  scheduleSave();
}

export function edit(ops: EditOp[], label: string, author: HistoryEntry['author'] = 'You'): OpResult {
  const res = applyOps(state.recipe, ops);
  if (!res.ok) return res;
  setState({ recipe: res.recipe });
  ensureBrushLayers(res.recipe);
  const changed: string[] = [];
  for (const { mask, strokes } of res.strokes) {
    const layer = brushLayers.get(mask)!;
    strokes.forEach(st => layer.stroke(st));
    changed.push(mask);
  }
  if (changed.length) setState({ brushVersion: state.brushVersion + 1 });
  commit(label, author, changed);
  return res;
}

function restore(i: number) {
  const e = state.entries[i];
  if (!e) return;
  for (const m of e.recipe.masks) {
    if (m.shape.type !== 'brush') continue;
    if (!brushLayers.has(m.id) && state.image) brushLayers.set(m.id, new BrushLayer(state.image.width, state.image.height));
    brushLayers.get(m.id)!.restore(e.brushes[m.id]);
  }
  const selected = e.recipe.masks.some(m => m.id === state.selectedMask) ? state.selectedMask : null;
  setState({ index: i, recipe: cloneRecipe(e.recipe), selectedMask: selected, brushVersion: state.brushVersion + 1 });
  scheduleSave();
}

export const undo = () => { if (state.index > 0) restore(state.index - 1); };
export const redo = () => { if (state.index < state.entries.length - 1) restore(state.index + 1); };
export const canUndo = (s: State) => s.index > 0;
export const canRedo = (s: State) => s.index < s.entries.length - 1;

export async function openFile(blob: Blob, name: string, savedRecipe?: unknown, brushBlobs?: Record<string, Blob>) {
  setState({ loading: `Opening ${name}…`, error: null });
  try {
    const img = await decode(blob, name);
    state.image?.full.close();
    brushLayers.clear();
    original = blob;
    const recipe = savedRecipe ? normalizeRecipe(savedRecipe) : defaultRecipe();
    setState({ image: img, recipe, entries: [], index: -1, selectedMask: null, mode: 'edit', loading: null });
    for (const m of recipe.masks) {
      if (m.shape.type !== 'brush') continue;
      const layer = new BrushLayer(img.width, img.height);
      const b = brushBlobs?.[m.id];
      if (b) await layer.load(b);
      brushLayers.set(m.id, layer);
    }
    const entry: HistoryEntry = { recipe: cloneRecipe(recipe), brushes: snapshotBrushes(undefined, recipe, new Set()), label: 'Opened photo', author: 'You', time: Date.now() };
    setState({ entries: [entry], index: 0, brushVersion: state.brushVersion + 1 });
    if (!savedRecipe) {
      const ok = await db.saveOriginal(blob, name);
      setState({ save: ok ? 'saved' : 'memory' });
      scheduleSave();
    } else setState({ save: 'saved' });
    return img;
  } catch (e) {
    setState({ loading: null, error: (e as Error).message });
    throw e;
  }
}

export function closePhoto() {
  state.image?.full.close();
  brushLayers.clear();
  original = null;
  setState({ image: null, recipe: defaultRecipe(), entries: [], index: -1, selectedMask: null, mode: 'edit', save: 'idle' });
  void db.clearProject();
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave() {
  if (state.save === 'memory' || !state.image) return;
  clearTimeout(saveTimer);
  setState({ save: 'saving' });
  saveTimer = setTimeout(async () => {
    const s = state;
    if (!s.image) return;
    const brushes: Record<string, Blob> = {};
    for (const m of s.recipe.masks) {
      const layer = brushLayers.get(m.id);
      if (layer) brushes[m.id] = await layer.toBlob();
    }
    const ok = await db.saveProject({ name: s.image.name, recipe: s.recipe }, brushes);
    setState({ save: ok ? 'saved' : 'error' });
  }, 500);
}

export async function restoreLastProject(): Promise<boolean> {
  const p = await db.loadProject();
  if (!p) return false;
  try {
    await openFile(p.original, p.name, p.recipe, p.brushes);
    return true;
  } catch {
    return false;
  }
}

export function originalBlob() { return original; }
