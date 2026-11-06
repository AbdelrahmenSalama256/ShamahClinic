/**
 * Which script a field was actually written in, and the one artifact imports left.
 *
 * The WordPress import put English sentences into `*_ar` columns — 91 of 93 article
 * excerpts — so "the column is not empty" stopped meaning "the Arabic exists". Two
 * questions the console and the public readers both have to ask of a field: is this
 * text mostly Latin letters (an English row wearing an Arabic column), and does it end
 * in the `[…]` the WP teaser shortcode baked into the stored value?
 *
 * Isomorphic on purpose: the editor warns while a person types, in the browser.
 */

const ARABIC_LETTER = /\p{Script=Arabic}/u;
const LATIN_LETTER = /[A-Za-z]/g;

/** Counts only *letters*: digits, punctuation and spaces belong to no script here. */
export function scriptCounts(text: string): { arabic: number; latin: number } {
  let arabic = 0;
  for (const char of text || '') if (ARABIC_LETTER.test(char)) arabic += 1;
  const latin = (text.match(LATIN_LETTER) || []).length;
  return { arabic, latin };
}

/**
 * Is this text written in Latin letters with (almost) no Arabic?
 *
 * A French product name inside an Arabic sentence is not a Latin row: the test is
 * "Latin letters outnumber Arabic ones and some Arabic survives nowhere", with a
 * small Arabic floor so a stray ء in a transliteration does not count as a translation.
 */
export function isMostlyLatin(text: string): boolean {
  const { arabic, latin } = scriptCounts(text);
  if (latin === 0) return false;
  return arabic === 0 || latin > arabic * 3;
}

/** The WordPress teaser artifact: a literal bracketed ellipsis at the end. */
const ELLIPSIS_ARTIFACT = /\s*(?:\[…]|\[\.\.\.\]|\[&hellip;])\s*$/i;

/** Does the value end in `[…]`? The editor warns with this; the readers clean with the next. */
export function endsWithEllipsisArtifact(text: string): boolean {
  return ELLIPSIS_ARTIFACT.test(text || '');
}

/** Drop a trailing `[…]` / `[...]` / `[&hellip;]` and the space it leaned on. */
export function stripEllipsisArtifact(text: string): string {
  return (text || '').replace(ELLIPSIS_ARTIFACT, '').trim();
}
