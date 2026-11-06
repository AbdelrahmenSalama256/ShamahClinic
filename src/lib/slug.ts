/**
 * Addresses a person can read: slugs and heading ids.
 *
 * Arabic is the site's first language, so a slug keeps its Arabic letters. Stripping
 * them — to transliteration or to nothing — would turn a sessions title into `--` and
 * every heading id into `section`, which is how a table of contents loses its anchors.
 * The rule is therefore: fold what folds (case, Arabic letter variants, combining
 * marks), keep every letter and digit either script writes, and let one hyphen stand
 * for any run of spacing and punctuation — including the Arabic question mark, which
 * separates a clause exactly the way a Latin one does.
 */

/**
 * Letter variants that read as one letter: every alef-with-hamza seat folds to a bare
 * alef, alef-maksura to ya, ta marbuta to ha.
 */
const FOLDS: ReadonlyArray<[RegExp, string]> = [
  [/[أإآٱ]/g, 'ا'],
  [/ى/g, 'ي'],
  [/ة/g, 'ه'],
  [/ؤ/g, 'و'],
  [/ئ/g, 'ي'],
];

/**
 * One hyphen-separated address for a sentence, in either script.
 *
 * Returns '' when nothing survives — a title of only emoji or punctuation has no
 * address, and the caller names it rather than publishing `---`.
 */
export function slugify(text: string): string {
  // \p{M} first: tashkeel is a mark, not a letter, and left in place it would cut a
  // word in two where a hyphen belongs. \p{L}\p{N} then keeps both scripts' letters
  // and both scripts' digits — and nothing else.
  let out = (text || '').toLowerCase().replace(/\p{M}/gu, '');
  for (const [from, to] of FOLDS) out = out.replace(from, to);
  out = out
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return out;
}

/**
 * A slug none of `taken` holds yet: the base, then `-2`, `-3`, …
 *
 * The suffix starts at two because a base with a `-2` already in it is a different
 * base, and re-numbering from one would rename rows a link already points at.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const held = new Set(taken);
  if (!held.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!held.has(candidate)) return candidate;
  }
}
