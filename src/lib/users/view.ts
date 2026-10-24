/**
 * The read side of the accounts screen: one page of users, and the roles with the grants
 * they carry.
 *
 * Both shapes are computed on the server, because the browser must never be the thing that
 * decides who has which permission — the roles editor renders checkboxes the server will
 * re-validate, and the user list annotates each row only from rows that already exist.
 *
 * A user is never hard-deleted in this build (`users.deleted_at` is set by an account that
 * is disabled), so every read here filters `deleted_at IS NULL` as well as the status the
 * screen is asked for.
 */
import { sql, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely';
import { ACTIONS, RESOURCES, type Action, type Resource } from '../auth/permissions';
import { db } from '../db';
import type { Database, PermissionScope } from '../db/types';

export const USER_STATUSES = ['active', 'invited', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export function isUserStatus(value: string | null | undefined): value is UserStatus {
  return (USER_STATUSES as readonly string[]).includes(value ?? '');
}

export interface UserRoleRef {
  id: string;
  name: string;
  isOwner: boolean;
}

export interface UserView {
  id: string;
  email: string;
  name: string;
  locale: string;
  status: UserStatus;
  roles: UserRoleRef[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface RolePermissionView {
  resource: string;
  action: string;
  scope: PermissionScope | null;
}

export interface RoleView {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isOwner: boolean;
  members: number;
  permissions: RolePermissionView[];
}

export interface UsersView {
  q: string;
  status: UserStatus | 'all';
  roleId: string;
  page: number;
  per: number;
}

export const USERS_PER_PAGES = [25, 50, 100] as const;

/** The search terms a console page is handed, parsed once — the URL is the state. */
export function parseUsersView(search: Record<string, string | string[] | undefined> | undefined): UsersView {
  const first = (name: string): string => {
    const value = search?.[name];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  };
  const status = first('status');
  return {
    status: isUserStatus(status) ? status : 'all',
    roleId: first('role').slice(0, 64),
    q: first('q').slice(0, 120),
    page: Math.max(1, Number(first('page')) || 1),
    per: USERS_PER_PAGES.includes(Number(first('per')) as (typeof USERS_PER_PAGES)[number])
      ? Number(first('per'))
      : 25,
  };
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** The roles screen, and the options the user screen's role picker is drawn from. */
export async function listRoles(): Promise<RoleView[]> {
  const [roles, permissions, memberRows] = await Promise.all([
    db
      .selectFrom('roles')
      .select(['id', 'name', 'description', 'is_system', 'is_owner'])
      .where('deleted_at', 'is', null)
      .execute(),
    db
      .selectFrom('role_permissions')
      .select(['role_id', 'resource', 'action', 'scope'])
      .execute(),
    db
      .selectFrom('user_roles')
      .innerJoin('users', 'users.id', 'user_roles.user_id')
      .select(['user_roles.role_id'])
      .where('users.deleted_at', 'is', null)
      .where('users.status', '!=', 'disabled')
      .execute(),
  ]);

  const byRole = new Map<string, RolePermissionView[]>();
  for (const row of permissions) {
    const list = byRole.get(row.role_id) ?? [];
    list.push({ resource: row.resource, action: row.action, scope: row.scope ?? null });
    byRole.set(row.role_id, list);
  }
  const members = new Map<string, number>();
  for (const row of memberRows) members.set(row.role_id, (members.get(row.role_id) ?? 0) + 1);

  const resourceOrder = (resource: string): number => {
    const index = (RESOURCES as readonly string[]).indexOf(resource);
    return index === -1 ? RESOURCES.length : index;
  };
  const actionOrder = (action: string): number => {
    const index = (ACTIONS as readonly string[]).indexOf(action);
    return index === -1 ? ACTIONS.length : index;
  };

  return roles
    .map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.is_system === 1,
      isOwner: role.is_owner === 1,
      members: members.get(role.id) ?? 0,
      permissions: (byRole.get(role.id) ?? []).sort(
        (a, b) => resourceOrder(a.resource) - resourceOrder(b.resource) || actionOrder(a.action) - actionOrder(b.action),
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.isOwner) - Number(a.isOwner) ||
        Number(b.isSystem) - Number(a.isSystem) ||
        a.name.localeCompare(b.name),
    );
}

export interface UsersScreenData {
  view: UsersView;
  users: UserView[];
  total: number;
  page: number;
  pages: number;
  per: number;
  roles: RoleView[];
  currentUserId: string;
}

/** The filter in one place, so the count and the page can never disagree about it. */
function userFilter(view: UsersView) {
  return (eb: ExpressionBuilder<Database, 'users'>): Expression<SqlBool> => {
    const conditions: Expression<SqlBool>[] = [eb('users.deleted_at', 'is', null)];
    if (view.status !== 'all') conditions.push(eb('users.status', '=', view.status));
    if (view.q) {
      const term = `%${view.q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
      conditions.push(eb.or([eb('users.email_lc', 'like', term), eb('users.name', 'like', term)]));
    }
    if (view.roleId) {
      conditions.push(
        eb(
          'users.id',
          'in',
          eb.selectFrom('user_roles').select('user_id').where('role_id', '=', view.roleId),
        ),
      );
    }
    return eb.and(conditions);
  };
}

/**
 * One page of accounts, with the roles each one holds attached in a second query — a
 * join here would multiply a user by its roles and turn the page size into a lie.
 */
export async function usersScreenData(input: {
  view: UsersView;
  currentUserId: string;
  roles?: RoleView[];
}): Promise<UsersScreenData> {
  const { view, currentUserId } = input;
  const roles = input.roles ?? (await listRoles());

  const counted = await db
    .selectFrom('users')
    .select(sql<number>`count(*)`.as('total'))
    .where(userFilter(view))
    .executeTakeFirst();
  const total = Number(counted?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / view.per));
  const page = Math.min(view.page, pages);

  const rows = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'locale', 'status', 'must_change_password', 'last_login_at', 'created_at'])
    .where(userFilter(view))
    .orderBy('users.created_at', 'desc')
    .orderBy('users.id', 'asc')
    .limit(view.per)
    .offset((page - 1) * view.per)
    .execute();

  const ids = rows.map((row) => row.id);
  const links = ids.length
    ? await db
        .selectFrom('user_roles')
        .innerJoin('roles', 'roles.id', 'user_roles.role_id')
        .select(['user_roles.user_id', 'roles.id', 'roles.name', 'roles.is_owner'])
        .where('user_roles.user_id', 'in', ids)
        .where('roles.deleted_at', 'is', null)
        .execute()
    : [];
  const rolesOf = new Map<string, UserRoleRef[]>();
  for (const link of links) {
    const list = rolesOf.get(link.user_id) ?? [];
    list.push({ id: link.id, name: link.name, isOwner: link.is_owner === 1 });
    rolesOf.set(link.user_id, list);
  }

  return {
    view: { ...view, page },
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      locale: row.locale,
      status: row.status,
      roles: (rolesOf.get(row.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      mustChangePassword: row.must_change_password === 1,
      lastLoginAt: iso(row.last_login_at),
      createdAt: iso(row.created_at),
    })),
    total,
    page,
    pages,
    per: view.per,
    roles,
    currentUserId,
  };
}

/** One account with its roles, for the response a write answers with. */
export async function getUser(id: string): Promise<UserView | null> {
  const row = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'locale', 'status', 'must_change_password', 'last_login_at', 'created_at'])
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) return null;

  const links = await db
    .selectFrom('user_roles')
    .innerJoin('roles', 'roles.id', 'user_roles.role_id')
    .select(['roles.id', 'roles.name', 'roles.is_owner'])
    .where('user_roles.user_id', '=', id)
    .where('roles.deleted_at', 'is', null)
    .execute();

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    locale: row.locale,
    status: row.status,
    roles: links
      .map((link) => ({ id: link.id, name: link.name, isOwner: link.is_owner === 1 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    mustChangePassword: row.must_change_password === 1,
    lastLoginAt: iso(row.last_login_at),
    createdAt: iso(row.created_at),
  };
}

/** The permissions a role currently carries, keyed the way the API compares them. */
export function grantKey(resource: string, action: string): string {
  return `${resource}\u0000${action}`;
}

export function isResource(value: string): value is Resource {
  return (RESOURCES as readonly string[]).includes(value);
}

export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

/**
 * True while at least one active account other than `exceptUserId` holds an owner role.
 * Disabling or demoting the last Owner would leave a console nobody can administer.
 */
export async function anotherOwnerRemains(exceptUserId: string): Promise<boolean> {
  const row = await db
    .selectFrom('users')
    .innerJoin('user_roles', 'user_roles.user_id', 'users.id')
    .innerJoin('roles', 'roles.id', 'user_roles.role_id')
    .select(sql<number>`count(distinct users.id)`.as('total'))
    .where('roles.is_owner', '=', 1)
    .where('roles.deleted_at', 'is', null)
    .where('users.deleted_at', 'is', null)
    .where('users.status', '=', 'active')
    .where('users.id', '!=', exceptUserId)
    .executeTakeFirst();
  return Number(row?.total ?? 0) > 0;
}
