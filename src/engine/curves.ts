import type { CurvePoint, Curves } from './recipe';

/** Monotone cubic (Fritsch–Carlson) interpolation: no overshoot between points. */
export function curveFn(points: CurvePoint[]): (x: number) => number {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  const n = p.length;
  if (n < 2) return x => x;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(p[i + 1][0] - p[i][0]);
    m.push((p[i + 1][1] - p[i][1]) / (dx[i] || 1e-6));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  return (x: number) => {
    if (x <= p[0][0]) return p[0][1];
    if (x >= p[n - 1][0]) return p[n - 1][1];
    let i = 0;
    while (i < n - 2 && x > p[i + 1][0]) i++;
    const h = dx[i], u = (x - p[i][0]) / h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * h * t[i]
      + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * h * t[i + 1];
  };
}

export const LUT_SIZE = 1024;

/** RGBA8 lookup table: per channel, channel curve applied after the master curve. */
export function buildLut(curves: Curves): Uint8Array {
  const master = curveFn(curves.rgb);
  const ch = [curveFn(curves.r), curveFn(curves.g), curveFn(curves.b)];
  const out = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const v = master(i / (LUT_SIZE - 1));
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(Math.min(1, Math.max(0, ch[c](Math.min(1, Math.max(0, v))))) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
