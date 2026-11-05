/**
 * The site's wording, one override per (sentence, language).
 *
 * A sentence on this site is written once, in the component that renders it, as
 * `t("العربية", "English")`. That pair is generated into `src/lib/copy/catalog.ts` together
 * with its address (`copy.<hash>`), and this module holds only what an owner changed on
 * top of it. Nothing here invents a default: a row that does not exist is not a missing
 * translation, and the component's own words are the answer.
 *
 * **The lookup is the pair, the key is its hash.** `content_fields.field_key` carries the
 * hash because a sentence can be long and a key cannot. `t()` looks an override up by the
 * pair it already holds — the row stores the Arabic and English it was written against, so
 * the server can rebuild that lookup without a hash function in the browser bundle. The
 * consequence is worth knowing: reword a sentence *in the code* and the old override stops
 * matching. It is not lost; the row stays and the console lists it under "wording no page
 * asks for", so somebody can clear it or aim it again.
 *
 * **Saving is not publishing.** `draft_*` and `pub_*` are written together and the row is
 * marked published, the way a site setting and an SEO row behave. The draft/published pair
 * exists so a future approval step has somewhere to sit; a person correcting a word on
 * their own clinic's site expects the next fetch to show it, and the copy screen is not the
 * article editor.
 *
 * **An empty value removes the override, and nothing else is deleted.** Resetting sets that
 * language's `pub_*` to null; when both languages are back to null the row is soft-deleted
 * (`deleted_at`) rather than dropped, so the row and its audit trail survive a reset.
 * Saving the same address again revives it.
 */
import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { db } from '../db';
import type { ContentLocale } from '../content/kinds';
import { COPY_KEY_PREFIX, pairKey, type CopyDict } from './shared';
import type { CopyEntry } from './catalog';

/** What a screen shows beside one address. */
export interface CopyStored {
  ar: string | null;
  en: string | null;
}

/** A copy row as it sits in `content_fields`, for the screen that lists both languages. */
export interface CopyRow extends CopyStored {
  key: string;
  defaultAr: string | null;
  defaultEn: string | null;
  sourceFile: string | null;
  sourceLine: number | null;
  updatedAt: Date;
}

/**
 * The overrides for one language, keyed by the pair the component will ask with.
 *
 * `cache()` per request: a page renders the header, the footer and eight sections, and all
 * of them ask through the same `t()`. An unreadable database is an empty dictionary, which
 * is the site's own wording — a public page never fails because an optional overlay could
 * not be read, the same rule `readSeoOverride` follows.
 */
export const readCopy = cache(async function readCopy(locale: ContentLocale): Promise<CopyDict> {
  try {
    const rows = await db
      .selectFrom('content_fields')
      .select(['default_ar', 'default_en', 'pub_ar', 'pub_en'])
      .where('field_key', 'like', `${COPY_KEY_PREFIX}%`)
      .where('deleted_at', 'is', null)
      .where('enabled', '=', 1)
      .execute();
    const dict: CopyDict = {};
    for (const row of rows) {
      const value = (locale === 'ar' ? row.pub_ar : row.pub_en)?.trim() ?? '';
      if (!value || row.default_ar === null || row.default_en === null) continue;
      dict[pairKey(row.default_ar, row.default_en)] = value;
    }
    return dict;
  } catch {
    return {};
  }
});

/** Every live copy row, for the console screen. */
export async function readCopyRows(): Promise<CopyRow[]> {
  const rows = await db
    .selectFrom('content_fields')
    .selectAll()
    .where('field_key', 'like', `${COPY_KEY_PREFIX}%`)
    .where('deleted_at', 'is', null)
    .orderBy('field_key', 'asc')
    .execute();
  return rows.map((row) => ({
    key: row.field_key,
    ar: row.pub_ar?.trim() || null,
    en: row.pub_en?.trim() || null,
    defaultAr: row.default_ar,
    defaultEn: row.default_en,
    sourceFile: row.source_file,
    sourceLine: row.source_line,
    updatedAt: row.updated_at,
  }));
}

interface FoundRow {
  id: string;
  pub_ar: string | null;
  pub_en: string | null;
  version: number;
}

