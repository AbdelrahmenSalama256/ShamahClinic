/**
 * Moving one shared picture description onto the two per-picture ones.
 *
 * A result case has a before and an after picture, and each is described on its own — one
 * sentence cannot name both a face before a peel and the same face after it. Rows written
 * before that split hold a single `alt` for the pair, and this list's form has no box for it:
 * the schema refuses a key it does not describe, so the row cannot be saved at all until
 * somebody deletes a sentence an owner typed. This is the one-click version of that decision.
 *
 * Three rules, because the alternative is losing what somebody wrote:
 *
 * **A box with words in it keeps them.** Only an empty half receives the shared description.
 *
 * **The shared key goes only when its words survive.** If it says something neither half now
 * says, the row is left exactly as it was and the author is told — silently deleting a
 * description is the defect this replaces.
 *
 * **A row that says nothing to move comes back unchanged.** Running the pass twice is
 * therefore a no-op, which is what makes a retry after a dropped connection safe.
 *
 * Isomorphic on purpose: the console applies it to the form before a save and the API applies
 * it to the stored document, so the same row answers the same way from either side.
 */
import { schemaStems, type ListSchema } from './list-schema';
import type { ContentLocale } from './kinds';

const LOCALES: readonly ContentLocale[] = ['ar', 'en'];
/** What a row written before the split calls its one description of both pictures. */
export const SHARED_ALT_STEM = 'alt';
/** The two keys it belongs on now, in the order the pictures show. */
const HALVES = ['beforeAlt', 'afterAlt'] as const;

export type AltStatus = 'moved' | 'kept' | 'nothing';

/** The two per-picture descriptions, in the order the pictures show. */
export const ALT_HALVES = HALVES;

/** The four keys a shared description belongs on — what one move can fill or leave alone. */
export const ALT_TARGET_KEYS: readonly string[] = HALVES.flatMap((half) => LOCALES.map((locale) => `${half}_${locale}`));

export interface AltPair {
  ar: string;
  en: string;
}

export interface AltMove {
  status: AltStatus;
  /** the target keys that received words, e.g. `beforeAlt_en` */
  copied: string[];
}

export interface DocAltMove extends AltMove {
  /** the document to write — the one it was handed, unless `status` is `moved` */
  doc: Record<string, unknown>;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * One stem's two languages as the row holds them, with nothing borrowed.
 *
 * `docBi` in ./list-docs.ts fills an empty language from the other one, which is right for
 * rendering a picture's alt and wrong here: this decides whether a person's sentence gets
 * written over, and a box that shows nothing is empty whatever the other box says.
 */
function rawPair(doc: Record<string, unknown>, stem: string): AltPair {
  const ar = text(doc[`${stem}_ar`]);
  const en = text(doc[`${stem}_en`]);
  if (ar || en) return { ar, en };
  const nested = doc[stem];
  if (typeof nested === 'string') {
    const value = text(nested);
    return { ar: value, en: value };
  }
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
    const pair = nested as Record<string, unknown>;
    return { ar: text(pair.ar), en: text(pair.en) };
  }
  return { ar: '', en: '' };
}

/**
 * A list whose form has both per-picture descriptions and no shared one.
 *
 * That is the results case and nothing else, and it is read off the schema rather than
 * written out as `listKey === 'results'`: a list that gains the field later gains the action,
 * and one that drops it stops offering it. A list with its own `alt` field — services,
 * specialists — is refused here, because its `alt` is a description the form draws and moves
 * nothing.
 */
export function sharedAltApplies(schema: ListSchema | null | undefined): boolean {
  if (!schema) return false;
  const stems = new Set(schemaStems(schema));
  return stems.has(HALVES[0]) && stems.has(HALVES[1]) && !stems.has(SHARED_ALT_STEM);
}

export function isSharedAltKey(key: string): boolean {
  return key === SHARED_ALT_STEM || key === `${SHARED_ALT_STEM}_ar` || key === `${SHARED_ALT_STEM}_en`;
}

/** The legacy keys this document holds, under whichever of the three shapes it was written in. */
export function sharedAltKeysOf(doc: Record<string, unknown>): string[] {
  return Object.keys(doc).filter(isSharedAltKey);
}

/** Copy into whichever half is empty, then answer whether the shared key may go. */
function splitShared(alt: AltPair, before: AltPair, after: AltPair): { targets: Record<(typeof HALVES)[number], AltPair>; copied: string[]; drop: boolean } {
  const targets = { beforeAlt: { ...before }, afterAlt: { ...after } };
  const copied: string[] = [];
  for (const locale of LOCALES) {
    const shared = alt[locale];
    if (!shared) continue;
    for (const half of HALVES) {
      if (targets[half][locale]) continue;
      targets[half][locale] = shared;
      copied.push(`${half}_${locale}`);
    }
  }
  const drop = LOCALES.every((locale) => {
    const shared = alt[locale];
    return shared === '' || targets.beforeAlt[locale] === shared || targets.afterAlt[locale] === shared;
  });
  return { targets, copied, drop };
}

/** The document as its own row would be saved: descriptions split, shared key gone. */
export function moveSharedAltInDoc(doc: Record<string, unknown>): DocAltMove {
  const keys = sharedAltKeysOf(doc);
  if (keys.length === 0) return { doc, status: 'nothing', copied: [] };

  const moved = splitShared(rawPair(doc, SHARED_ALT_STEM), rawPair(doc, HALVES[0]), rawPair(doc, HALVES[1]));
  if (!moved.drop) return { doc, status: 'kept', copied: moved.copied };

  const next: Record<string, unknown> = { ...doc };
  for (const key of keys) delete next[key];
  for (const half of HALVES) {
    for (const locale of LOCALES) next[`${half}_${locale}`] = moved.targets[half][locale];
  }
  return { doc: next, status: 'moved', copied: moved.copied };
}
