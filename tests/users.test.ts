/**
 * BK-16a: the accounts screen and the role matrix, end to end.
 *
 * What one file cannot show by reading the handlers:
 *   - creating an account through the console makes its password temporary and records
 *     the create in `audit_log`;
 *   - the two lockout rails hold: nobody changes their own role or status, and the last
 *     active Owner cannot be demoted or disabled;
 *   - a password reset revokes every other session;
 *   - a role's grants are replaced wholesale, a role without `read` is refused with the
 *     resource named, and a system role is immutable;
 *   - a role somebody holds cannot be deleted;
 *   - permission is answered before the body is parsed (Admin gets 403, not 400).
 *
 * The actor is a **custom manager role**, not the Owner: the last-Owner rail needs a
 * target who is the only owner, and the caller has to be somebody else to reach it.
 *
 * Every fixture is named `bk16-<run>` and removed in `afterAll`.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, destroyDb, readDbConfig } from '../src/lib/db';
import { assertTestDb } from '../src/lib/db/guard';
import { json } from '../src/lib/db/json';
import { CSRF_HEADER } from '../src/lib/auth/env';
import type { Grant } from '../src/lib/auth/permissions';
import { syncRoles } from '../src/lib/auth/roles';
import { loginHandler } from '../src/lib/auth/login';
import { loadGrants } from '../src/lib/auth/sessions';
import { assignRole, createUser, getOrCreateRole } from '../src/lib/auth/users';
import { roleHandler, rolesHandler, userHandler, userPasswordHandler, usersHandler } from '../src/lib/users/api';
import { parseUsersView, usersScreenData, type RoleView, type UserView } from '../src/lib/users/view';

const run = randomUUID().slice(0, 8);
const PASSWORD = 'Shamah-users-2026';
const MARK = `bk16-${run}`;

interface Session {
  email: string;
  id: string;
  token: string;
  csrf: string;
  grants: Grant[];
}

const emails = {
  Manager: `${MARK}-manager@example.invalid`,
  Admin: `${MARK}-admin@example.invalid`,
  OwnerTarget: `${MARK}-owner@example.invalid`,
  ResetTarget: `${MARK}-reset@example.invalid`,
} as const;

const actors = {} as Record<keyof typeof emails, Session>;
const userIds: string[] = [];
let managerRoleId = '';
let ownerTargetId = '';

let ipSeq = 0;
const ip = (): string => `203.0.113.${++ipSeq % 250}`;

function setCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const joined = res.headers.get('set-cookie');
  return joined ? joined.split(/,\s*(?=[^;,]+=)/) : [];
}

function cookieValue(cookies: string[], name: string): string {
  const line = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.slice(name.length + 1).split(';')[0]) : '';
}

function request(path: string, init: RequestInit & { cookie?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('cookie', init.cookie);
  if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', ip());
  return new Request(`http://localhost/api/console${path}`, { ...init, headers });
}

function read(actor: Session): RequestInit & { cookie: string } {
  return { cookie: `shamah_session=${actor.token}` };
}

function write(actor: Session, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit & { cookie: string } {
  return {
    method,
    cookie: `shamah_session=${actor.token}`,
    headers: { [CSRF_HEADER]: actor.csrf, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

async function login(email: string): Promise<Session> {
  const res = await loginHandler(
    new Request('http://localhost/api/console/auth', {
      method: 'POST',
      headers: { 'x-forwarded-for': ip() },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  const body = (await res.json()) as { csrfToken: string };
  const row = await db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirstOrThrow();
  return {
    email,
    id: row.id,
    token: cookieValue(setCookies(res), 'shamah_session'),
    csrf: body.csrfToken,
    grants: (await loadGrants(row.id)).grants,
  };
}

async function bodyOf<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function roleIds(): Promise<Map<string, string>> {
  const rows = await db.selectFrom('roles').select(['id', 'name']).where('deleted_at', 'is', null).execute();
  return new Map(rows.map((row) => [row.name, row.id]));
}

/**
 * The last-Owner rail is answerable only when the target is the only active Owner, so the
 * links that would answer "somebody else still holds it" are lifted for the length of one
 * assertion and put back exactly as they were.
 */