async function loadRow(key: string): Promise<FoundRow | undefined> {
  return await db
    .selectFrom('content_fields')
    .select(['id', 'pub_ar', 'pub_en', 'version'])
    .where('field_key', '=', key)
    .executeTakeFirst();
}

async function storedOf(key: string): Promise<CopyStored> {
  const row = await db
    .selectFrom('content_fields')
    .select(['pub_ar', 'pub_en'])
    .where('field_key', '=', key)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return { ar: row?.pub_ar?.trim() || null, en: row?.pub_en?.trim() || null };
}

/**
 * Take one language back to the site's own wording.
 *
 * Also works for an address the catalog no longer lists, which is the point: a sentence a
 * developer reworded leaves an override nothing renders, and the person looking at that row
 * needs a way to clear it rather than a rebuild.
 */
export async function clearCopyOverride(input: {
  key: string;
  locale: ContentLocale;
  actorId: string;
}): Promise<CopyStored> {
  const found = await loadRow(input.key);
  if (!found) return { ar: null, en: null };

  // The other language keeps whatever it holds; a reset of Arabic does not quiet English.
  const pubAr = input.locale === 'ar' ? null : found.pub_ar;
  const pubEn = input.locale === 'en' ? null : found.pub_en;

  await db
    .updateTable('content_fields')
    .set({
      pub_ar: pubAr,
      pub_en: pubEn,
      draft_ar: pubAr,
      draft_en: pubEn,
      // Nothing is overridden in either language, so the row is history: kept, and
      // soft-deleted. This build never drops a row a person wrote.
      deleted_at: pubAr?.trim() || pubEn?.trim() ? null : new Date(),
      version: Number(found.version) + 1,
      updated_by: input.actorId,
    })
    .where('id', '=', found.id)
    .execute();

  return await storedOf(input.key);
}

/**
 * Write one language of one address.
 *
 * `entry` comes from the generated catalog — the caller never lets a body name the defaults,
 * so a row's `default_ar`/`default_en` are always what the code says, and a request cannot
 * aim an override at a sentence the site does not render. An empty value is a reset.
 */
export async function saveCopyOverride(input: {
  entry: CopyEntry;
  locale: ContentLocale;
  value: string;
  actorId: string;
}): Promise<CopyStored> {
  const value = input.value.trim();
  if (value === '')
    return clearCopyOverride({ key: input.entry.key, locale: input.locale, actorId: input.actorId });

  const found = await loadRow(input.entry.key);

  if (found) {
    await db
      .updateTable('content_fields')
      .set(
        input.locale === 'ar'
          ? {
              // Both defaults follow the code, so an override written against wording a
              // developer has since changed stops applying instead of half-applying.
              default_ar: input.entry.ar,
              default_en: input.entry.en,
              pub_ar: value,
              pub_en: found.pub_en,
              draft_ar: value,
              updated_by: input.actorId,
              version: Number(found.version) + 1,
              deleted_at: null,
              status: 'published',
              enabled: 1,
            }
          : {
              default_ar: input.entry.ar,
              default_en: input.entry.en,
              pub_ar: found.pub_ar,
              pub_en: value,
              draft_en: value,
              updated_by: input.actorId,
              version: Number(found.version) + 1,
              deleted_at: null,
              status: 'published',
              enabled: 1,
            },
      )
      .where('id', '=', found.id)
      .execute();
  } else {
    await db
      .insertInto('content_fields')
      .values({
        id: randomUUID(),
        field_key: input.entry.key,
        label: input.entry.ar.slice(0, 255),
        role: 'text',
        route: '',
        section_id: input.entry.area,
        default_ar: input.entry.ar,
        default_en: input.entry.en,
        draft_ar: input.locale === 'ar' ? value : null,
        draft_en: input.locale === 'en' ? value : null,
        pub_ar: input.locale === 'ar' ? value : null,
        pub_en: input.locale === 'en' ? value : null,
        status: 'published',
        enabled: 1,
        source_file: input.entry.file,
        source_line: input.entry.line,
        created_by: input.actorId,
        updated_by: input.actorId,
        version: 1,
      })
      .execute();
  }

  return await storedOf(input.entry.key);
}
