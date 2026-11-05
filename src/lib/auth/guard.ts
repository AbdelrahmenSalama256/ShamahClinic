/**
 * The one enforcement path: authenticate → can() → parse → execute → audit.
 *
 * Two ordering rules the whole console depends on:
 *   1. Permission is decided **before** the body is parsed, so a caller without
 *      the grant gets 403 and never learns that their payload was also invalid.
 *   2. The scope is read from the request line (path and query), never from the
 *      body — otherwise a caller could pick their own scope by editing JSON.
 *
 * Every console mutation goes through `guard()`. A route that skips it is not
 * faster, it is unauthenticated.
 */
import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import { cookiesRequireSecure, csrfTokenFrom, serializeCookie, sessionTokenFrom } from './cookies';
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, SESSION_TTL_DAYS } from './env';
import { can, type Action, type Resource, type Target } from './permissions';
import { sha256, safeEqual, hashIp, clientIp } from './tokens';
import { loadAuth, touchSession, type AuthContext } from './sessions';
import { writeAudit } from './audit';

export type Auth = AuthContext;

export interface AuditPatch {
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

export interface GuardResult<R> {
  status?: number;
  data: R;
  /**
   * A body that is not JSON — a CSV or XLSX download. The audit row still uses `data`,
   * so an export is recorded by what it contained, not by the bytes it returned.
   */
  response?: Response;
  audit?: AuditPatch;
}

/** `I` is the parsed shape; omit `schema` on read routes and it stays `unknown`. */
export interface Rule<I = unknown> {
  /**
   * One resource, or several where a single response aggregates them — the palette's
   * search reads articles, offers and pages at once. The caller must hold `action` on
   * at least one to get past this rule, and the handler then filters each section
   * against `ctx.resources`, so a grant the caller lacks cannot leak through the
   * section it belongs to.
   */
  resource: Resource | readonly Resource[];
  action: Action;
  /** Parsed only after permission is granted. */
  schema?: ZodType<I>;
  /**
   * Where the payload comes from. Reads take it from the URL; the default is the JSON body.
   * A `multipart/form-data` upload is read here, after permission is granted, so an
   * unauthenticated caller cannot make the server buffer a file.
   */
  inputFrom?: (req: Request) => unknown | Promise<unknown>;
  /** From the URL, never the body. A function lets a route derive it from the path. */
  target?: Target | ((req: Request) => Target);
  /** Only for the routes that change the caller's own password or session. */
  allowBeforePasswordChange?: boolean;
}

export interface HandlerContext<I> {
  auth: Auth;
  input: I;
  req: Request;
  requestId: string;
  target: Target;
  /** Of `rule.resource`, the resources this caller actually holds `action` on. */
  resources: readonly Resource[];
  ipHash: string;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function jsonError(status: number, code: string, extra: Record<string, unknown> = {}, trace: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: code, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...trace },
  });
}

/** Reads the session cookie, or an `Authorization: Bearer` token for CLI smoke checks. */
export async function authenticate(req: Request): Promise<Auth | null> {
  const auth = await loadAuth(sessionTokenFrom(req.headers));
  if (!auth) return null;
  await touchSession(auth);
  return auth;
}

export async function guard<I, R>(
  req: Request,
  rule: Rule<I>,
  handler: (ctx: HandlerContext<I>) => Promise<GuardResult<R>>,
): Promise<Response> {
  const requestId = randomUUID();
  const trace = { 'x-request-id': requestId };
  const ipHash = hashIp(clientIp(req.headers));

  const auth = await authenticate(req);
  if (!auth) return jsonError(401, 'unauthenticated', {}, trace);

  if (UNSAFE.has(req.method)) {
    const token = csrfTokenFrom(req.headers);
    if (!token || !safeEqual(sha256(token), auth.csrfHash)) {
      return jsonError(403, 'csrf_failed', { hint: `Send the ${CSRF_HEADER} header with the value of the shamah_csrf cookie.` }, trace);
    }
  }

  const target = typeof rule.target === 'function' ? rule.target(req) : (rule.target ?? {});
  const wanted: readonly Resource[] = typeof rule.resource === 'string' ? [rule.resource] : rule.resource;
  const resources = wanted.filter((resource) => can(auth.user.grants, resource, rule.action, target));
  if (resources.length === 0) {
    // Answered before the body is read: a caller with no grant learns nothing about the payload.
    return jsonError(403, 'forbidden', { action: `${wanted.join('+')}.${rule.action}` }, trace);
  }
  if (rule.action !== 'read' && auth.user.mustChangePassword && !rule.allowBeforePasswordChange) {
    return jsonError(403, 'password_change_required', {}, trace);
  }

  let input: I = undefined as I;
  if (rule.schema) {
    const raw = rule.inputFrom ? await rule.inputFrom(req) : await readBody(req);
    const parsed = rule.schema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(400, 'invalid_input', { issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, trace);
    }
    input = parsed.data;
  }

  const result = await handler({ auth, input, req, requestId, target, resources, ipHash });

  // A handler that refuses the request (its own 400, after the schema passed)
  // changed nothing, so an audit row would record a change that never happened.
  if (rule.action !== 'read' && (result.status ?? 200) < 400) {
    const audit = result.audit ?? {};
    await writeAudit({
      actorId: auth.user.id,
      actorEmail: auth.user.email,
      actorKind: 'user',
      action: `${resources[0]}.${rule.action}`,
      entityType: audit.entityType ?? resources[0],
      entityId: audit.entityId ?? (Object.values(target)[0] ?? ''),
      before: audit.before,
      after: audit.after ?? result.data,
      ipHash,
      requestId,
    });
  }

  if (result.response) {
    for (const [name, value] of Object.entries(trace)) result.response.headers.set(name, value);
    return result.response;
  }

  return new Response(JSON.stringify(result.data), {
    status: result.status ?? 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...trace },
  });
}

async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    // zod then reports the shape it expected; the raw body is never echoed back.
    return { __unparseable: true };
  }
}

/**
 * Called by the login route once the password checks out, and by nothing else —
 * one place sets the cookies, so one place can be checked for their attributes.
 */
export function sessionCookies(req: Request, session: { token: string; csrfToken: string; expiresAt: Date }): string[] {
  const secure = cookiesRequireSecure(req);
  const seconds = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
  const maxAgeSeconds = seconds > 0 ? seconds : SESSION_TTL_DAYS * 86_400;
  return [
    serializeCookie(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: 'lax', secure, maxAgeSeconds, path: '/' }),
    serializeCookie(CSRF_COOKIE, session.csrfToken, { httpOnly: false, sameSite: 'lax', secure, maxAgeSeconds, path: '/' }),
  ];
}

export function clearedSessionCookies(req: Request): string[] {
  const secure = cookiesRequireSecure(req);
  return [
    serializeCookie(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', secure, maxAgeSeconds: 0, path: '/' }),
    serializeCookie(CSRF_COOKIE, '', { httpOnly: false, sameSite: 'lax', secure, maxAgeSeconds: 0, path: '/' }),
  ];
}

export function appendCookies(res: Response, cookies: string[]): Response {
  for (const cookie of cookies) res.headers.append('set-cookie', cookie);
  return res;
}
