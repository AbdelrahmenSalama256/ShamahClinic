/**
 * Sessions. The cookie carries an opaque 32-byte token; `sessions.token_hash`
 * holds its SHA-256, so reading the table does not mint a cookie.
 */
import { randomUUID } from 'node:crypto';
import { db } from '../db';
import { SESSION_RENEW_DAYS, SESSION_TTL_DAYS, SESSION_TOUCH_MINUTES } from './env';
import { randomToken, sha256 } from './tokens';
import type { Grant } from './permissions';

export interface ConsoleUser {
  id: string;
  email: string;
  name: string;
  locale: string;
  theme: string;
  mustChangePassword: boolean;
  roles: string[];
  grants: Grant[];
}

export interface AuthContext {
  user: ConsoleUser;
  sessionId: string;
  csrfHash: string;
  expiresAt: Date;
}

export interface NewSession {
  sessionId: string;
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

export async function loadGrants(userId: string): Promise<{ roles: string[]; grants: Grant[] }> {
  const roleRows = await db
    .selectFrom('roles')
    .innerJoin('user_roles', 'user_roles.role_id', 'roles.id')
    .select(['roles.name', 'roles.is_owner'])
    .where('user_roles.user_id', '=', userId)
    .where('roles.deleted_at', 'is', null)
    .execute();

  const grants: Grant[] = [];
  if (roleRows.some((row) => row.is_owner === 1)) {
    // The Owner role is a wildcard row of its own, but a role edited into
    // is_owner must never be able to lose the lockout key.
    grants.push({ resource: '*', action: '*', scope: null });
  }

  if (roleRows.length > 0) {    const permRows = await db
      .selectFrom('role_permissions')
      .innerJoin('roles', 'roles.id', 'role_permissions.role_id')
      .select(['role_permissions.resource', 'role_permissions.action', 'role_permissions.scope'])
      .innerJoin('user_roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', '=', userId)
      .execute();
    for (const row of permRows) {
      grants.push({ resource: row.resource, action: row.action, scope: row.scope });
    }
  }

  // Time-boxed grants from the approvals inbox.
  const grantRows = await db
    .selectFrom('permission_grants')
    .select(['resource', 'action', 'scope', 'expires_at'])
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .execute();
  const now = new Date();
  for (const row of grantRows) {
    if (row.expires_at && row.expires_at <= now) continue;
    grants.push({ resource: row.resource, action: row.action, scope: row.scope });
  }

  return { roles: roleRows.map((row) => row.name), grants };
}

export async function loadConsoleUser(userId: string): Promise<ConsoleUser | null> {
  const row = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'locale', 'theme', 'must_change_password', 'status', 'deleted_at'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!row || row.deleted_at !== null || row.status !== 'active') return null;

  const { roles, grants } = await loadGrants(row.id);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    locale: row.locale,
    theme: row.theme,
    mustChangePassword: row.must_change_password === 1,
    roles,
    grants,
  };
}

export async function findUserByEmail(email_lc: string): Promise<{ id: string; password_hash: string; status: string; deleted_at: Date | null } | null> {
  return await db
    .selectFrom('users')
    .select(['id', 'password_hash', 'status', 'deleted_at'])
    .where('email_lc', '=', email_lc)
    .executeTakeFirst()
    .then((row) => row ?? null);
}

export async function createSession(
  userId: string,
  meta: { ipHash: string; userAgent: string },
  now = new Date(),
): Promise<NewSession> {
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
  const sessionId = randomUUID();
  await db
    .insertInto('sessions')
    .values({
      id: sessionId,
      token_hash: sha256(token),
      user_id: userId,
      csrf_hash: sha256(csrfToken),
      ip_hash: meta.ipHash,
      user_agent: meta.userAgent.slice(0, 400),
      created_at: now,
      last_seen_at: now,
      expires_at: expiresAt,
    })
    .execute();
  return { sessionId, token, csrfToken, expiresAt };
}

/**
 * The one way a request becomes a user. Expired, revoked, or belonging to a
 * disabled/deleted account returns null — and the caller answers 401.
 */
export async function loadAuth(token: string | null | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const session = await db
    .selectFrom('sessions')
    .select(['id', 'user_id', 'csrf_hash', 'expires_at', 'revoked_at', 'last_seen_at'])
    .where('token_hash', '=', sha256(token))
    .executeTakeFirst();
  if (!session || session.revoked_at !== null || session.expires_at <= new Date()) return null;

  const user = await loadConsoleUser(session.user_id);
  if (!user) return null;
  return { user, sessionId: session.id, csrfHash: session.csrf_hash, expiresAt: session.expires_at };
}

/** Sliding session: seen often, extended only when it is nearly done. */
export async function touchSession(auth: AuthContext, now = new Date()): Promise<void> {
  const lastSeen = await db
    .selectFrom('sessions')
    .select('last_seen_at')
    .where('id', '=', auth.sessionId)
    .executeTakeFirst();
  const stale = !lastSeen || now.getTime() - lastSeen.last_seen_at.getTime() > SESSION_TOUCH_MINUTES * 60_000;
  if (!stale) return;
  const renew = auth.expiresAt.getTime() - now.getTime() < SESSION_RENEW_DAYS * 86_400_000;
  await db
    .updateTable('sessions')
    .set({
      last_seen_at: now,
      ...(renew ? { expires_at: new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000) } : {}),
    })
    .where('id', '=', auth.sessionId)
    .execute();
  if (renew) auth.expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86_400_000);
}

export async function revokeSession(sessionId: string, now = new Date()): Promise<void> {
  await db.updateTable('sessions').set({ revoked_at: now }).where('id', '=', sessionId).where('revoked_at', 'is', null).execute();
}

/** Password change, disable, or reset: every other cookie the account holds stops working. */
export async function revokeAllSessions(userId: string, exceptSessionId?: string, now = new Date()): Promise<void> {
  let query = db.updateTable('sessions').set({ revoked_at: now }).where('user_id', '=', userId).where('revoked_at', 'is', null);
  if (exceptSessionId) query = query.where('id', '!=', exceptSessionId);
  await query.execute();
}
