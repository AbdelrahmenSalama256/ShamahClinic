/**
 * The palette's record search.
 *
 * Narrow on purpose: one `LIKE` per titled kind, three columns each, a `LIMIT`, and
 * never the body columns — a search that pulls 92 articles' full `content_ar` to
 * match a string is a search that takes the console down with it on a shared host.
 *
 * Which kinds are here is a permission question too. `resources` comes from `guard`,
 * so it is exactly the set the caller holds `read` on; a Marketer's search never
 * builds a `pages` query, and so never learns whether a page matches.
 *
 * List items are not in this search. Their labels live inside one JSON document whose
 * keys each list defines for itself (`lists.item_schema`), so a `LIKE` over that column
 * would match a `"position":3` as happily as a name, and BK-13.3 gives each list its
 * own filter once the schema is known. The lists themselves are leaves in the nav tree.
 */
import { sql, type SqlBool } from 'kysely';
import { db } from '../db';
import type { Resource } from '../auth/permissions';
import { kindSpec, type ContentKind } from '../content/kinds';

/** A hit, already turned into the console URL that opens it. */
export interface SearchHit {
  kind: ContentKind;
  id: string;
  key: string;
  title: string;
  path: string;
}

/** The kinds with a titled document row: the palette searches these and nothing else. */
export const SEARCH_RESOURCES = ['article', 'offer', 'page'] as const;

const KIND_OF: Partial<Record<Resource, ContentKind>> = {
  article: 'article',
  offer: 'offer',
  page: 'page',
};

/** Where the screen of a kind lives, and the parameter that opens one row. */
const SCREEN_OF: Record<ContentKind, string> = {
  article: '/console/articles',
  offer: '/console/offers',
  page: '/console/pages',
  list_item: '/console/lists',
};

/** Backslash is MySQL's own `LIKE` escape character, so it has to escape itself first. */
export function likeOf(term: string): string {
  return `%${term.trim().replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

interface HitRow {
  id: string;
  row_key: string;
  title_ar: string | null;
  title_en: string | null;
}

export async function searchRows(resources: readonly Resource[], term: string, limit = 12): Promise<SearchHit[]> {
  const needle = likeOf(term);
  const hits: SearchHit[] = [];

  for (const resource of resources) {
    const kind = KIND_OF[resource];
    if (!kind) continue;
    const spec = kindSpec(kind);
    // The first bilingual field is the one the console shows as the row's title.
    const title = spec.bi.find((field) => field.name === 'title' || field.name === 'name');
    if (!title) continue;

    // The columns are named by `kinds.ts`, and only the needle is a bind parameter.
    const pattern = sql<SqlBool>`(${sql.ref(spec.keyColumn)} LIKE ${needle} OR ${sql.ref(title.draft.ar)} LIKE ${needle} OR ${sql.ref(title.draft.en)} LIKE ${needle})`;

    const rows = await db
      .selectFrom(spec.table)
      .select([
        'id',
        sql<string>`${sql.ref(spec.keyColumn)}`.as('row_key'),
        sql<string | null>`${sql.ref(title.draft.ar)}`.as('title_ar'),
        sql<string | null>`${sql.ref(title.draft.en)}`.as('title_en'),
      ])
      .where('deleted_at', 'is', null)
      .where(pattern)
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .execute();

    for (const row of rows as unknown as HitRow[]) {
      hits.push({
        kind,
        id: row.id,
        key: row.row_key,
        // Arabic is the site's primary language, so it wins when a row has both.
        title: (row.title_ar || row.title_en || row.row_key).trim(),
        path: `${SCREEN_OF[kind]}?key=${encodeURIComponent(row.row_key)}`,
      });
    }
  }

  return hits;
}
