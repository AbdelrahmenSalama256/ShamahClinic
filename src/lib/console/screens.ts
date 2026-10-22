import { can, type Action, type Grant, type Resource } from '../auth/permissions';

export interface ConsoleScreen {
  /** Doubles as the message key, so a screen with no label is a type error. */
  key: 'overview' | 'articles' | 'offers' | 'pages' | 'lists' | 'settings' | 'password';
  path: string;
  /** `null` is the landing screen: anyone with a session may open it. */
  resource: Resource | null;
  action: Action;
}

/**
 * The sidebar is this list filtered by what the caller may read, so a role that
 * cannot reach a screen never sees a control that would 403. Each BK appends its
 * own entry when the page exists — nothing here links to a screen not built yet.
 *
 * The order is the order the sidebar shows, and `tests/console.test.ts` asserts
 * both halves of it: a screen with no page file and a page file with no screen
 * each fail the suite.
 */
export const CONSOLE_SCREENS: readonly ConsoleScreen[] = [
  { key: 'overview', path: '/console', resource: null, action: 'read' },
  { key: 'articles', path: '/console/articles', resource: 'article', action: 'read' },
  { key: 'offers', path: '/console/offers', resource: 'offer', action: 'read' },
  { key: 'pages', path: '/console/pages', resource: 'page', action: 'read' },
  { key: 'lists', path: '/console/lists', resource: 'list', action: 'read' },
  // Only Owner and Admin hold `setting read`, so this is the one content screen a
  // content role never sees. `is_secret` rows are hidden inside it, not here.
  { key: 'settings', path: '/console/settings', resource: 'setting', action: 'read' },
  // `self` needs no grant, so this is the one screen every role is expected to hold.
  { key: 'password', path: '/console/password', resource: 'self', action: 'update' },
];

export function visibleScreens(grants: readonly Grant[]): ConsoleScreen[] {
  return CONSOLE_SCREENS.filter((screen) => screen.resource === null || can(grants, screen.resource, screen.action, {}));
}
