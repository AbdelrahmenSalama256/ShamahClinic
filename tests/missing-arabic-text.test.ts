/**
 * What an Arabic page shows when the Arabic is missing.
 *
 * Two rules, and the order between them is the point of this file:
 *
 *  1. An empty field is filled from the other language **only** when the owner has said
 *     so — one row in `settings`, absent means no. Until this switch existed, `pair()` in
 *     `site.ts` cross-filled unconditionally, which is how an English sentence ended up
 *     under an Arabic headline.
 *  2. An Arabic teaser is cut from the **Arabic body** whenever the excerpt column cannot
 *     be read in Arabic — empty *or* written in Latin letters. That is the imported
 *     corpus: 91 of 94 published articles hold English in `excerpt_ar`, and the article
 *     beside it is Arabic.
 *
 * Rule 2 wins where both could answer, because an Arabic sentence from the article is a
 * better reply to an Arabic reader than an English one from the same row. Rule 1 is what
 * is left for a field with nothing to derive from — a headline.
 *
 * The rows are written straight into `shamah_cms_test` as published (the read path is
 * under test, not the editor), every slug names this run, and `afterAll` deletes them and
 * restores the settings row to exactly what it was.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { answersIn, BLANK, OTHER_LANGUAGE, parseMissingText, readMissingTextRule, resolveMissingText } from '../src/lib/content/language-fill';
import { teaserIn, teaserPair } from '../src/lib/content/teaser';
import { deriveExcerpt, htmlToText } from '../src/lib/wp/sanitize';
import { writeSetting } from '../src/lib/content/settings';
import { LANGUAGE_SETTING_GROUP, MISSING_TEXT_SETTING_KEY } from '../src/lib/content/settings-catalog';
import { getAllArticles, getPost } from '../src/lib/content/site';

const run = randomUUID().slice(0, 8);
const slugOf = (name: string): string => `p1c-${run}-${name}`;
const actor = randomUUID();

const AR_TITLE = 'جلسات إزالة الشعر بالليزر';
const EN_TITLE = 'Laser Hair Removal Sessions';
/** The import's own English sentence, with the `[…]` the teaser shortcode left behind. */
const LATIN_EXCERPT = 'Laser hair removal sessions have become the ideal solution […]';
const AR_TEASER = 'تُعدّ جلسة الليزر من أكثر الطرق راحةً لإزالة الشعر في القاهرة، وتستهلك عشرين دقيقة فقط.';
const AR_BODY = `<p class="wp-block-paragraph">${AR_TEASER}</p><h2>كيف تجري الجلسة</h2><p>تبدأ الجلسة بتجهيز البشرة ثم يمرر الجهاز على المنطقة.</p>`;
const EN_BODY = '<p class="wp-block-paragraph">Laser hair removal is comfortable and takes about twenty minutes.</p>';

/**
 * Every column here is `NOT NULL`, which is what the read path already knows: an
 * untranslated Arabic field is the empty string, not a missing value.
 */
interface Seed {
  slug: string;
  title: { ar: string; en: string };
  excerpt: { ar: string; en: string };
  content: { ar: string; en: string };
}

async function seed(row: Seed): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  await db
    .insertInto('articles')
    .values({
      id,
      slug: row.slug,
      status: 'published',
      title_ar: row.title.ar,
      title_en: row.title.en,
      excerpt_ar: row.excerpt.ar,
      excerpt_en: row.excerpt.en,
      content_ar: row.content.ar,
      content_en: row.content.en,
      pub_title_ar: row.title.ar,
      pub_title_en: row.title.en,
      pub_excerpt_ar: row.excerpt.ar,
      pub_excerpt_en: row.excerpt.en,
      pub_content_ar: row.content.ar,
      pub_content_en: row.content.en,
      published_at: now,
    })
    .execute();
  return id;
}

/** An article whose Arabic is complete except for the excerpt the import broke. */
const latinExcerpt = {
  slug: slugOf('latin-excerpt'),
  title: { ar: AR_TITLE, en: EN_TITLE },
  excerpt: { ar: LATIN_EXCERPT, en: 'Laser hair removal sessions have become the ideal solution […]' },
  content: { ar: AR_BODY, en: EN_BODY },
} satisfies Seed;

/** An article published in English only — the case the switch is about. */
const englishOnly = {
  slug: slugOf('english-only'),
  title: { ar: '', en: EN_TITLE },
  excerpt: { ar: '', en: 'An English teaser with no Arabic beside it.' },
  content: { ar: '', en: EN_BODY },
} satisfies Seed;