async function hideOtherOwners(targetUserId: string): Promise<{ user_id: string; role_id: string }[]> {
  const owners = await db.selectFrom('roles').select('id').where('is_owner', '=', 1).where('deleted_at', 'is', null).execute();
  const ids = owners.map((role) => role.id);
  if (ids.length === 0) return [];
  const links = await db
    .selectFrom('user_roles')
    .select(['user_id', 'role_id'])
    .where('role_id', 'in', ids)
    .where('user_id', '!=', targetUserId)
    .execute();
  if (links.length > 0) {
    await db.deleteFrom('user_roles').where('role_id', 'in', ids).where('user_id', '!=', targetUserId).execute();
  }
  return links;
}

async function restoreOwners(links: { user_id: string; role_id: string }[]): Promise<void> {
  if (links.length > 0) await db.insertInto('user_roles').values(links).execute();
}

async function purge(): Promise<void> {
  const users = await db.selectFrom('users').select('id').where('email', 'like', `%${MARK}%`).execute();
  const ids = users.map((row) => row.id);
  const roles = await db.selectFrom('roles').select('id').where('name', 'like', `${MARK}%`).execute();
  const roleIdsToDrop = roles.map((row) => row.id);

  if (ids.length > 0) {
    await db.deleteFrom('sessions').where('user_id', 'in', ids).execute();
    await db.deleteFrom('permission_grants').where('user_id', 'in', ids).execute();
    await db.deleteFrom('user_roles').where('user_id', 'in', ids).execute();
  }
  if (ids.length > 0 || roleIdsToDrop.length > 0) {
    await db
      .deleteFrom('audit_log')
      .where((eb) =>
        eb.or([
          ...(ids.length > 0 ? [eb('actor_id', 'in', ids), eb('entity_id', 'in', ids)] : []),
          ...(roleIdsToDrop.length > 0 ? [eb('entity_id', 'in', roleIdsToDrop)] : []),
        ]),
      )
      .execute();
  }
  if (ids.length > 0) await db.deleteFrom('users').where('id', 'in', ids).execute();
  if (roleIdsToDrop.length > 0) {
    await db.deleteFrom('role_permissions').where('role_id', 'in', roleIdsToDrop).execute();
    await db.deleteFrom('roles').where('id', 'in', roleIdsToDrop).execute();
  }
  await db.deleteFrom('login_attempts').where('email_lc', 'like', `%${MARK}%`).execute();
}

let createdUserId = '';
let resetTargetId = '';
let contentRoleId = '';
let inUseRoleId = '';

beforeAll(async () => {
  assertTestDb();
  await purge();
  await syncRoles({ dryRun: false, database: readDbConfig().database });

  const ids = await roleIds();
  const viewerId = ids.get('Viewer') ?? '';
  const ownerId = ids.get('Owner') ?? '';
  const adminId = ids.get('Admin') ?? '';

  // A custom manager: everything the accounts screen does, without being an Owner.
  managerRoleId = await getOrCreateRole(`${MARK}-manager`, { is_system: false });
  await db
    .insertInto('role_permissions')
    .values(
      [
        ['user', 'read'],
        ['user', 'create'],
        ['user', 'update'],
        ['role', 'read'],
        ['role', 'create'],
        ['role', 'update'],
        ['role', 'delete'],
      ].map(([resource, action]) => ({
        id: randomUUID(),
        role_id: managerRoleId,
        resource,
        action,
        scope: json(null),
      })),
    )
    .execute();

  actors.Manager = await (async () => {
    const id = await createUser({ email: emails.Manager, password: PASSWORD, name: `BK16 Manager ${run}` });
    await assignRole(id, managerRoleId);
    userIds.push(id);
    return login(emails.Manager);
  })();

  actors.Admin = await (async () => {
    const id = await createUser({ email: emails.Admin, password: PASSWORD, name: `BK16 Admin ${run}` });
    await assignRole(id, adminId);
    userIds.push(id);
    return login(emails.Admin);
  })();

  // The only Owner the suite knows about; the last-Owner test hides any other.
  ownerTargetId = await createUser({ email: emails.OwnerTarget, password: PASSWORD, name: `BK16 Owner ${run}` });
  await assignRole(ownerTargetId, ownerId);
  userIds.push(ownerTargetId);

  resetTargetId = await createUser({ email: emails.ResetTarget, password: PASSWORD, name: `BK16 Reset ${run}` });
  await assignRole(resetTargetId, viewerId);
  userIds.push(resetTargetId);
  await login(emails.ResetTarget);
});

