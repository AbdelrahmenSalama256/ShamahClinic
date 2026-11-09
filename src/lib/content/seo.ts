/**
 * Per-address search metadata, as one record the console writes and the site reads.
 *
 * The site already has words for every page — an article's title, a service's name, a
 * route's authored sentence. An override exists for the cases those words are wrong for
 * a search result: too long, too vague, or written for a different intent. It is keyed
 * by the public path and the language, not by a row id, because that is the only key the
 * metadata builder has: a page that moves or a row that changes slug is a new address,
 * and an override that follows the row silently would be editing a page nobody linked.
 *
 * Nothing here publishes. `seo_entries.draft = 0` and `published_at` are set on save,
 * the same way a site setting takes effect on save — the SEO screen is not a copy of the
 * content editor's draft/publish cycle, and a person who fixes a title expects the next
 * fetch to show it.
 */
import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { db } from '../db';
import type { ContentKind, ContentLocale } from './kinds';
import { publicPathOf } from './paths';

/** One entity type for every URL; `entity_id` carries the path, `''` being the home page. */
export const SEO_ENTITY_TYPE = 'path';

export interface SeoOverride {
  title: string;
  description: string;
  /** The phrase the page is written to rank for; graded by `seo-score.ts`, never emitted. */
  focusKeyword?: string;
  ogTitle?: string;
  ogDescription?: string;
  /** A rooted upload path or an absolute URL. */
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
}

/**
 * The focus keyword has no column of its own: it rides in `head_tags`, which nothing on
 * the public side reads, under a name no `<meta>` would carry. That keeps the live
 * database free of a schema change for a word only the console ever looks at.
 */
const FOCUS_TAG = 'console:focus-keyword';

const SEO_COLUMNS = ['entity_id', 'title', 'description', 'og_title', 'og_description', 'og_image', 'canonical', 'robots', 'head_tags'] as const;

interface SeoRowShape {
  title: string;
  description: string;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  canonical: string | null;
  robots: string | null;
  head_tags: unknown;
}

function focusOf(tags: unknown): string {
  let list = tags;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return '';
    }
  }
  if (!Array.isArray(list)) return '';
  const tag = list.find((entry) => entry && typeof entry === 'object' && (entry as Record<string, unknown>).name === FOCUS_TAG);
  const content = tag ? (tag as Record<string, unknown>).content : '';
  return typeof content === 'string' ? content.trim() : '';
}

/** A row as the record the console and the metadata builder read, or null when it says nothing. */
function recordOf(row: SeoRowShape): SeoOverride | null {
  const record: SeoOverride = {
    title: row.title.trim(),
    description: row.description.trim(),
    focusKeyword: focusOf(row.head_tags),
    ogTitle: (row.og_title ?? '').trim(),
    ogDescription: (row.og_description ?? '').trim(),
    ogImage: (row.og_image ?? '').trim(),
    canonical: (row.canonical ?? '').trim(),
    noindex: /noindex/i.test(row.robots ?? ''),
  };
  return isEmptyRecord(record) ? null : record;
}

export function isEmptyRecord(record: SeoOverride): boolean {
  return (
    !record.title &&
    !record.description &&
    !record.focusKeyword &&
    !record.ogTitle &&
    !record.ogDescription &&
    !record.ogImage &&
    !record.canonical &&
    !record.noindex
  );
}

/** A path this console may write. Empty is the home page; `..`, `//` and schemes are not paths. */
export function isSeoPath(value: string): boolean {
  if (value === '') return true;
  return value.length <= 191 && value.startsWith('/') && !value.startsWith('//') && !value.includes('..');
}

/** The path an entity is actually indexed at, or null when it has no page of its own. */
export function seoPathOf(kind: ContentKind, key: string, listKey?: string | null): string | null {
  switch (kind) {
    case 'article':
    case 'offer':
      return publicPathOf(kind, key) ?? null;
    case 'page': {
      // Imported WordPress pages keep their builder names; only the handful that became
      // real routes are indexed. The rest of the SEO center is the route itself, so a
      // row without a route says so rather than inventing `/creative-slider`.
      const routes: Record<string, string> = {
        home: '',
        about: '/about',
        'our-services': '/services',
        shop: '/offers',
        'shop-2': '/offers',
        journal: '/blogs',
        faq: '/faq',
        contact: '/contact',
        'privacy-policy': '/privacy',
      };
      return routes[key] ?? null;
    }
    case 'list_item':
      if (listKey === 'branches') return `/branches/${key}`;
      if (listKey === 'services' || listKey === 'treatments') return `/services/${key}`;
      // Results, FAQ and doctor rows are sections of one page: their words appear there,
      // but `/results` is the address, and the screen edits it once.
      return null;
  }
}

