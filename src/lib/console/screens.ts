import { can, type Action, type Grant, type Resource } from '../auth/permissions';

export interface ConsoleScreen {
  /** Doubles as the message key, so a screen with no label is a type error. */
  key: 'overview' | 'password';
  path: string;
  /** `null` is the landing screen: anyone with a session may open it. */
  resource: Resource | null;
  action: Action;
}

/**
 * The sidebar is this list filtered by what the caller may read, so a role that
 * cannot reach a screen never sees a control that would 403. Each BK appends its
 * own entry when the page exists — nothing here links to a screen not built yet.
 */
export const CONSOLE_SCREENS: readonly ConsoleScreen[] = [
  { key: 'overview', path: '/console', resource: null, action: 'read' },
  // `self` needs no grant, so this is the one screen every role is expected to hold.
  { key: 'password', path: '/console/password', resource: 'self', action: 'update' },
];

export function visibleScreens(grants: readonly Grant[]): ConsoleScreen[] {
  return CONSOLE_SCREENS.filter((screen) => screen.resource === null || can(grants, screen.resource, screen.action, {}));
}
