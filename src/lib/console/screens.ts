/**
 * The navigation, as one flat list.
 *
 * The sidebar used to be a permission tree — group, screen, entity — because that is the
 * shape the grants have. But a tree made a person open a fold to reach the Arabic articles
 * and another to reach the branches list, and the console is a work surface: every
 * destination this role can read is one row, in the order the work is done.
 *
 * Two rules, both inherited from BK-5 and both asserted in `tests/console.test.ts`:
 *   - a destination the caller cannot **read** is not rendered at all, so nobody tabs
 *     through a control that would answer 403;
 *   - a destination the caller can read but not **write** is rendered and greyed, because
 *     reading the Arabic articles is a real job and hiding the row would hide the work.
 *
 * The list vocabulary is the catalog's, not the database's: `LIST_KEYS` from
 * `src/lib/auth/roles.ts` is what a scoped grant can name, so a `lists` row that
 * somehow exists outside it would be an editable-looking row no role can write.
 *
 * Sign-out is not here: it is an action, not a screen, and `ConsoleNav` renders it after
 * these rows. The palette takes the same list, so a section is findable two ways and
 * both answer with the same address.
 */
import { can, type Action, type Grant, type Resource } from '../auth/permissions';
import { LIST_KEYS } from '../auth/roles';
import { CONTENT_LOCALES, type ContentLocale } from '../content/kinds';
import { LIST_LABELS } from '../content/lists';
import { message, type MessageKey } from './messages';
import { listSectionPath } from './paths';
import type { ConsoleLocale } from './prefs';

/** Which vocabulary this screen's rows come from. */
export type EntityVocabulary = 'none' | 'locales' | 'lists';

export interface ConsoleScreen {
  /** Doubles as the message key, so a screen with no label is a type error. */
  key:
    | 'overview'
    | 'leads'
    | 'articles'
    | 'offers'
    | 'pages'
    | 'about'
    | 'hero'
    | 'lists'
    | 'texts'
    | 'seo'
    | 'redirects'
    | 'tracking'
    | 'settings'
    | 'users'
    | 'roles'
    | 'password';
  path: string;
  /** `null` is the landing screen: anyone with a session may open it. */
  resource: Resource | null;
  action: Action;
  entities: EntityVocabulary;
}

/**
 * Every screen the console has, in the order its row appears in the sidebar. A screen
 * whose entities are lists expands into one row per list at this position — the
 * aggregate `/console/lists` path is a redirect, not a destination.
 *
 * The order is asserted in `tests/console.test.ts`: the working screens come first, the
 * site's configuration next, then the account's own screen. Nothing here links to a
 * screen that is not built.
 */
