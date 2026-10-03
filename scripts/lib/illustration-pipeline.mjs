// Restyles a public-domain plate into Durar line art: paper -> transparent, ink -> aqua (#cfeef0),
// square WebPs at PIPELINE.widths. sharp only decodes, crops, resizes, blurs and encodes; every
// per-pixel step is plain JS on raw buffers, so output is the same on any CI runner.
import sharp from 'sharp';
import { PIPELINE } from '../../shared/images.ts';

sharp.simd(false); // libvips SIMD paths change bytes by CPU; scalar is CPU-independent (+20% time)
sharp.concurrency(1);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Source size after EXIF rotation, and the crop box in source pixels (crop is percent: l, t, w, h). */
export async function cropBox(input, entry) {
  const meta = await sharp(input).metadata();
  const rot = (meta.orientation ?? 1) >= 5;
  const SW = rot ? meta.height : meta.width;
  const SH = rot ? meta.width : meta.height;
  const [l, t, w, h] = entry.crop ?? [0, 0, 100, 100];
  const left = Math.round((l / 100) * SW);
  const top = Math.round((t / 100) * SH);
  return {
    SW,
    SH,
    left,
    top,
    width: Math.min(SW - left, Math.round((w / 100) * SW)),
    height: Math.min(SH - top, Math.round((h / 100) * SH)),
  };
}

/**
 * @returns {{ files: { width: number, buf: Buffer }[], side: number, upscale: number, warnings: string[], source: [number, number], cropPx: number[] }}
 */
export async function restyle(input, entry, P = PIPELINE) {
  const st = P.styles[entry.style ?? 'ink'];
  const p = { lo: entry.lo ?? P.lo, hi: entry.hi ?? P.hi };
  const box = await cropBox(input, entry);
  const { data, info } = await sharp(input, { limitInputPixels: 4e8, failOn: 'error' })
    .rotate()
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize({ width: P.workMax, height: P.workMax, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .raw({ depth: 'uchar' })
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  const n = w * h;
  if (channels !== 3) throw new Error(`expected RGB, got ${channels} channels`);
  const scale = w / box.width; // source px -> work px

  // 1. per-channel darkness against the local paper colour (also white-balances yellowed paper)
  const D = [0, 1, 2].map((c) => {
    const g = new Float32Array(n);
    for (let i = 0; i < n; i++) g[i] = data[i * 3 + c];
    const bg = background(g, w, h, P.bg);
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = clamp01(1 - g[i] / Math.max(1, bg[i]));
    return d;
  });
  // 2. one darkness per pixel
  const dd = new Float32Array(n);
  const wt = { luma: [0.2126, 0.7152, 0.0722], green: [0, 1, 0], blue: [0, 0, 1] }[st.channel ?? 'luma'];
  for (let i = 0; i < n; i++) {
    const r = D[0][i], g = D[1][i], b = D[2][i];
    if (st.mode === 'ink') {
      const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      dd[i] = mx > 0.02 ? mn * smooth(P.gate[0], P.gate[1], mn / mx) : mn;
    } else dd[i] = wt[0] * r + wt[1] * g + wt[2] * b;
  }
  if (st.mode === 'colour' && st.detail) {
    const k = st.detail;
    const u8 = Buffer.from(Uint8Array.from(dd, (v) => Math.round(v * 255)));
    const { data: bl } = await sharp(u8, { raw: { width: w, height: h, channels: 1 } })
      .blur(Math.max(0.5, Math.max(w, h) * P.detailSigma))
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });
    const gain = 1 / (1 - k / 2);
    for (let i = 0; i < n; i++) dd[i] = clamp01((dd[i] - (k * bl[i]) / 255) * gain);
  }
  // 3. darkness -> alpha, then erase circles (percent of the unflipped source)
  const a = new Uint8Array(n);
  const span = p.hi - p.lo;
  for (let i = 0; i < n; i++) a[i] = Math.round(255 * Math.pow(clamp01((dd[i] - p.lo) / span), P.gamma));
  for (const [ex, ey, er] of entry.erase ?? []) {
    const cx = ((ex / 100) * box.SW - box.left) * scale;
    const cy = ((ey / 100) * box.SH - box.top) * scale;
    const rr = (er / 100) * box.SW * scale;
    for (let yy = Math.max(0, Math.floor(cy - rr)); yy < Math.min(h, cy + rr); yy++)
      for (let xx = Math.max(0, Math.floor(cx - rr)); xx < Math.min(w, cx + rr); xx++)
        if ((xx - cx) ** 2 + (yy - cy) ** 2 <= rr * rr) a[yy * w + xx] = 0;
  }
  // 4. trim to the art (mass-based, ignores specks), centre in a padded square, mirror if asked
  const bb = massBox(a, w, h, P.trimMass);
  if (!bb) throw new Error('no ink found: check crop, style or lo');
  const artW = bb.x1 - bb.x0 + 1, artH = bb.y1 - bb.y0 + 1;
  const side = Math.ceil(Math.max(artW, artH) / (1 - 2 * P.pad));
  const maxW = Math.max(...P.widths);
  const upscale = maxW / side;
  const warnings = [];
  if (upscale > P.maxUpscale)
    throw new Error(
      `the art is ${Math.max(artW, artH)} px after the crop; a ${maxW} px image needs at least ${Math.ceil((maxW / P.maxUpscale) * (1 - 2 * P.pad))} px. Use a larger file on Commons or a looser crop`,
    );
  if (upscale > 1) warnings.push(`enlarged ${upscale.toFixed(2)}x (art ${Math.max(artW, artH)} px)`);
  const sq = new Uint8Array(side * side);
  const ox = (side - artW) >> 1, oy = (side - artH) >> 1;
  for (let y = 0; y < artH; y++) {
    const row = a.subarray((bb.y0 + y) * w + bb.x0, (bb.y0 + y) * w + bb.x1 + 1);
    if (entry.flip) for (let x = 0; x < artW; x++) sq[(oy + y) * side + (side - 1 - ox - x)] = row[x];
    else sq.set(row, (oy + y) * side + ox);
  }
  // 5. per width: resize the mask, lift hairlines, fill with the tint, encode
  const files = [];
  for (const W of P.widths) {
    const { data: m } = await sharp(sq, { raw: { width: side, height: side, channels: 1 } })
      .resize(W, W, { kernel: P.kernel })
      .toColourspace('b-w') // else sharp returns 3 channels
      .raw()
      .toBuffer({ resolveWithObject: true });
    const L = P.lift[W] ?? 1;
    const lut = Uint8Array.from({ length: 256 }, (_, v) => Math.round(255 * Math.pow(v / 255, L)));
    const rgba = Buffer.alloc(W * W * 4);
    for (let i = 0; i < W * W; i++) {
      rgba[i * 4] = P.tint[0];
      rgba[i * 4 + 1] = P.tint[1];
      rgba[i * 4 + 2] = P.tint[2];
      rgba[i * 4 + 3] = lut[m[i]];
    }
    files.push({ width: W, buf: await sharp(rgba, { raw: { width: W, height: W, channels: 4 } }).webp(P.webp).toBuffer() });
  }
  return { files, side, upscale, warnings, source: [box.SW, box.SH], cropPx: [box.left, box.top, box.width, box.height] };
}

