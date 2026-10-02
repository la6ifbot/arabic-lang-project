import { Fragment, useEffect } from 'react';
import credits from '../data/credits.json';
import topicData from '../data/topics.json';
import { LICENSES, type MUSIC_LICENSES } from '../../shared/credits';
import { ILLUSTRATIONS, illustrationSrc } from '../lib/illustrations';
import { linkHandler } from '../lib/router';
import { WORDS } from '../lib/words';
import type { Topic } from '../types';
import { PageShell } from './PageShell';

/** One track in src/data/credits.json. tests/unit/credits.test.ts checks every file in public/audio has one. */
interface Music {
  file: string;
  title: string;
  artist: string;
  license: (typeof MUSIC_LICENSES)[number];
  sourceUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
  changes?: string;
}
interface Font {
  family: string;
  package: string;
  copyright: string;
}
const MUSIC = credits.music as Music[];
const FONTS = credits.fonts as Font[];
const TOPICS = topicData as Topic[];

/** The copy of each font's licence the build ships next to the site (scripts/prerender.mjs). */
const fontLicensePath = (f: Font) => `/licenses/${f.package.split('/')[1]}.txt`;

function MusicLine({ m }: { m: Music }) {
  if (m.license === 'own-work') return <>“{m.title}” by {m.artist}. Made for Durar.</>;
  if (m.license === 'licensed')
    return (
      <>
        “{m.title}” by {m.artist}, used under the{' '}
        {m.licenseUrl ? (
          <a href={m.licenseUrl} rel="license external">
            {m.licenseName}
          </a>
        ) : (
          m.licenseName
        )}
        .
      </>
    );
  const l = LICENSES[m.license];
  return (
    <>
      “{m.title}” by {m.artist}.{' '}
      <a href={l.url} rel="license external">
        {l.label}
      </a>
      .{m.changes && <> {m.changes} by Durar.</>}
      {m.sourceUrl && (
        <>
          {' '}
          <a href={m.sourceUrl} rel="external">
            Original recording
          </a>
          .
        </>
      )}
    </>
  );
}

/** Who made the pictures, music and fonts, and their licences (decisions 5 and 8). Linked from Privacy and About. */
export default function CreditsPage() {
  useEffect(() => {
    // The list renders after the browser tried to scroll to the fragment (e.g. /credits#ill-rose-centifolia).
    const id = window.location.hash.slice(1); // ids are ASCII, so no decoding (which throws on a stray %)
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  const items = ILLUSTRATIONS.map((e) => ({
    e,
    words: WORDS.filter((w) => w.image === e.id),
    covers: TOPICS.filter((t) => t.cover === e.id),
  })).filter((x) => x.words.length + x.covers.length > 0);

  return (
    <PageShell>
      <h1 className="page-title">Credits</h1>
      <div className="prose">
        <p className="prose-lead">
          The meanings and most example sentences on Durar are written for Durar. The{' '}
          {MUSIC.length > 0 ? 'pictures, music and fonts' : 'pictures and fonts'} are other people’s work, credited here.
        </p>

        {items.length > 0 && (
          <>
            <h2>Illustrations</h2>
            <p>
              Every illustration is restyled from a public-domain or CC0 original: cleaned, cropped and tinted for Durar.
              We credit the artist and link the copy we used.
            </p>
            <ul className="credits-list">
              {items.map(({ e, words, covers }) => {
                const license = LICENSES[e.license];
                return (
                  <li key={e.id} id={`ill-${e.id}`} className="credit">
                    <img
                      className="credit-thumb"
                      src={illustrationSrc(e.id, 320)!}
                      alt={e.alt}
                      width={96}
                      height={96}
                      loading="lazy"
                      decoding="async"
                      crossOrigin="anonymous"
                    />
                    <div>
                      <p className="credit-by">
                        After {e.artist}, {e.plate && <>“{e.plate}”, </>}
                        <cite>{e.work}</cite> ({e.date}).{' '}
                        <a href={license.url} rel="license external">
                          {license.label}
                        </a>
                        . {e.flip ? 'Mirrored and restyled' : 'Restyled'} by Durar.{' '}
                        <a href={e.sourceUrl} rel="external">
                          The original on Wikimedia Commons
                        </a>
                        {e.scan && <> (scan: {e.scan})</>}.
                      </p>
                      <p className="credit-used">
                        Drawn for{' '}
                        {words.map((w, i) => (
                          <Fragment key={w.slug}>
                            {i > 0 && ', '}
                            <a href={`/word/${w.slug}`} onClick={linkHandler(`/word/${w.slug}`)}>
                              <span className="credit-ar" lang="ar" dir="rtl">
                                {w.ar}
                              </span>{' '}
                              {w.translit}
                            </a>
                          </Fragment>
                        ))}
                        {covers.map((t, i) => (
                          <Fragment key={t.id}>
                            {words.length + i > 0 && ', '}the cover of {t.name.en}
                          </Fragment>
                        ))}
                        .
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {MUSIC.length > 0 && (
          <>
            <h2>Music</h2>
            {MUSIC.map((m) => (
              <p key={m.file}>
                <MusicLine m={m} />
              </p>
            ))}
          </>
        )}

        <h2>Fonts</h2>
        <ul>
          {FONTS.map((f) => (
            <li key={f.family}>
              <strong>{f.family}</strong>: {f.copyright} <a href={fontLicensePath(f)}>{f.family} licence</a>
            </li>
          ))}
        </ul>
        <p>
          They are shared under the{' '}
          <a href={LICENSES['OFL-1.1'].url} rel="license external">
            SIL Open Font License 1.1
          </a>{' '}
          and served from our own site, not from Google.
        </p>

        <h2>Words and writing</h2>
        <p>
          Meanings, example sentences and word histories are written for Durar. Dictionaries are used as references and
          never copied. A few examples are lines of classical poetry or proverbs; the poet, or “proverb”, is named under
          the line.
        </p>
      </div>
    </PageShell>
  );
}
