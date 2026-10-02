// Card images for social previews (1200×630) and the daily email (600 CSS px wide, rendered at 2×).
//
// Arabic needs a real text engine (joined letterforms, diacritics), so the cards are drawn by
// headless Chromium, the same way the site draws its cards, then compressed with sharp.
//
// The images are served from img.durar.space (S3 + CloudFront) under content-hashed names worked
// out from each word's data (shared/cards.ts), so nothing is committed and nobody renders by hand:
//   • `npm run cards -- --upload` (CI, on every pull request and on main) checks which cards are
//     missing on img.durar.space, renders only those and uploads them (write-once);
//   • `npm run cards -- --check` fails if any word's card is missing there;
//   • `npm run cards` (optionally `-- --only=bahr,durar`) renders into .cards/ to look at locally.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_KINDS, CARD_SIZES as SIZES, HOME_CARD, IMAGE_ORIGIN, cardKey, cardStableKey } from '../shared/cards.ts';
import { checkOnHost, headOnHost, putOnce, s3 } from './lib/image-host.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_OUT = join(ROOT, '.cards');

const words = JSON.parse(readFileSync(join(ROOT, 'src/data/words.json'), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HOME = { slug: HOME_CARD, home: true };
/** cardKey/cardStableKey take the word, or HOME_CARD for the general card. */
const ref = (w) => (w.home ? HOME_CARD : w);

function fontFaces() {
  const f = (pkg, file) => `url(data:font/woff2;base64,${readFileSync(join(ROOT, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64')}) format('woff2')`;
  const AR = 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF';
  return `
    @font-face{font-family:Naskh;font-weight:600;src:${f('noto-naskh-arabic', 'noto-naskh-arabic-arabic-600-normal.woff2')};unicode-range:${AR}}
    @font-face{font-family:Naskh;font-weight:600;src:${f('noto-naskh-arabic', 'noto-naskh-arabic-latin-600-normal.woff2')};unicode-range:U+0000-024F}
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
    .ar{font:600 calc(var(--u)*160px)/1.6 Naskh;color:#f4efe3;direction:rtl;white-space:nowrap;
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

/** Renders each target at every size and hands the compressed PNG to `save(word, kind, png)`. */
async function render(targets, save) {
  const sharp = (await import('sharp')).default;
  const browser = await findBrowser();
  if (!browser) throw new Error('No Chromium found. Install one with `npx playwright install chromium` or set PW_CHROMIUM_PATH.');
  const started = Date.now();
  try {
    const pages = {};
    for (const kind of CARD_KINDS) {
      const { width, height, scale } = SIZES[kind];
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
      await page.setContent(pageHtml(fontFaces()), { waitUntil: 'load' });
      pages[kind] = page;
    }
    for (const w of targets) {
      for (const kind of CARD_KINDS) {
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
        const shot = await page.locator('.frame').screenshot({ type: 'png' });
        // Palette PNG: a fraction of the size, visually identical on these smooth gradients.
        await save(w, kind, await sharp(shot).png({ palette: true, quality: 90, effort: 8, dither: 1 }).toBuffer());
      }
    }
  } finally {
    await browser.close();
  }
  return Date.now() - started;
}

const cardKeys = (w) => CARD_KINDS.map((kind) => cardKey(kind, ref(w)));

/** Cards with any size missing on img.durar.space (asked through the public host; the CI key can't read S3). */
async function missingCards(targets, head = headOnHost) {
  const { missing, noCors } = await head(targets.flatMap(cardKeys));
  return { missing: targets.filter((w) => cardKeys(w).some((k) => missing.includes(k))), noCors };
}

async function upload(targets) {
  const client = await s3();
  const { missing } = await missingCards(targets);
  if (!missing.length) {
    console.log(`cards: all ${targets.length} cards are already on ${IMAGE_ORIGIN}.`);
    return;
  }
  console.log(`cards: ${missing.length} missing on ${IMAGE_ORIGIN} (${missing.slice(0, 8).map((w) => w.slug).join(', ')}${missing.length > 8 ? '…' : ''}).`);
  const ms = await render(missing, async (w, kind, png) => {
    // The hashed file never changes: written once, cached for a year. The stable copy only serves old links.
    await putOnce(client, cardKey(kind, ref(w)), png, 'image/png');
    await client.send({ Key: cardStableKey(kind, ref(w)), Body: png, ContentType: 'image/png', CacheControl: 'public, max-age=86400' });
  });
  console.log(`cards: rendered and uploaded ${missing.length} card(s) × ${CARD_KINDS.length} sizes in ${(ms / 1000).toFixed(1)} s.`);
}

async function main() {
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
  const targets = [...words, HOME].filter((w) => !only || only.includes(w.slug));
  if (process.argv.includes('--upload')) return upload(targets);
  if (process.argv.includes('--check')) {
    const { missing, noCors } = await missingCards(targets, checkOnHost);
    if (missing.length) {
      console.error(`cards: ${missing.length} missing on ${IMAGE_ORIGIN}: ${missing.map((w) => w.slug).join(', ')}.`);
      process.exit(1);
    }
    if (noCors.length) {
      console.error(`cards: ${IMAGE_ORIGIN} sends no Access-Control-Allow-Origin (e.g. ${noCors[0]}): add the SimpleCORS response headers policy in CloudFront.`);
      process.exit(1);
    }
    console.log(`cards: all ${targets.length} cards are on ${IMAGE_ORIGIN}.`);
    return;
  }
  const ms = await render(targets, (w, kind, png) => {
    const out = join(LOCAL_OUT, kind, `${w.slug}.png`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);
  });
  console.log(`cards: rendered ${targets.length} card(s) into .cards/ in ${(ms / 1000).toFixed(1)} s (nothing uploaded).`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
