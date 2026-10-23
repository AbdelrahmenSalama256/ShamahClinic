/**
 * The list view, as data — and as a URL.
 *
 * One screen's list state is six terms: how it is drawn, what it is ordered by,
 * which rows survive the filter, the search term, and where in the result the page
 * sits. All six live in the query string, so a view is linkable, shareable and
 * restorable by a colleague, and the saved filter is nothing more than a name pasted
 * onto the same string. Nothing here is a table name or a column name: the browser
 * sends these terms and the server maps them onto the columns `kinds.ts` declares,
 * which keeps a crafted query string from ever reaching SQL as an identifier.
 *
 * The defaults are per kind, not global, because the URL must round-trip: an offer
 * screen drops `sort=position` from its query string (it is that kind's default) and
 * must re-parse to the view it was written from. A single global default would drop
 * one kind's term and re-add another kind's direction.
 *
 * `parseListView` totalises: an unknown, missing or out-of-range term falls back to
 * the default rather than failing, because a list that refuses to draw over a typo in
 * a bookmark is a list the team stops trusting.
 */
import type { ContentKind } from './kinds';

export const LIST_MODES = ['table', 'card'] as const;
export type ListMode = (typeof LIST_MODES)[number];

/** The orders a list can be drawn in; the server maps each one onto declared columns. */
export const LIST_SORTS = ['title', 'key', 'status', 'updated', 'published', 'position'] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export const LIST_DIRS = ['asc', 'desc'] as const;
export type ListDir = (typeof LIST_DIRS)[number];

/**
 * The rows a chip keeps. `pending` is the draft having outrun the published copy, and
 * `off` a row the site does not render — neither is a `status` value, so both are
 * computed rather than matched.
 */
export const LIST_FILTERS = ['all', 'draft', 'published', 'changed', 'pending', 'off'] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];

export const LIST_PER_PAGES = [10, 25, 50, 100] as const;
export type ListPerPage = (typeof LIST_PER_PAGES)[number];

export interface ListView {
  mode: ListMode;
  sort: ListSort;
  dir: ListDir;
  q: string;
  filter: ListFilter;
  page: number;
  per: ListPerPage;
}

/** Terms a list keeps beside the view: the scope the guard checks, and the row to open. */
export interface ListScope {
  listKey: string | null;
  locale: string | null;
  trash: boolean;
  focusKey: string | null;
}

/** What each kind is ordered by out of the box: an authored list reads in its own order. */
const DEFAULT_SORT_OF: Record<ContentKind, ListSort> = {
  article: 'updated',
  offer: 'position',
  page: 'key',
  list_item: 'position',
};

/** The direction a column is first read in: newest first for time, natural order for the rest. */
export function naturalDir(sort: ListSort): ListDir {
  return sort === 'updated' || sort === 'published' ? 'desc' : 'asc';
}

/** The view a kind draws before anyone touches it — and the one a query string falls back onto. */
export function defaultViewFor(kind: ContentKind): ListView {
  const sort = DEFAULT_SORT_OF[kind];
  return { mode: 'table', sort, dir: naturalDir(sort), q: '', filter: 'all', page: 1, per: 25 };
}

type Params = Pick<URLSearchParams, 'get'>;

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes((value ?? '') as T) ? (value as T) : fallback;
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The view a query string asks for. Unknown terms fall back; they never throw.
 *
 * The kind decides what counts as known: `?sort=position` on an article and
 * `?filter=off` on an article fall back to the article's own defaults rather than
 * quietly ordering by the slug or matching every row. A list that lies about the view
 * it applied is worse than one that ignores a term.
 */
export function parseListView(params: Params, kind: ContentKind): ListView {
  const defaults = defaultViewFor(kind);
  const trash = params.get('trash') === '1';
  const sort = oneOf(params.get('sort'), sortsFor(kind), defaults.sort);
  const sizes = LIST_PER_PAGES;
  return {
    mode: oneOf(params.get('mode'), LIST_MODES, defaults.mode),
    sort,
    dir: oneOf(params.get('dir'), LIST_DIRS, naturalDir(sort)),
    q: (params.get('q') ?? '').trim().slice(0, 80),
    filter: oneOf(params.get('filter'), filtersFor(kind, trash), defaults.filter),
    page: positiveInt(params.get('page'), defaults.page),
    per: sizes.find((size) => size === Number(params.get('per'))) ?? defaults.per,
  };
}

/** The list's own orders; `position` only exists on a kind that declares it. */
export function sortsFor(kind: ContentKind): ListSort[] {
  const authored = kind === 'offer' || kind === 'list_item';
  const published = kind !== 'list_item';
  return LIST_SORTS.filter((sort) => (sort === 'position' ? authored : sort === 'published' ? published : true));
}

