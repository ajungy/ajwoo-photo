export const VERTEX = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/**
 * One pass, fixed order (the order sliders are moved never matters):
 * geometry → sharpen → global tone/colour → masks → colour mixer → grading → curves → vignette.
 * Tone work happens in a gamma-encoded perceptual space; white balance and
 * exposure happen in linear light.
 */
export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_src;
uniform sampler2D u_lut;
uniform sampler2D u_brush0;
uniform sampler2D u_brush1;
uniform sampler2D u_brush2;
uniform sampler2D u_brush3;

uniform vec2 u_srcSize;
uniform int u_rotate;
uniform bool u_flip;
uniform vec4 u_crop;
uniform vec2 u_outSize;
uniform float u_lodClarity;
uniform float u_lodSharp;

// x: exposure, y: contrast, z: highlights, w: shadows
uniform vec4 u_tone;
// x: whites, y: blacks
uniform vec2 u_levels;
// x: temperature, y: tint, z: vibrance, w: saturation
uniform vec4 u_color;
// x: clarity, y: sharpen, z: vignette
uniform vec3 u_fx;
uniform vec3 u_hsl[8];
uniform vec3 u_gradeShadow;
uniform vec3 u_gradeMid;
uniform vec3 u_gradeHigh;
uniform vec2 u_gradeShape; // balance, blending

uniform int u_maskCount;
uniform int u_maskType[4];     // 0 linear, 1 radial, 2 brush
uniform vec4 u_maskA[4];       // linear: from.xy, to.xy   radial: center.xy, radius.xy
uniform vec2 u_maskB[4];       // x: feather, y: amount (signed: negative = inverted)
uniform vec4 u_maskTone[4];    // exposure, contrast, highlights, shadows
uniform vec4 u_maskColor[4];   // temperature, tint, saturation, clarity
uniform int u_overlay;         // index of mask to tint, or -1

