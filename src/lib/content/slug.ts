/**
 * The identity a new row gets from the title the person typed.
 *
 * The console never asks a data-entry editor to invent a slug. They write the title once,
 * in the language tab they are working in, and the URL name follows: Latin letters fold
 * to lower case, Arabic letters stay as they are (they are valid in a URL once encoded),
 * punctuation and spaces collapse to one hyphen. A page's route is the same name with the
 * leading slash the route column stores.
 *
 * Keeping Arabic letters rather than transliterating is deliberate: a transliteration is
 * a second spelling that has to be reviewed, and a reader who copies the link gets text
 * they can recognise. The empty answer — a title made only of punctuation — is refused
 * by the caller rather than replaced with a timestamp nobody can read.
 */
import type { ContentKind } from './kinds';

const MAX_SLUG = 160;

export function slugify(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’"“”`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, '');
}

/** The identity column's value for a title: `route` keeps the slash, the rest do not. */
export function identityForTitle(kind: ContentKind, title: string): string {
  const slug = slugify(title);
  if (!slug) return '';
  return kind === 'page' ? `/${slug}` : slug;
}

/** The same identity with a numeric suffix, used only after the bare one is taken. */
export function identityVariant(identity: string, attempt: number): string {
  if (attempt <= 1) return identity;
  return `${identity}-${attempt}`;
}
