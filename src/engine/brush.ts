import type { BrushStroke } from './ops';

export const BRUSH_EDGE = 1024;

/** A brush mask's coverage, painted in original-image coordinates. White = selected. */
export class BrushLayer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  version = 0;

  constructor(imageW: number, imageH: number) {
    const s = BRUSH_EDGE / Math.max(imageW, imageH);
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(1, Math.round(imageW * s));
    this.canvas.height = Math.max(1, Math.round(imageH * s));
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.clear();
  }

  clear() {
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.version++;
  }

  dab(x: number, y: number, size: number, feather: number, erase: boolean) {
    const { width: w, height: h } = this.canvas;
    const r = Math.max(0.5, (size * Math.max(w, h)) / 2);
    const cx = x * w, cy = y * h;
    const g = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const c = erase ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${c},1)`);
    g.addColorStop(Math.max(0, Math.min(0.99, 1 - feather)), `rgba(${c},1)`);
    g.addColorStop(1, `rgba(${c},0)`);
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Dabs spaced along each segment so fast strokes stay continuous. */
  segment(a: [number, number], b: [number, number], size: number, feather: number, erase: boolean) {
    const { width: w, height: h } = this.canvas;
    const dist = Math.hypot((b[0] - a[0]) * w, (b[1] - a[1]) * h);
    const step = Math.max(1, (size * Math.max(w, h)) / 8);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.dab(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, size, feather, erase);
    }
    this.version++;
  }

  stroke(s: BrushStroke) {
    const f = s.feather ?? 0.5;
    const [first, ...rest] = s.points;
    this.dab(first[0], first[1], s.size, f, !!s.erase);
    let prev = first;
    for (const p of rest) { this.segment(prev, p, s.size, f, !!s.erase); prev = p; }
    this.version++;
  }

  snapshot(): ImageData {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  restore(data: ImageData | undefined) {
    if (data) this.ctx.putImageData(data, 0, 0); else this.clear();
    this.version++;
  }

  coverage(): number {
    const d = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 16) sum += d[i];
    return sum / (255 * (d.length / 16));
  }

  toBlob(): Promise<Blob> {
    return new Promise((res, rej) => this.canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not save brush mask'))), 'image/png'));
  }

  async load(blob: Blob) {
    const bmp = await createImageBitmap(blob);
    this.ctx.drawImage(bmp, 0, 0, this.canvas.width, this.canvas.height);
    this.version++;
  }
}