/** The same English-only row with an empty Arabic excerpt and an Arabic body. */
const derivable = {
  slug: slugOf('derivable'),
  title: { ar: AR_TITLE, en: EN_TITLE },
  excerpt: { ar: '', en: 'An English teaser with no Arabic beside it.' },
  content: { ar: AR_BODY, en: EN_BODY },
} satisfies Seed;

const ids: string[] = [];

/** What the switch was before this file touched it, so `afterAll` can put it back. */
let savedSetting: string | null = null;

async function readRawSetting(): Promise<string | null> {
  const row = await db
    .selectFrom('settings')
    .select('value')
    .where('group_name', '=', LANGUAGE_SETTING_GROUP)
    .where('setting_key', '=', MISSING_TEXT_SETTING_KEY)
    .executeTakeFirst();
  return row ? String(row.value) : null;
}

async function setSwitch(on: boolean | null): Promise<void> {
  if (on === null) {
    await db
      .deleteFrom('settings')
      .where('group_name', '=', LANGUAGE_SETTING_GROUP)
      .where('setting_key', '=', MISSING_TEXT_SETTING_KEY)
      .execute();
    return;
  }
  const saved = await writeSetting({ group: LANGUAGE_SETTING_GROUP, key: MISSING_TEXT_SETTING_KEY, value: on, actorId: actor });
  if (!saved.ok) throw new Error(`settings write failed: ${saved.code}`);
}

beforeAll(async () => {
  savedSetting = await readRawSetting();
  await setSwitch(null);
  ids.push(await seed(latinExcerpt), await seed(englishOnly), await seed(derivable));
});

afterAll(async () => {
  await db.deleteFrom('articles').where('slug', 'like', `p1c-${run}-%`).execute();
  if (savedSetting === null) await setSwitch(null);
  else {
    // Restored byte for byte: a test that leaves a site-wide switch on would report as a
    // passing run that changed what the owner's pages render.
    await db
      .updateTable('settings')
      .set({ value: savedSetting })
      .where('group_name', '=', LANGUAGE_SETTING_GROUP)
      .where('setting_key', '=', MISSING_TEXT_SETTING_KEY)
      .execute();
  }
});

describe('the missing-text rule', () => {
  it('fills nothing while the switch is off', () => {
    expect(resolveMissingText(BLANK, { ar: '', en: EN_TITLE })).toEqual({ ar: '', en: EN_TITLE });
    expect(resolveMissingText(BLANK, { ar: '   ', en: EN_TITLE }).ar).toBe('   ');
  });

  it('fills the empty side from the other language when the owner switched it on', () => {
    expect(resolveMissingText(OTHER_LANGUAGE, { ar: '', en: EN_TITLE }).ar).toBe(EN_TITLE);
    expect(resolveMissingText(OTHER_LANGUAGE, { ar: '   ', en: EN_TITLE }).ar).toBe(EN_TITLE);
  });

  it('never overwrites words that are already there', () => {
    expect(resolveMissingText(OTHER_LANGUAGE, { ar: AR_TITLE, en: EN_TITLE })).toEqual({ ar: AR_TITLE, en: EN_TITLE });
  });

  it('reads the saved switch in every shape the column can hold', () => {
    expect(parseMissingText(true)).toBe(OTHER_LANGUAGE);
    expect(parseMissingText('"true"')).toBe(OTHER_LANGUAGE);
    expect(parseMissingText('true')).toBe(OTHER_LANGUAGE);
    expect(parseMissingText(false)).toBe(BLANK);
    expect(parseMissingText(null)).toBe(BLANK);
    expect(parseMissingText('{"on":true}')).toBe(BLANK);
  });
});

describe('which column can be read in its own language', () => {
  it('calls an English sentence in the Arabic column unusable', () => {
    expect(answersIn('ar', LATIN_EXCERPT)).toBe(false);
    expect(answersIn('ar', '')).toBe(false);
    expect(answersIn('ar', '   ')).toBe(false);
  });

  it('keeps Arabic that carries a Latin brand name', () => {
    expect(answersIn('ar', 'جلسة Morpheus 8 للوجه')).toBe(true);
    expect(answersIn('ar', AR_TEASER)).toBe(true);
    expect(answersIn('ar', '٢٠ جلسة')).toBe(true);
  });

  it('trusts the English column to hold English', () => {
    expect(answersIn('en', LATIN_EXCERPT)).toBe(true);
    expect(answersIn('en', '')).toBe(false);
  });
});