export const CONSOLE_SCREENS: readonly ConsoleScreen[] = [
  { key: 'overview', path: '/console', resource: null, action: 'read', entities: 'none' },
  // An enquiry is the one thing on the site that stops existing if nobody looks at it,
  // so it sits beside the overview rather than at the end of the content screens. Reads
  // are unscoped; every role with a `lead read` grant sees the list, and the contact
  // columns are blanked for the ones that may only count.
  { key: 'leads', path: '/console/leads', resource: 'lead', action: 'read', entities: 'none' },
  { key: 'articles', path: '/console/articles', resource: 'article', action: 'read', entities: 'locales' },
  { key: 'offers', path: '/console/offers', resource: 'offer', action: 'read', entities: 'locales' },
  { key: 'pages', path: '/console/pages', resource: 'page', action: 'read', entities: 'locales' },
  { key: 'about', path: '/console/pages/about', resource: 'page', action: 'read', entities: 'locales' },
  // The homepage's own photographs and headline. It is a page surface, not a new content
  // type: the grant is `page`, so a role that may rewrite that page may change its slider.
  { key: 'hero', path: '/console/hero', resource: 'page', action: 'read', entities: 'none' },
  // Each named list is its own section, so the aggregate row is never rendered; the
  // screen stays here because the page file and the `list read` grant still exist.
  { key: 'lists', path: '/console/lists', resource: 'list', action: 'read', entities: 'lists' },
  // The site's own sentences. It sits with the content screens because that is what it
  // edits — the words of a page — and it needs no new grant: a role that may write a page
  // may write its wording, in the languages it is already limited to.
  { key: 'texts', path: '/console/texts', resource: 'page', action: 'read', entities: 'locales' },
  // Every address the site serves, with the words a search result shows for it. It sits
  // after the content sections because the words come from those rows; the screen is a
  // second way to read the same site, not a separate content type.
  { key: 'seo', path: '/console/seo', resource: 'seo', action: 'read', entities: 'none' },
  { key: 'redirects', path: '/console/redirects', resource: 'redirect', action: 'read', entities: 'none' },
  // The tags that watch the site and where a lead goes. A Marketer holds `integration`
  // and nothing else here, so this is their screen; no other role has a reason to open it.
  { key: 'tracking', path: '/console/tracking', resource: 'integration', action: 'read', entities: 'none' },
  // The site's configuration, in the order the owner named it: who may do what, who has
  // an account, and then the settings both of those roles share.
  // Only Owner and Admin hold `setting read`, so Settings is the one content screen a
  // content role never sees. `is_secret` rows are hidden inside it, not here.
  { key: 'roles', path: '/console/roles', resource: 'role', action: 'read', entities: 'none' },
  { key: 'users', path: '/console/users', resource: 'user', action: 'read', entities: 'none' },
  { key: 'settings', path: '/console/settings', resource: 'setting', action: 'read', entities: 'none' },
  // `self` needs no grant, so this is the one screen every role is expected to hold.
  { key: 'password', path: '/console/password', resource: 'self', action: 'update', entities: 'none' },
];

export interface NavItem {
  key: string;
  label: string;
  path: string;
  writable: boolean;
}

/** The palette's section rows are the navigation's rows; a place has no second shape. */
export type PalettePlace = NavItem;

export function visibleScreens(grants: readonly Grant[]): ConsoleScreen[] {
  return CONSOLE_SCREENS.filter((screen) => screen.resource === null || can(grants, screen.resource, screen.action, {}));
}

/**
 * Whether a screen can take a write at the scope its rows name.
 *
 * A grant scoped to Arabic never matches an unscoped `can(…, {})`, so a content screen
 * asks each locale and is writable when any one of them is. A list screen asks each list;
 * every other screen has no scope and asks once.
 */
function writableOf(screen: ConsoleScreen, grants: readonly Grant[]): boolean {
  if (!screen.resource) return true;
  if (screen.entities === 'locales') {
    return CONTENT_LOCALES.some((code: ContentLocale) => can(grants, screen.resource as Resource, 'update', { locales: code }));
  }
  return can(grants, screen.resource, 'update', {});
}

/**
 * The sidebar's rows and the phone strip's pills, in one order.
 *
 * A list screen contributes one row per list at the screen's position, so "Services" is a
 * destination of its own rather than a tab inside "Lists". Every row is a link a person
 * can read; the `writable` flag only decides whether it is greyed.
 */
export function navItems(grants: readonly Grant[], locale: ConsoleLocale): NavItem[] {
  const out: NavItem[] = [];

  for (const screen of visibleScreens(grants)) {
    if (screen.entities === 'lists' && screen.resource) {
      for (const listKey of LIST_KEYS) {
        out.push({
          key: listKey,
          label: LIST_LABELS[listKey]?.[locale] ?? listKey,
          path: listSectionPath(listKey),
          writable: can(grants, screen.resource, 'update', { lists: listKey }),
        });
      }
      continue;
    }

    out.push({
      key: screen.key,
      label: message(`nav.${screen.key}` as MessageKey, locale),
      path: screen.path,
      writable: writableOf(screen, grants),
    });
  }

  return out;
}

/**
 * One reachable place for the palette.
 *
 * The list is the navigation's own, because a palette that answered to a second list
 * would be a second navigation: two places to add a section, and one of them would fall
 * behind. A section the role cannot write is still listed, marked — the palette is also
 * how someone finds the screen they may only read.
 */
export function palettePlaces(grants: readonly Grant[], locale: ConsoleLocale): PalettePlace[] {
  return navItems(grants, locale);
}