vec3 toLinear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toGamma(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 sourceUv(vec2 uv) {
  vec2 o = u_crop.xy + uv * u_crop.zw;
  if (u_flip) o.x = 1.0 - o.x;
  if (u_rotate == 1) return vec2(o.y, 1.0 - o.x);
  if (u_rotate == 2) return vec2(1.0 - o.x, 1.0 - o.y);
  if (u_rotate == 3) return vec2(1.0 - o.y, o.x);
  return o;
}

// Shared by the whole photo and by each mask.
vec3 adjust(vec3 p, float localL, float exposure, float contrast, float highlights, float shadows,
            float temperature, float tint, float saturation, float clarity) {
  vec3 lin = toLinear(p);
  lin *= vec3(1.0 + temperature * 0.30, 1.0 - tint * 0.25, 1.0 - temperature * 0.30);
  lin *= exp2(exposure);
  p = toGamma(lin);

  float L = luma(p);
  float base = mix(L, localL, 0.6); // edge-aware-ish: weights follow the local area, not each pixel
  float hw = smoothstep(0.45, 1.0, base);
  float sw = 1.0 - smoothstep(0.0, 0.55, base);
  p += highlights * 0.30 * hw * (highlights < 0.0 ? L : (1.0 - L));
  p += shadows * 0.35 * sw * (shadows > 0.0 ? (1.0 - L) : L);

  if (contrast >= 0.0) {
    vec3 c = clamp(p, 0.0, 1.0);
    p = mix(p, c * c * (3.0 - 2.0 * c), contrast);
  } else {
    p = 0.5 + (p - 0.5) * (1.0 + contrast * 0.6);
  }

  p += (L - localL) * clarity * 0.9;

  float g = luma(p);
  p = g + (p - g) * (1.0 + saturation);
  return p;
}

vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5, d = mx - mn, h = 0.0, s = 0.0;
  if (d > 1e-5) {
    s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  t = fract(t);
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 h) {
  if (h.y < 1e-5) return vec3(h.z);
  float q = h.z < 0.5 ? h.z * (1.0 + h.y) : h.z + h.y - h.z * h.y;
  float p = 2.0 * h.z - q;
  return vec3(hue2rgb(p, q, h.x + 1.0 / 3.0), hue2rgb(p, q, h.x), hue2rgb(p, q, h.x - 1.0 / 3.0));
}

const float CENTERS[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 310.0);

vec3 colorMixer(vec3 p) {
  vec3 c = clamp(p, 0.0, 1.0);
  vec3 hsl = rgb2hsl(c);
  float deg = hsl.x * 360.0;
  float dh = 0.0, ds = 0.0, dl = 0.0, total = 0.0;
  for (int i = 0; i < 8; i++) {
    float d = abs(deg - CENTERS[i]);
    d = min(d, 360.0 - d);
    float w = max(0.0, 1.0 - d / 45.0);
    w = w * w * (3.0 - 2.0 * w);
    dh += u_hsl[i].x * w; ds += u_hsl[i].y * w; dl += u_hsl[i].z * w; total += w;
  }
  if (total > 1.0) { dh /= total; ds /= total; dl /= total; }
  float strength = smoothstep(0.02, 0.25, hsl.y);
  hsl.x = fract(hsl.x + dh * 30.0 / 360.0 * strength);
  hsl.y = clamp(hsl.y * (1.0 + ds * strength), 0.0, 1.0);
  vec3 outc = hsl2rgb(hsl);
  outc *= 1.0 + dl * 0.5 * strength;
  return p + (outc - c);
}

vec3 grade(vec3 p) {
  float L = clamp(luma(p), 0.0, 1.0);
  float pivot = 0.5 + u_gradeShape.x * 0.3;
  float width = 0.1 + u_gradeShape.y * 0.4;
  float sw = 1.0 - smoothstep(pivot - width, pivot, L);
  float hw = smoothstep(pivot, pivot + width, L);
  float mw = clamp(1.0 - sw - hw, 0.0, 1.0);
  return p + u_gradeShadow * sw + u_gradeMid * mw + u_gradeHigh * hw;
}

float maskWeight(int i, vec2 suv) {
  vec4 a = u_maskA[i];
  float w = 0.0;
  int t = u_maskType[i];
  if (t == 0) {
    vec2 asp = vec2(u_srcSize.x / u_srcSize.y, 1.0);
    vec2 d = (a.zw - a.xy) * asp;
    float k = dot(suv * asp - a.xy * asp, d) / max(dot(d, d), 1e-6);
    w = 1.0 - smoothstep(0.0, 1.0, k);
  } else if (t == 1) {
    float d = length((suv - a.xy) / max(a.zw, vec2(1e-4)));
    float f = max(u_maskB[i].x, 0.01);
    w = 1.0 - smoothstep(1.0 - f, 1.0, d);
  } else {
    if (i == 0) w = texture(u_brush0, suv).r;
    else if (i == 1) w = texture(u_brush1, suv).r;
    else if (i == 2) w = texture(u_brush2, suv).r;
    else w = texture(u_brush3, suv).r;
  }
  float amt = u_maskB[i].y;
  if (amt < 0.0) { w = 1.0 - w; amt = -amt; }
  return clamp(w, 0.0, 1.0) * amt;
}

void main() {
  vec2 suv = sourceUv(v_uv);
  vec3 p = texture(u_src, suv).rgb;
  vec3 blurSmall = textureLod(u_src, suv, u_lodSharp).rgb;
  float localL = luma(textureLod(u_src, suv, u_lodClarity).rgb);
  p += (p - blurSmall) * u_fx.y * 1.6;

  p = adjust(p, localL, u_tone.x, u_tone.y, u_tone.z, u_tone.w, u_color.x, u_color.y, u_color.w, u_fx.x);

  // Vibrance: lifts muted colours more than saturated ones.
  float mx = max(p.r, max(p.g, p.b)), mn = min(p.r, min(p.g, p.b));
  float g = luma(p);
  p = g + (p - g) * (1.0 + u_color.z * (1.0 - clamp(mx - mn, 0.0, 1.0)));

  // Levels: whites and blacks move the end points.
  float bp = -u_levels.y * 0.08;
  float wp = 1.0 - u_levels.x * 0.20;
  p = (p - bp) / max(wp - bp, 0.05);

  float overlayW = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= u_maskCount) break;
    float w = maskWeight(i, suv);
    if (i == u_overlay) overlayW = w;
    if (w <= 0.0) continue;
    vec4 mt = u_maskTone[i];
    vec4 mc = u_maskColor[i];
    vec3 q = adjust(p, localL + (luma(p) - luma(texture(u_src, suv).rgb)), mt.x, mt.y, mt.z, mt.w, mc.x, mc.y, mc.z, mc.w);
    p = mix(p, q, w);
  }

  p = colorMixer(p);
  p = grade(p);

  vec3 c = clamp(p, 0.0, 1.0);
  p = vec3(texture(u_lut, vec2(c.r, 0.5)).r, texture(u_lut, vec2(c.g, 0.5)).g, texture(u_lut, vec2(c.b, 0.5)).b);

  vec2 asp = vec2(u_outSize.x / max(u_outSize.y, 1.0), 1.0);
  float vd = length((v_uv - 0.5) * asp) / length(0.5 * asp);
  float vw = smoothstep(0.35, 1.05, vd);
  p *= 1.0 + u_fx.z * 0.85 * vw;

  if (u_overlay >= 0) p = mix(p, vec3(0.95, 0.18, 0.22), overlayW * 0.55);
  outColor = vec4(clamp(p, 0.0, 1.0), 1.0);
}`;
