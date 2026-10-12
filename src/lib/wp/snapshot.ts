import fs from "node:fs";
import path from "node:path";
import type { Lang } from "./types";

/**
 * The committed WordPress snapshot (`data/wp/*.json`, produced by `npm run sync:wp`).
 *
 * `next build` reads ONLY from here — zero requests reach the client's production
 * WordPress. At runtime the live API is preferred and this is the fallback.
 */
const DIR = path.join(process.cwd(), "data", "wp");

/** Snapshot collections; `*-list` variants carry no `content` body. */
export type SnapshotName =
  | "posts-list"
  | "posts"
  | "pages-list"
  | "pages"
  | "categories"
  | "products"
  | "offer-categories";

export interface SnapshotMeta {
  generatedAt: string;
  previousGeneratedAt: string | null;
  origin: string;
  requests: number;
  bytes: number;
  counts: Record<string, number>;
}

const cache = new Map<string, unknown>();

const SHARED: SnapshotName[] = ["offer-categories"];

function fileFor(name: SnapshotName, lang: Lang): string {
  return SHARED.includes(name) ? `${name}.en.json` : `${name}.${lang}.json`;
}

function parse<T>(key: string, file: string): T | null {
  if (cache.has(key)) return cache.get(key) as T;
  let value: T | null = null;
  try {
    value = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8")) as T;
  } catch {
    value = null;
  }
  cache.set(key, value);
  return value;
}

export function readSnapshot<T>(name: SnapshotName, lang: Lang): T | null {
  return parse<T>(`${name}:${lang}`, fileFor(name, lang));
}

export function snapshotExists(name: SnapshotName, lang: Lang): boolean {
  return readSnapshot<unknown>(name, lang) !== null;
}

/** Media map (language-neutral, keyed by attachment id). */
export function snapshotMedia(): Map<number, WPMediaRow> {
  const cached = cache.get("media");
  if (cached) return cached as Map<number, WPMediaRow>;
  const rows = parse<WPMediaRow[]>("media", "media.json") || [];
  const map = new Map<number, WPMediaRow>();
  for (const m of rows) map.set(m.id, m);
  cache.set("media", map);
  return map;
}

export interface WPMediaRow {
  id: number;
  source_url: string;
  alt_text?: string;
  media_details?: { sizes?: Record<string, { source_url: string }> };
}

export interface SeoHeadRow {
  lang: Lang;
  url: string;
  head: { title: string; description: string; canonical: string; ogImage: string };
}

/** Parsed `<head>` meta captured at sync time, keyed by the WordPress URL. */
export function snapshotSeo(url: string, lang: Lang): SeoHeadRow | null {
  const rows = parse<SeoHeadRow[]>("seo", "seo.json") || [];
  const normalize = (u: string) => u.replace(/\/+$/, "");
  return rows.find((r) => r.lang === lang && normalize(r.url) === normalize(url)) || null;
}

export function snapshotMeta(): SnapshotMeta | null {
  return parse<SnapshotMeta>("meta", "meta.json") || null;
}
