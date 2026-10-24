/**
 * User and role writes, shared by the CLI (`npm run owner:create`) and the
 * console's user manager, so a password can only ever be stored one way.
 *
 * Callers must run the password through `passwordProblem()` first; these
 * functions refuse a password that fails it rather than trusting a route.
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db';
import { hashPassword, passwordProblem } from './password';
import { revokeAllSessions } from './sessions';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface NewUser {
  email: string;
  password: string;
  name?: string;
  locale?: string;
  /** true when someone else chose the password and the user must replace it. */
  mustChangePassword?: boolean;
  actorId?: string | null;
}

export async function createUser(input: NewUser): Promise<string> {
  const problem = passwordProblem(input.password);
  if (problem) throw new Error(problem);
  const email = normalizeEmail(input.email);
  const existing = await db.selectFrom('users').select('id').where('email_lc', '=', email).executeTakeFirst();
  if (existing) throw new Error(`A user with that email already exists: ${email}`);
  const id = randomUUID();
  await db
    .insertInto('users')
    .values({
      id,
      email: input.email.trim(),
      email_lc: email,
      password_hash: await hashPassword(input.password),
      name: input.name ?? '',
      locale: input.locale ?? 'ar',
      status: 'active',
      must_change_password: input.mustChangePassword ? 1 : 0,
      created_by: input.actorId ?? null,
      updated_by: input.actorId ?? null,
    })
    .execute();
  return id;
}

/**
 * The only way a hash changes. Every session of the account is revoked here,
 * because a password reset is also the fix for a stolen cookie — `keepSessionId`
 * is how a user who is signed in stays signed in while rotating their own.
 */
export async function setPassword(
  userId: string,
  password: string,
  options: { actorId?: string | null; keepSessionId?: string; mustChangePassword?: boolean } = {},
): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const updated = await db
    .updateTable('users')
    .set({
      password_hash: await hashPassword(password),
      // A password the account holder did not choose is temporary by definition: the
      // console's reset passes `true`, a person rotating their own password gets `0`.
      must_change_password: options.mustChangePassword ? 1 : 0,
      version: sql`version + 1`,
      updated_by: options.actorId ?? null,
    })
    .where('id', '=', userId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (Number(updated.numUpdatedRows ?? 0) === 0) throw new Error(`No active user ${userId} to update.`);
  await revokeAllSessions(userId, options.keepSessionId);
}

export async function findRoleByName(name: string): Promise<{ id: string; name: string } | null> {
  const row = await db.selectFrom('roles').select(['id', 'name']).where('name', '=', name).executeTakeFirst();
  return row ?? null;
}

export async function getOrCreateRole(
  name: string,
  init: { description?: string; is_system?: boolean; is_owner?: boolean } = {},
): Promise<string> {
  const existing = await findRoleByName(name);
  if (existing) return existing.id;
  const id = randomUUID();
  await db
    .insertInto('roles')
    .values({
      id,
      name,
      description: init.description ?? '',
      is_system: init.is_system ? 1 : 0,
      is_owner: init.is_owner ? 1 : 0,
    })
    .execute();
  return id;
}

export async function assignRole(userId: string, roleId: string): Promise<void> {
  // MariaDB has no `ON CONFLICT DO NOTHING`; a check-then-insert is the portable
  // idempotent form, and this path runs when an account is created, not per request.
  const existing = await db
    .selectFrom('user_roles')
    .select('user_id')
    .where('user_id', '=', userId)
    .where('role_id', '=', roleId)
    .executeTakeFirst();
  if (existing) return;
  await db.insertInto('user_roles').values({ user_id: userId, role_id: roleId }).execute();
}
