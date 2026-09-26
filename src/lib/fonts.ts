import '@fontsource/noto-naskh-arabic/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-600.css';
import '@fontsource/aref-ruqaa/arabic-700.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-ext-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/latin-ext-500-italic.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/latin-500.css';

/** Noto Naskh Arabic: a formal print Naskh that places stacked marks (shadda + fatha) correctly. */
export const FONT_AR = '"Noto Naskh Arabic"';
export const FONT_EN = '"Cormorant Garamond"';

let ready: Promise<void> | null = null;

/**
 * Canvas text does not trigger webfont downloads on its own, so explicitly load every face the
 * card renderer uses before drawing (otherwise the first cards bake in a fallback font).
 */
export function loadCardFonts(): Promise<void> {
  ready ??= Promise.all([
    document.fonts.load(`600 64px ${FONT_AR}`, 'دُرَّة'),
    document.fonts.load(`400 64px ${FONT_AR}`, 'دُرَّة'),
    document.fonts.load(`500 64px ${FONT_EN}`, 'pearl ḥʿ'),
    document.fonts.load(`italic 500 64px ${FONT_EN}`, 'pearl ḥʿ'),
  ])
    .then(() => undefined)
    .catch(() => undefined);
  return ready;
}
