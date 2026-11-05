/**
 * Edit operations shared by the interface and the agent API.
 *
 * A batch is validated as a whole: if any op is invalid nothing is applied,
 * and every problem is reported. Values are never silently clamped.
 */
import {
  CONTROL_BY_ID, FULL_CROP, MAX_MASKS, cloneRecipe, defaultRecipe,
  type CurveChannel, type CurvePoint, type Geometry, type Mask, type MaskShape, type Recipe,
} from './recipe';

export type Target = 'global' | string;

export interface BrushStroke {
  /** Normalized points in the original image. */
  points: [number, number][];
  /** Brush diameter as a fraction of the image's longer edge. */
  size: number;
  /** 0–1 */
  feather?: number;
  erase?: boolean;
}

export type EditOp =
  | { op: 'set'; control: string; value: number; target?: Target }
  | { op: 'adjust'; control: string; delta: number; target?: Target }
  | { op: 'setCurve'; channel: CurveChannel; points: CurvePoint[] }
  | { op: 'setGeometry'; rotate?: 0 | 1 | 2 | 3; flipH?: boolean; crop?: Geometry['crop'] }
  | { op: 'addMask'; id?: string; name?: string; shape: MaskShape; invert?: boolean; amount?: number; adjust?: Record<string, number> }
  | { op: 'updateMask'; id: string; name?: string; shape?: MaskShape; invert?: boolean; amount?: number }
  | { op: 'removeMask'; id: string }
  | { op: 'paintBrush'; mask: string; strokes: BrushStroke[] }
  | { op: 'reset'; scope?: 'all' | 'adjustments' | 'geometry' };

export interface OpResult {
  ok: boolean;
  recipe: Recipe;
  errors: string[];
  /** Resolved absolute values for every control the batch touched. */
  changed: { target: Target; control: string; value: number }[];
  /** Strokes to paint, applied by the caller to brush textures after commit. */
  strokes: { mask: string; strokes: BrushStroke[] }[];
  /** New mask ids, in order. */
  createdMasks: string[];
}

