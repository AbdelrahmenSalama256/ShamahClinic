/**
 * Per-page visibility, stored in the `settings` table under the `pages` group so a
 * page can be hidden without a migration and without deleting anything.
 *
 * One row per page: `{ "enabled": true, "redirectTo": null }`. A missing row means
 * enabled — a site that has never opened this screen keeps behaving exactly as it did.
 *
 * The reader **fails open**. It runs in the layout, every page, the sitemap and the
 * nav, so a database outage that made it throw would turn a readable site into 404s
 * everywhere. A page whose state cannot be read stays visible; the console's own
 * write path still reports the failure loudly.
 */
import { cache } from 'react';
import { db } from '../db';
import {
  PAGE_SETTING_GROUP,
  SITE_PAGES,
  hrefOfPage,
  safeRedirect,
  type SitePageKey,
} from './settings-catalog';

export interface PageState {
  enabled: boolean;
  /** Only honoured while the page is hidden; validated on the way in and out. */
  redirectTo: string | null;
}

export type PageStates = Record<SitePageKey, PageState>;

export function defaultPageStates(): PageStates {
  return Object.fromEntries(
    SITE_PAGES.map((page) => [page.key, { enabled: true, redirectTo: null }]),
  ) as PageStates;
}

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text.startsWith('{') && !text.startsWith('[') && !text.startsWith('"')) {
    return text === 'true' ? true : text === 'false' ? false : value;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

export function parsePageState(value: unknown): PageState {
  const document = decode(value);
  if (typeof document === 'boolean') return { enabled: document, redirectTo: null };
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { enabled: true, redirectTo: null };
  }
  const record = document as Record<string, unknown>;
  const enabled = record.enabled === false || record.enabled === 0 || record.enabled === '0' ? false : true;
  const redirect = typeof record.redirectTo === 'string' ? safeRedirect(record.redirectTo) : null;
  return { enabled, redirectTo: redirect };
}

/**
 * One read per render: the layout asks for the hidden pages to build the menu, and the
 * page's own guard asks again before rendering. The two answers cannot differ inside a
 * render, and a save revalidates the route, so the next render reads the new row.
 */
export const readPageStates = cache(async function readPageStates(): Promise<PageStates> {
  const states = defaultPageStates();
  try {
    const rows = await db
      .selectFrom('settings')
      .select(['setting_key', 'value'])
      .where('group_name', '=', PAGE_SETTING_GROUP)
      .where('is_secret', '=', 0)
      .execute();
    for (const row of rows) {
      if (!(row.setting_key in states)) continue;
      states[row.setting_key as SitePageKey] = parsePageState(row.value);
    }
  } catch {
    /* fail open: an unreadable setting must not take the whole site down */
  }
  return states;
});

/** The hrefs the header and footer must stop linking to. */
export function hiddenPageHrefs(states: PageStates): string[] {
  return SITE_PAGES.filter((page) => !states[page.key].enabled).map(hrefOfPage);
}
