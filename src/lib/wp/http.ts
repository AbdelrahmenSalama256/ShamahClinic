import { restBase, REVALIDATE, WP_FETCH_TIMEOUT_MS, WP_MAX_INFLIGHT, isBuildPhase } from "./config";
import type { Lang } from "./types";

export interface WpResponse<T> {
  data: T;
  total: number;
  source: "live" | "snapshot";
}

export interface WpFetchOptions {
  /**
   * Data-cache TTL for this URL. Taxonomy and media reads use a longer one than
   * content: the data team edits posts, not categories, and every WordPress round
   * trip on this host costs seconds, so a slow refresh there keeps page renders fast.
   */
  revalidate?: number;
}

/**
 * Live WordPress access. This module never reads the snapshot — the selector
 * layer (`lib/wp/index.ts`) owns the snapshot-first decision so that a build
 * pass can prove it made zero requests.
 */

// --- global concurrency cap -------------------------------------------------
let inFlight = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (inFlight < WP_MAX_INFLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function release() {
  inFlight -= 1;
  waiters.shift()?.();
}

// --- in-flight dedupe -------------------------------------------------------
const pending = new Map<string, Promise<WpResponse<unknown>>>();

/**
 * After a live failure for a URL we stop trying that URL for a short while.
 * A failed fetch is not cached by Next, so without this every single render of
 * `/blogs` would pay the full 8s timeout again when the origin stalls.
 */
const COOLDOWN_MS = 30_000;
const cooled = new Map<string, number>();

/**
 * GET a WordPress REST path. At most WP_MAX_INFLIGHT requests run concurrently,
 * each aborted after WP_FETCH_TIMEOUT_MS with one retry inside that budget, and
 * identical URLs share a single request.
 */
export function wpFetch<T>(relPath: string, lang: Lang, opts?: WpFetchOptions): Promise<WpResponse<T>> {
  if (isBuildPhase()) {
    // Provable guarantee: `next build` serves the committed snapshot only.
    console.warn(`[wp] REFUSED live request during build: ${lang} ${relPath}`);
    return Promise.reject(new Error("WordPress requests are disabled during next build"));
  }
  const key = `${lang} ${relPath}`;
  const until = cooled.get(key);
  if (until && until > Date.now()) {
    return Promise.reject(new Error("live cooldown after an earlier WordPress failure"));
  }
  if (until) cooled.delete(key);
  const existing = pending.get(key);
  if (existing) return existing as Promise<WpResponse<T>>;

  const p = attempt<T>(relPath, lang, opts?.revalidate ?? REVALIDATE).then(
    (value) => {
      pending.delete(key);
      cooled.delete(key);
      return value;
    },
    (err: unknown) => {
      pending.delete(key);
      if (cooled.size > 200) cooled.clear();
      cooled.set(key, Date.now() + COOLDOWN_MS);
      throw err;
    },
  );
  pending.set(key, p);
  return p;
}

async function attempt<T>(relPath: string, lang: Lang, revalidate: number): Promise<WpResponse<T>> {
  const url = `${restBase(lang)}${relPath}`;
  // One wall-clock budget for the whole attempt pair. A stalling origin does not
  // get 2 x 8s: the retry only runs while there is time left, so a page never
  // waits ~16s before the snapshot takes over.
  const deadline = Date.now() + WP_FETCH_TIMEOUT_MS;
  await acquire();
  try {
    let lastErr: unknown;
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const remaining = deadline - Date.now();
      if (remaining <= 250) break;
      try {
        const res = await fetch(url, {
          next: { revalidate, tags: [`wp:${lang}`, `wp:${lang}:${normalizeKey(relPath)}`] },
          headers: { "User-Agent": "shamah-site/1.0", Accept: "application/json" },
          cache: "force-cache",
          signal: AbortSignal.timeout(remaining),
        });
        if (!res.ok) throw new Error(`WP ${res.status} ${url}`);
        const data = (await res.json()) as T;
        const total = Number(res.headers.get("x-wp-total") || (Array.isArray(data) ? data.length : 0));
        return { data, total, source: "live" };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`WP request failed ${url}`);
  } finally {
    release();
  }
}

export function normalizeKey(p: string): string {
  return p.split("?")[0];
}

/** Fetch the same relative path from BOTH language subsites. */
export async function wpFetchPair<T>(
  relPath: string,
): Promise<{ en: WpResponse<T>; ar: WpResponse<T> }> {
  const [en, ar] = await Promise.all([wpFetch<T>(relPath, "en"), wpFetch<T>(relPath, "ar")]);
  return { en, ar };
}