afterAll(async () => {
  await purge();
  await destroyDb();
});

describe('accounts (BK-16a)', () => {
  it('creates an account with a temporary password and an audit row', async () => {
    const roles = await roleIds();
    const res = await usersHandler(
      request('/users', write(actors.Manager, 'POST', {
        email: `${MARK}-created@example.invalid`,
        name: `BK16 Created ${run}`,
        password: PASSWORD,
        locale: 'en',
        roleId: roles.get('Viewer'),
      })),
    );
    expect(res.status).toBe(201);
    const body = await bodyOf<{ user: UserView }>(res);
    createdUserId = body.user.id;

    expect(body.user.status).toBe('active');
    expect(body.user.mustChangePassword).toBe(true);
    expect(body.user.roles.map((role) => role.name)).toEqual(['Viewer']);

    const row = await db
      .selectFrom('users')
      .select(['must_change_password', 'locale'])
      .where('id', '=', createdUserId)
      .executeTakeFirstOrThrow();
    expect(row.must_change_password).toBe(1);
    expect(row.locale).toBe('en');

    const audit = await db
      .selectFrom('audit_log')
      .select(['action', 'entity_type'])
      .where('entity_id', '=', createdUserId)
      .where('actor_id', '=', actors.Manager.id)
      .executeTakeFirst();
    expect(audit).toMatchObject({ action: 'user.create', entity_type: 'user' });
  });

  it('refuses an email another account already has', async () => {
    const roles = await roleIds();
    const res = await usersHandler(
      request('/users', write(actors.Manager, 'POST', {
        email: emails.Manager.toUpperCase(),
        password: PASSWORD,
        roleId: roles.get('Viewer'),
      })),
    );
    expect(res.status).toBe(409);
    expect((await bodyOf<{ error: string }>(res)).error).toBe('email_taken');
  });

  it('changes a name, language and role, and answers with the new row', async () => {
    const roles = await roleIds();
    const res = await userHandler(
      request(`/users/${createdUserId}`, write(actors.Manager, 'PATCH', {
        name: `BK16 Renamed ${run}`,
        locale: 'ar',
        roleId: roles.get('Editor'),
      })),
    );
    expect(res.status).toBe(200);
    const body = await bodyOf<{ user: UserView }>(res);
    expect(body.user.name).toBe(`BK16 Renamed ${run}`);
    expect(body.user.locale).toBe('ar');
    expect(body.user.roles.map((role) => role.name)).toEqual(['Editor']);

    // Replace, not append: the console assigns one role through this path.
    const links = await db.selectFrom('user_roles').select('role_id').where('user_id', '=', createdUserId).execute();
    expect(links).toHaveLength(1);
  });

  it('will not let an account change its own role or status', async () => {
    const roles = await roleIds();
    const status = await userHandler(
      request(`/users/${actors.Manager.id}`, write(actors.Manager, 'PATCH', { status: 'disabled' })),
    );
    expect(status.status).toBe(400);
    expect((await bodyOf<{ error: string }>(status)).error).toBe('self_locked');

    const role = await userHandler(
      request(`/users/${actors.Manager.id}`, write(actors.Manager, 'PATCH', { roleId: roles.get('Viewer') })),
    );
    expect(role.status).toBe(400);
    expect((await bodyOf<{ error: string }>(role)).error).toBe('self_locked');

    const still = await db.selectFrom('users').select('status').where('id', '=', actors.Manager.id).executeTakeFirstOrThrow();
    expect(still.status).toBe('active');
  });

  it('refuses to demote or disable the last active Owner', async () => {
    const roles = await roleIds();
    const target = ownerTargetId;
    expect(target).toBeTruthy();

    const hidden = await hideOtherOwners(target as string);
    try {
      const disabled = await userHandler(
        request(`/users/${target}`, write(actors.Manager, 'PATCH', { status: 'disabled' })),
      );
      expect(disabled.status).toBe(409);
      expect((await bodyOf<{ error: string }>(disabled)).error).toBe('last_owner');

      const demoted = await userHandler(
        request(`/users/${target}`, write(actors.Manager, 'PATCH', { roleId: roles.get('Viewer') })),
      );
      expect(demoted.status).toBe(409);
      expect((await bodyOf<{ error: string }>(demoted)).error).toBe('last_owner');

      const row = await db.selectFrom('users').select('status').where('id', '=', target as string).executeTakeFirstOrThrow();
      expect(row.status).toBe('active');
    } finally {
      await restoreOwners(hidden);
    }
  });

  it('resets a password as temporary and signs every other session out', async () => {
    const before = await db
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', resetTargetId)
      .where('revoked_at', 'is', null)
      .execute();
    expect(before.length).toBeGreaterThan(0);

    const res = await userPasswordHandler(
      request(`/users/${resetTargetId}/password`, write(actors.Manager, 'POST', { password: 'Shamah-reset-2026' })),
    );
    expect(res.status).toBe(200);
    const body = await bodyOf<{ user: UserView }>(res);
    expect(body.user.mustChangePassword).toBe(true);

    const row = await db
      .selectFrom('users')
      .select('must_change_password')
      .where('id', '=', resetTargetId)
      .executeTakeFirstOrThrow();
    expect(row.must_change_password).toBe(1);

    const open = await db
      .selectFrom('sessions')
      .select('id')
      .where('user_id', '=', resetTargetId)
      .where('revoked_at', 'is', null)
      .execute();
    expect(open).toHaveLength(0);
  });

  it('lists a page with the roles and honours the account filters', async () => {
    const roles = await roleIds();
    const viewerId = roles.get('Viewer') ?? '';
    const res = await usersHandler(request(`/users?q=${MARK}&role=${viewerId}`, read(actors.Manager)));
    expect(res.status).toBe(200);
    const body = await bodyOf<{
      users: UserView[];
      roles: RoleView[];
      total: number;
      currentUserId: string;
      view: ReturnType<typeof parseUsersView>;
    }>(res);

    expect(body.currentUserId).toBe(actors.Manager.id);
    expect(body.view).toMatchObject({ q: MARK, roleId: viewerId });
    expect(body.roles.map((role) => role.name)).toEqual(expect.arrayContaining(['Owner', 'Admin', 'Viewer']));
    expect(body.total).toBe(body.users.length);
    for (const user of body.users) {
      expect(user.email).toContain(MARK);
      expect(user.roles.map((role) => role.name)).toContain('Viewer');
    }

    // The server-side reader agrees with the handler, and refuses a page past the end
    // rather than answering an empty list that looks like a filter.
    const screen = await usersScreenData({ view: parseUsersView({ page: '99', q: MARK }), currentUserId: actors.Manager.id });
    expect(screen.page).toBe(screen.pages);
    expect(screen.users.length).toBeGreaterThan(0);
  });

  it('answers 403 before parsing the body for an account with no user.create', async () => {
    const forbidden = await usersHandler(request('/users', write(actors.Admin, 'POST', {})));
    expect(forbidden.status).toBe(403);
    expect((await bodyOf<{ error: string }>(forbidden)).error).toBe('forbidden');

    const allowed = await usersHandler(request('/users', write(actors.Manager, 'POST', {})));
    expect(allowed.status).toBe(400);
    expect((await bodyOf<{ error: string }>(allowed)).error).toBe('invalid_input');
  });
});

