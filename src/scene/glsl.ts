/** Shared GLSL: the water gradient is used by the backdrop and as the “fog” colour of every card,
 *  so distant objects dissolve into exactly the colour of the water behind them. */
export const WATER_GLSL = /* glsl */ `
  uniform vec2 uResolution;
  uniform float uTime;

  vec3 waterColor(vec2 uv) {
    vec3 deep = vec3(0.006, 0.022, 0.048);
    vec3 mid = vec3(0.015, 0.095, 0.14);
    vec3 glow = vec3(0.19, 0.58, 0.62);
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    vec3 col = mix(deep, mid, smoothstep(0.0, 0.85, uv.y));
    // Sunlight entering from above, slowly wandering.
    float cx = 0.5 + 0.08 * sin(uTime * 0.05);
    vec2 d = vec2((uv.x - cx) * aspect * 0.9, (uv.y - 1.12) * 1.25);
    float g = exp(-dot(d, d) * 1.6);
    col = mix(col, glow, g * 0.62);
    // Edges fall away into the deep.
    vec2 v = (uv - vec2(0.5, 0.62)) * vec2(aspect * 0.55, 1.0);
    col *= 1.0 - 0.6 * smoothstep(0.25, 1.1, length(v));
    return col;
  }
`;

export const NOISE_GLSL = /* glsl */ `
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
               mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  // Cheap caustic web: folded sine interference, sharpened.
  float caustic(vec2 p, float t) {
    vec2 q = p;
    float c = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      q += vec2(sin(q.y * 1.7 + t * (0.55 + fi * 0.1) + fi), cos(q.x * 1.9 - t * (0.45 + fi * 0.12)));
      c += 1.0 / length(vec2(sin(q.x * 1.3), cos(q.y * 1.1)) + 0.35);
    }
    c /= 3.0;
    return pow(clamp(c * 0.42, 0.0, 1.0), 3.0);
  }
`;
