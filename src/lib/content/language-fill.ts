/**
 * Whose words show when a row's own language has nothing.
 *
 * The site has been answering this without being asked: `pair()` in `./site.ts` wrote
 * `ar: value.ar || value.en`, so an article published with an Arabic headline and no
 * Arabic teaser printed the English one under it. On `/ar`. A visitor who reads Arabic got
 * a sentence in a language the page had not switched to, and nobody decided that — the
 * fallback was the shape of a helper function.
 *
 * So the decision is one row in `settings`, off by default, and this module is the only
 * place that reads it. Two answers:
 *   - `blank` — an empty field stays empty. That is what an unpublished translation means.
 *   - `other-language` — the other locale stands in, the owner's deliberate choice for a
 *     corpus that is half written.
 *
 * Only an **empty** value is filled. Text filed in the wrong script — the 91 English
 * sentences sitting in `excerpt_ar` — is not empty, and filling it would hide a data bug
 * the site is supposed to report. That case has its own rule per field: derive a
 * same-language answer where one exists (`./article-body.ts` cuts an Arabic teaser out of
 * the Arabic body), and report the row where none does.
 *
 * The read fails to `blank`: settings that cannot be read must not quietly start printing
 * a second language on a page that has always been monolingual.
 */
import { cache } from 'react';
import { db } from '../db';
import { isMostlyLatin } from '../text-script';
import { LANGUAGE_SETTING_GROUP, MISSING_TEXT_SETTING_KEY } from './settings-catalog';
import type { Bi } from '../wp/types';

export type MissingText = 'blank' | 'other-language';

/** What a site with no saved row says: nothing. */
export const BLANK: MissingText = 'blank';
/** What the owner ticks when a half-translated corpus should show its other half. */
export const OTHER_LANGUAGE: MissingText = 'other-language';

/**
 * Apply the rule to one bilingual value.
 *
 * An empty string is the gap, and whitespace-only counts as empty because nothing would
 * render from it either. A value that exists is never second-guessed here.
 */
export function resolveMissingText(rule: MissingText, value: Bi): Bi {
  const ar = (value.ar ?? '').trim();
  const en = (value.en ?? '').trim();
  if (rule !== OTHER_LANGUAGE) return { ar: value.ar ?? '', en: value.en ?? '' };
  return { ar: ar || en, en: en || ar };
}

/**
 * Is this text an answer in the language it is filed under?
 *
 * The Arabic column is the one the WordPress import wrote in English, so only `ar` is
 * tested for script: an English column holding English is exactly what it says.
 */
export function answersIn(locale: 'ar' | 'en', text: string): boolean {
  const value = (text || '').trim();
  if (!value) return false;
  return locale === 'ar' ? !isMostlyLatin(value) : true;
}

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text.startsWith('{') && !text.startsWith('[') && !text.startsWith('"')) {
    return text === 'true' ? true : text === 'false' ? false : value;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

/** The saved switch, read the way a page's visibility row is read. */
export function parseMissingText(value: unknown): MissingText {
  const decoded = decode(value);
  // `'true'` is the shape a value saved as a word arrives in, and it is what the console
  // wrote if an operator typed it by hand into a field that no longer exists.
  if (decoded === true || decoded === 'true' || decoded === 'on' || decoded === '1' || decoded === 1) return OTHER_LANGUAGE;
  return BLANK;
}

/**
 * One read per render: every public reader asks, and the answer cannot change mid-page.
 * A save revalidates the route, so the next render sees the new switch.
 */
export const readMissingTextRule = cache(async function readMissingTextRule(): Promise<MissingText> {
  try {
    const row = await db
      .selectFrom('settings')
      .select('value')
      .where('group_name', '=', LANGUAGE_SETTING_GROUP)
      .where('setting_key', '=', MISSING_TEXT_SETTING_KEY)
      .where('is_secret', '=', 0)
      .executeTakeFirst();
    return row ? parseMissingText(row.value) : BLANK;
  } catch {
    return BLANK;
  }
});
