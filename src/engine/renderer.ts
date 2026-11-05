import { FRAGMENT, VERTEX } from './shader';
import { buildLut, LUT_SIZE } from './curves';
import { outputSize } from './geometry';
import { GRADE_RANGES, HSL_BANDS, hueToRgb, MAX_MASKS, value, type Crop, type Recipe } from './recipe';

export interface RenderOptions {
  crop?: Crop;
  overlay?: number;
}

type Uniforms = Record<string, WebGLUniformLocation | null>;

/**
 * WebGL2 renderer. One instance per canvas. The same shader renders the
 * screen preview from a proxy texture and the export from the full image.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private u: Uniforms = {};
  private src: WebGLTexture | null = null;
  private srcSize: [number, number] = [1, 1];
  private lut: WebGLTexture;
  private lutKey = '';
  private brushes: WebGLTexture[] = [];
  private empty: WebGLTexture;
  readonly maxTexture: number;

  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('This browser does not support WebGL2, which ajwoo photo needs to edit photos.');
    this.gl = gl;
    this.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.program = this.link();
    const names = ['u_src', 'u_lut', 'u_brush0', 'u_brush1', 'u_brush2', 'u_brush3', 'u_srcSize', 'u_rotate', 'u_flip', 'u_crop',
      'u_outSize', 'u_lodClarity', 'u_lodSharp', 'u_tone', 'u_levels', 'u_color', 'u_fx', 'u_hsl', 'u_gradeShadow', 'u_gradeMid',
      'u_gradeHigh', 'u_gradeShape', 'u_maskCount', 'u_maskType', 'u_maskA', 'u_maskB', 'u_maskTone', 'u_maskColor', 'u_overlay'];
    for (const n of names) this.u[n] = gl.getUniformLocation(this.program, n);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.lut = this.texture(gl.LINEAR);
    this.empty = this.texture(gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    for (let i = 0; i < MAX_MASKS; i++) this.brushes.push(this.texture(gl.LINEAR));
  }

  private link(): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader failed: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Shader link failed: ' + gl.getProgramInfoLog(p));
    return p;
  }

  private texture(filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter === gl.LINEAR_MIPMAP_LINEAR ? gl.LINEAR : filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  setSource(image: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    if (this.src) gl.deleteTexture(this.src);
    this.src = this.texture(gl.LINEAR_MIPMAP_LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.srcSize = [width, height];
  }

  /** Brush masks are single-channel coverage images in source coordinates. */
  setBrush(index: number, image: TexImageSource | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.brushes[index]);
    if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  get hasSource() { return !!this.src; }

  render(recipe: Recipe, width: number, height: number, opts: RenderOptions = {}, brushIndex: (id: string) => number = () => -1) {
    const gl = this.gl, u = this.u;
    if (!this.src) return;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    const lutKey = JSON.stringify(recipe.curves);
    if (lutKey !== this.lutKey) {
      gl.bindTexture(gl.TEXTURE_2D, this.lut);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, LUT_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLut(recipe.curves));
      this.lutKey = lutKey;
    }

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.src); gl.uniform1i(u.u_src, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lut); gl.uniform1i(u.u_lut, 1);

    const v = (id: string) => value(recipe, id);
    const g = recipe.geometry;
    const crop = opts.crop ?? g.crop;
    const long = Math.max(...this.srcSize);
    gl.uniform2f(u.u_srcSize, this.srcSize[0], this.srcSize[1]);
    gl.uniform1i(u.u_rotate, g.rotate);
    gl.uniform1i(u.u_flip, g.flipH ? 1 : 0);
    gl.uniform4f(u.u_crop, crop.x, crop.y, crop.w, crop.h);
    gl.uniform2f(u.u_outSize, width, height);
    gl.uniform1f(u.u_lodClarity, Math.max(0, Math.log2(long / 48)));
    gl.uniform1f(u.u_lodSharp, Math.max(0.6, Math.log2(long / 1400)));
    gl.uniform4f(u.u_tone, v('light.exposure'), v('light.contrast') / 100, v('light.highlights') / 100, v('light.shadows') / 100);
    gl.uniform2f(u.u_levels, v('light.whites') / 100, v('light.blacks') / 100);
    gl.uniform4f(u.u_color, v('color.temperature') / 100, v('color.tint') / 100, v('color.vibrance') / 100, v('color.saturation') / 100);
    gl.uniform3f(u.u_fx, v('effects.clarity') / 100, v('effects.sharpen') / 100, v('effects.vignette') / 100);
    gl.uniform3fv(u.u_hsl, HSL_BANDS.flatMap(b => [v(`hsl.${b.id}.hue`) / 100, v(`hsl.${b.id}.saturation`) / 100, v(`hsl.${b.id}.luminance`) / 100]));

    const gradeVec = (range: string) => {
      const [r, gg, b] = hueToRgb(v(`grading.${range}.hue`));
      const s = v(`grading.${range}.saturation`) / 100 * 0.22;
      const m = 0.2126 * r + 0.7152 * gg + 0.0722 * b; // keep brightness roughly unchanged
      return [(r - m) * s, (gg - m) * s, (b - m) * s];
    };
    const [gs, gm, gh] = GRADE_RANGES.map(r => gradeVec(r.id));
    gl.uniform3fv(u.u_gradeShadow, gs);
    gl.uniform3fv(u.u_gradeMid, gm);
    gl.uniform3fv(u.u_gradeHigh, gh);
    gl.uniform2f(u.u_gradeShape, v('grading.balance') / 100, v('grading.blending') / 100);

    const masks = recipe.masks.slice(0, MAX_MASKS);
    const types: number[] = [], A: number[] = [], B: number[] = [], T: number[] = [], C: number[] = [];
    masks.forEach((m, i) => {
      const s = m.shape;
      types.push(s.type === 'linear' ? 0 : s.type === 'radial' ? 1 : 2);
      if (s.type === 'linear') A.push(...s.from, ...s.to);
      else if (s.type === 'radial') A.push(...s.center, ...s.radius);
      else A.push(0, 0, 0, 0);
      B.push(s.type === 'radial' ? s.feather : 0, (m.amount / 100) * (m.invert ? -1 : 1));
      const a = (id: string) => m.adjust[id] ?? 0;
      T.push(a('light.exposure'), a('light.contrast') / 100, a('light.highlights') / 100, a('light.shadows') / 100);
      C.push(a('color.temperature') / 100, a('color.tint') / 100, a('color.saturation') / 100, a('effects.clarity') / 100);
      gl.activeTexture(gl.TEXTURE2 + i);
      const bi = s.type === 'brush' ? brushIndex(m.id) : -1;
      gl.bindTexture(gl.TEXTURE_2D, bi >= 0 ? this.brushes[bi] : this.empty);
    });
    for (let i = masks.length; i < MAX_MASKS; i++) {
      types.push(0); A.push(0, 0, 0, 1); B.push(0, 0); T.push(0, 0, 0, 0); C.push(0, 0, 0, 0);
      gl.activeTexture(gl.TEXTURE2 + i); gl.bindTexture(gl.TEXTURE_2D, this.empty);
    }
    for (let i = 0; i < MAX_MASKS; i++) gl.uniform1i(u[`u_brush${i}`], 2 + i);
    gl.uniform1i(u.u_maskCount, masks.length);
    gl.uniform1iv(u.u_maskType, types);
    gl.uniform4fv(u.u_maskA, A);
    gl.uniform2fv(u.u_maskB, B);
    gl.uniform4fv(u.u_maskTone, T);
    gl.uniform4fv(u.u_maskColor, C);
    gl.uniform1i(u.u_overlay, opts.overlay ?? -1);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Render into an offscreen framebuffer and read the pixels back, top row first. */
  renderToPixels(recipe: Recipe, width: number, height: number, opts: RenderOptions = {}, brushIndex?: (id: string) => number): Uint8ClampedArray<ArrayBuffer> {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    try {
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('The graphics card could not allocate an image this large.');
      this.render(recipe, width, height, opts, brushIndex);
      const px = new Uint8ClampedArray(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const row = width * 4, tmp = new Uint8ClampedArray(row);
      for (let y = 0; y < height >> 1; y++) {
        const a = y * row, b = (height - 1 - y) * row;
        tmp.set(px.subarray(a, a + row)); px.copyWithin(a, b, b + row); px.set(tmp, b);
      }
      return px;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
    }
  }

  outputSize(recipe: Recipe, crop?: Crop) {
    return outputSize(this.srcSize[0], this.srcSize[1], recipe.geometry, crop);
  }
}
