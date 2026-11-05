/**
 * The accounts API: people, the roles they hold, and the grants a role carries.
 *
 * Every route goes through `guard()`, so permission is answered before a body is read and
 * every write lands in `audit_log`. Three rules are enforced here rather than in the
 * browser, because a browser can be edited:
 *
 *   1. Nobody changes their own role or disables their own account through this API.
 *      A person who can lock themselves out is one stray click from a console nobody
 *      can open.
 *   2. The last active Owner cannot be disabled or demoted. The Owner role is the
 *      wildcard that can fix every other mistake, and it has no peer once it is gone.
 *   3. The six catalog roles (`is_system = 1`) are immutable here. `syncRoles()` owns
 *      them; an edit through this API would be reverted by the next deploy, and the
 *      diff would look like the console had lost the change.
 *
 * Accounts are disabled, never deleted: `users.deleted_at` is not set by anything in
 * this file. A departing employee's audit trail has to keep its actor.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from 'kysely';
import { guard, jsonError, type GuardResult } from '../auth/guard';
import { normalizeEmail, assignRole, createUser, setPassword } from '../auth/users';
import { ACTIONS, RESOURCES } from '../auth/permissions';
import { LIST_KEYS, SITE_LOCALES } from '../auth/roles';
import { revokeAllSessions } from '../auth/sessions';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN, passwordProblem } from '../auth/password';
import { db } from '../db';
import { json } from '../db/json';
import type { PermissionScope } from '../db/types';
import { listRoles, parseUsersView, usersScreenData, getUser, anotherOwnerRemains } from './view';

type Body = Record<string, unknown>;

const emailSchema = z.string().trim().min(3).max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'invalid_email');
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN)
  .max(PASSWORD_MAX_BYTES)
  .refine((value) => passwordProblem(value) === null, 'weak_password');
const nameSchema = z.string().trim().max(120);
const roleNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^\p{L}[\p{L}\p{N} _-]*$/u, 'invalid_role_name');
const descriptionSchema = z.string().trim().max(500);
const statusSchema = z.enum(['active', 'disabled']);
const scopeSchema = z
  .object({
    locales: z.array(z.enum(SITE_LOCALES)).min(1).optional(),
    lists: z.array(z.string().refine((value) => (LIST_KEYS as readonly string[]).includes(value), 'unknown_list')).min(1).optional(),
  })
  .strict()
  .nullable()
  .optional();
const grantSchema = z.object({ resource: z.enum(RESOURCES), action: z.enum(ACTIONS), scope: scopeSchema });

const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema.optional(),
  locale: z.enum(SITE_LOCALES).optional(),
  roleId: z.string().trim().min(1).max(64),
  mustChangePassword: z.boolean().optional(),
});

const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    locale: z.enum(SITE_LOCALES).optional(),
    roleId: z.string().trim().min(1).max(64).optional(),
    status: statusSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: 'nothing_to_change' });

const resetPasswordSchema = z.object({
  password: passwordSchema,
  mustChangePassword: z.boolean().optional(),
});

const createRoleSchema = z.object({
  name: roleNameSchema,
  description: descriptionSchema.optional(),
  grants: z.array(grantSchema).max(200).optional(),
});

const updateRoleSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: descriptionSchema.optional(),
    grants: z.array(grantSchema).max(200).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, { message: 'nothing_to_change' });

type GrantInput = z.output<typeof grantSchema>;

/** `path parts after the collection` — `/api/console/users/<id>/password` is `['<id>', 'password']`. */
function segmentsAfter(req: Request, name: string): string[] {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const index = parts.lastIndexOf(name);
  return index === -1 ? [] : parts.slice(index + 1);
}

function notFound(): GuardResult<Body> {
  return { status: 404, data: { error: 'not_found' } };
}

function refusal(status: number, code: string): GuardResult<Body> {
  return { status, data: { error: code } };
}

/**
 * One `{resource, action}` row per grant: `role_permissions` is unique on the pair, so a
 * checkbox the browser sent twice must not become two inserts. The later row wins, which
 * matches the last checkbox a person ticked.
 */
