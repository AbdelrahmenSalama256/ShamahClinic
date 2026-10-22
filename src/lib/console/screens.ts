/**
 * The navigation, as the permission catalog describes it.
 *
 * Three levels — group, screen, entity — because that is the shape the grants
 * themselves have: a role holds `article update` scoped to `{locales:['ar']}`, or
 * `list update` scoped to `{lists:['branches']}`. So the tree reads directly off
 * `can()` instead of a second list of "who may see what" that would drift.
 *
 * Two rules, both inherited from BK-5 and both asserted in `tests/console.test.ts`:
 *   - a screen the caller cannot **read** is not rendered at all, so nobody tabs
 *     through a control that would answer 403;
 *   - an entity the caller can read but not **write** is rendered and greyed, because
 *     reading the Arabic articles is a real job and hiding the tab would hide the
 *     screen's own structure.
 *
 * The entity vocabulary is the catalog's, not the database's: `LIST_KEYS` from
 * `src/lib/auth/roles.ts` is what a scoped grant can name, so a `lists` row that
 * somehow exists outside it would be an editable-looking leaf no role can write.
 */
import { can, type Action, type Grant, type Resource } from '../auth/permissions';
import { LIST_KEYS } from '../auth/roles';
import { CONTENT_LOCALES, type ContentLocale } from '../content/kinds';
import { LIST_LABELS, type ListKey } from '../content/lists';
import { message, type MessageKey } from './messages';
import type { ConsoleLocale } from './prefs';

export type NavGroupKey = 'workspace' | 'content' | 'site' | 'account';
/** Which vocabulary this screen's leaves come from. */
export type EntityVocabulary = 'none' | 'locales' | 'lists';

export interface ConsoleScreen {
  /** Doubles as the message key, so a screen with no label is a type error. */
  key: 'overview' | 'articles' | 'offers' | 'pages' | 'lists' | 'settings' | 'password';
  path: string;
  /** `null` is the landing screen: anyone with a session may open it. */
  resource: Resource | null;
  action: Action;
  group: NavGroupKey;
  entities: EntityVocabulary;
}

/**
 * The sidebar is this list filtered by what the caller may read. Each BK appends its
 * own entry when the page exists — nothing here links to a screen not built yet.
 *
 * The order is the order the sidebar shows inside each group, and
 * `tests/console.test.ts` asserts both halves of it: a screen with no page file and a
 * page file with no screen each fail the suite.
 */
export const CONSOLE_SCREENS: readonly ConsoleScreen[] = [
  { key: 'overview', path: '/console', resource: null, action: 'read', group: 'workspace', entities: 'none' },
  { key: 'articles', path: '/console/articles', resource: 'article', action: 'read', group: 'content', entities: 'locales' },
  { key: 'offers', path: '/console/offers', resource: 'offer', action: 'read', group: 'content', entities: 'locales' },
  { key: 'pages', path: '/console/pages', resource: 'page', action: 'read', group: 'content', entities: 'locales' },
  { key: 'lists', path: '/console/lists', resource: 'list', action: 'read', group: 'content', entities: 'lists' },
  // Only Owner and Admin hold `setting read`, so this is the one content screen a
  // content role never sees. `is_secret` rows are hidden inside it, not here.
  // Settings have no permission dimension of their own — `PermissionScope` names
  // locales, lists, pages and lead sources — so a tree of group names would be
  // decoration, and this screen stays a single leaf.
  { key: 'settings', path: '/console/settings', resource: 'setting', action: 'read', group: 'site', entities: 'none' },
  // `self` needs no grant, so this is the one screen every role is expected to hold.
  { key: 'password', path: '/console/password', resource: 'self', action: 'update', group: 'account', entities: 'none' },
];

const GROUP_ORDER: readonly NavGroupKey[] = ['workspace', 'content', 'site', 'account'];

export interface NavLeaf {
  key: string;
  label: string;
  path: string;
  writable: boolean;
}

export interface NavBranch {
  key: string;
  label: string;
  path: string;
  /** the screen level is greyed when every one of its entities is, and it has some */
  writable: boolean;
  leaves: NavLeaf[];
}

export interface NavGroup {
  key: NavGroupKey;
  label: string;
  branches: NavBranch[];
}

export function visibleScreens(grants: readonly Grant[]): ConsoleScreen[] {
  return CONSOLE_SCREENS.filter((screen) => screen.resource === null || can(grants, screen.resource, screen.action, {}));
}

function leafPath(screen: ConsoleScreen, param: string, value: string): string {
  return `${screen.path}?${param}=${encodeURIComponent(value)}`;
}

function leavesOf(screen: ConsoleScreen, grants: readonly Grant[], locale: ConsoleLocale): NavLeaf[] {
  if (!screen.resource || screen.entities === 'none') return [];
  // Reads are unscoped in this catalog, so every entity of a readable screen is a leaf.
  const writable = (target: Parameters<typeof can>[3]): boolean => can(grants, screen.resource as Resource, 'update', target);

  if (screen.entities === 'locales') {
    return CONTENT_LOCALES.map((code: ContentLocale) => ({
      key: code,
      label: message(`content.locale.${code}` as MessageKey, locale),
      path: leafPath(screen, 'locale', code),
      writable: writable({ locales: code }),
    }));
  }

  return LIST_KEYS.map((listKey: ListKey) => ({
    key: listKey,
    label: LIST_LABELS[listKey]?.[locale] ?? listKey,
    path: leafPath(screen, 'list', listKey),
    writable: writable({ lists: listKey }),
  }));
}

/** Screens grouped for the sidebar, with each screen's entities and their write state. */
export function navTree(grants: readonly Grant[], locale: ConsoleLocale): NavGroup[] {
  const visible = visibleScreens(grants);

  return GROUP_ORDER.map((group) => ({
    key: group,
    label: message(`nav.group.${group}` as MessageKey, locale),
    branches: visible
      .filter((screen) => screen.group === group)
      .map((screen) => {
        const leaves = leavesOf(screen, grants, locale);
        return {
          key: screen.key,
          label: message(`nav.${screen.key}` as MessageKey, locale),
          path: screen.path,
          writable: !screen.resource || can(grants, screen.resource, 'update', {}) || leaves.some((leaf) => leaf.writable),
          leaves,
        };
      }),
  })).filter((group) => group.branches.length > 0);
}

/** The phone tab bar: the same screens, flat, because a drawer holds the tree. */
export function navStrip(grants: readonly Grant[], locale: ConsoleLocale): NavBranch[] {
  return navTree(grants, locale).flatMap((group) => group.branches.map((branch) => ({ ...branch, leaves: [] })));
}

/**
 * One reachable place for the palette.
 *
 * Both levels of the tree are listed, because they answer two different requests:
 * "open the lists screen" and "show me the branches list". The `group` string is what
 * the palette filters on besides the label, so a leaf carries its screen inside it.
 */
export interface PalettePlace {
  path: string;
  label: string;
  group: string;
  writable: boolean;
}

export function palettePlaces(grants: readonly Grant[], locale: ConsoleLocale): PalettePlace[] {
  const out: PalettePlace[] = [];
  for (const group of navTree(grants, locale)) {
    for (const branch of group.branches) {
      out.push({ path: branch.path, label: branch.label, group: group.label, writable: branch.writable });
      for (const leaf of branch.leaves) {
        out.push({ path: leaf.path, label: leaf.label, group: `${group.label} · ${branch.label}`, writable: leaf.writable });
      }
    }
  }
  return out;
}
