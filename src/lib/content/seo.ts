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
import { db } from '../db';
import type { ContentKind, ContentLocale } from './kinds';
import { publicPathOf } from './paths';

/** One entity type for every URL; `entity_id` carries the path, `''` being the home page. */
export const SEO_ENTITY_TYPE = 'path';

export interface SeoOverride {
  title: string;
  description: string;
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
export async function readSeoOverride(path: string, locale: ContentLocale): Promise<SeoOverride | null> {
  try {
    const row = await db
      .selectFrom('seo_entries')
      .select(['title', 'description'])
      .where('entity_type', '=', SEO_ENTITY_TYPE)
      .where('entity_id', '=', path)
      .where('locale', '=', locale)
      .executeTakeFirst();
    if (!row) return null;
    const title = row.title.trim();
    const description = row.description.trim();
    return title || description ? { title, description } : null;
  } catch {
    // A public page must not fail to render because its optional SEO row could not be
    // read; the authored copy is a complete answer.
    return null;
  }
}

/** Every override on one screen in one query, keyed by path. */
export async function readSeoOverrides(paths: readonly string[], locale: ContentLocale): Promise<Map<string, SeoOverride>> {
  const out = new Map<string, SeoOverride>();
  if (paths.length === 0) return out;
  const rows = await db
    .selectFrom('seo_entries')
    .select(['entity_id', 'title', 'description'])
    .where('entity_type', '=', SEO_ENTITY_TYPE)
    .where('locale', '=', locale)
    .where('entity_id', 'in', [...paths])
    .execute();
  for (const row of rows) {
    const title = row.title.trim();
    const description = row.description.trim();
    if (title || description) out.set(row.entity_id, { title, description });
  }
  return out;
}

/** An empty pair is not an override: it deletes the row and hands the page back its copy. */
export async function saveSeoOverride(input: {
  path: string;
  locale: ContentLocale;
  title: string;
  description: string;
  actorId: string;
}): Promise<SeoOverride | null> {
  const title = input.title.trim();
  const description = input.description.trim();
  const existing = await db
    .selectFrom('seo_entries')
    .select('id')
    .where('entity_type', '=', SEO_ENTITY_TYPE)
    .where('entity_id', '=', input.path)
    .where('locale', '=', input.locale)
    .executeTakeFirst();

  if (!title && !description) {
    if (existing) await db.deleteFrom('seo_entries').where('id', '=', existing.id).execute();
    return null;
  }

  if (existing) {
    await db
      .updateTable('seo_entries')
      .set({ title, description, draft: 0, published_at: new Date(), updated_by: input.actorId })
      .where('id', '=', existing.id)
      .execute();
  } else {
    await db
      .insertInto('seo_entries')
      .values({
        id: randomUUID(),
        entity_type: SEO_ENTITY_TYPE,
        entity_id: input.path,
        locale: input.locale,
        title,
        description,
        draft: 0,
        published_at: new Date(),
        created_by: input.actorId,
        updated_by: input.actorId,
      })
      .execute();
  }
  return { title, description };
}
