/**
 * BK-7.4 — the proof that the site no longer asks WordPress for anything.
 *
 * Two halves, because a single assertion would prove too little:
 *
 *  1. **behaviour**: `globalThis.fetch` is replaced with a recorder that throws, then
 *     every public reader runs — the whole read path (`lib/content/site`), the kinds
 *     still on the snapshot rung, and the derived readers behind /about, /results and
 *     the treatment pages. Zero recorded URLs means zero requests, and the content
 *     assertions in the same pass mean that "zero" is not the result of a reader
 *     quietly returning nothing.
 *  2. **structure**: a source scan, because the behaviour half can only catch a call
 *     that some test happens to reach. No `fetch(` may appear anywhere under
 *     `src/lib`, and `src/lib/wp/http.ts` — the live REST/Store-API client with its
 *     timeout and concurrency cap — must stay deleted. Something re-pointing the read
 *     path at the client's production host has to fail here, not in production.
 *
 * The one live WordPress call left in the app is the Contact Form 7 forward in
 * `/api/v1/lead`, gated behind `LEAD_MODE=cf7` (the default is `whatsapp`). It is a
 * write, not a read, and BK-8 replaces lead handling entirely — so it is asserted to
 * be the *only* one rather than silently tolerated.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as site from '../src/lib/content/site';
import * as wp from '../src/lib/wp';
import { getAbout } from '../src/lib/wp/about';
import { getResultStories } from '../src/lib/wp/result-stories';
import { getFeaturedServices, getMergedTreatment, getMergedTreatments } from '../src/lib/wp/treatments';

const ROOT = process.cwd();
const fetches: string[] = [];
let restore: (() => void) | null = null;

beforeAll(() => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    fetches.push(String(typeof input === 'object' && input && 'url' in input ? (input as Request).url : input));
    throw new Error('this suite disables the network');
  }) as typeof fetch;
  restore = () => {
    globalThis.fetch = original;
  };
});

afterAll(() => {
  restore?.();
});

/** Everything a public route renders, in the language it renders it in. */
async function renderEveryPublicReader(): Promise<void> {
  const [article] = await site.getAllArticles();
  const [offer] = await site.getAllOffers('en');
  const [page] = await site.getAllPages();
  const arOffers = await site.getAllOffers('ar');
  const treatments = await getMergedTreatments();

  await Promise.all([
    site.getPosts({ page: 1, perPage: 9 }),
    site.getPosts({ search: 'laser' }),
    site.getPost(article.slug),
    site.getPost(encodeURIComponent(article.slug)),
    site.getCategories(),
    site.getOffers({ page: 1 }, 'ar'),
    site.getOffer(offer.slug, 'en'),
    site.getOffer(arOffers[0]?.slug ?? offer.slug, 'ar'),
    site.getPages({ search: 'about' }),
    site.getPage(page.slug),
    site.getPageTitle(page.slug, { ar: '', en: '' }),
    site.getBranches(),
    site.getBranchList(),
    site.getServiceCards(),
    site.getHome({ offers: 3, articles: 3, lang: 'en' }),
    site.getHome({ offers: 3, articles: 3, lang: 'ar' }),
    wp.getSettings('en'),
    wp.getSettings('ar'),
    wp.getHeroPhotos(),
    wp.getHomeIntro(),
    wp.getHomeProseSections(),
    wp.getOfferCategories(),
    wp.getAllArticles(),
    wp.getPosts({ page: 1 }),
    wp.getPost(article.slug),
    wp.getOffer(offer.slug, 'ar'),
    getAbout(),
    getResultStories({ page: 1, perPage: 9 }),
    getFeaturedServices(3),
    getMergedTreatment(treatments[0]?.id ?? ''),
  ]);
}

describe('the site renders without a network', () => {
  it('makes zero requests while every public reader answers', async () => {
    await renderEveryPublicReader();
    expect(fetches).toEqual([]);
  }, 120_000);

  it('still returns the content, so "zero requests" is not an empty page', async () => {
    const [articles, offers, pages, branches, services, treatments] = await Promise.all([
      site.getAllArticles(),
      site.getAllOffers('en'),
      site.getAllPages(),
      site.getBranches(),
      site.getServiceCards(),
      getMergedTreatments(),
    ]);
    expect(articles.length).toBeGreaterThan(50);
    expect(offers.length).toBeGreaterThan(0);
    expect(pages.length).toBeGreaterThan(10);
    expect(branches.length).toBeGreaterThan(0);
    expect(services.length).toBeGreaterThan(0);
    expect(treatments.length).toBeGreaterThan(0);
  }, 120_000);
});

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('the live WordPress client is gone', () => {
  it('deleted the REST client module', () => {
    expect(existsSync(join(ROOT, 'src/lib/wp/http.ts'))).toBe(false);
  });

  it('keeps src/lib free of any fetch', () => {
    const offenders = sources(join(ROOT, 'src/lib')).filter((file) => readFileSync(file, 'utf8').includes('fetch('));
    expect(offenders).toEqual([]);
  });

  it('leaves the CF7 lead forward as the only live call in the app, and off by default', () => {
    const route = readFileSync(join(ROOT, 'src/app/api/v1/lead/route.ts'), 'utf8');
    expect(route).toContain('wp-json');
    expect(route).toContain('LEAD_MODE');
    expect(readFileSync(join(ROOT, 'src/lib/wp/config.ts'), 'utf8')).toContain('LEAD_MODE || "whatsapp"');
    const appSources = sources(join(ROOT, 'src/app')).filter((file) => readFileSync(file, 'utf8').includes('wp-json'));
    expect(appSources.map((file) => relative(ROOT, file))).toEqual([join('src', 'app', 'api', 'v1', 'lead', 'route.ts')]);
  });
});
