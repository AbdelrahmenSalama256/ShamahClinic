/**
 * What a content screen shows: the rows, and the buttons this caller is allowed to
 * press for each scope.
 *
 * The console renders the rows on the server so the first paint is real content,
 * then hands them to one client workspace that refetches after every mutation. The
 * abilities are computed here rather than in the browser because the grant scopes
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
import { knownListKeys, listRows, type ContentRow } from '../content/store';
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
  rows: ContentRow[];
  trash: boolean;
  /** the list a `list_item` screen is showing; null for a bilingual kind */
  listKey: string | null;
  lists: { key: string; label: string }[];
  locale: ConsoleLocale;
  labels: Record<MessageKey, string>;
}

/** What a content page is asked to show: the kind, its heading, and the URL's scope. */
export interface ContentScreenProps {
  kind: ContentKind;
  titleKey: MessageKey;
  listKey?: string | null;
  trash?: boolean;
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
  input: { grants: readonly Grant[]; locale: ConsoleLocale; listKey?: string | null; trash?: boolean },
): Promise<ContentScreenData | null> {
  const spec = kindSpec(kind);
  if (!can(input.grants, spec.resource, 'read', {})) return null;

  const abilities = abilitiesFor(kind, input.grants);
  const lists =
    spec.scope === 'lists'
      ? (await knownListKeys()).map((key) => ({ key, label: LIST_LABELS[key as ListKey]?.[input.locale] ?? key }))
      : [];
  const listKey = spec.scope === 'lists' ? (input.listKey ?? lists[0]?.key ?? null) : null;

  // A list screen edits one list at a time, so it reads only that one. A bilingual
  // row carries both locales, so its tabs are views over the same rows.
  const rows = spec.scope === 'lists' && !listKey ? [] : await listRows(kind, { listKey: listKey ?? undefined, trash: input.trash ?? false });

  return {
    kind,
    scopeKind: spec.scope,
    keyColumn: spec.keyColumn,
    scopes: spec.scope === 'lists' ? lists.map((list) => list.key) : [...CONTENT_LOCALES],
    abilities,
    writable: abilities.update.length > 0,
    rows,
    trash: input.trash ?? false,
    listKey,
    lists,
    locale: input.locale,
    labels: catalogFor(input.locale),
  };
}
