/**
 * The edit recipe and the control registry.
 *
 * Every slider in the interface and every value the agent API accepts comes
 * from CONTROLS below. A control cannot exist on one side without the other.
 */

export type ControlGroup = 'Light' | 'Color' | 'Effects' | 'Color mixer' | 'Grading';

export interface Control {
  id: string;
  label: string;
  group: ControlGroup;
  min: number;
  max: number;
  default: number;
  step: number;
  unit?: string;
  /** Shown as a gradient track: the colour is the information. */
  track?: 'temperature' | 'tint' | 'hue' | 'saturation';
  /** Also adjustable inside a mask. */
  local?: boolean;
  meaning: string;
}

const tone = (id: string, label: string, meaning: string, local = true): Control => ({
  id, label, group: 'Light', min: -100, max: 100, default: 0, step: 1, local, meaning,
});

export const HSL_BANDS = [
  { id: 'red', label: 'Red', hue: 0 },
  { id: 'orange', label: 'Orange', hue: 30 },
  { id: 'yellow', label: 'Yellow', hue: 60 },
  { id: 'green', label: 'Green', hue: 120 },
  { id: 'aqua', label: 'Aqua', hue: 180 },
  { id: 'blue', label: 'Blue', hue: 240 },
  { id: 'purple', label: 'Purple', hue: 270 },
  { id: 'magenta', label: 'Magenta', hue: 310 },
] as const;
export type HslBand = (typeof HSL_BANDS)[number]['id'];

export const GRADE_RANGES = [
  { id: 'shadows', label: 'Shadows' },
  { id: 'midtones', label: 'Midtones' },
  { id: 'highlights', label: 'Highlights' },
] as const;

export const CONTROLS: Control[] = [
  { id: 'light.exposure', label: 'Exposure', group: 'Light', min: -5, max: 5, default: 0, step: 0.01, unit: 'EV', local: true,
    meaning: 'Brightens or darkens the whole tonal range, in stops.' },
  tone('light.contrast', 'Contrast', 'Separates or compresses darks and lights around the midtones.'),
  tone('light.highlights', 'Highlights', 'Recovers (negative) or brightens (positive) bright areas.'),
  tone('light.shadows', 'Shadows', 'Lifts (positive) or deepens (negative) dark areas.'),
  tone('light.whites', 'Whites', 'Moves the white point. Positive brightens the brightest tones.', false),
  tone('light.blacks', 'Blacks', 'Moves the black point. Positive lifts the darkest tones.', false),
  { id: 'color.temperature', label: 'Temperature', group: 'Color', min: -100, max: 100, default: 0, step: 1, track: 'temperature', local: true,
    meaning: 'Cooler (negative, blue) or warmer (positive, yellow). Relative for rendered photos.' },
  { id: 'color.tint', label: 'Tint', group: 'Color', min: -100, max: 100, default: 0, step: 1, track: 'tint', local: true,
    meaning: 'Greener (negative) or more magenta (positive).' },
  { id: 'color.vibrance', label: 'Vibrance', group: 'Color', min: -100, max: 100, default: 0, step: 1,
    meaning: 'Saturation that affects muted colours more than already-saturated ones.' },
  { id: 'color.saturation', label: 'Saturation', group: 'Color', min: -100, max: 100, default: 0, step: 1, track: 'saturation', local: true,
    meaning: 'Intensity of all colours equally. -100 is black and white.' },
  { id: 'effects.clarity', label: 'Clarity', group: 'Effects', min: -100, max: 100, default: 0, step: 1, local: true,
    meaning: 'Local midtone contrast. Positive adds punch; negative softens.' },
  { id: 'effects.sharpen', label: 'Sharpening', group: 'Effects', min: 0, max: 100, default: 0, step: 1,
    meaning: 'Edge sharpening. Judge at full size; the preview is approximate.' },
  { id: 'effects.vignette', label: 'Vignette', group: 'Effects', min: -100, max: 100, default: 0, step: 1,
    meaning: 'Darkens (negative) or lightens (positive) the edges of the frame.' },
  ...HSL_BANDS.flatMap(b => [
    { id: `hsl.${b.id}.hue`, label: 'Hue', group: 'Color mixer' as const, min: -100, max: 100, default: 0, step: 1,
      meaning: `Shifts ${b.label.toLowerCase()} tones toward neighbouring hues.` },
    { id: `hsl.${b.id}.saturation`, label: 'Saturation', group: 'Color mixer' as const, min: -100, max: 100, default: 0, step: 1,
      meaning: `Intensity of ${b.label.toLowerCase()} tones.` },
    { id: `hsl.${b.id}.luminance`, label: 'Luminance', group: 'Color mixer' as const, min: -100, max: 100, default: 0, step: 1,
      meaning: `Brightness of ${b.label.toLowerCase()} tones.` },
  ]),
  ...GRADE_RANGES.flatMap(r => [
    { id: `grading.${r.id}.hue`, label: 'Hue', group: 'Grading' as const, min: 0, max: 360, default: 0, step: 1, unit: '°', track: 'hue' as const,
      meaning: `Colour added to the ${r.label.toLowerCase()}.` },
    { id: `grading.${r.id}.saturation`, label: 'Saturation', group: 'Grading' as const, min: 0, max: 100, default: 0, step: 1,
      meaning: `How strongly the ${r.label.toLowerCase()} colour is applied.` },
  ]),
  { id: 'grading.balance', label: 'Balance', group: 'Grading', min: -100, max: 100, default: 0, step: 1,
    meaning: 'Shifts the split between shadows and highlights. Positive favours highlights.' },
  { id: 'grading.blending', label: 'Blending', group: 'Grading', min: 0, max: 100, default: 50, step: 1,
    meaning: 'How much the tonal ranges overlap.' },
];

