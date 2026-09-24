// Card images for social previews (1200×630) and the daily email (600 CSS px wide, rendered at 2×).
//
// Arabic needs a real text engine (joined letterforms, diacritics), so the cards are drawn by
// headless Chromium, the same way the site draws its cards, then compressed with sharp.
//
// The PNGs are committed under public/cards/ with a manifest of content hashes, so:
//   • a build (e.g. on Vercel, which has no browser) just ships them, with no render cost;
//   • `npm run cards` re-renders only words whose text or the template changed;
//   • `npm run cards -- --check` (run in CI and before builds) fails if any image is stale.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/cards');
const MANIFEST = join(OUT, 'manifest.json');
/** Bump when the template changes to re-render everything. */
const TEMPLATE_VERSION = 4;

export const SIZES = {
  og: { width: 1200, height: 630, scale: 1 },
  email: { width: 600, height: 340, scale: 2 },
};

const words = JSON.parse(readFileSync(join(ROOT, 'src/data/words.json'), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Alt text used for og:image:alt, twitter:image:alt and the email <img>. */
export const cardAlt = (w) => `${w.ar} (${w.translit}): ${w.meanings[0]}`;

const hashWord = (w) =>
  createHash('sha256').update(JSON.stringify([TEMPLATE_VERSION, w.slug, w.ar, w.translit, w.meanings[0]])).digest('hex').slice(0, 16);
const HOME = { slug: 'durar', home: true };
const hashHome = () => createHash('sha256').update(`home:${TEMPLATE_VERSION}`).digest('hex').slice(0, 16);

function fontFaces() {
  const f = (pkg, file) => `url(data:font/woff2;base64,${readFileSync(join(ROOT, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64')}) format('woff2')`;
  const AR = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF';
  return `
    @font-face{font-family:Markazi;font-weight:600;src:${f('markazi-text', 'markazi-text-arabic-600-normal.woff2')};unicode-range:${AR}}
    @font-face{font-family:Markazi;font-weight:600;src:${f('markazi-text', 'markazi-text-latin-600-normal.woff2')};unicode-range:U+0000-024F}
    @font-face{font-family:Cormorant;font-weight:500;src:${f('cormorant-garamond', 'cormorant-garamond-latin-500-normal.woff2')};unicode-range:U+0000-00FF,U+2000-206F}
    @font-face{font-family:Cormorant;font-weight:500;src:${f('cormorant-garamond', 'cormorant-garamond-latin-ext-500-normal.woff2')};unicode-range:U+0100-02FF,U+1E00-1EFF}
    @font-face{font-family:Cormorant;font-weight:500;font-style:italic;src:${f('cormorant-garamond', 'cormorant-garamond-latin-500-italic.woff2')};unicode-range:U+0000-00FF,U+2000-206F}
    @font-face{font-family:Cormorant;font-weight:500;font-style:italic;src:${f('cormorant-garamond', 'cormorant-garamond-latin-ext-500-italic.woff2')};unicode-range:U+0100-02FF,U+1E00-1EFF}
    @font-face{font-family:Ruqaa;font-weight:700;src:${f('aref-ruqaa', 'aref-ruqaa-arabic-700-normal.woff2')};unicode-range:${AR}}
    @font-face{font-family:Ruqaa;font-weight:700;src:${f('aref-ruqaa', 'aref-ruqaa-latin-700-normal.woff2')};unicode-range:U+0000-024F}`;
}

function pageHtml(fonts) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fonts}
    *{box-sizing:border-box;margin:0}
    body{background:#020b14}
    .frame{position:relative;overflow:hidden;display:grid;place-items:center;
      background:
        radial-gradient(90% 70% at 50% -12%, rgba(64,170,178,.62), transparent 62%),
        linear-gradient(104deg, transparent 30%, rgba(150,230,230,.07) 36%, transparent 43%),
        linear-gradient(96deg, transparent 58%, rgba(150,230,230,.05) 63%, transparent 70%),
        radial-gradient(140% 110% at 50% 40%, #06283a 0%, #031520 55%, #01080f 100%)}
    .card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
      border-radius:calc(var(--u)*30px);
      background:
        radial-gradient(80% 55% at 28% 8%, rgba(150,200,210,.22), transparent 70%),
        linear-gradient(180deg,#123641,#07161e 78%);
      box-shadow:0 calc(var(--u)*30px) calc(var(--u)*80px) rgba(0,0,0,.55), inset 0 0 calc(var(--u)*60px) rgba(160,230,230,.06)}
    .card::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:calc(var(--u)*2.2px);
      background:conic-gradient(from 210deg,#f6d8ff,#c8fff4,#fff4d8,#d8e8ff,#ffd8ec,#c8fff4,#f6d8ff);
      -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.8}
    .tr{font:italic 500 calc(var(--u)*34px)/1 Cormorant;letter-spacing:.06em;color:rgba(214,232,236,.82);margin-bottom:calc(var(--u)*22px)}
    .ar{font:600 calc(var(--u)*170px)/1.3 Markazi;color:#f4efe3;direction:rtl;white-space:nowrap;
      text-shadow:0 0 calc(var(--u)*30px) rgba(170,235,240,.35)}
    .rule{position:relative;width:32%;height:calc(var(--u)*1.6px);margin:calc(var(--u)*6px) 0 calc(var(--u)*22px);
      background:linear-gradient(90deg,transparent,rgba(220,240,240,.6),transparent)}
    .rule::after{content:"";position:absolute;left:50%;top:50%;width:calc(var(--u)*11px);height:calc(var(--u)*11px);border-radius:50%;
      transform:translate(-50%,-50%);background:radial-gradient(circle at 36% 30%,#fff,#dcecee 45%,#7fa9b1)}
    .en{font:500 calc(var(--u)*44px)/1.25 Cormorant;color:#f4efe3;max-width:78%;text-wrap:balance}
    .card:not(.home .card){padding-bottom:calc(var(--u)*36px)}
    .sig{position:absolute;right:calc(var(--u)*34px);bottom:calc(var(--u)*22px);display:flex;align-items:baseline;gap:calc(var(--u)*8px);
      font:700 calc(var(--u)*30px)/1 Ruqaa;color:rgba(240,236,226,.5);transform:rotate(-4deg)}
    .sig small{font-size:.62em;opacity:.8}
    .home .ar{font:700 calc(var(--u)*190px)/1.25 Ruqaa;background:linear-gradient(100deg,#f7f1e6 10%,#cfeef0 40%,#f0d9f2 65%,#f7f1e6 90%);
      -webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none}
    .home .en{font-style:italic;letter-spacing:.08em;color:rgba(214,232,236,.85)}
  </style></head><body><div id="root"></div></body></html>`;
}

function cardHtml(w, kind) {
  const { width, height } = SIZES[kind];
  // Layout unit: 1 at 1200 px wide.
  const u = width / 1200;
  const inner = kind === 'og' ? { w: width - 120, h: height - 90 } : { w: width - 36, h: height - 36 };
  const unit = kind === 'og' ? u : u * 1.3;
  const body = w.home
    ? `<div class="ar" lang="ar">دُرَر</div><div class="rule"></div><p class="en">Arabic words, like pearls</p>`
    : `<p class="tr">${esc(w.translit)}</p><div class="ar" lang="ar">${esc(w.ar)}</div><div class="rule"></div><p class="en">${esc(w.meanings[0])}</p>
       <div class="sig" aria-hidden="true"><span lang="ar">دُرَر</span><small>Durar</small></div>`;
  return `<div class="frame ${w.home ? 'home' : ''}" style="--u:${unit};width:${width}px;height:${height}px">
    <div class="card" style="width:${inner.w}px;height:${inner.h}px">${body}</div></div>`;
}

async function findBrowser() {
  const { chromium } = await import('playwright');
  const candidates = [process.env.PW_CHROMIUM_PATH, (() => { try { return chromium.executablePath(); } catch { return undefined; } })()];
  const executablePath = candidates.find((p) => p && existsSync(p));
  if (!executablePath) return null;
  return chromium.launch({ executablePath });
}

async function render(targets) {
  const sharp = (await import('sharp')).default;
  const browser = await findBrowser();
  if (!browser) throw new Error('No Chromium found. Install one with `npx playwright install chromium` or set PW_CHROMIUM_PATH.');
  const started = Date.now();
  try {
    const pages = {};
    for (const kind of Object.keys(SIZES)) {
      const { width, height, scale } = SIZES[kind];
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
      await page.setContent(pageHtml(fontFaces()), { waitUntil: 'load' });
      pages[kind] = page;
    }
    for (const w of targets) {
      for (const kind of Object.keys(SIZES)) {
        const page = pages[kind];
        await page.evaluate((html) => (document.getElementById('root').innerHTML = html), cardHtml(w, kind));
        await page.evaluate(async () => {
          await document.fonts.ready;
          // Shrink the headword until it fits the card.
          const ar = document.querySelector('.ar');
          const card = document.querySelector('.card');
          let size = parseFloat(getComputedStyle(ar).fontSize);
          while (ar.scrollWidth > card.clientWidth * 0.84 && size > 20) {
            size *= 0.94;
            ar.style.fontSize = `${size}px`;
          }
        });
        const png = await page.locator('.frame').screenshot({ type: 'png' });
        const out = join(OUT, kind, `${w.slug}.png`);
        mkdirSync(dirname(out), { recursive: true });
        // Palette PNG: a fraction of the size, visually identical on these smooth gradients.
        await sharp(png).png({ palette: true, quality: 90, effort: 8, dither: 1 }).toFile(out);
      }
    }
  } finally {
    await browser.close();
  }
  return Date.now() - started;
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    return { words: {} };
  }
}

async function main() {
  const check = process.argv.includes('--check');
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  if (only) {
    const ms = await render([...words, HOME].filter((w) => only.includes(w.slug)));
    console.log(`cards: rendered ${only.join(', ')} in ${ms} ms (manifest untouched).`);
    return;
  }
  const all = process.argv.includes('--all');
  const manifest = readManifest();
  const wanted = { ...Object.fromEntries(words.map((w) => [w.slug, hashWord(w)])), [HOME.slug]: hashHome() };
  const stale = [...words, HOME].filter((w) => {
    if (all || manifest.words[w.slug] !== wanted[w.slug]) return true;
    return !Object.keys(SIZES).every((k) => existsSync(join(OUT, k, `${w.slug}.png`)));
  });
  const removed = Object.keys(manifest.words).filter((s) => !(s in wanted));

  if (check) {
    if (stale.length || removed.length) {
      console.error(`cards: ${stale.length} missing or out of date (${stale.slice(0, 5).map((w) => w.slug).join(', ')}…). Run \`npm run cards\` and commit public/cards.`);
      process.exit(1);
    }
    console.log(`cards: all ${words.length} word images are up to date.`);
    return;
  }
  for (const slug of removed) for (const k of Object.keys(SIZES)) rmSync(join(OUT, k, `${slug}.png`), { force: true });
  if (!stale.length) {
    console.log('cards: nothing to render.');
  } else {
    const ms = await render(stale);
    console.log(`cards: rendered ${stale.length} card(s) × ${Object.keys(SIZES).length} sizes in ${(ms / 1000).toFixed(1)} s.`);
  }
  writeFileSync(MANIFEST, JSON.stringify({ template: TEMPLATE_VERSION, words: wanted }, null, 1) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
