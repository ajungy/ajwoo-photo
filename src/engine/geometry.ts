import type { Crop, Geometry } from './recipe';

/** Size of the rotated (not yet cropped) image. */
export function orientedSize(w: number, h: number, g: Geometry): [number, number] {
  return g.rotate % 2 ? [h, w] : [w, h];
}

/** Size of the final output. */
export function outputSize(w: number, h: number, g: Geometry, crop: Crop = g.crop): [number, number] {
  const [ow, oh] = orientedSize(w, h, g);
  return [Math.max(1, Math.round(ow * crop.w)), Math.max(1, Math.round(oh * crop.h))];
}

/** Oriented (rotated + flipped) normalized point → source normalized point. Mirrors the shader. */
export function orientedToSource([x, y]: [number, number], g: Geometry): [number, number] {
  if (g.flipH) x = 1 - x;
  switch (g.rotate) {
    case 1: return [y, 1 - x];
    case 2: return [1 - x, 1 - y];
    case 3: return [1 - y, x];
    default: return [x, y];
  }
}

export function sourceToOriented([x, y]: [number, number], g: Geometry): [number, number] {
  let o: [number, number];
  switch (g.rotate) {
    case 1: o = [1 - y, x]; break;
    case 2: o = [1 - x, 1 - y]; break;
    case 3: o = [y, 1 - x]; break;
    default: o = [x, y];
  }
  if (g.flipH) o[0] = 1 - o[0];
  return o;
}

/** Output (cropped view) normalized point → source normalized point. */
export function viewToSource(p: [number, number], g: Geometry, crop: Crop = g.crop): [number, number] {
  return orientedToSource([crop.x + p[0] * crop.w, crop.y + p[1] * crop.h], g);
}

export function sourceToView(p: [number, number], g: Geometry, crop: Crop = g.crop): [number, number] {
  const o = sourceToOriented(p, g);
  return [(o[0] - crop.x) / crop.w, (o[1] - crop.y) / crop.h];
}