/** Paper level per pixel: block 90th percentile -> grey closing (max then min) -> gaussian -> bilinear upsample. */
function background(g, w, h, { blocks, percentile, close, sigma }) {
  const B = Math.max(4, Math.round(Math.max(w, h) / blocks)), gw = Math.ceil(w / B), gh = Math.ceil(h / B);
  let grid = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      hist.fill(0);
      let cnt = 0;
      for (let y = by * B; y < Math.min(h, by * B + B); y++)
        for (let x = bx * B; x < Math.min(w, bx * B + B); x++) {
          hist[Math.round(g[y * w + x])]++;
          cnt++;
        }
      let k = 0, acc = 0;
      while (k < 255 && acc + hist[k] < cnt * percentile) acc += hist[k++];
      grid[by * gw + bx] = k;
    }
  const pass = (src, horiz, R, f) => {
    const o = new Float32Array(src.length);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) o[y * gw + x] = f(src, x, y, horiz, R);
    return o;
  };
  const at = (src, x, y) => src[Math.min(gh - 1, Math.max(0, y)) * gw + Math.min(gw - 1, Math.max(0, x))];
  const ext = (fn) => (src, x, y, horiz, R) => {
    let v = src[y * gw + x];
    for (let d = -R; d <= R; d++) v = fn(v, horiz ? at(src, x + d, y) : at(src, x, y + d));
    return v;
  };
  for (const fn of [Math.max, Math.min]) grid = pass(pass(grid, true, close, ext(fn)), false, close, ext(fn));
  const R = Math.ceil(sigma * 3);
  const ker = Array.from({ length: 2 * R + 1 }, (_, i) => Math.exp(-((i - R) ** 2) / (2 * sigma * sigma)));
  const ks = ker.reduce((s, v) => s + v, 0);
  const gauss = (src, x, y, horiz) => {
    let s = 0;
    for (let d = -R; d <= R; d++) s += ker[d + R] * (horiz ? at(src, x + d, y) : at(src, x, y + d));
    return s / ks;
  };
  grid = pass(pass(grid, true, R, gauss), false, R, gauss);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / B - 0.5)), y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / B - 0.5)), x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
      const top = grid[y0 * gw + x0] + (grid[y0 * gw + x1] - grid[y0 * gw + x0]) * tx;
      const bot = grid[y1 * gw + x0] + (grid[y1 * gw + x1] - grid[y1 * gw + x0]) * tx;
      out[y * w + x] = top + (bot - top) * ty;
    }
  }
  return out;
}

