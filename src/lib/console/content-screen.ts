/**
 * What a content screen shows: the rows, and the buttons this caller is allowed to
 * press for each scope.
 *
 * The console renders the first page of rows on the server so the first paint is real
 * content, then hands them to one client workspace that refetches after every mutation.
 * The read is one page of summaries (./summary.ts), never the whole table: this is the
 * screen that opens on 92 articles, and pulling 92 bodies to draw 92 titles is how a
 * console becomes the slowest page on the site. The abilities are computed here rather
 * than in the browser because the grant scopes
 * (`{locales:[…]}` for a bilingual kind, `{lists:[…]}` for a list) only mean
 * something once you name the dimension — and the workspace's job is to not offer
 * a control the API would answer with a 403.
 *
 * The API is the enforcement; this is the courtesy.
 */
import { can, type Action, type Grant, type Target } from '../auth/permissions';
import { LIST_KEYS } from '../auth/roles';
import { CONTENT_LOCALES, kindSpec, type ContentKind, type ContentLocale } from '../content/kinds';
import { LIST_LABELS, type ListKey } from '../content/lists';
import { idForRowKey, knownListKeys } from '../content/store';
import { filtersFor, parseListView, parseListScope, sortsFor, type ListFilter, type ListView, type ListSort } from '../content/list-view';
import { listSummaries, type ListPage } from '../content/summary';
import { catalogFor, type MessageKey } from './messages';
import type { ConsoleLocale } from './prefs';

/** The dimension a request names: a locale code, or a `lists.list_key`. */
export type ContentScope = ContentLocale | string;

export interface ContentAbilities {
  create: ContentScope[];
  update: ContentScope[];
  publish: ContentScope[];
  remove: ContentScope[];
}

export interface ContentScreenData {
  kind: ContentKind;
  /** which dimension a write names: `locale` for a bilingual row, `list` for a list item */
  scopeKind: 'locales' | 'lists';
  /** the identity column, so the create form can label it and the site can link it */
  keyColumn: string;
  /** every scope the screen can show — reads are unscoped, so this is all of them */
  scopes: ContentScope[];
  abilities: ContentAbilities;
  /** the caller may read the resource at all, but not one scope of it */
  writable: boolean;
  /** one page of rows, filtered/searched/ordered by the database, not the browser */
  page: ListPage;
  /** the view the page was actually read with — after unknown terms fell back */
  view: ListView;
  trash: boolean;
  /** the list a `list_item` screen is showing; null for a bilingual kind */
  listKey: string | null;
  /** the orders and chips this kind honours, so the browser draws no control the query would ignore */
  sorts: ListSort[];
  filters: ListFilter[];
  lists: { key: string; label: string }[];
  locale: ConsoleLocale;
  /**
   * The language tab to open. `?locale=` wins over the console's own locale because
   * the URL is what a nav leaf, a palette hit or a shared link carries.
   */
  activeLocale: ContentLocale;
  /** The row the URL asked to open, and the id it is loaded by: the page shown may not hold it. */
  focusKey: string | null;
  focusId: string | null;
  labels: Record<MessageKey, string>;
}

/** What a content page is asked to show: the kind, its heading, and the URL's whole query. */
export interface ContentScreenProps {
  kind: ContentKind;
  titleKey: MessageKey;
  /** Next hands `searchParams` over as flat-or-array strings; the view parses them. */
  search?: Record<string, string | string[] | undefined>;
}

function paramsOf(search: ContentScreenProps['search']): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search ?? {})) {
    const text = Array.isArray(value) ? value[0] : value;
    if (text !== undefined) params.set(key, text);
  }
  return params;
}

/** `?locale=`, but only the two codes the content actually has. */
function localeAskedFor(value: string | null | undefined, fallback: ConsoleLocale): ContentLocale {
  if (value === 'ar' || value === 'en') return value;
  return fallback === 'en' ? 'en' : 'ar';
}

function targetOf(scope: ContentScope, named: 'locales' | 'lists'): Target {
  return named === 'lists' ? { lists: String(scope) } : { locales: String(scope) };
}

/** The scopes holding one action, checked against the role's grant scopes. */
function scopesHolding(
  grants: readonly Grant[],
  resource: Parameters<typeof can>[1],
  action: Action,
  candidates: readonly ContentScope[],
  named: 'locales' | 'lists',
): ContentScope[] {
  return candidates.filter((scope) => can(grants, resource, action, targetOf(scope, named)));
}

function abilitiesFor(kind: ContentKind, grants: readonly Grant[]): ContentAbilities {
  const spec = kindSpec(kind);
  const named = spec.scope;
  const candidates: readonly ContentScope[] = named === 'lists' ? LIST_KEYS : CONTENT_LOCALES;
  const holding = (action: Action): ContentScope[] => scopesHolding(grants, spec.resource, action, candidates, named);

  return {
    create: holding('create'),
    update: holding('update'),
    // Publishing needs the publish grant *and* a writable draft in that scope:
    // `publishHandler` re-tests both, so a button for a scope this caller cannot
    // write would only ever answer `no_writable_locale`.
    publish: holding('publish').filter((scope) => holding('update').includes(scope)),
    remove: holding('delete'),
  };
}

/** Rows for one content screen, or `null` when the role cannot read the resource. */
export async function contentScreenData(
  kind: ContentKind,
  input: { grants: readonly Grant[]; locale: ConsoleLocale; search?: ContentScreenProps['search'] },
): Promise<ContentScreenData | null> {
  const spec = kindSpec(kind);
  if (!can(input.grants, spec.resource, 'read', {})) return null;

  const params = paramsOf(input.search);
  const scope = parseListScope(params);
  const view = parseListView(params, kind);
  const activeLocale = localeAskedFor(scope.locale, input.locale);

  const abilities = abilitiesFor(kind, input.grants);
  const lists = spec.scope === 'lists' ? (await knownListKeys()).map((key) => ({ key, label: LIST_LABELS[key as ListKey]?.[input.locale] ?? key })) : [];
  // A `?list=` nobody has registered is not a scope a screen can show, so the tab falls
  // back to the first list rather than drawing an empty one the URL cannot explain.
  const asked = scope.listKey ?? '';
  const listKey = spec.scope === 'lists' ? (lists.some((list) => list.key === asked) ? asked : lists[0]?.key ?? null) : null;

  // A list screen reads one list at a time; a bilingual row carries both locales, so its
  // tabs are views over the same rows and the locale only decides which title sorts.
  const page = await listSummaries(kind, { view, listKey, trash: scope.trash, locale: activeLocale });
  const focusKey = scope.focusKey;
  const focusId = focusKey ? await idForRowKey(kind, focusKey, listKey ?? undefined) : null;

  return {
    kind,
    scopeKind: spec.scope,
    keyColumn: spec.keyColumn,
    scopes: spec.scope === 'lists' ? lists.map((list) => list.key) : [...CONTENT_LOCALES],
    abilities,
    writable: abilities.update.length > 0,
    page,
    view,
    sorts: sortsFor(kind),
    filters: filtersFor(kind, scope.trash),
    trash: scope.trash,
    listKey,
    lists,
    locale: input.locale,
    activeLocale,
    focusKey,
    focusId,
    labels: catalogFor(input.locale),
  };
}