function uniqueGrants(grants: readonly GrantInput[]): GrantInput[] {
  const seen = new Map<string, GrantInput>();
  for (const grant of grants) seen.set(`${grant.resource}\u0000${grant.action}`, grant);
  return [...seen.values()];
}

/** A write grant without `read` is a permission nobody can exercise: the screen never appears. */
function missingRead(grants: readonly GrantInput[]): string | null {
  const read = new Set(grants.filter((grant) => grant.action === 'read').map((grant) => grant.resource));
  return grants.find((grant) => grant.action !== 'read' && !read.has(grant.resource))?.resource ?? null;
}

function normalizedScope(scope: GrantInput['scope']): PermissionScope | null {
  if (!scope) return null;
  const next: PermissionScope = {};
  if (scope.locales?.length) next.locales = [...scope.locales];
  if (scope.lists?.length) next.lists = [...scope.lists];
  return Object.keys(next).length > 0 ? next : null;
}

async function roleById(id: string): Promise<{ id: string; name: string; isSystem: boolean; isOwner: boolean } | null> {
  const row = await db
    .selectFrom('roles')
    .select(['id', 'name', 'is_system', 'is_owner'])
    .where('id', '=', id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? { id: row.id, name: row.name, isSystem: row.is_system === 1, isOwner: row.is_owner === 1 } : null;
}

/** The account's current roles, read before a write so the last-Owner check sees the truth. */
async function ownerHeldBy(userId: string): Promise<boolean> {
  const row = await db
    .selectFrom('user_roles')
    .innerJoin('roles', 'roles.id', 'user_roles.role_id')
    .select('roles.id')
    .where('user_roles.user_id', '=', userId)
    .where('roles.is_owner', '=', 1)
    .where('roles.deleted_at', 'is', null)
    .executeTakeFirst();
  return Boolean(row);
}

/** `GET/POST /api/console/users` */
export async function usersHandler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'user', action: 'read' }, async ({ auth }): Promise<GuardResult<Body>> => {
      const view = parseUsersView(Object.fromEntries(new URL(req.url).searchParams));
      const screen = await usersScreenData({ view, currentUserId: auth.user.id });
      // A fresh literal, because `GuardResult`'s data is the index-signature `Body` the
      // other handlers answer with; an interface does not satisfy an index signature.
      return { data: { ...screen } };
    });
  }
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof createUserSchema>, Body>(
    req,
    { resource: 'user', action: 'create', schema: createUserSchema },
    async (ctx): Promise<GuardResult<Body>> => {
      const role = await roleById(ctx.input.roleId);
      if (!role) return refusal(400, 'unknown_role');

      const email = normalizeEmail(ctx.input.email);
      const existing = await db.selectFrom('users').select('id').where('email_lc', '=', email).executeTakeFirst();
      if (existing) return refusal(409, 'email_taken');

      let id: string;
      try {
        id = await createUser({
          email: ctx.input.email,
          password: ctx.input.password,
          name: ctx.input.name,
          locale: ctx.input.locale,
          // An account someone else created starts with a temporary password.
          mustChangePassword: ctx.input.mustChangePassword ?? true,
          actorId: ctx.auth.user.id,
        });
      } catch (error) {
        // The unique index is the real arbiter; the check above only gives a nicer code.
        if (error instanceof Error && /already exists/.test(error.message)) return refusal(409, 'email_taken');
        throw error;
      }
      await assignRole(id, role.id);
      const user = await getUser(id);
      return { status: 201, data: { user }, audit: { entityType: 'user', entityId: id, after: user } };
    },
  );
}