/** Bounding box that drops the outermost `frac` of alpha mass on each side. */
function massBox(a, w, h, frac) {
  const col = new Float64Array(w), row = new Float64Array(h);
  let tot = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = a[y * w + x];
      col[x] += v;
      row[y] += v;
      tot += v;
    }
  if (tot === 0) return null;
  const lim = tot * frac;
  const edge = (arr, fwd) => {
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      const j = fwd ? i : arr.length - 1 - i;
      s += arr[j];
      if (s > lim) return j;
    }
    return fwd ? 0 : arr.length - 1;
  };
  return { x0: edge(col, true), x1: edge(col, false), y0: edge(row, true), y1: edge(row, false) };
}

/**
 * Review sheet (JPEG, 1800x620): source with a labelled 10% grid, the crop box and erase circles |
 * the 960 result on the sea | a card with the art at ILLUSTRATION_ALPHA.behindText plus the 96 px Credits tile.
 */
export async function contactSheet(input, entry, result, behindText = 0.18) {
  const H = 600;
  const src = await sharp(input, { limitInputPixels: 4e8 }).rotate().resize({ height: H, width: 760, fit: 'inside' }).flatten({ background: '#fff' }).jpeg().toBuffer({ resolveWithObject: true });
  const sw = src.info.width, sh = src.info.height;
  const k = sw / result.source[0];
  const [cl, ct, cw, ch] = result.cropPx.map((v) => v * k);
  const lines = [];
  for (let i = 1; i < 10; i++) {
    const x = (sw * i) / 10, y = (sh * i) / 10;
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${sh}"/><line x1="0" y1="${y}" x2="${sw}" y2="${y}"/>`);
    lines.push(`<text x="${x + 2}" y="12">${i * 10}</text><text x="2" y="${y - 2}">${i * 10}</text>`);
  }
  const circles = (entry.erase ?? []).map(([x, y, r]) => `<circle cx="${(x / 100) * sw}" cy="${(y / 100) * sh}" r="${(r / 100) * sw}" fill="none" stroke="#f0f" stroke-width="2"/>`);
  const grid = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}"><g stroke="#00a0ff" stroke-opacity=".7" stroke-width="1" font-family="DejaVu Sans,sans-serif" font-size="11" fill="#0060c0">${lines.join('')}</g>` +
      `<rect x="${cl}" y="${ct}" width="${cw}" height="${ch}" fill="none" stroke="#ff2a2a" stroke-width="3"/>${circles.join('')}</svg>`,
  );
  const big = result.files.at(-1).buf;
  const art = await sharp(big).resize(H).png().toBuffer();
  const faded = async (size, op) => {
    const { data, info } = await sharp(big).resize(size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * op);
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  };
  const card = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${H}"><defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#123641"/><stop offset=".78" stop-color="#07161e"/></linearGradient></defs><rect width="420" height="${H}" fill="#031520"/><rect x="10" y="10" width="400" height="${H - 20}" rx="24" fill="url(#c)"/><rect x="304" y="${H - 116}" width="96" height="96" rx="12" fill="#03131d"/></svg>`,
  );
  const tile = await sharp(result.files[0].buf).resize(96).png().toBuffer();
  return sharp({ create: { width: 1800, height: H + 20, channels: 3, background: '#031520' } })
    .composite([
      { input: src.data, left: 10, top: 10 },
      { input: grid, left: 10, top: 10 },
      { input: art, left: 780, top: 10 },
      { input: card, left: 1380, top: 10 },
      { input: await faded(380, behindText), left: 1400, top: 120 },
      { input: tile, left: 1380 + 304, top: 10 + H - 116 },
    ])
    .jpeg({ quality: 82 })
    .toBuffer();
}
