/**
 * Permission matching. Pure: no database, no request, so every scope rule is
 * testable in a table instead of through an endpoint.
 *
 * A grant is `{ resource, action, scope }`. `'*'` means every resource or action.
 * `scope === null` means the whole resource; a scope object narrows only the
 * dimensions it names — and then a request must name that dimension and fall
 * inside it. An empty array therefore means "none of it".
 */
import type { PermissionScope } from '../db/types';

export const RESOURCES = [
  'self',
  'article',
  'offer',
  'page',
  'list',
  'setting',
  'seo',
  'redirect',
  'media',
  'lead',
  'cta',
  'stat',
  'user',
  'role',
  'permission_request',
  'audit',
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ['read', 'create', 'update', 'delete', 'publish', 'export'] as const;
export type Action = (typeof ACTIONS)[number];

/** The row a request is about, as far as it is known. */
export type Target = Partial<Record<keyof PermissionScope, string>>;

export interface Grant {
  resource: string;
  action: string;
  scope: PermissionScope | null;
}

export function grantMatches(grant: Grant, resource: Resource, action: Action): boolean {
  return (grant.resource === '*' || grant.resource === resource) && (grant.action === '*' || grant.action === action);
}

function dimensionAllowed(values: string[] | undefined, requested: string | undefined): boolean {
  if (values === undefined) return true;
  if (requested === undefined) return false;
  return values.includes(requested);
}

export function scopeAllows(scope: PermissionScope | null, target: Target): boolean {
  if (scope === null) return true;
  return (
    dimensionAllowed(scope.pages, target.pages) &&
    dimensionAllowed(scope.lists, target.lists) &&
    dimensionAllowed(scope.locales, target.locales) &&
    dimensionAllowed(scope.leadSources, target.leadSources)
  );
}

/**
 * `self` is the caller's own account — password, locale, theme. It is never
 * stored in `role_permissions`: a Viewer who cannot change their own password
 * is an account that never rotates.
 */
export function can(grants: readonly Grant[], resource: Resource, action: Action, target: Target = {}): boolean {
  if (resource === 'self') return action === 'read' || action === 'update';
  return grants.some(
    (grant) => grantMatches(grant, resource, action) && (grant.scope === null || scopeAllows(grant.scope, target)),
  );
}