/** `PATCH /api/console/users/<id>` */
export async function userHandler(req: Request): Promise<Response> {
  const [id] = segmentsAfter(req, 'users');
  if (!id) return jsonError(404, 'unknown_route');
  if (req.method !== 'PATCH') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof updateUserSchema>, Body>(
    req,
    { resource: 'user', action: 'update', schema: updateUserSchema },
    async (ctx): Promise<GuardResult<Body>> => {
      const before = await db
        .selectFrom('users')
        .select(['id', 'email', 'name', 'locale', 'status', 'deleted_at'])
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!before) return notFound();

      const { auth, input } = ctx;
      const self = id === auth.user.id;
      if (self && (input.status !== undefined || input.roleId !== undefined)) {
        // Renaming oneself or switching one's language is fine; changing one's own
        // standing is the move an account must ask someone else to make.
        return refusal(400, 'self_locked');
      }

      const wasOwner = await ownerHeldBy(id);
      let nextOwner = wasOwner;
      if (input.roleId) {
        const nextRole = await roleById(input.roleId);
        if (!nextRole) return refusal(400, 'unknown_role');
        nextOwner = nextRole.isOwner;
      }

      const disabling = input.status === 'disabled';
      const wasActiveOwner = wasOwner && before.status === 'active';
      const willBeActiveOwner = nextOwner && (input.status ?? before.status) === 'active';
      // Demoting or disabling the last active Owner leaves nobody with the wildcard grant.
      if (wasActiveOwner && !willBeActiveOwner && !(await anotherOwnerRemains(id))) {
        return refusal(409, 'last_owner');
      }

      await db
        .updateTable('users')
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updated_by: auth.user.id,
          version: sql`version + 1`,
        })
        .where('id', '=', id)
        .execute();

      if (input.roleId) {
        const roleId = input.roleId;
        await db.transaction().execute(async (trx) => {
          await trx.deleteFrom('user_roles').where('user_id', '=', id).execute();
          await trx.insertInto('user_roles').values({ user_id: id, role_id: roleId }).execute();
        });
      }

      // A disabled account's open tabs stop working now, not when their cookie expires.
      if (disabling) await revokeAllSessions(id);

      const user = await getUser(id);
      return { data: { user }, audit: { entityType: 'user', entityId: id, before, after: user } };
    },
  );
}

/** `POST /api/console/users/<id>/password` */
export async function userPasswordHandler(req: Request): Promise<Response> {
  const [id, action] = segmentsAfter(req, 'users');
  if (!id || action !== 'password') return jsonError(404, 'unknown_route');
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof resetPasswordSchema>, Body>(
    req,
    { resource: 'user', action: 'update', schema: resetPasswordSchema },
    async (ctx): Promise<GuardResult<Body>> => {
      const target = await db
        .selectFrom('users')
        .select(['id', 'email', 'deleted_at'])
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!target) return notFound();

      const self = id === ctx.auth.user.id;
      await setPassword(id, ctx.input.password, {
        actorId: ctx.auth.user.id,
        // Resetting your own password should not sign you out of the tab you did it in;
        // every other session that account holds is still revoked.
        keepSessionId: self ? ctx.auth.sessionId : undefined,
        mustChangePassword: self ? false : (ctx.input.mustChangePassword ?? true),
      });
      const user = await getUser(id);
      return {
        data: { user },
        audit: { entityType: 'user', entityId: id, after: { password_reset: true, self } },
      };
    },
  );
}

/** `GET/POST /api/console/roles` */
export async function rolesHandler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    return guard(req, { resource: 'role', action: 'read' }, async (): Promise<GuardResult<Body>> => {
      return { data: { roles: await listRoles() } };
    });
  }
  if (req.method !== 'POST') return jsonError(405, 'method_not_allowed');

  return guard<z.output<typeof createRoleSchema>, Body>(
    req,
    { resource: 'role', action: 'create', schema: createRoleSchema },
    async (ctx): Promise<GuardResult<Body>> => {
      const grants = uniqueGrants(ctx.input.grants ?? []);
      const withoutRead = missingRead(grants);
      if (withoutRead) return refusal(400, `read_required:${withoutRead}`);

      const existing = await db.selectFrom('roles').select('id').where('name', '=', ctx.input.name).executeTakeFirst();
      if (existing) return refusal(409, 'role_name_taken');

      const id = randomUUID();
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('roles')
          .values({
            id,
            name: ctx.input.name,
            description: ctx.input.description ?? '',
            is_system: 0,
            is_owner: 0,
            created_by: ctx.auth.user.id,
            updated_by: ctx.auth.user.id,
          })
          .execute();
        for (const grant of grants) {
          await trx
            .insertInto('role_permissions')
            .values({
              id: randomUUID(),
              role_id: id,
              resource: grant.resource,
              action: grant.action,
              scope: json(normalizedScope(grant.scope)),
              created_by: ctx.auth.user.id,
              updated_by: ctx.auth.user.id,
            })
            .execute();
        }
      });

      const role = (await listRoles()).find((entry) => entry.id === id) ?? null;
      return { status: 201, data: { role }, audit: { entityType: 'role', entityId: id, after: role } };
    },
  );
}