/** The override for one address, or null when the site's own copy is still in charge. */
export const readSeoOverride = cache(async function readSeoOverride(path: string, locale: ContentLocale): Promise<SeoOverride | null> {
  try {
    const row = await db
      .selectFrom('seo_entries')
      .select([...SEO_COLUMNS])
      .where('entity_type', '=', SEO_ENTITY_TYPE)
      .where('entity_id', '=', path)
      .where('locale', '=', locale)
      .executeTakeFirst();
    return row ? recordOf(row) : null;
  } catch {
    // A public page must not fail to render because its optional SEO row could not be
    // read; the authored copy is a complete answer.
    return null;
  }
});

/** Every override on one screen in one query, keyed by path. */
export async function readSeoOverrides(paths: readonly string[], locale: ContentLocale): Promise<Map<string, SeoOverride>> {
  const out = new Map<string, SeoOverride>();
  if (paths.length === 0) return out;
  const rows = await db
    .selectFrom('seo_entries')
    .select([...SEO_COLUMNS])
    .where('entity_type', '=', SEO_ENTITY_TYPE)
    .where('locale', '=', locale)
    .where('entity_id', 'in', [...paths])
    .execute();
  for (const row of rows) {
    const record = recordOf(row);
    if (record) out.set(row.entity_id, record);
  }
  return out;
}

/** Every path a row has asked to keep out of the index, in either language. */
export async function readNoindexPaths(): Promise<Set<string>> {
  try {
    const rows = await db
      .selectFrom('seo_entries')
      .select(['entity_id'])
      .where('entity_type', '=', SEO_ENTITY_TYPE)
      .where('robots', 'like', '%noindex%')
      .execute();
    return new Set(rows.map((row) => row.entity_id));
  } catch {
    return new Set();
  }
}

/**
 * Writes one address's record. A field the caller leaves out keeps what is stored — the
 * SEO center's table edits only the search pair and must not wipe a share image set in the
 * article's own panel — and a record left with nothing in it is deleted, which hands the
 * page back its own copy.
 */
export async function saveSeoOverride(input: {
  path: string;
  locale: ContentLocale;
  title: string;
  description: string;
  focusKeyword?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  canonical?: string;
  noindex?: boolean;
  actorId: string;
}): Promise<SeoOverride | null> {
  const existing = await db
    .selectFrom('seo_entries')
    .select(['id', ...SEO_COLUMNS])
    .where('entity_type', '=', SEO_ENTITY_TYPE)
    .where('entity_id', '=', input.path)
    .where('locale', '=', input.locale)
    .executeTakeFirst();
  const before: SeoOverride = (existing && recordOf(existing)) ?? { title: '', description: '' };
  const keep = (value: string | undefined, kept: string | undefined): string => (value === undefined ? kept ?? '' : value.trim());
  const next: SeoOverride = {
    title: input.title.trim(),
    description: input.description.trim(),
    focusKeyword: keep(input.focusKeyword, before.focusKeyword),
    ogTitle: keep(input.ogTitle, before.ogTitle),
    ogDescription: keep(input.ogDescription, before.ogDescription),
    ogImage: keep(input.ogImage, before.ogImage),
    canonical: keep(input.canonical, before.canonical),
    noindex: input.noindex === undefined ? !!before.noindex : input.noindex,
  };

  if (isEmptyRecord(next)) {
    if (existing) await db.deleteFrom('seo_entries').where('id', '=', existing.id).execute();
    return null;
  }

  const columns = {
    title: next.title,
    description: next.description,
    og_title: next.ogTitle || null,
    og_description: next.ogDescription || null,
    og_image: next.ogImage || null,
    canonical: next.canonical || null,
    robots: next.noindex ? 'noindex,follow' : null,
    head_tags: JSON.stringify(next.focusKeyword ? [{ name: FOCUS_TAG, content: next.focusKeyword }] : []),
    draft: 0 as const,
    published_at: new Date(),
    updated_by: input.actorId,
  };
  if (existing) {
    await db.updateTable('seo_entries').set(columns).where('id', '=', existing.id).execute();
  } else {
    await db
      .insertInto('seo_entries')
      .values({
        id: randomUUID(),
        entity_type: SEO_ENTITY_TYPE,
        entity_id: input.path,
        locale: input.locale,
        ...columns,
        created_by: input.actorId,
      })
      .execute();
  }
  return next;
}