describe('roles and permissions (BK-16a)', () => {
  it('creates a custom role with its grants, and records it', async () => {
    const res = await rolesHandler(
      request('/roles', write(actors.Manager, 'POST', {
        name: `${MARK}-content`,
        description: 'Articles only',
        grants: [
          { resource: 'article', action: 'read' },
          { resource: 'article', action: 'update', scope: { locales: ['ar'] } },
        ],
      })),
    );
    expect(res.status).toBe(201);
    const body = await bodyOf<{ role: RoleView }>(res);
    contentRoleId = body.role.id;

    expect(body.role.isSystem).toBe(false);
    expect(body.role.permissions).toEqual([
      { resource: 'article', action: 'read', scope: null },
      { resource: 'article', action: 'update', scope: { locales: ['ar'] } },
    ]);

    const audit = await db
      .selectFrom('audit_log')
      .select(['action'])
      .where('entity_id', '=', contentRoleId)
      .where('action', '=', 'role.create')
      .executeTakeFirst();
    expect(audit).toBeTruthy();
  });

  it('refuses a write grant whose resource has no read', async () => {
    const res = await rolesHandler(
      request('/roles', write(actors.Manager, 'POST', {
        name: `${MARK}-blind`,
        grants: [{ resource: 'offer', action: 'update' }],
      })),
    );
    expect(res.status).toBe(400);
    expect((await bodyOf<{ error: string }>(res)).error).toBe('read_required:offer');
  });

  it('replaces a role’s grants instead of merging them', async () => {
    const res = await roleHandler(
      request(`/roles/${contentRoleId}`, write(actors.Manager, 'PATCH', {
        description: 'Offers now',
        grants: [{ resource: 'offer', action: 'read' }],
      })),
    );
    expect(res.status).toBe(200);
    const body = await bodyOf<{ role: RoleView }>(res);
    expect(body.role.permissions).toEqual([{ resource: 'offer', action: 'read', scope: null }]);
    expect(body.role.description).toBe('Offers now');

    const rows = await db.selectFrom('role_permissions').select(['resource', 'action']).where('role_id', '=', contentRoleId).execute();
    expect(rows).toEqual([{ resource: 'offer', action: 'read' }]);
  });

  it('refuses a name another role already holds', async () => {
    const res = await roleHandler(
      request(`/roles/${contentRoleId}`, write(actors.Manager, 'PATCH', { name: 'Editor' })),
    );
    expect(res.status).toBe(409);
    expect((await bodyOf<{ error: string }>(res)).error).toBe('role_name_taken');
  });

  it('leaves the six catalog roles to syncRoles()', async () => {
    const roles = await roleIds();
    const res = await roleHandler(
      request(`/roles/${roles.get('Viewer')}`, write(actors.Manager, 'PATCH', { description: 'changed by hand' })),
    );
    expect(res.status).toBe(409);
    expect((await bodyOf<{ error: string }>(res)).error).toBe('system_role_immutable');

    const row = await db.selectFrom('roles').select('description').where('name', '=', 'Viewer').executeTakeFirstOrThrow();
    expect(row.description).not.toBe('changed by hand');
  });

  it('will not delete a role an account still holds', async () => {
    const created = await rolesHandler(
      request('/roles', write(actors.Manager, 'POST', {
        name: `${MARK}-in-use`,
        grants: [{ resource: 'offer', action: 'read' }],
      })),
    );
    expect(created.status).toBe(201);
    inUseRoleId = (await bodyOf<{ role: RoleView }>(created)).role.id;

    const account = await usersHandler(
      request('/users', write(actors.Manager, 'POST', {
        email: `${MARK}-held@example.invalid`,
        password: PASSWORD,
        roleId: inUseRoleId,
      })),
    );
    expect(account.status).toBe(201);
    const heldId = (await bodyOf<{ user: UserView }>(account)).user.id;

    const refused = await roleHandler(request(`/roles/${inUseRoleId}`, write(actors.Manager, 'DELETE')));
    expect(refused.status).toBe(409);
    expect((await bodyOf<{ error: string }>(refused)).error).toBe('role_in_use');

    // Move the account off the role, and the same delete succeeds — including its grants.
    const roles = await roleIds();
    await userHandler(request(`/users/${heldId}`, write(actors.Manager, 'PATCH', { roleId: roles.get('Viewer') })));

    const deleted = await roleHandler(request(`/roles/${inUseRoleId}`, write(actors.Manager, 'DELETE')));
    expect(deleted.status).toBe(200);
    expect((await bodyOf<{ deleted: string }>(deleted)).deleted).toBe(inUseRoleId);

    const grants = await db.selectFrom('role_permissions').select('id').where('role_id', '=', inUseRoleId).execute();
    expect(grants).toHaveLength(0);
    const row = await db.selectFrom('roles').select('id').where('id', '=', inUseRoleId).executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it('returns the catalog with each grant it carries', async () => {
    const res = await rolesHandler(request('/roles', read(actors.Manager)));
    expect(res.status).toBe(200);
    const body = await bodyOf<{ roles: RoleView[] }>(res);
    const owner = body.roles.find((role) => role.name === 'Owner');
    const viewer = body.roles.find((role) => role.name === 'Viewer');
    expect(owner?.permissions).toEqual([{ resource: '*', action: '*', scope: null }]);
    expect(viewer?.isSystem).toBe(true);
    expect(viewer?.permissions.length).toBeGreaterThan(0);
    expect(body.roles[0]?.isOwner).toBe(true);
  });
});
