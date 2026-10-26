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
import { getRow, knownListKeys, listKeyOfItem, type ContentRow } from '../content/store';
import { filtersFor, parseListView, parseListScope, sortsFor, type ListFilter, type ListView, type ListSort } from '../content/list-view';
import { articleChoices, listChoices, linkedArticleTitle, listSummaries, type ListChoice, type ListPage } from '../content/summary';
import { listDocTitle, listSchemaOf } from '../content/list-schema';
import { catalogFor, type MessageKey } from './messages';
import { listSectionPath } from './paths';
import type { ConsoleLocale } from './prefs';
import { entitySeoOf, type EntitySeo } from './seo-center';

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
  /** every scope the screen can show: both languages, or the one list the section names */
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
  labels: Record<MessageKey, string>;
}

/** What a content page is asked to show: the kind, its heading, and the URL's whole query. */
export interface ContentScreenProps {
  kind: ContentKind;
  titleKey: MessageKey;
  /** A list-backed screen is one list's own section now, named by this key. */
  listKey?: string;
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
  input: { grants: readonly Grant[]; locale: ConsoleLocale; search?: ContentScreenProps['search']; listKey?: string | null },
): Promise<ContentScreenData | null> {
  const spec = kindSpec(kind);
  if (!can(input.grants, spec.resource, 'read', {})) return null;

  const params = paramsOf(input.search);
  const scope = parseListScope(params);
  const view = parseListView(params, kind);
  const activeLocale = localeAskedFor(scope.locale, input.locale);

  const abilities = abilitiesFor(kind, input.grants);
  // The catalog decides which lists a screen may offer. An archived row (the old
  // `treatments` list, kept in the database) stays content, but it is not a section
  // the navigation or the editor can reach.
  const known = new Set<string>(LIST_KEYS);
  const lists = spec.scope === 'lists' ? (await knownListKeys()).filter((key) => known.has(key)).map((key) => ({ key, label: LIST_LABELS[key as ListKey]?.[input.locale] ?? key })) : [];
  // A section route pins its list; `?list=` is only the old spelling. An unknown `?list=`
  // falls back to the first list rather than drawing an empty one the URL cannot explain.
  const asked = scope.listKey ?? '';
  const listKey =
    spec.scope === 'lists'
      ? input.listKey || (lists.some((list) => list.key === asked) ? asked : lists[0]?.key ?? null)
      : null;

  // A list screen reads one list at a time; a bilingual row carries both locales, so its
  // tabs are views over the same rows and the locale only decides which title sorts.
  const page = await listSummaries(kind, { view, listKey, trash: scope.trash, locale: activeLocale });

  return {
    kind,
    scopeKind: spec.scope,
    keyColumn: spec.keyColumn,
    scopes: spec.scope === 'lists' ? (listKey ? [listKey] : []) : [...CONTENT_LOCALES],
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
    labels: catalogFor(input.locale),
  };
}

/** One row, as the detail screen draws it: the document, its scope, and what may be written. */
export interface ContentDetailData {
  kind: ContentKind;
  row: ContentRow;
  /** the list a `list_item` belongs to; null for a bilingual kind */
  listKey: string | null;
  /** the language tab to open, and the one a write names */
  activeLocale: ContentLocale;
  abilities: ContentAbilities;
  /** the scopes this row may be published in */
  publishable: ContentScope[];
  /** the title the row is known by in the active language, for the screen's heading */
  title: string;
  /** the list screen this row came from, with its own scope kept */
  backHref: string;
  /** what each `refs` field may point at, keyed by the field's stem */
  referenceOptions: Record<string, ListChoice[]>;
  /** the row's search result: public path, inherited copy, override, and this role's write */
  seo: EntitySeo & { writable: boolean };
  labels: Record<MessageKey, string>;
}

export type ContentDetailResult =
  | { ok: true; data: ContentDetailData }
  | { ok: false; reason: 'forbidden' | 'not_found' };

/**
 * One row for the dedicated detail route.
 *
 * The row is read by id — the id is the address now, not a `?key=` on a list screen —
 * and a list item has to prove it belongs to a list, the same way a bulk write does.
 * The screen is server-rendered so the first paint holds the document, and the client
 * editor starts from `initialRow` rather than flashing an empty form while it fetches
 * what the server already had.
 */
export async function contentDetailData(
  kind: ContentKind,
  id: string,
  input: { grants: readonly Grant[]; locale: ConsoleLocale; search?: ContentScreenProps['search']; listKey?: string | null },
): Promise<ContentDetailResult> {
  const spec = kindSpec(kind);
  if (!can(input.grants, spec.resource, 'read', {})) return { ok: false, reason: 'forbidden' };

  const row = await getRow(kind, id);
  if (!row) return { ok: false, reason: 'not_found' };

  const params = paramsOf(input.search);
  const activeLocale = localeAskedFor(params.get('locale'), input.locale);
  const listKey = spec.scope === 'lists' ? await listKeyOfItem(id) : null;
  // The section names the list, so an item opened under another section's address is a
  // miss rather than a row shown under the wrong heading.
  if (spec.scope === 'lists' && (!listKey || (input.listKey && listKey !== input.listKey))) {
    return { ok: false, reason: 'not_found' };
  }

  const abilities = abilitiesFor(kind, input.grants);
  const schema = listKey ? listSchemaOf(listKey) : null;
  let title = '';
  if (spec.table === 'list_items') {
    const doc = row.fields.data?.draftJson;
    if (schema) {
      title = listDocTitle(schema, doc !== null && typeof doc === 'object' && !Array.isArray(doc) ? (doc as Record<string, unknown>) : {}, activeLocale);
    }
    // An unnamed result story is the article its uid points at; a heading of "1182" is
    // the defect, not a name.
    if (!title && listKey === 'results') title = await linkedArticleTitle(row.key, activeLocale);
  } else {
    const titleField = spec.bi.find((field) => field.name === 'title' || field.name === 'name');
    title = titleField ? row.fields[titleField.name]?.draft?.[activeLocale]?.trim() || row.key : row.key;
  }
  if (!title) title = row.key;
  const publishable = spec.scope === 'lists' ? abilities.publish.filter((scope) => scope === listKey) : abilities.publish;
  const seo = await entitySeoOf(kind, row.key, listKey, activeLocale);

  const referenceOptions: Record<string, ListChoice[]> = {};
  for (const field of schema?.fields ?? []) {
    if (field.type === 'refs') referenceOptions[field.stem] = await listChoices(field.source, activeLocale);
    // A result story is not a list item, so its choices come from the journal itself.
    if (field.type === 'story') referenceOptions[field.stem] = await articleChoices(activeLocale);
  }

  return {
    ok: true,
    data: {
      kind,
      row,
      listKey,
      activeLocale,
      abilities,
      publishable,
      title,
      backHref:
        spec.scope === 'lists'
          ? listSectionPath(listKey ?? '')
          : `/console/${kind}s?locale=${activeLocale}`,
      referenceOptions,
      seo: { ...seo, writable: can(input.grants, 'seo', 'update', {}) },
      labels: catalogFor(input.locale),
    },
  };
}
