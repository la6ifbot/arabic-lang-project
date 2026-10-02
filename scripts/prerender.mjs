// Post-build step: writes a static, crawlable HTML page for every word at dist/word/<slug>/index.html
// (unique <title>, description, canonical, Open Graph / Twitter tags, JSON-LD and the card's text),
// plus sitemap.xml when SITE_URL is set. Live visitors get the same SPA, which boots into that word.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME_CARD, cardAlt, cardUrl } from '../shared/cards.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const words = JSON.parse(readFileSync(join(root, 'src/data/words.json'), 'utf8'));
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const SITE = (process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.URL || '').replace(/\/$/, '');
const site = SITE && !/^https?:\/\//.test(SITE) ? `https://${SITE}` : SITE;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HIDDEN = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';

// Card images live on img.durar.space (shared/cards.ts), uploaded by CI under content-hashed names.
const SITE_IMAGE = { src: cardUrl('og', HOME_CARD), alt: 'Durar (دُرَر): Arabic words, like pearls' };

/** og:image / twitter:image, emitted (like og:url) only when the site URL is known. */
function imageTags(image) {
  if (!site || !image) return [];
  const { src } = image;
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
    head({ title, description, path, image: { src: cardUrl('og', w), alt: cardAlt(w) }, extra: `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` }),
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
  {
    path: '/credits',
    title: 'Credits · Durar',
    description: 'Who made the illustrations, music and fonts on Durar, and the licences they are shared under.',
  },
];
for (const page of pages) {
  const out = join(dist, page.path.slice(1), 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, inject(template, head({ ...page, type: 'website' }), ''));
}

// The fonts' licence texts (SIL OFL 1.1 asks for them to travel with the font files we serve), linked from /credits.
const credits = JSON.parse(readFileSync(join(root, 'src/data/credits.json'), 'utf8'));
mkdirSync(join(dist, 'licenses'), { recursive: true });
for (const f of credits.fonts) copyFileSync(join(root, 'node_modules', f.package, 'LICENSE'), join(dist, 'licenses', `${f.package.split('/')[1]}.txt`));

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

if (site) {
  const urls = ['/', ...pages.filter((p) => !p.noindex).map((p) => p.path), ...words.map((w) => `/word/${w.slug}`)];
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