let maskCounter = 0;
export function newMaskId(existing: Mask[]): string {
  let id: string;
  do { id = `mask_${++maskCounter}`; } while (existing.some(m => m.id === id));
  return id;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const inUnit = (n: unknown) => finite(n) && n >= -0.5 && n <= 1.5; // handles may sit slightly off-image

function validShape(s: MaskShape | undefined): string | null {
  if (!s || typeof s !== 'object') return 'shape is required';
  if (s.type === 'linear') {
    if (!s.from?.every(inUnit) || !s.to?.every(inUnit)) return 'linear mask needs from and to as [x, y] in 0–1';
    if (s.from[0] === s.to[0] && s.from[1] === s.to[1]) return 'linear mask from and to must differ';
    return null;
  }
  if (s.type === 'radial') {
    if (!s.center?.every(inUnit)) return 'radial mask needs center as [x, y] in 0–1';
    if (!s.radius?.every(r => finite(r) && r > 0 && r <= 2)) return 'radial mask needs radius as [rx, ry], each in (0, 2]';
    if (!finite(s.feather) || s.feather < 0 || s.feather > 1) return 'radial mask feather must be 0–1';
    return null;
  }
  if (s.type === 'brush') return null;
  return `unknown mask type "${(s as { type: string }).type}"`;
}

export function applyOps(recipe: Recipe, ops: EditOp[]): OpResult {
  const r = cloneRecipe(recipe);
  const errors: string[] = [];
  const changed: OpResult['changed'] = [];
  const strokes: OpResult['strokes'] = [];
  const createdMasks: string[] = [];
  if (!Array.isArray(ops)) return { ok: false, recipe, errors: ['ops must be an array'], changed, strokes, createdMasks };

  ops.forEach((op, i) => {
    const at = `ops[${i}]`;
    switch (op?.op) {
      case 'set':
      case 'adjust': {
        const c = CONTROL_BY_ID.get(op.control);
        if (!c) { errors.push(`${at}: unknown control "${op.control}". Call describeControls() for the list.`); return; }
        const target = op.target ?? 'global';
        const mask = target === 'global' ? null : r.masks.find(m => m.id === target);
        if (target !== 'global' && !mask) { errors.push(`${at}: no mask "${target}"`); return; }
        if (mask && !c.local) { errors.push(`${at}: "${c.id}" cannot be used inside a mask`); return; }
        const current = mask ? (mask.adjust[c.id] ?? 0) : (r.values[c.id] ?? c.default);
        const raw = op.op === 'set' ? op.value : op.delta;
        if (!finite(raw)) { errors.push(`${at}: ${op.op === 'set' ? 'value' : 'delta'} must be a finite number`); return; }
        const next = op.op === 'set' ? raw : current + raw;
        if (next < c.min || next > c.max) {
          errors.push(`${at}: ${c.id} ${next} is outside ${c.min}–${c.max}${c.unit ? ' ' + c.unit : ''}`); return;
        }
        if (mask) mask.adjust[c.id] = next; else r.values[c.id] = next;
        changed.push({ target, control: c.id, value: next });
        return;
      }
      case 'setCurve': {
        if (!['rgb', 'r', 'g', 'b'].includes(op.channel)) { errors.push(`${at}: channel must be rgb, r, g, or b`); return; }
        const pts = op.points;
        if (!Array.isArray(pts) || pts.length < 2 || pts.length > 16) { errors.push(`${at}: a curve needs 2–16 points`); return; }
        if (!pts.every(p => Array.isArray(p) && p.length === 2 && p.every(v => finite(v) && v >= 0 && v <= 1))) {
          errors.push(`${at}: points must be [x, y] pairs in 0–1`); return;
        }
        const sorted = [...pts].sort((a, b) => a[0] - b[0]);
        for (let k = 1; k < sorted.length; k++) if (sorted[k][0] - sorted[k - 1][0] < 0.01) {
          errors.push(`${at}: curve points need distinct x values at least 0.01 apart`); return;
        }
        r.curves[op.channel] = sorted.map(p => [p[0], p[1]] as CurvePoint);
        return;
      }
      case 'setGeometry': {
        if (op.rotate !== undefined) {
          if (![0, 1, 2, 3].includes(op.rotate)) { errors.push(`${at}: rotate must be 0, 1, 2, or 3 quarter turns`); return; }
          if (op.rotate !== r.geometry.rotate && !op.crop) r.geometry.crop = { ...FULL_CROP };
          r.geometry.rotate = op.rotate;
        }
        if (op.flipH !== undefined) r.geometry.flipH = !!op.flipH;
        if (op.crop) {
          const { x, y, w, h } = op.crop;
          if (![x, y, w, h].every(finite) || x < 0 || y < 0 || w < 0.02 || h < 0.02 || x + w > 1.0001 || y + h > 1.0001) {
            errors.push(`${at}: crop must be {x, y, w, h} inside 0–1, at least 0.02 wide and high`); return;
          }
          r.geometry.crop = { x, y, w, h };
        }
        return;
      }
      case 'addMask': {
        if (r.masks.length >= MAX_MASKS) { errors.push(`${at}: at most ${MAX_MASKS} masks in this version`); return; }
        const problem = validShape(op.shape);
        if (problem) { errors.push(`${at}: ${problem}`); return; }
        if (op.id && r.masks.some(m => m.id === op.id)) { errors.push(`${at}: mask id "${op.id}" already exists`); return; }
        const id = op.id ?? newMaskId(r.masks);
        const adjust: Record<string, number> = {};
        for (const [k, v] of Object.entries(op.adjust ?? {})) {
          const c = CONTROL_BY_ID.get(k);
          if (!c || !c.local) { errors.push(`${at}: "${k}" is not a mask control`); return; }
          if (!finite(v) || v < c.min || v > c.max) { errors.push(`${at}: ${k} ${v} is outside ${c.min}–${c.max}`); return; }
          adjust[k] = v;
        }
        const amount = op.amount ?? 100;
        if (!finite(amount) || amount < 0 || amount > 100) { errors.push(`${at}: amount must be 0–100`); return; }
        const n = r.masks.length + 1;
        const name = op.name ?? `${op.shape.type === 'linear' ? 'Linear' : op.shape.type === 'radial' ? 'Radial' : 'Brush'} ${n}`;
        r.masks.push({ id, name, shape: structuredClone(op.shape), invert: !!op.invert, amount, adjust });
        createdMasks.push(id);
        return;
      }
      case 'updateMask': {
        const m = r.masks.find(x => x.id === op.id);
        if (!m) { errors.push(`${at}: no mask "${op.id}"`); return; }
        if (op.shape) {
          const problem = validShape(op.shape);
          if (problem) { errors.push(`${at}: ${problem}`); return; }
          if (op.shape.type !== m.shape.type) { errors.push(`${at}: a mask cannot change type`); return; }
          m.shape = structuredClone(op.shape);
        }
        if (op.name !== undefined) m.name = String(op.name).slice(0, 40) || m.name;
        if (op.invert !== undefined) m.invert = !!op.invert;
        if (op.amount !== undefined) {
          if (!finite(op.amount) || op.amount < 0 || op.amount > 100) { errors.push(`${at}: amount must be 0–100`); return; }
          m.amount = op.amount;
        }
        return;
      }
      case 'removeMask': {
        const i2 = r.masks.findIndex(x => x.id === op.id);
        if (i2 < 0) { errors.push(`${at}: no mask "${op.id}"`); return; }
        r.masks.splice(i2, 1);
        return;
      }
      case 'paintBrush': {
        const m = r.masks.find(x => x.id === op.mask);
        if (!m || m.shape.type !== 'brush') { errors.push(`${at}: "${op.mask}" is not a brush mask`); return; }
        if (!Array.isArray(op.strokes) || !op.strokes.every(s =>
          Array.isArray(s.points) && s.points.length > 0 && s.points.every(p => p.every(inUnit)) && finite(s.size) && s.size > 0 && s.size <= 1)) {
          errors.push(`${at}: strokes need points [[x, y], …] in 0–1 and size in (0, 1]`); return;
        }
        strokes.push({ mask: op.mask, strokes: op.strokes });
        return;
      }
      case 'reset': {
        const d = defaultRecipe();
        const scope = op.scope ?? 'all';
        if (scope === 'all' || scope === 'adjustments') { r.values = d.values; r.curves = d.curves; r.masks = []; }
        if (scope === 'all' || scope === 'geometry') r.geometry = d.geometry;
        return;
      }
      default:
        errors.push(`${at}: unknown op "${(op as { op?: string })?.op}"`);
    }
  });

  if (errors.length) return { ok: false, recipe, errors, changed: [], strokes: [], createdMasks: [] };
  return { ok: true, recipe: r, errors, changed, strokes, createdMasks };
}