/** `PATCH/DELETE /api/console/roles/<id>` */
export async function roleHandler(req: Request): Promise<Response> {
  const [id] = segmentsAfter(req, 'roles');
  if (!id) return jsonError(404, 'unknown_route');
  if (req.method === 'PATCH') return updateRole(req, id);
  if (req.method === 'DELETE') return deleteRole(req, id);
  return jsonError(405, 'method_not_allowed');
}

async function updateRole(req: Request, id: string): Promise<Response> {
  return guard<z.output<typeof updateRoleSchema>, Body>(
    req,
    { resource: 'role', action: 'update', schema: updateRoleSchema },
    async (ctx): Promise<GuardResult<Body>> => {
      const before = await roleById(id);
      if (!before) return notFound();
      if (before.isSystem) return refusal(409, 'system_role_immutable');

      const grants = ctx.input.grants ? uniqueGrants(ctx.input.grants) : null;
      if (grants) {
        const withoutRead = missingRead(grants);
        if (withoutRead) return refusal(400, `read_required:${withoutRead}`);
      }

      if (ctx.input.name && ctx.input.name !== before.name) {
        const taken = await db
          .selectFrom('roles')
          .select('id')
          .where('name', '=', ctx.input.name)
          .where('id', '!=', id)
          .executeTakeFirst();
        if (taken) return refusal(409, 'role_name_taken');
      }

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('roles')
          .set({
            ...(ctx.input.name !== undefined ? { name: ctx.input.name } : {}),
            ...(ctx.input.description !== undefined ? { description: ctx.input.description } : {}),
            updated_by: ctx.auth.user.id,
            version: sql`version + 1`,
          })
          .where('id', '=', id)
          .execute();

        if (grants) {
          // Replace, not merge: the matrix on screen is the role's whole permission set,
          // so an unchecked box is a grant that must disappear.
          await trx.deleteFrom('role_permissions').where('role_id', '=', id).execute();
          for (const grant of grants) {
            await trx
              .insertInto('role_permissions')
              .values({
                id: randomUUID(),
                role_id: id,
                resource: grant.resource,
                action: grant.action,
                scope: json(normalizedScope(grant.scope)),
                created_by: ctx.auth.user.id,
                updated_by: ctx.auth.user.id,
              })
              .execute();
          }
        }
      });

      const role = (await listRoles()).find((entry) => entry.id === id) ?? null;
      return { data: { role }, audit: { entityType: 'role', entityId: id, before, after: role } };
    },
  );
}

async function deleteRole(req: Request, id: string): Promise<Response> {
  return guard(
    req,
    { resource: 'role', action: 'delete' },
    async (): Promise<GuardResult<Body>> => {
      const before = await roleById(id);
      if (!before) return notFound();
      if (before.isSystem) return refusal(409, 'system_role_immutable');

      const members = await db
        .selectFrom('user_roles')
        .select(sql<number>`count(*)`.as('total'))
        .where('role_id', '=', id)
        .executeTakeFirst();
      if (Number(members?.total ?? 0) > 0) return refusal(409, 'role_in_use');

      // `roles.name` is unique across soft-deleted rows too, so a custom role is removed
      // with its grants rather than kept as a tombstone that blocks the next role of the
      // same name. A system role never reaches this branch.
      await db.transaction().execute(async (trx) => {
        await trx.deleteFrom('role_permissions').where('role_id', '=', id).execute();
        await trx.deleteFrom('roles').where('id', '=', id).execute();
      });

      return {
        data: { deleted: id },
        audit: { entityType: 'role', entityId: id, before, after: { deleted: id } },
      };
    },
  );
}