export const CONTROL_BY_ID = new Map(CONTROLS.map(c => [c.id, c]));
export const LOCAL_CONTROLS = CONTROLS.filter(c => c.local);

export type CurveChannel = 'rgb' | 'r' | 'g' | 'b';
export type CurvePoint = [number, number];
export type Curves = Record<CurveChannel, CurvePoint[]>;

export interface Crop { x: number; y: number; w: number; h: number }
export interface Geometry {
  /** Quarter turns clockwise. */
  rotate: 0 | 1 | 2 | 3;
  flipH: boolean;
  /** Normalized to the rotated, flipped image. */
  crop: Crop;
}

export type MaskType = 'linear' | 'radial' | 'brush';
/** Positions are normalized 0–1 in the original image (after EXIF orientation, before crop). */
export interface LinearMask { type: 'linear'; from: [number, number]; to: [number, number] }
export interface RadialMask { type: 'radial'; center: [number, number]; radius: [number, number]; feather: number }
export interface BrushMask { type: 'brush' }
export type MaskShape = LinearMask | RadialMask | BrushMask;

export interface Mask {
  id: string;
  name: string;
  shape: MaskShape;
  invert: boolean;
  /** 0–100 */
  amount: number;
  adjust: Record<string, number>;
}

export interface Recipe {
  version: 1;
  values: Record<string, number>;
  curves: Curves;
  geometry: Geometry;
  masks: Mask[];
}

export const MAX_MASKS = 4;
export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };
export const IDENTITY_CURVE: CurvePoint[] = [[0, 0], [1, 1]];

export function defaultRecipe(): Recipe {
  return {
    version: 1,
    values: Object.fromEntries(CONTROLS.map(c => [c.id, c.default])),
    curves: { rgb: [...IDENTITY_CURVE], r: [...IDENTITY_CURVE], g: [...IDENTITY_CURVE], b: [...IDENTITY_CURVE] },
    geometry: { rotate: 0, flipH: false, crop: { ...FULL_CROP } },
    masks: [],
  };
}

export function value(recipe: Recipe, id: string): number {
  return recipe.values[id] ?? CONTROL_BY_ID.get(id)?.default ?? 0;
}

export function maskValue(mask: Mask, id: string): number {
  return mask.adjust[id] ?? 0;
}

export function isDefault(recipe: Recipe): boolean {
  const d = defaultRecipe();
  return JSON.stringify({ ...recipe, geometry: null }) === JSON.stringify({ ...d, geometry: null });
}

export function cloneRecipe(r: Recipe): Recipe {
  return structuredClone(r);
}

/** Older or hand-written recipes are filled in with defaults. */
export function normalizeRecipe(input: unknown): Recipe {
  const base = defaultRecipe();
  if (!input || typeof input !== 'object') return base;
  const r = input as Partial<Recipe>;
  for (const [k, v] of Object.entries(r.values ?? {})) {
    const c = CONTROL_BY_ID.get(k);
    if (c && Number.isFinite(v)) base.values[k] = Math.min(c.max, Math.max(c.min, v));
  }
  if (r.curves) for (const ch of ['rgb', 'r', 'g', 'b'] as const) {
    if (Array.isArray(r.curves[ch]) && r.curves[ch].length >= 2) base.curves[ch] = r.curves[ch];
  }
  if (r.geometry) base.geometry = { ...base.geometry, ...r.geometry };
  if (Array.isArray(r.masks)) base.masks = r.masks.slice(0, MAX_MASKS);
  return base;
}

/** Hue (degrees) to an RGB colour of unit saturation — for grading and hue tracks. */
export function hueToRgb(h: number): [number, number, number] {
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5), f(3), f(1)];
}
