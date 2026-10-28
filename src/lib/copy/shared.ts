/**
 * The one thing the generator, the console and the site have to agree on: what a sentence
 * is called.
 *
 * A piece of site copy is a pair — the Arabic wording and the English wording of the same
 * sentence, written next to each other in the component as `t("…", "…")`. The pair is the
 * default, and it stays the default until an owner saves an override for one language of
 * it. Nothing here reaches the browser as a database row: the server reads the overrides,
 * keys them by the pair the component will ask with, and `t()` falls back to its own
 * arguments when the dictionary has nothing.
 *
 * `pairKey` is that lookup. It is not the address the console writes — `COPY_KEY_PATTERN`,
 * a hash of the same pair, is the row's stable name in `content_fields.field_key`. The
 * hash cannot be recomputed inside a component without pulling a hash function into every
 * page, and the pair the component already holds can.
 */

/** Every copy row in `content_fields` is addressed `copy.<12 hex>`. */
export const COPY_KEY_PREFIX = 'copy.';
export const COPY_KEY_PATTERN = /^copy\.[0-9a-f]{12}$/;

/**
 * U+241F, the printable symbol for a unit separator. A control character would work as a
 * key separator too, but this one survives a trip through a log, a JSON payload and a
 * browser devtools panel without being silently dropped — and nobody types it into a
 * sentence.
 */
const SEPARATOR = '␟';

/** The address a component's `t(ar, en)` call is looked up with. */
export function pairKey(ar: string, en: string): string {
  return `${ar}${SEPARATOR}${en}`;
}

/**
 * The overrides for one language, keyed by `pairKey` of the wording the component holds.
 * An absent pair is not a missing translation: it means nobody has changed that sentence.
 */
export type CopyDict = Record<string, string>;

/**
 * A dictionary and the language it was read for. `LanguageProvider` applies it only while
 * its own language matches, so a client-side move to the other language cannot briefly
 * render Arabic words from the Arabic dictionary inside an English page.
 */
export interface CopyBundle {
  locale: 'ar' | 'en';
  values: CopyDict;
}

/** `t("نتيجة {0}", "{0} results", total)` — the slots an owner has to keep. */
export function slotsOf(text: string): string[] {
  return text.match(/\{\d+\}/g) ?? [];
}

/** Fill `{0}`, `{1}`, … in order. Values beyond the slots are ignored, not appended. */
export function fillSlots(template: string, values: readonly (string | number)[]): string {
  if (values.length === 0) return template;
  let out = template;
  for (const [index, value] of values.entries()) out = out.split(`{${index}}`).join(String(value));
  return out;
}
