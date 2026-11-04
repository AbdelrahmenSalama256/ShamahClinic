#!/usr/bin/env node
/**
 * Golden-set capture — the visual baseline every later item is compared against.
 *
 * It renders the CURRENT production build at 1440 and 390 px in AR and EN for the
 * seventeen routes the owner's brief lists, and writes one full-page PNG per route
 * plus `docs/baseline/capture.json`: the route, HTTP status, bytes, sha256 and the
 * console/page/request errors the page produced. The PNGs are git-ignored (the set
 * is ~49 MB); the manifest with its hashes is committed, so a later run can prove
 * that a page is byte-identical to the baseline or name the file that changed.
 *
 *   PROOF_BASE=http://127.0.0.1:3430 node scripts/baseline-capture.mjs
 *   PROOF_BASE=http://127.0.0.1:3430 BASELINE_SKIP_SHOTS=1 node scripts/baseline-capture.mjs
 *
 * Run it against `next start` on a production build, not against `next dev`: a dev
 * server serves unoptimized fonts and no compiled CSS chunks, so its pixels are not
 * the owner's pixels. Scroll the page before capture so anything revealed on scroll
 * is in the shot, and never trust a "failed request" here without reading it — the
 * `<Link prefetch>` RSC requests are cancelled when the page closes and arrive as
 * `net::ERR_ABORTED`, which is not a defect.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.PROOF_BASE || 'http://127.0.0.1:3430';
const OUT = join(process.cwd(), 'docs/baseline');
// `BASELINE_SKIP_SHOTS=1` walks the same routes and collects only the per-route error ledger,
// into `errors.json`. Use it to re-prove "zero console errors" after a change without spending
// forty minutes and 49 MB re-writing golden PNGs that the change did not touch.
const SHOTS = process.env.BASELINE_SKIP_SHOTS !== '1';

const WIDTHS = [
  { w: 1440, h: 900, tag: 'desktop-1440' },
  { w: 390, h: 844, tag: 'phone-390' },
];
const LOCALES = ['ar', 'en'];

/** [manifest name, path under the locale] in the order the brief lists them. */
const ROUTES = [
  ['home', ''],
  ['services', 'services'],
  ['service-skincare', 'services/skincare'],
  ['service-laser-hair-removal', 'services/laser-hair-removal'],
  ['service-botox-injections', 'services/botox-injections'],
  ['offers', 'offers'],
  ['cases-results', 'results'],
  ['doctors', 'doctors'],
  ['branches', 'branches'],
  ['contact', 'contact'],
  ['about', 'about'],
  ['blog-list', 'blogs'],
  ['article-short-hifu', 'blogs/hifu-facial-skin-tightening'],
  ['article-long-table-underarm', 'blogs/laser-underarm-hair-removal'],
  ['article-two-tables-morpheus', 'blogs/morpheus-8-sessions'],
  ['article-lists-clinics-near-me', 'blogs/best-laser-clinics-near-me'],
  ['article-price-table', 'blogs/laser-hair-removal-egypt-price'],
];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const records = [];

for (const locale of LOCALES) {
  for (const vp of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 1,
      locale: locale === 'ar' ? 'ar-EG' : 'en-US',
      timezoneId: 'Africa/Cairo',
      reducedMotion: 'no-preference',
    });
    const page = await ctx.newPage();
    // Errors are drained per route (`seen.splice(0)` below), so a record describes the route it
    // was taken from and nothing else. A "keep the last 8" buffer lets one route's noise push an
    // earlier route's console error out of the manifest, which would make "zero console errors"
    // unprovable — the first run did exactly that and hid the reason a URL looked non-RSC.
    let seen = [];
    let prefetchAborts = 0;
    page.on('console', (m) => m.type() === 'error' && seen.push(`console-error: ${m.text()}`));
    page.on('pageerror', (e) => seen.push(`pageerror: ${String(e)}`));
    page.on('requestfailed', (r) => {
      const url = r.url();
      // RSC prefetches die on context close and Playwright calls that a failed request; they are
      // not page errors, so they get a counter instead of the error list. Never truncate the URL:
      // slicing mid-percent-escape turns a `?_rsc=` prefetch into something that looks like a
      // broken link, and `decodeURIComponent` then throws on the leftover byte.
      if (/[?&]_rsc=/.test(url)) prefetchAborts++;
      else seen.push(`requestfailed: ${r.resourceType()} ${url} ${r.failure()?.errorText}`);
    });

    for (const [name, tail] of ROUTES) {
      const url = `${BASE}/${locale}${tail ? '/' + tail : ''}`;
      const file = join(OUT, `${locale}-${vp.tag}-${name}.png`);
      const started = Date.now();
      let status = 'no-response';
      try {
        const res = await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
        status = res ? String(res.status()) : status;
        await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => {});
        await page.evaluate(async () => {
          if (document.fonts) await document.fonts.ready;
          const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
          for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 40));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(350);
        if (SHOTS) await page.screenshot({ path: file, fullPage: true });
      } catch (error) {
        status = 'ERROR';
        seen.push(`goto-failed: ${String(error)}`);
      }
      const shot = {
        locale,
        viewport: vp.tag,
        route: `/${locale}${tail ? '/' + tail : ''}`,
        name,
        status,
        ms: Date.now() - started,
        file: SHOTS && existsSync(file) ? `docs/baseline/${locale}-${vp.tag}-${name}.png` : null,
        bytes: SHOTS && existsSync(file) ? statSync(file).size : 0,
        sha256: SHOTS && existsSync(file) ? sha256(file) : null,
        pageErrors: seen.splice(0),
        prefetchAborts,
      };
      prefetchAborts = 0;
      records.push(shot);
      console.log(`${shot.locale} ${shot.viewport} ${name} -> ${status} ${shot.bytes}B ${shot.ms}ms`);
    }
    await ctx.close();
  }
}
await browser.close();

writeFileSync(
  join(OUT, SHOTS ? 'capture.json' : 'errors.json'),
  JSON.stringify(
    { base: BASE, capturedAt: new Date().toISOString(), widths: WIDTHS, routes: ROUTES.length, shots: SHOTS, records },
    null,
    2,
  ),
);
const bytes = records.reduce((n, r) => n + r.bytes, 0);
const errorLines = records.reduce((n, r) => n + r.pageErrors.length, 0);
console.log(
  `\nshots=${records.length} non200=${records.filter((r) => r.status !== '200').length} ` +
    `bytes=${bytes} (~${(bytes / 1048576).toFixed(1)} MB) errors=${errorLines} ` +
    `prefetchAborts=${records.reduce((n, r) => n + r.prefetchAborts, 0)}`,
);
// A page that logs a console error is a failing capture: the brief's Definition of Done is "zero
// console errors on pages touched", so the golden set carries that as data, not as prose.
process.exit(
  records.some((r) => r.status !== '200' || r.pageErrors.length > 0 || (SHOTS && !r.file)) ? 1 : 0,
);