/** The filter chips a kind can honour: `changed` is a list item's, `off` needs an `enabled` column. */
export function filtersFor(kind: ContentKind, trash = false): ListFilter[] {
  // Trash is a different result set, not a state of this one: every row in it is trashed,
  // so `filter=draft` matches nothing and the Drafts chip looks like a broken link. A
  // measured consequence of toggling Trash from a Drafts view — the rows were still there,
  // the list was empty.
  if (trash) return ['all'];
  if (kind === 'list_item') return ['all', 'draft', 'published', 'changed', 'pending', 'off'];
  if (kind === 'article') return ['all', 'draft', 'published', 'pending'];
  return ['all', 'draft', 'published', 'pending', 'off'];
}

/**
 * The view as a query string, with the kind's own defaults left out.
 *
 * Omitting them is what makes a saved filter readable in the address bar and keeps a
 * sort click from growing the URL forever; `parseListView` re-adds exactly what was
 * dropped. `dir` is compared with the column's natural direction, not the kind's, so
 * "title, descending" is two terms and "title" alone is none.
 */
export function listViewParams(view: ListView, kind: ContentKind): URLSearchParams {
  const params = new URLSearchParams();
  const defaults = defaultViewFor(kind);
  if (view.mode !== defaults.mode) params.set('mode', view.mode);
  if (view.sort !== defaults.sort) params.set('sort', view.sort);
  if (view.dir !== naturalDir(view.sort)) params.set('dir', view.dir);
  if (view.q) params.set('q', view.q);
  if (view.filter !== defaults.filter) params.set('filter', view.filter);
  if (view.page > 1) params.set('page', String(view.page));
  if (view.per !== defaults.per) params.set('per', String(view.per));
  return params;
}

/** The scope terms, kept separate because the guard reads them and the view does not. */
export function listScopeParams(scope: ListScope): URLSearchParams {
  const params = new URLSearchParams();
  if (scope.listKey) params.set('list', scope.listKey);
  if (scope.locale) params.set('locale', scope.locale);
  if (scope.trash) params.set('trash', '1');
  if (scope.focusKey) params.set('key', scope.focusKey);
  return params;
}

/**
 * The line a **write** names its scope with — as opposed to the address bar, which carries
 * every term it knows. One spelling because the either/or is the rule, and three components
 * inventing it is three chances to send both terms: the guard reads the scope off the URL,
 * so a request that names a list *and* a locale is answered against whichever it reads
 * first, not the one the caller meant.
 */
export function writeScopeQuery(scope: { listKey: string | null; locale: string | null }): string {
  if (scope.listKey) return `?list=${encodeURIComponent(scope.listKey)}`;
  if (scope.locale) return `?locale=${encodeURIComponent(scope.locale)}`;
  // Nothing names the scope, so nothing is sent: the guard reads the scope off the URL and
  // a write that arrives without one is refused rather than guessed at.
  return '';
}

/** The scope a query string names. Each term is verbatim or absent: the server validates the values. */
export function parseListScope(params: Params): ListScope {
  return {
    listKey: (params.get('list') ?? '').trim().slice(0, 191) || null,
    locale: (params.get('locale') ?? '').trim() || null,
    trash: params.get('trash') === '1',
    focusKey: (params.get('key') ?? '').trim().slice(0, 191) || null,
  };
}

/** The full query string for a screen: scope first, then the view, so the URL reads like the nav. */
export function listViewQuery(view: ListView, scope: ListScope, kind: ContentKind): string {
  const params = listScopeParams(scope);
  // Writing `filter=draft` next to `trash=1` would put a term in the URL the parser answers
  // by falling back, so the address bar and the screen disagree about which chip is pressed.
  const drawn = scope.trash && view.filter !== 'all' ? { ...view, filter: 'all' as ListFilter } : view;
  for (const [key, value] of listViewParams(drawn, kind)) params.set(key, value);
  const line = params.toString();
  return line ? `?${line}` : '';
}

/**
 * The canonical query string for a screen, from whatever the browser sent.
 *
 * Re-parsing then re-rendering is what lets the console store a saved view and trust
 * it later: a term the parser ignores is dropped, an unknown value falls back, and the
 * row a `?key=` opened is left out, because a saved filter is a way to read a list,
 * not a bookmark of one row.
 */
export function canonicalViewQuery(params: Params, kind: ContentKind): string {
  const scope = parseListScope(params);
  return listViewQuery(parseListView(params, kind), { ...scope, focusKey: null }, kind);
}

/** The same view, with a different page — because "next" must not reset the filter. */
export function withPage(view: ListView, page: number): ListView {
  return { ...view, page: Math.max(1, page) };
}

/** A sort click on the column already sorted re-reads it the other way; a new column starts natural. */
export function withSort(view: ListView, sort: ListSort): ListView {
  if (view.sort === sort) return { ...view, dir: view.dir === 'asc' ? 'desc' : 'asc', page: 1 };
  return { ...view, sort, dir: naturalDir(sort), page: 1 };
}

/** Any term other than the page changed the result set, so page one is the only honest answer. */
export function withView(view: ListView, patch: Partial<ListView>): ListView {
  return { ...view, ...patch, page: patch.page ?? 1 };
}