describe('the teaser a card shows', () => {
  it('cuts an Arabic sentence out of the Arabic body when the excerpt cannot be read', () => {
    expect(teaserIn('ar', LATIN_EXCERPT, AR_BODY)).toBe(AR_TEASER);
  });

  it('keeps a stored excerpt that does answer in the language', () => {
    expect(teaserIn('ar', AR_TEASER, AR_BODY)).toBe(AR_TEASER);
    expect(teaserIn('en', 'A stored English line.', AR_BODY)).toBe('A stored English line.');
  });

  it('answers each language from its own body, never from the other', () => {
    const pair = teaserPair({ ar: '', en: '' }, { ar: AR_BODY, en: EN_BODY });
    expect(pair.ar).toContain('الليزر');
    expect(pair.ar).not.toContain('Laser');
    expect(pair.en).toContain('Laser');
  });

  it('drops the builder shortcodes that are markup, not words', () => {
    expect(teaserIn('ar', '', '<p>[vc_row][vc_column]نص عربي[/vc_column][/vc_row]</p>')).toBe('نص عربي');
  });

  it('cuts a long body at a word boundary and ends with one ellipsis', () => {
    const long = `<p>${'كلمة '.repeat(80)}</p>`;
    const teaser = deriveExcerpt(long, 40);
    expect(teaser.length).toBeLessThanOrEqual(40);
    expect(teaser.endsWith('…')).toBe(true);
    expect(teaser.endsWith(' …')).toBe(false);
  });
});

describe('the […] the WordPress teaser shortcode left in the stored value', () => {
  it('does not reach a reader', () => {
    expect(htmlToText('<p>جلسة تالية […]</p>')).toBe('جلسة تالية');
    expect(htmlToText('<p>جلسة تالية[&hellip;]</p>')).toBe('جلسة تالية');
    expect(deriveExcerpt('<p>جلسة تالية [...]</p>')).toBe('جلسة تالية');
  });

  it('is only an ending, so brackets inside a sentence survive', () => {
    expect(htmlToText('<p>قوس […] في الوسط ثم كلام</p>')).toBe('قوس […] في الوسط ثم كلام');
  });
});

describe('the published read path', () => {
  it('reads the switch: no row means no substitution', async () => {
    expect(await readMissingTextRule()).toBe(BLANK);
  });

  it('gives an Arabic reader the Arabic body, not the English excerpt column', async () => {
    const found = await getPost(latinExcerpt.slug);
    expect(found).not.toBeNull();
    const item = found!.item;
    expect(item.title.ar).toBe(AR_TITLE);
    expect(item.excerpt.ar).toBe(AR_TEASER);
    expect(item.excerpt.ar).not.toContain('Laser');
    expect(item.excerpt.ar).not.toContain('[…]');
    expect(item.excerpt.en).not.toContain('[…]');
  });

  it('prints the same teaser on the card the journal list builds', async () => {
    const cards = await getAllArticles();
    const card = cards.find((entry) => entry.slug === latinExcerpt.slug);
    expect(card?.excerpt.ar).toBe(AR_TEASER);
  });

  it('leaves an Arabic field empty while the switch is off', async () => {
    const found = await getPost(englishOnly.slug);
    expect(found).not.toBeNull();
    const item = found!.item;
    expect(item.title.ar).toBe('');
    expect(item.title.en).toBe(EN_TITLE);
    expect(item.excerpt.ar).toBe('');
  });

  it('prefers an Arabic sentence to the English column even with the switch on', async () => {
    // `excerpt_ar` is empty and `excerpt_en` is not, so both rules could answer here.
    // The derivation wins: the reader asked for Arabic and gets Arabic.
    await setSwitch(true);
    expect(await readMissingTextRule()).toBe(OTHER_LANGUAGE);
    const found = await getPost(derivable.slug);
    expect(found!.item.excerpt.ar).toBe(AR_TEASER);
    await setSwitch(false);
  });

  it('stands in with the other language once the owner has asked it to', async () => {
    await setSwitch(true);
    const found = await getPost(englishOnly.slug);
    const item = found!.item;
    expect(item.title.ar).toBe(EN_TITLE);
    // The teaser ends up English from the English body: with the switch on, the Arabic
    // *body* is the English one too, and the rule that cuts a teaser out of whatever the
    // row calls Arabic is the same rule either way.
    expect(item.excerpt.ar).toBe('Laser hair removal is comfortable and takes about twenty minutes.');
    await setSwitch(false);
    const strict = await getPost(englishOnly.slug);
    expect(strict!.item.title.ar).toBe('');
  });
});
