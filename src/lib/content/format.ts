/**
 * What a field holds, and how a value is made to hold it.
 *
 * Three formats, because the site treats them differently:
 *   - `plain` is a sentence. It is printed as text — a card teaser, a `<title>`, an
 *     `alt` attribute — so any markup inside it reaches a visitor as visible `<p>` and
 *     `&#8217;` noise, which is exactly what the WordPress import left behind in 92 of
 *     the 94 article excerpts.
 *   - `html` is a body the console writes. It keeps its tags and is filtered by
 *     `sanitizeRichHtml()` on the way **in**, so the database never holds a script or
 *     an `onerror=` at all.
 *   - `source` is a body the site imported. It is markup the console shows as source and
 *     stores verbatim, because the homepage's hero slider and prose rows are still read
 *     out of that document — `rs-slide` and `data-thumb` included — and filtering on the
 *     way in would delete the hero the moment anyone saved the page. It is filtered on
 *     the way **out** instead, by `sanitizeHtmlBody()`, on every render.
 *
 * This module is isomorphic on purpose: the console normalizes a plain field while it
 * is being typed and the server normalizes it again on the way in, and both have to
 * agree word for word. Anything that needs Node — a real HTML parser, `sanitize-html` —
 * belongs in `rich.ts`, not here.
 */
export type FieldFormat = 'plain' | 'html' | 'source';

/**
 * A value read out of a column, cleaned the way its field's format says.
 *
 * Both read paths use this — the console's draft view and the site's published view —
 * because a `plain` column imported from WordPress still holds `<p>` and `&#8217;` until
 * someone re-saves the row, and neither door should print that to a person.
 */
export function readStored(format: FieldFormat, value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return format === 'plain' ? plainText(text) : text;
}

/** Is this value markup the console owns, and so worth filtering before it is stored? */
export function isStoredHtml(format: FieldFormat): boolean {
  return format === 'html';
}

/** The entities WordPress leaves in a text field, and the ones an editor pastes. */
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  times: '×',
  laquo: '«',
  raquo: '»',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
};

function codePoint(value: number): string {
  // A code point outside the document range is not a character, and `fromCodePoint`
  // would throw inside a save. Dropping it keeps the rest of the sentence.
  return Number.isFinite(value) && value > 0 && value <= 0x10fffd ? String.fromCodePoint(value) : '';
}

/**
 * Decode entities once.
 *
 * Once matters: `decodeEntities` alone is the single pass a person's text gets, and the
 * loop in `plainText()` is the only thing that repeats it — see the fixed point there.
 */
export function decodeEntities(input: string): string {
  if (!input) return '';
  return input
    .replace(/&#(\d{1,7});/g, (_, digits: string) => codePoint(Number(digits)))
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&([a-z][a-z0-9]{1,9});/gi, (whole, name: string) => NAMED[name.toLowerCase()] ?? whole);
}

/**
 * A tag, and only a tag.
 *
 * The name has to start with a letter, so `a < b > c` and `<3` survive as the text they
 * are; requiring the closing bracket on the same token means a stray `<` in a sentence
 * cannot eat the rest of it.
 */
const TAG = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?>/g;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
/** Elements whose *contents* are not prose: a script's text is code, not a sentence. */
const NON_PROSE = /<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Does this value carry markup? Used to tell an editor their text will be cleaned. */
export function hasMarkup(value: string): boolean {
  // A non-global pattern: `test()` on a `/g` regex remembers `lastIndex` and answers
  // differently depending on what the previous call found.
  return /<!--|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?>/.test(value);
}

/**
 * The value as the plain-text field wants it: no tags, decoded entities, one space
 * between words.
 *
 * Tags go before entities are decoded, so `&lt;p&gt;` — a person writing about a tag — is
 * not mistaken for markup on the first look. Decoding can then hand back text that *is*
 * markup-shaped, which is why this settles on a fixed point instead of running once: the
 * same function runs on the way **in** (`parseWrites`) and on the way **out** (`readStored`),
 * and a cleaner that kept changing its own answer would make the console show a different
 * sentence from the column and shave characters off the same value every time it was read.
 *
 * The cost is honest and small: an author who typed `&amp;#8217;` to talk *about* an entity
 * gets `’`, and one who typed `&lt;script&gt;` gets nothing. Both are rarer than the 92
 * WordPress excerpts this exists for, and neither is a sentence the site is losing.
 */
export function plainText(value: string): string {
  if (!value) return '';
  let current = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const stripped = decodeEntities(current.replace(NON_PROSE, ' ').replace(COMMENT, ' ').replace(TAG, ' ')).replace(/\s+/g, ' ').trim();
    if (stripped === current) return current;
    current = stripped;
  }
  return current;
}
