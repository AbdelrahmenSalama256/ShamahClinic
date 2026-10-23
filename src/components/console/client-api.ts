/**
 * One place for the console's browser-side calls: read the CSRF cookie the login
 * response set, and send it as the header `guard()` expects. `shamah_csrf` is not
 * HttpOnly precisely so this works; `shamah_session` is, and never appears here.
 */
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/auth/env';
import type { FieldIssue } from '@/lib/console/issues';

export function csrfToken(): string {
  for (const pair of document.cookie.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name === CSRF_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export interface CallResult<T = unknown> {
  status: number;
  /** The `error` code the guard answers with, or a synthetic `http_<status>` for a
   *  failure that reached the server and came back with no code to name. */
  error: string | null;
  /** The response body minus `error` and `issues` — null on a failed call, so a screen cannot read a
   *  row out of a response that never carried one. */
  data: T | null;
  /** The per-field rejections that came with the error code, which is the only reason
   *  an editor can mark the box rather than the banner. */
  issues: FieldIssue[];
}

function dataOf<T>(payload: unknown): T | null {
  if (payload === null || typeof payload !== 'object') return null;
  const rest = { ...(payload as Record<string, unknown>) };
  delete rest.error;
  delete rest.issues;
  return Object.keys(rest).length > 0 ? (rest as T) : null;
}

/**
 * `parseWrites()` and zod both answer with `{ path, message }` lists. They are kept
 * beside the code rather than inside `data`, because `data` is null on a failure and the
 * field that failed is the one thing the editor still has to show.
 */
function issuesOf(payload: unknown): FieldIssue[] {
  if (payload === null || typeof payload !== 'object') return [];
  const value = (payload as { issues?: unknown }).issues;
  if (!Array.isArray(value)) return [];
  return value.filter((issue): issue is FieldIssue => {
    if (issue === null || typeof issue !== 'object') return false;
    const candidate = issue as { path?: unknown; message?: unknown };
    return typeof candidate.path === 'string' && typeof candidate.message === 'string';
  });
}

/** A server that fails hard answers with no body to read, and that is not a JSON error. */
async function payloadOf(res: Response): Promise<unknown> {
  return await res.json().catch(() => null);
}

/** The code a guard answers with, when the body is JSON and carries one. */
function codeOf(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') return undefined;
  const value = (payload as { error?: unknown }).error;
  return typeof value === 'string' ? value : undefined;
}

/**
 * The rule both calls share: the body's code names the failure, and when the body has
 * none the status does.
 *
 * A handler that dies inside MariaDB answers 500 with an empty body, so "the body has no
 * `error`" cannot mean "it worked" — a screen that read it that way just told the person
 * their filter was saved while nothing was written.
 */
export function callResult<T>(status: number, payload: unknown): CallResult<T> {
  const error = codeOf(payload) ?? (status >= 200 && status < 300 ? null : `http_${status}`);
  return { status, error, issues: issuesOf(payload), data: error ? null : dataOf<T>(payload) };
}

export async function consoleCall<T = unknown>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<CallResult<T>> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: csrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  return callResult<T>(res.status, await payloadOf(res));
}

/** A read: no CSRF header, because a GET writes nothing. */
export async function consoleRead<T>(path: string): Promise<CallResult<T>> {
  const res = await fetch(path, { method: 'GET', credentials: 'same-origin' });
  return callResult<T>(res.status, await payloadOf(res));
}
