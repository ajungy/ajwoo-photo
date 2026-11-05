import { describe, expect, it } from 'vitest';
import { applyOps } from '../src/engine/ops';
import { defaultRecipe, CONTROLS } from '../src/engine/recipe';
import { curveFn, buildLut } from '../src/engine/curves';
import { orientedToSource, sourceToOriented, sourceToView, viewToSource } from '../src/engine/geometry';

describe('edit ops', () => {
  it('applies a valid batch and reports resolved values', () => {
    const r = applyOps(defaultRecipe(), [
      { op: 'set', control: 'light.exposure', value: 0.5 },
      { op: 'adjust', control: 'light.exposure', delta: 0.25 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.recipe.values['light.exposure']).toBe(0.75);
    expect(r.changed.at(-1)).toEqual({ target: 'global', control: 'light.exposure', value: 0.75 });
  });

  it('rejects the whole batch when one op is invalid, without clamping', () => {
    const base = defaultRecipe();
    const r = applyOps(base, [
      { op: 'set', control: 'light.contrast', value: 20 },
      { op: 'set', control: 'light.exposure', value: 9 },
      { op: 'set', control: 'nope', value: 1 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
    expect(r.recipe).toBe(base);
  });

  it('creates masks and edits inside them', () => {
    const r = applyOps(defaultRecipe(), [
      { op: 'addMask', id: 'sky', shape: { type: 'linear', from: [0.5, 0], to: [0.5, 0.5] } },
      { op: 'set', target: 'sky', control: 'light.exposure', value: -0.5 },
    ]);
    expect(r.ok).toBe(true);
    expect(r.recipe.masks[0].adjust['light.exposure']).toBe(-0.5);
    const bad = applyOps(r.recipe, [{ op: 'set', target: 'sky', control: 'light.whites', value: 10 }]);
    expect(bad.ok).toBe(false);
  });

  it('validates curves', () => {
    expect(applyOps(defaultRecipe(), [{ op: 'setCurve', channel: 'rgb', points: [[0, 0], [0.5, 0.6], [1, 1]] }]).ok).toBe(true);
    expect(applyOps(defaultRecipe(), [{ op: 'setCurve', channel: 'rgb', points: [[0, 0], [0, 1]] }]).ok).toBe(false);
  });

  it('has a unique id for every control and defaults inside range', () => {
    expect(new Set(CONTROLS.map(c => c.id)).size).toBe(CONTROLS.length);
    for (const c of CONTROLS) expect(c.default >= c.min && c.default <= c.max).toBe(true);
  });
});

describe('curves', () => {
  it('identity stays identity and does not overshoot', () => {
    const f = curveFn([[0, 0], [1, 1]]);
    expect(f(0.3)).toBeCloseTo(0.3);
    const g = curveFn([[0, 0], [0.5, 0.9], [1, 1]]);
    for (let x = 0; x <= 1; x += 0.05) expect(g(x)).toBeLessThanOrEqual(1.0001);
    expect(buildLut({ rgb: [[0, 0], [1, 1]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] })[4 * 1023]).toBe(255);
  });
});

describe('geometry', () => {
  it('round-trips points for every rotation and flip', () => {
    for (const rotate of [0, 1, 2, 3] as const) for (const flipH of [false, true]) {
      const g = { rotate, flipH, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } };
      const p: [number, number] = [0.3, 0.7];
      const back = sourceToOriented(orientedToSource(p, g), g);
      expect(back[0]).toBeCloseTo(p[0]); expect(back[1]).toBeCloseTo(p[1]);
      const v = sourceToView(viewToSource(p, g), g);
      expect(v[0]).toBeCloseTo(p[0]); expect(v[1]).toBeCloseTo(p[1]);
    }
  });
});
