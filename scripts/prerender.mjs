// Post-build step: writes a static, crawlable HTML page for every word at dist/word/<slug>/index.html
// (unique <title>, description, canonical, Open Graph / Twitter tags, JSON-LD and the card's text),
// plus sitemap.xml when SITE_URL is set. Live visitors get the same SPA, which boots into that word.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const words = JSON.parse(readFileSync(join(root, 'src/data/words.json'), 'utf8'));
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const SITE = (process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.URL || '').replace(/\/$/, '');
const site = SITE && !/^https?:\/\//.test(SITE) ? `https://${SITE}` : SITE;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HIDDEN = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';

const SITE_IMAGE = { path: '/cards/og/durar.png', alt: 'Durar (دُرَر): Arabic words, like pearls' };

/** og:image / twitter:image need absolute URLs, so they're only emitted when the site URL is known. */
function imageTags(image) {
  if (!site || !image) return [];
  const src = `${site}${image.path}`;
  return [
    `<meta property="og:image" content="${src}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(image.alt)}" />`,
    `<meta name="twitter:image" content="${src}" />`,
    `<meta name="twitter:image:alt" content="${esc(image.alt)}" />`,
  ];
}

function head({ title, description, path, type = 'article', extra = '', noindex = false, image = SITE_IMAGE }) {
  const url = site && !noindex ? `${site}${path}` : '';
  const images = noindex ? [] : imageTags(image);
  return [
    `<title>${esc(title)}</title>`,
    noindex && `<meta name="robots" content="noindex" />`,
    `<meta name="description" content="${esc(description)}" />`,
    url && `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="Durar · درر" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    url && `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:locale:alternate" content="ar_AR" />`,
    ...images.slice(0, 5),
    `<meta name="twitter:card" content="${images.length ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    ...images.slice(5),
    extra,
  ]
    .filter(Boolean)
    .join('\n    ');
}

function article(w) {
  const examples = w.examples
    .map(
      (ex) =>
        `<li><p lang="ar" dir="rtl">${esc(ex.ar)}</p><p>${esc(ex.en)}</p>${ex.source ? `<p>— ${esc(ex.source)}</p>` : ''}</li>`,
    )
    .join('');
  return `<article id="seo-word" style="${HIDDEN}">
      <p>${esc(w.translit)}</p>
      <h1 lang="ar" dir="rtl">${esc(w.ar)}</h1>
      <p>${esc(w.meanings.join('; '))}</p>
      <ul>${examples}</ul>
      <p><a href="/">Durar — more Arabic words</a></p>
    </article>`;
}

const inject = (html, headHtml, bodyHtml) =>
  html.replace(/<!--seo:start-->[\s\S]*<!--seo:end-->/, headHtml).replace('<!--seo:body-->', bodyHtml);

for (const w of words) {
  const title = `${w.ar} (${w.translit}) — ${w.meanings[0]} · Durar`;
  const ex = w.examples[0];
  const description = `${w.ar} (${w.translit}): ${w.meanings.join('; ')}. Example: ${ex.ar} — “${ex.en}”`;
  const path = `/word/${w.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: w.ar,
    alternateName: w.translit,
    description: w.meanings.join('; '),
    inLanguage: 'ar',
    ...(site && { url: `${site}${path}` }),
    inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'Durar · درر' },
  };
  const html = inject(
    template,
    head({ title, description, path, image: { path: `/cards/og/${w.slug}.png`, alt: `${w.ar} (${w.translit}): ${w.meanings[0]}` }, extra: `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` }),
    article(w),
  );
  const out = join(dist, 'word', w.slug, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
}

// App pages. The Library is personal: never indexed, never in the sitemap.
const pages = [
  {
    path: '/library',
    title: 'My Pearls · Durar',
    description: 'The Arabic words you have saved on Durar.',
    noindex: true,
  },
  {
    path: '/subscribe/confirm',
    title: 'Confirm your subscription · Durar',
    description: 'Confirm your Pearl of the Day email subscription.',
    noindex: true,
  },
  {
    path: '/unsubscribe',
    title: 'Unsubscribe · Durar',
    description: 'Unsubscribe from the Pearl of the Day email.',
    noindex: true,
  },
  {
    path: '/privacy',
    title: 'Privacy · Durar',
    description: 'What Durar stores about you (very little), why, where, and how to delete it.',
  },
];
for (const page of pages) {
  const out = join(dist, page.path.slice(1), 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, inject(template, head({ ...page, type: 'website' }), ''));
}

// Home: keep default tags, add canonical + a crawlable index of every word.
const index = `<nav id="seo-word" style="${HIDDEN}" aria-label="All words"><ul>${words
  .map((w) => `<li><a href="/word/${w.slug}" lang="ar">${esc(w.ar)}</a> — ${esc(w.meanings[0])}</li>`)
  .join('')}</ul></nav>`;
const home = inject(
  template,
  head({
    title: 'Durar · درر — Arabic words, like pearls',
    description:
      'Durar is an immersive, underwater world of beautiful Arabic words. Swipe through pearls of vocabulary — each with its meaning and example sentences.',
    path: '/',
    type: 'website',
  }),
  index,
);
writeFileSync(join(dist, 'index.html'), home);

// Not found: a static page Vercel serves with a real 404 status for any path that isn't a file
// (vercel.json has no catch-all rewrite, so every app route must be prerendered above). It uses
// the app's stylesheet but none of its JavaScript; a few lines of inline script search the words.
const stylesheet = template.match(/<link rel="stylesheet"[^>]*>/)?.[0] ?? '';
const lost = words.map((w) => ({ s: w.slug, ar: w.ar, tr: w.translit, en: w.meanings.join('; ') }));
const notFound = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#041621" />
    <meta name="robots" content="noindex" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>Page not found · Durar</title>
    ${stylesheet}
    <style>
      .lost { display: grid; justify-items: center; gap: 18px; text-align: center; }
      .lost-pearl { position: relative; width: 74px; height: 74px; margin-top: 4vh; border-radius: 50%;
        background: radial-gradient(circle at 34% 30%, #fffdf6 0 8%, #f3ece0 22%, #cfdcdc 52%, #8fa8ac 78%, #5d7a80 100%);
        box-shadow: 0 0 40px rgba(127, 214, 214, 0.25), inset -6px -8px 18px rgba(30, 60, 70, 0.45);
        animation: lost-drift 9s var(--ease-water) infinite alternate; }
      .lost-pearl::after { content: ''; position: absolute; inset: 0; border-radius: inherit; opacity: 0.35;
        background: conic-gradient(from 200deg, #f6d8ff, #c8fff4, #fff4d8, #d8e8ff, #ffd8ec, #f6d8ff); mix-blend-mode: soft-light; }
      @keyframes lost-drift { from { transform: translate(-14px, 6px) rotate(-8deg); } to { transform: translate(14px, -10px) rotate(8deg); } }
      .lost .page-title { margin: 0; }
      .lost-text { max-width: 34rem; margin: 0; font: 500 1.2rem/1.5 var(--font-en); color: var(--ink-soft); text-wrap: balance; }
      .lost-search { width: min(26rem, 100%); }
      .lost-search label { display: block; margin-bottom: 8px; font: italic 500 1.05rem/1.2 var(--font-en); color: var(--ink-soft); }
      .lost-search input { width: 100%; box-sizing: border-box; min-height: 46px; padding: 0 18px; border-radius: 999px;
        border: 1px solid var(--glass-edge); background: rgba(8, 34, 46, 0.5); color: var(--ink); font: 400 1rem/1 var(--font-ui); }
      .lost-search input::placeholder { color: var(--ink-faint); }
      .lost-search input:focus-visible { outline: none; border-color: rgba(190, 240, 240, 0.4); box-shadow: 0 0 0 3px rgba(127, 214, 214, 0.3); }
      .lost-results { display: grid; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; text-align: start; }
      .lost-results a { display: flex; align-items: baseline; gap: 12px; padding: 8px 14px; border-radius: 14px;
        color: var(--ink); text-decoration: none; background: rgba(8, 34, 46, 0.42); }
      .lost-results a:hover, .lost-results a:focus-visible { outline: none; background: rgba(127, 214, 214, 0.14); }
      .lost-results [lang='ar'] { font: 600 1.4rem/1.4 var(--font-ar); }
      .lost-results .lost-en { font: 500 1rem/1.3 var(--font-en); color: var(--ink-soft); }
      .lost-status { min-height: 1.2em; margin: 8px 0 0; font: italic 500 0.95rem/1.2 var(--font-en); color: var(--ink-faint); }
      .lost-home { display: inline-block; margin-top: 8px; padding: 12px 26px; border-radius: 999px; border: 1px solid rgba(190, 240, 240, 0.35);
        color: var(--ink); text-decoration: none; font: 500 1.15rem/1 var(--font-en); background: rgba(127, 214, 214, 0.12); }
      .lost-home:hover, .lost-home:focus-visible { outline: none; background: rgba(127, 214, 214, 0.22); box-shadow: 0 0 0 3px rgba(127, 214, 214, 0.3); }
    </style>
  </head>
  <body>
    <div class="page">
      <div class="page-light" aria-hidden="true"></div>
      <header class="page-top">
        <a class="page-back" href="/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>Back to the sea</a>
        <a class="brand" href="/"><span class="brand-ar" lang="ar">دُرَر</span><span class="sr-only"> Durar home</span></a>
        <span></span>
      </header>
      <main class="page-main lost">
        <div class="lost-pearl" aria-hidden="true"></div>
        <h1 class="page-title"><span class="page-title-ar" lang="ar" dir="rtl">دُرَّةٌ ضَائِعَةٌ</span>A lost pearl</h1>
        <p class="lost-text">This page isn’t in the sea. The link may be mistyped, or the page has drifted away.</p>
        <form class="lost-search" role="search" hidden>
          <label for="lost-q">Look for a word instead</label>
          <input id="lost-q" type="search" autocomplete="off" placeholder="ابحث · search" />
          <p class="lost-status" role="status"></p>
          <ul class="lost-results"></ul>
        </form>
        <a class="lost-home" href="/">Back to the sea</a>
      </main>
    </div>
    <script>
      (() => {
        const words = ${JSON.stringify(lost).replace(/</g, '\\u003c')};
        const ar = (s) => s.replace(/[\\u0610-\\u061a\\u064b-\\u065f\\u0670\\u06d6-\\u06ed\\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
        const la = (s) => s.normalize('NFD').replace(/\\p{M}/gu, '').replace(/[ʿʾ'’\`-]/g, '').toLowerCase();
        const form = document.querySelector('.lost-search');
        const input = form.querySelector('input');
        const status = form.querySelector('.lost-status');
        const list = form.querySelector('.lost-results');
        form.hidden = false;
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          list.querySelector('a')?.click();
        });
        input.addEventListener('input', () => {
          const q = input.value.trim();
          const hits = !q ? [] : /[\\u0600-\\u06ff]/.test(q)
            ? words.filter((w) => ar(w.ar).includes(ar(q).replace(/^ال/, '')))
            : words.filter((w) => la(w.tr).replace(/\\s+/g, '').startsWith(la(q).replace(/\\s+/g, '')) || la(w.en).includes(la(q)));
          list.replaceChildren(...hits.slice(0, 6).map((w) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '/word/' + w.s;
            const word = document.createElement('span');
            word.lang = 'ar';
            word.dir = 'rtl';
            word.textContent = w.ar;
            const en = document.createElement('span');
            en.className = 'lost-en';
            en.textContent = w.tr + ' · ' + w.en.split(';')[0];
            a.append(word, en);
            li.append(a);
            return li;
          }));
          status.textContent = !q ? '' : hits.length ? hits.length + (hits.length === 1 ? ' word' : ' words') : 'No word matches that yet.';
        });
      })();
    </script>
  </body>
</html>
`;
writeFileSync(join(dist, '404.html'), notFound);

if (site) {
  const urls = ['/', '/privacy', ...words.map((w) => `/word/${w.slug}`)];
  writeFileSync(
    join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${site}${u}</loc></url>`)
      .join('\n')}\n</urlset>\n`,
  );
  writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
} else {
  console.warn('prerender: SITE_URL not set — skipping sitemap.xml and absolute canonical/og:url tags.');
}
console.log(`prerender: wrote ${words.length} word pages.`);
