/**
 * Login, logout, "who am I", and change-password — the four handlers the console
 * signs with. They answer with plain `Response` objects, so a Next route handler
 * is a one-line wrapper and a test can call them directly.
 */
import { z } from 'zod';
import { db } from '../db';
import { writeAudit } from './audit';
import { appendCookies, authenticate, clearedSessionCookies, guard, jsonError, sessionCookies } from './guard';
import { clientIp, hashIp } from './tokens';
import { verifyPassword, verifyPasswordOrDecoy, passwordProblem } from './password';
import { createSession, findUserByEmail, loadConsoleUser, revokeSession } from './sessions';
import { checkThrottle, recordLoginAttempt } from './throttle';
import { normalizeEmail, setPassword } from './users';

const emailField = z.string().trim().min(3).max(255);
const passwordField = z.string().min(1).max(200);

export const loginSchema = z.object({ email: emailField, password: passwordField });
export const changePasswordSchema = z.object({ current: passwordField, next: passwordField });

/** Never says which half was wrong, and never says it faster for an unknown address. */
export async function loginHandler(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_input');

  const email_lc = normalizeEmail(parsed.data.email);
  const ipHash = hashIp(clientIp(req.headers));

  const verdict = await checkThrottle(email_lc, ipHash);
  if (!verdict.allowed) {
    return jsonError(429, 'too_many_attempts', { retry_after_seconds: verdict.retryAfterSeconds }, { 'retry-after': String(verdict.retryAfterSeconds) });
  }

  const account = await findUserByEmail(email_lc);
  const credentialsOk = await verifyPasswordOrDecoy(parsed.data.password, account?.password_hash ?? null);
  if (!account || !credentialsOk) {
    await recordLoginAttempt({ email_lc, ip_hash: ipHash, success: false });
    return jsonError(401, 'invalid_credentials');
  }
  if (account.status !== 'active' || account.deleted_at !== null) {
    // The password was right, so this is the account owner being told to go complain.
    await recordLoginAttempt({ email_lc, ip_hash: ipHash, success: false });
    return jsonError(403, 'account_disabled');
  }

  await recordLoginAttempt({ email_lc, ip_hash: ipHash, success: true });
  const session = await createSession(account.id, { ipHash, userAgent: req.headers.get('user-agent') ?? '' });
  const now = new Date();
  await db.updateTable('users').set({ last_login_at: now }).where('id', '=', account.id).execute();

  const user = await loadConsoleUser(account.id);
  if (!user) return jsonError(401, 'invalid_credentials');

  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    actorKind: 'user',
    action: 'session.login',
    entityType: 'session',
    entityId: session.sessionId,
    after: { roles: user.roles },
    ipHash,
  });

  const res = Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      theme: user.theme,
      roles: user.roles,
      mustChangePassword: user.mustChangePassword,
    },
    // Handed to the SPA once, here, because it is the only response allowed to.
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
  });
  return appendCookies(res, sessionCookies(req, session));
}

export async function logoutHandler(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  const cookies = clearedSessionCookies(req);
  if (!auth) return appendCookies(Response.json({ ok: true }), cookies);

  await revokeSession(auth.sessionId);
  await writeAudit({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    actorKind: 'user',
    action: 'session.logout',
    entityType: 'session',
    entityId: auth.sessionId,
    ipHash: hashIp(clientIp(req.headers)),
  });
  return appendCookies(Response.json({ ok: true }), cookies);
}

export async function meHandler(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (!auth) return jsonError(401, 'unauthenticated');
  return Response.json({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      locale: auth.user.locale,
      theme: auth.user.theme,
      roles: auth.user.roles,
      mustChangePassword: auth.user.mustChangePassword,
    },
  });
}

type ChangePasswordResult = { ok: true } | { error: string; message?: string };

/** `self.update` needs no grant, so a Viewer can always rotate their own password. */
export function changePasswordHandler(req: Request): Promise<Response> {
  return guard<z.output<typeof changePasswordSchema>, ChangePasswordResult>(
    req,
    { resource: 'self', action: 'update', schema: changePasswordSchema, allowBeforePasswordChange: true },
    async ({ auth, input }) => {
      const problem = passwordProblem(input.next);
      if (problem) return { status: 400, data: { error: 'weak_password', message: problem } };

      const row = await db.selectFrom('users').select('password_hash').where('id', '=', auth.user.id).executeTakeFirst();
      if (!row || !(await verifyPassword(input.current, row.password_hash))) {
        return { status: 401, data: { error: 'invalid_credentials' } };
      }
      await setPassword(auth.user.id, input.next, { actorId: auth.user.id, keepSessionId: auth.sessionId });
      return { data: { ok: true }, audit: { entityType: 'user', entityId: auth.user.id, after: { password: 'changed' } } };
    },
  );
}
