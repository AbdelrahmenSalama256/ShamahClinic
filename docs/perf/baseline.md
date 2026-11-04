# Performance baseline — the §0b numbers, taken before any fix

The owner's brief says report both baselines before fixing anything and never hide a page
that is below target, so this file is deliberately a list of failures first and an
explanation second. Nothing on the site was changed to produce these numbers: the build is
the same `.next-build` output the §0a golden set was shot from, and the only extra thing
this pass added to the tree is the `DATABASE_LOG_QUERIES=1` environment variable on a
second, disposable server.

**32 of 32 page/locale/form combinations were measured, 3 runs each — 96 Lighthouse runs.
18 of them are below a row-7 budget.** Every one is named in
[Breaches](#breaches-every-combination-below-a-row-7-budget) below; none were dropped for
being slow, and the medians are the medians of all three runs, not the best.

## Provenance

| fact | value |
|------|-------|
| branch / commit | `wip/snapshot-nov3`, on top of `eb1fe35` (item 0a) — uncommitted at capture time |
| build | `NEXT_DIST_DIR=.next-build npm run build`, `BUILD_ID` **`02zpKI9iZLsh9fg1CxUyc`** (written 2026-11-04 18:16:41 local) |
| Lighthouse server | disposable production server `next start -p 3430`, PID **31324**, started 18:25:35 local, `http://127.0.0.1:3430` |
| DB-timing server | second disposable server, same distDir, `next start -p 3431` with `DATABASE_LOG_QUERIES=1`, PIDs **37916 / 32868** (wrapper 18244), started 19:13:53 local |
| content database | dev database `shamah_cms` on `127.0.0.1:3307` (`DATABASE_NAME` read from `.env.local`; the test database `shamah_cms_test` served nothing — it is for vitest only) |
| Lighthouse | **12.8.2**, Chrome `148.0.7778.96` via Playwright's `chromium-1248`, Node 24.18.0, installed out-of-git in `%TEMP%\shamah-lh` |
| matrix window | first run 2026-11-04T16:36Z, last run 2026-11-04T17:11Z (the runner exited 0) |
| DB timing window | 2026-11-04 19:15–19:17 local, after the matrix finished so nothing competed for CPU |
| owner's dev server | still running on **3100** throughout the matrix window — untouched, and nothing in this pass measured it (it was gone by the time the item's gates ran, at 19:36) |
| gate rebuild | same tree, `NEXT_DIST_DIR=.next-build npm run build` exit 0 at **19:37:11**, `BUILD_ID 8rFROZu4x77RQE7K46BIK`; served again on 3430 (PID **23604**) for `prove:no-wp`, `verify-render` and `verify-style-isolation`. Identical output: every JS chunk above by the same name, the same 5 stylesheets / 210,830 B raw — only the site CSS chunk name moved (see below), so the numbers here still describe this tree |

## Method, and what it does and does not prove

```
# 96 runs: 8 pages × AR/EN × mobile/desktop × 3
node %TEMP%\shamah-lh-run.cjs                                   # lighthouse CLI, one process per run
node %TEMP%\shamah-perf-summary.cjs --md                        # medians + tables from the raw reports

# 22 URLs × 2 hits, one request at a time
%TEMP%\shamah-start-3431.cmd                                    # DATABASE_LOG_QUERIES=1
PROOF_BASE=http://127.0.0.1:3431 node %TEMP%\shamah-dbq.cjs      # reads [dbq] lines off the server log
```

- **Mobile** = `--form-factor=mobile --screenEmulation.mobile --throttling-method=simulate`,
  which is Lighthouse's own 4× CPU throttle and Slow 4G (1.6 Mbps / 150 ms RTT) model — the
  brief's wording, "simulated slow 4G, 4x CPU". **Desktop** = `--preset=desktop`.
- **Median of 3 runs** for every number, with the min–max spread printed under each table.
  Spreads are wide where the page is wide (see `mobile-ar-home` TBT 191–340 ms): a single run
  of this site would have been a coin flip, which is why the brief asked for three.
- **INP is a proxy, and the proxy is named.** Lighthouse 12.8.2 in this configuration has no
  lab `interaction-to-next-page` audit (checked against the 176 audits in every report), so
  the column is **Max Potential First Input Delay** (`max-potential-fid`, ms) plus the long
  task count and longest task. Real INP needs field data (CrUX) or a scripted-interaction
  harness; neither existed for this baseline. Treat "INP-proxy 250 ms" as "the first tap on
  this page can be blocked for about a quarter second", not as a measured INP.
- **Request counts include Next's own prefetch traffic.** Every `reqs` cell shows
  `total (N RSC)`, where N is requests whose URL carries `?_rsc=` — `<Link prefetch>` RSC
  fetches, not page assets. Across the 96 runs, 9,697 of 13,063 requests were RSC prefetches
  (74%). That ratio is itself a finding, not a unit mistake.
- **`transfer`/`JS`/`CSS`/`font` are bytes over the wire** (Lighthouse `transferSize`/
  `encodedBytes`, i.e. gzipped), taken from the `resource-summary` and `script-treemap-data`
  audits of the same runs.
- **The pages are dynamic.** `prerender-manifest.json` in this build lists only
  `/robots.txt` and `/sitemap.xml` as prerendered; every public page rendered per request,
  which is why the DB-timing numbers below are per request and why TTFB is not free.
- **Content is the dev database, junk included.** Per §0a and Q-16 the rows are seeded/faker
  content (94 articles, 213 `list_items`, 28 `pages`). Query counts and image counts scale
  with that data, so they are a shape of the cost, not the production number. The
  *rendered* defects that follow from it are marked as such.

## Headline

| budget (brief row 7) | target | measured now | verdict |
|---|---|---|---|
| Mobile Performance | ≥ 90, aim 95+ | medians **71–86** across 16 combos | every mobile page fails |
| Desktop Performance | ≥ 95 | medians **90–100**; 15 of 16 pass | `/ar` home is 90 |
| LCP | < 2.5 s (aim < 2 s) | mobile **3.88–4.75 s**, desktop **0.65–1.04 s** | mobile fails everywhere |
| CLS | ≤ 0.05 | mobile AR **0–0.173**, mobile EN 0–0.007, desktop 0–0.113 | 4 combos fail |
| TBT | < 200 ms | mobile **154–382 ms**, desktop 0–7 ms | 9 mobile combos fail |
| INP (< 200 ms) | — | proxy **189–259 ms** mobile, 50–63 ms desktop | 11 mobile combos fail on the proxy |
| Accessibility / BP / SEO | ≥ 95 | A11y 96–100, BP 100, SEO 100 | pass; two audit failures cost 4 points on home |
| First-load JS | ≤ 170 KB gzip | **218.8–243.8 KB** gzip per page | 40–73 KB over, on every page |
| CSS | ≤ 60 KB | **20.2 KB** gzip (2 requests) | pass |
| LCP image | ≤ 120 KB | largest image on any page **31.7 KB** mobile, 105.2 KB desktop | pass |
| Page weight | ≤ 1.5 MB | mobile 438–792 KB; desktop 447–610 KB **except `/ar` home 4.2 MB** | 1 combo fails, by 2.8× |
| Console errors / failed requests | 0 | **0** in all 96 runs (`errors-in-console` audit) | pass |

**What the numbers actually say, in one paragraph:** desktop is fine and mobile is not, and
the mobile problem is not the server — TTFB is 26–222 ms and LCP lands 3.9–4.8 s after
navigation start with 4–7 long tasks of 190–380 ms. The documents arrive fast and then the
main thread spends seconds parsing 219–244 KB of JS and re-laying-out text when the four
Tajawal files swap in. The CLS failures are all font-swap or hero-text reflow, all on the
Arabic pages (and both home pages on desktop). The one 4.2 MB page is 2,700 duplicate RSC
prefetch requests for four links.

## The 32 combinations

| page | Perf | A11y | BP | SEO | FCP | LCP | CLS | TBT | INP-proxy | TTFB(doc) | transfer | JS | CSS | font | reqs | long tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `home` | 78 | 96 | 100 | 100 | 1.66 s | 4.66 s | 0.067 | 199 ms | 212 ms | 196 ms | 791.6 KiB | 240.1 | 20.2 | 83.4 | 180 (140 RSC) | 14 | 31.7 KiB | 7 / 242 ms |
| `services` | 71 | 100 | 100 | 100 | 1.67 s | 4.55 s | 0.173 | 220 ms | 253 ms | 109 ms | 495.9 KiB | 224.3 | 20.2 | 83.4 | 49 (10 RSC) | 15 | 17.2 KiB | 6 / 253 ms |
| `service-detail` | 80 | 100 | 100 | 100 | 1.67 s | 4.40 s | 0.033 | 214 ms | 251 ms | 101 ms | 474.9 KiB | 250.4 | 20.2 | 83.4 | 37 (4 RSC) | 6 | 17.2 KiB | 4 / 251 ms |
| `offers` | 77 | 100 | 100 | 100 | 1.22 s | 4.71 s | 0.041 | 256 ms | 248 ms | 98 ms | 603.5 KiB | 227.1 | 20.2 | 83.4 | 39 (4 RSC) | 11 | 31.7 KiB | 7 / 248 ms |
| `cases` | 78 | 100 | 100 | 100 | 1.67 s | 4.71 s | 0.045 | 177 ms | 217 ms | 133 ms | 511.7 KiB | 234.7 | 20.2 | 83.4 | 42 (6 RSC) | 10 | 27.9 KiB | 3 / 220 ms |
| `articles` | 78 | 100 | 100 | 100 | 1.68 s | 4.56 s | 0.033 | 226 ms | 254 ms | 222 ms | 503.9 KiB | 228.5 | 20.2 | 83.4 | 48 (10 RSC) | 14 | 19.7 KiB | 4 / 255 ms |
| `article` | 73 | 100 | 100 | 100 | 1.82 s | 4.51 s | 0.033 | 382 ms | 259 ms | 131 ms | 440.8 KiB | 231.7 | 20.2 | 83.4 | 32 (4 RSC) | 3 | 9.4 KiB | 7 / 317 ms |
| `contact` | 80 | 100 | 100 | 100 | 1.67 s | 4.38 s | 0.035 | 220 ms | 225 ms | 35 ms | 453.7 KiB | 233.8 | 20.2 | 83.4 | 33 (2 RSC) | 6 | 21.3 KiB | 5 / 233 ms |

- `home`: Perf 71–78, LCP 4.65 s–4.96 s, CLS stable 0.067, TBT 191 ms–340 ms, INP-proxy 207 ms–333 ms, transfer 777.1 KiB–799.7 KiB, requests 179–186
- `services`: Perf 68–74, LCP 4.16 s–4.72 s, CLS 0.166–0.174, TBT 208 ms–312 ms, INP-proxy 193 ms–253 ms, transfer 494.1 KiB–495.9 KiB, requests stable 49
- `service-detail`: Perf 79–86, LCP 3.74 s–4.43 s, CLS stable 0.033, TBT 198 ms–239 ms, INP-proxy 210 ms–271 ms, transfer 474.9 KiB–476.6 KiB, requests stable 37
- `offers`: Perf 77–81, LCP 4.37 s–4.86 s, CLS 0.035–0.042, TBT 204 ms–276 ms, INP-proxy 239 ms–267 ms, transfer 601.9 KiB–604.4 KiB, requests stable 39
- `cases`: Perf 78–80, LCP 4.68 s–4.72 s, CLS stable 0.045, TBT 149 ms–182 ms, INP-proxy 190 ms–220 ms, transfer 510.9 KiB–511.8 KiB, requests stable 42
- `articles`: Perf 72–81, LCP 4.49 s–4.79 s, CLS stable 0.033, TBT 160 ms–381 ms, INP-proxy 195 ms–402 ms, transfer 503.7 KiB–505.9 KiB, requests stable 48
- `article`: Perf 71–78, LCP 4.33 s–4.61 s, CLS stable 0.033, TBT 260 ms–402 ms, INP-proxy 198 ms–308 ms, transfer 440 KiB–441 KiB, requests stable 32
- `contact`: Perf 80–81, LCP 4.36 s–4.42 s, CLS 0.035–0.036, TBT 210 ms–221 ms, INP-proxy 201 ms–233 ms, transfer 453.7 KiB–454.3 KiB, requests stable 33

| page | Perf | A11y | BP | SEO | FCP | LCP | CLS | TBT | INP-proxy | TTFB(doc) | transfer | JS | CSS | font | reqs | long tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `home` | 78 | 96 | 100 | 100 | 1.67 s | 4.71 s | 0.005 | 193 ms | 195 ms | 187 ms | 584.6 KiB | 240.1 | 20.2 | 83.4 | 42 (3 RSC) | 13 | 31.7 KiB | 5 / 227 ms |
| `services` | 82 | 100 | 100 | 100 | 1.38 s | 4.50 s | 0.001 | 208 ms | 215 ms | 94 ms | 493.2 KiB | 224.3 | 20.2 | 83.4 | 49 (10 RSC) | 15 | 17.2 KiB | 6 / 215 ms |
| `service-detail` | 86 | 100 | 100 | 100 | 1.67 s | 3.88 s | 0.002 | 154 ms | 190 ms | 97 ms | 474.8 KiB | 250.4 | 20.2 | 83.4 | 37 (4 RSC) | 6 | 17.2 KiB | 4 / 190 ms |
| `offers` | 79 | 100 | 100 | 100 | 1.22 s | 4.73 s | 0 | 214 ms | 189 ms | 88 ms | 571.1 KiB | 227.1 | 20.2 | 83.4 | 38 (4 RSC) | 10 | 31.7 KiB | 6 / 204 ms |
| `cases` | 80 | 100 | 100 | 100 | 1.67 s | 4.75 s | 0.001 | 193 ms | 203 ms | 83 ms | 508.7 KiB | 234.7 | 20.2 | 83.4 | 40 (4 RSC) | 10 | 27.9 KiB | 5 / 203 ms |
| `articles` | 80 | 100 | 100 | 100 | 1.52 s | 4.56 s | 0 | 203 ms | 210 ms | 136 ms | 501.1 KiB | 228.5 | 20.2 | 83.4 | 48 (10 RSC) | 14 | 19.7 KiB | 6 / 210 ms |
| `article` | 76 | 100 | 100 | 100 | 1.82 s | 4.44 s | 0.007 | 295 ms | 227 ms | 116 ms | 438.2 KiB | 231.7 | 20.2 | 83.4 | 32 (4 RSC) | 3 | 9.4 KiB | 7 / 247 ms |
| `contact` | 82 | 100 | 100 | 100 | 1.67 s | 4.40 s | 0 | 191 ms | 220 ms | 29 ms | 452.7 KiB | 233.8 | 20.2 | 83.4 | 33 (2 RSC) | 6 | 21.3 KiB | 4 / 220 ms |

- `home`: Perf 78–79, LCP 4.67 s–4.74 s, CLS stable 0.005, TBT 171 ms–194 ms, INP-proxy 176 ms–209 ms, transfer 583.9 KiB–584.9 KiB, requests stable 42
- `services`: Perf 80–82, LCP 4.17 s–4.59 s, CLS stable 0.001, TBT 171 ms–214 ms, INP-proxy 197 ms–235 ms, transfer 491.5 KiB–493.2 KiB, requests stable 49
- `service-detail`: Perf 85–86, LCP 3.84 s–3.89 s, CLS stable 0.002, TBT 144 ms–165 ms, INP-proxy 188 ms–195 ms, transfer 473.6 KiB–475.6 KiB, requests stable 37
- `offers`: Perf 79–80, LCP 4.71 s–4.79 s, CLS stable 0, TBT 176 ms–218 ms, INP-proxy 186 ms–208 ms, transfer 570.7 KiB–571.9 KiB, requests stable 38
- `cases`: Perf 79–80, LCP 4.46 s–4.76 s, CLS stable 0.001, TBT 160 ms–215 ms, INP-proxy 200 ms–229 ms, transfer 507.7 KiB–509.4 KiB, requests stable 40
- `articles`: Perf 80–82, LCP 4.31 s–4.65 s, CLS stable 0, TBT 174 ms–212 ms, INP-proxy 205 ms–221 ms, transfer 499.8 KiB–502.7 KiB, requests stable 48
- `article`: Perf 72–78, LCP 4.34 s–4.47 s, CLS stable 0.007, TBT 264 ms–424 ms, INP-proxy 208 ms–231 ms, transfer 437.6 KiB–438.4 KiB, requests stable 32
- `contact`: Perf 81–83, LCP 4.15 s–4.41 s, CLS stable 0, TBT 179 ms–193 ms, INP-proxy 215 ms–224 ms, transfer 452.5 KiB–453.5 KiB, requests stable 33

| page | Perf | A11y | BP | SEO | FCP | LCP | CLS | TBT | INP-proxy | TTFB(doc) | transfer | JS | CSS | font | reqs | long tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `home` | 90 | 100 | 100 | 100 | 0.43 s | 0.71 s | 0.064 | 7 ms | 63 ms | 173 ms | 4164 KiB | 240.1 | 20.2 | 83.4 | 2744 (2699 RSC) | 19 | 105.2 KiB | 2 / 63 ms |
| `services` | 99 | 100 | 100 | 100 | 0.42 s | 1.02 s | 0.011 | 2 ms | 52 ms | 83 ms | 533 KiB | 224.3 | 20.2 | 83.4 | 60 (22 RSC) | 14 | 21.5 KiB | 1 / 52 ms |
| `service-detail` | 99 | 100 | 100 | 100 | 0.42 s | 0.85 s | 0.007 | 0 ms | 50 ms | 87 ms | 473.3 KiB | 250.4 | 20.2 | 83.4 | 48 (16 RSC) | 5 | 17.2 KiB | 1 / 50 ms |
| `offers` | 99 | 100 | 100 | 100 | 0.42 s | 1.01 s | 0.001 | 4 ms | 54 ms | 79 ms | 609.3 KiB | 227.1 | 20.2 | 83.4 | 58 (22 RSC) | 12 | 30.6 KiB | 2 / 54 ms |
| `cases` | 99 | 100 | 100 | 100 | 0.42 s | 1.01 s | 0.006 | 3 ms | 53 ms | 85 ms | 545.9 KiB | 234.7 | 20.2 | 83.4 | 55 (20 RSC) | 9 | 29 KiB | 2 / 56 ms |
| `articles` | 99 | 100 | 100 | 100 | 0.42 s | 0.99 s | 0.003 | 5 ms | 55 ms | 133 ms | 543.5 KiB | 228.5 | 20.2 | 83.4 | 60 (22 RSC) | 14 | 22.7 KiB | 1 / 55 ms |
| `article` | 100 | 100 | 100 | 100 | 0.46 s | 0.67 s | 0.001 | 6 ms | 57 ms | 100 ms | 451.7 KiB | 231.7 | 20.2 | 83.4 | 44 (16 RSC) | 3 | 9.4 KiB | 2 / 72 ms |
| `contact` | 99 | 100 | 100 | 100 | 0.42 s | 0.91 s | 0.005 | 3 ms | 53 ms | 26 ms | 451 KiB | 233.8 | 20.2 | 83.4 | 46 (16 RSC) | 5 | 17.2 KiB | 1 / 53 ms |

- `home`: Perf 89–90, LCP 0.71 s–0.71 s, CLS stable 0.064, TBT 6 ms–7 ms, INP-proxy 62 ms–64 ms, transfer 4096.8 KiB–4314.6 KiB, requests 2706–2880
- `services`: Perf stable 99, LCP 0.98 s–1.03 s, CLS stable 0.011, TBT 2 ms–6 ms, INP-proxy 52 ms–56 ms, transfer 532.2 KiB–534 KiB, requests stable 60
- `service-detail`: Perf 99–100, LCP 0.77 s–0.87 s, CLS stable 0.007, TBT 0 ms–2 ms, INP-proxy 47 ms–52 ms, transfer 473.2 KiB–474.7 KiB, requests stable 48
- `offers`: Perf stable 99, LCP 0.92 s–1.02 s, CLS stable 0.001, TBT 2 ms–12 ms, INP-proxy 54 ms–62 ms, transfer 608.8 KiB–612.5 KiB, requests stable 58
- `cases`: Perf stable 99, LCP 1.00 s–1.03 s, CLS stable 0.006, TBT 0 ms–16 ms, INP-proxy 46 ms–66 ms, transfer 545.8 KiB–545.9 KiB, requests stable 55
- `articles`: Perf stable 99, LCP 0.95 s–1.04 s, CLS stable 0.003, TBT 4 ms–6 ms, INP-proxy 54 ms–56 ms, transfer 542.3 KiB–546.5 KiB, requests stable 60
- `article`: Perf stable 100, LCP 0.65 s–0.77 s, CLS stable 0.001, TBT 3 ms–8 ms, INP-proxy 56 ms–63 ms, transfer 451.1 KiB–453 KiB, requests stable 44
- `contact`: Perf stable 99, LCP 0.91 s–0.92 s, CLS stable 0.005, TBT 0 ms–4 ms, INP-proxy 50 ms–54 ms, transfer 449 KiB–452.3 KiB, requests stable 46

| page | Perf | A11y | BP | SEO | FCP | LCP | CLS | TBT | INP-proxy | TTFB(doc) | transfer | JS | CSS | font | reqs | long tasks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `home` | 96 | 100 | 100 | 100 | 0.42 s | 0.69 s | 0.113 | 1 ms | 52 ms | 167 ms | 765.4 KiB | 240.1 | 20.2 | 83.4 | 60 (15 RSC) | 19 | 105.2 KiB | 2 / 53 ms |
| `services` | 99 | 100 | 100 | 100 | 0.42 s | 1.01 s | 0 | 1 ms | 51 ms | 69 ms | 530.5 KiB | 224.3 | 20.2 | 83.4 | 59 (21 RSC) | 14 | 21.5 KiB | 1 / 51 ms |
| `service-detail` | 100 | 100 | 100 | 100 | 0.42 s | 0.81 s | 0.001 | 0 ms | 50 ms | 95 ms | 472.2 KiB | 250.4 | 20.2 | 83.4 | 48 (16 RSC) | 5 | 17.2 KiB | 1 / 50 ms |
| `offers` | 99 | 100 | 100 | 100 | 0.42 s | 1.01 s | 0 | 1 ms | 51 ms | 74 ms | 603.2 KiB | 227.1 | 20.2 | 83.4 | 57 (21 RSC) | 12 | 30.6 KiB | 1 / 51 ms |
| `cases` | 99 | 100 | 100 | 100 | 0.42 s | 1.01 s | 0.001 | 3 ms | 53 ms | 80 ms | 543.3 KiB | 234.7 | 20.2 | 83.4 | 54 (19 RSC) | 9 | 29 KiB | 1 / 53 ms |
| `articles` | 99 | 100 | 100 | 100 | 0.42 s | 1.04 s | 0 | 4 ms | 54 ms | 152 ms | 539.1 KiB | 228.5 | 20.2 | 83.4 | 59 (21 RSC) | 14 | 22.7 KiB | 1 / 54 ms |
| `article` | 100 | 100 | 100 | 100 | 0.46 s | 0.65 s | 0 | 0 ms | 50 ms | 93 ms | 447.6 KiB | 231.7 | 20.2 | 83.4 | 44 (16 RSC) | 3 | 9.4 KiB | 2 / 65 ms |
| `contact` | 99 | 100 | 100 | 100 | 0.42 s | 0.91 s | 0.001 | 1 ms | 51 ms | 32 ms | 448.4 KiB | 233.8 | 20.2 | 83.4 | 45 (15 RSC) | 5 | 17.2 KiB | 1 / 51 ms |

- `home`: Perf stable 96, LCP 0.69 s–0.81 s, CLS stable 0.113, TBT 0 ms–3 ms, INP-proxy 50 ms–56 ms, transfer 765.4 KiB–766.7 KiB, requests stable 60
- `services`: Perf stable 99, LCP 1.00 s–1.01 s, CLS stable 0, TBT 0 ms–2 ms, INP-proxy 48 ms–52 ms, transfer 530 KiB–532.1 KiB, requests stable 59
- `service-detail`: Perf 99–100, LCP 0.78 s–0.85 s, CLS stable 0.001, TBT stable 0 ms, INP-proxy 46 ms–50 ms, transfer 471.3 KiB–475 KiB, requests stable 48
- `offers`: Perf stable 99, LCP 0.95 s–1.02 s, CLS stable 0, TBT 0 ms–3 ms, INP-proxy 50 ms–53 ms, transfer 603.2 KiB–603.3 KiB, requests stable 57
- `cases`: Perf stable 99, LCP 0.99 s–1.03 s, CLS stable 0.001, TBT 3 ms–13 ms, INP-proxy 53 ms–63 ms, transfer 542.2 KiB–546 KiB, requests stable 54
- `articles`: Perf 98–99, LCP 1.02 s–1.05 s, CLS stable 0, TBT 4 ms–5 ms, INP-proxy 54 ms–55 ms, transfer 536.9 KiB–539.6 KiB, requests stable 59
- `article`: Perf stable 100, LCP 0.65 s–0.67 s, CLS stable 0, TBT 0 ms–9 ms, INP-proxy 50 ms–67 ms, transfer 446.8 KiB–448.3 KiB, requests stable 44
- `contact`: Perf stable 99, LCP 0.90 s–0.96 s, CLS stable 0.001, TBT 0 ms–3 ms, INP-proxy 50 ms–53 ms, transfer 447.7 KiB–449.7 KiB, requests stable 45

## Breaches: every combination below a row-7 budget

Eighteen of 32 combinations, which is 60 individual breaches. Listed one breach per row, not
one page per row, so a fix can be checked against the exact line it is supposed to clear.

| # | combination | budget missed | measured | target |
|---|---|---|---|---|
| 1 | `mobile-ar-home` | Performance score | 78 | ≥ 90 |
| 2 | `mobile-ar-home` | LCP | 4.66 s | < 2.5 s |
| 3 | `mobile-ar-home` | CLS | 0.067 | ≤ 0.05 |
| 4 | `mobile-ar-home` | INP-proxy (Max Pot FID) | 212 ms | < 200 ms |
| 5 | `mobile-ar-services` | Performance score | 71 | ≥ 90 |
| 6 | `mobile-ar-services` | LCP | 4.55 s | < 2.5 s |
| 7 | `mobile-ar-services` | CLS | 0.173 | ≤ 0.05 |
| 8 | `mobile-ar-services` | TBT | 220 ms | < 200 ms |
| 9 | `mobile-ar-services` | INP-proxy (Max Pot FID) | 253 ms | < 200 ms |
| 10 | `mobile-ar-service-detail` | Performance score | 80 | ≥ 90 |
| 11 | `mobile-ar-service-detail` | LCP | 4.40 s | < 2.5 s |
| 12 | `mobile-ar-service-detail` | TBT | 214 ms | < 200 ms |
| 13 | `mobile-ar-service-detail` | INP-proxy (Max Pot FID) | 251 ms | < 200 ms |
| 14 | `mobile-ar-offers` | Performance score | 77 | ≥ 90 |
| 15 | `mobile-ar-offers` | LCP | 4.71 s | < 2.5 s |
| 16 | `mobile-ar-offers` | TBT | 256 ms | < 200 ms |
| 17 | `mobile-ar-offers` | INP-proxy (Max Pot FID) | 248 ms | < 200 ms |
| 18 | `mobile-ar-cases` | Performance score | 78 | ≥ 90 |
| 19 | `mobile-ar-cases` | LCP | 4.71 s | < 2.5 s |
| 20 | `mobile-ar-cases` | INP-proxy (Max Pot FID) | 217 ms | < 200 ms |
| 21 | `mobile-ar-articles` | Performance score | 78 | ≥ 90 |
| 22 | `mobile-ar-articles` | LCP | 4.56 s | < 2.5 s |
| 23 | `mobile-ar-articles` | TBT | 226 ms | < 200 ms |
| 24 | `mobile-ar-articles` | INP-proxy (Max Pot FID) | 254 ms | < 200 ms |
| 25 | `mobile-ar-article` | Performance score | 73 | ≥ 90 |
| 26 | `mobile-ar-article` | LCP | 4.51 s | < 2.5 s |
| 27 | `mobile-ar-article` | TBT | 382 ms | < 200 ms |
| 28 | `mobile-ar-article` | INP-proxy (Max Pot FID) | 259 ms | < 200 ms |
| 29 | `mobile-ar-contact` | Performance score | 80 | ≥ 90 |
| 30 | `mobile-ar-contact` | LCP | 4.38 s | < 2.5 s |
| 31 | `mobile-ar-contact` | TBT | 220 ms | < 200 ms |
| 32 | `mobile-ar-contact` | INP-proxy (Max Pot FID) | 225 ms | < 200 ms |
| 33 | `mobile-en-home` | Performance score | 78 | ≥ 90 |
| 34 | `mobile-en-home` | LCP | 4.71 s | < 2.5 s |
| 35 | `mobile-en-services` | Performance score | 82 | ≥ 90 |
| 36 | `mobile-en-services` | LCP | 4.50 s | < 2.5 s |
| 37 | `mobile-en-services` | TBT | 208 ms | < 200 ms |
| 38 | `mobile-en-services` | INP-proxy (Max Pot FID) | 215 ms | < 200 ms |
| 39 | `mobile-en-service-detail` | Performance score | 86 | ≥ 90 |
| 40 | `mobile-en-service-detail` | LCP | 3.88 s | < 2.5 s |
| 41 | `mobile-en-offers` | Performance score | 79 | ≥ 90 |
| 42 | `mobile-en-offers` | LCP | 4.73 s | < 2.5 s |
| 43 | `mobile-en-offers` | TBT | 214 ms | < 200 ms |
| 44 | `mobile-en-cases` | Performance score | 80 | ≥ 90 |
| 45 | `mobile-en-cases` | LCP | 4.75 s | < 2.5 s |
| 46 | `mobile-en-cases` | INP-proxy (Max Pot FID) | 203 ms | < 200 ms |
| 47 | `mobile-en-articles` | Performance score | 80 | ≥ 90 |
| 48 | `mobile-en-articles` | LCP | 4.56 s | < 2.5 s |
| 49 | `mobile-en-articles` | TBT | 203 ms | < 200 ms |
| 50 | `mobile-en-articles` | INP-proxy (Max Pot FID) | 210 ms | < 200 ms |
| 51 | `mobile-en-article` | Performance score | 76 | ≥ 90 |
| 52 | `mobile-en-article` | LCP | 4.44 s | < 2.5 s |
| 53 | `mobile-en-article` | TBT | 295 ms | < 200 ms |
| 54 | `mobile-en-article` | INP-proxy (Max Pot FID) | 227 ms | < 200 ms |
| 55 | `mobile-en-contact` | Performance score | 82 | ≥ 90 |
| 56 | `mobile-en-contact` | LCP | 4.40 s | < 2.5 s |
| 57 | `mobile-en-contact` | INP-proxy (Max Pot FID) | 220 ms | < 200 ms |
| 58 | `desktop-ar-home` | Performance score | 90 | ≥ 95 |
| 59 | `desktop-ar-home` | CLS | 0.064 | ≤ 0.05 |
| 60 | `desktop-en-home` | CLS | 0.113 | ≤ 0.05 |

### Two of these are not mobile-throttling artefacts

`desktop-ar-home` (Performance 90, CLS 0.064) and `desktop-en-home` (CLS 0.113) are desktop
runs with unthrottled network. They fail for reasons that will still be there on a fast
machine: the home hero re-lays-out when the webfont arrives, and the AR home issues thousands
of prefetch requests.

## Where the time goes on a mobile page

| stage | measured | evidence |
|---|---|---|
| Server: DB → HTML | TTFB 29–222 ms (median per page), DB duration sum per request 34–1,273 ms | `server-response-time` audit + the `[dbq]` pass below |
| Download | 438–792 KiB, of which JS 218–250 KiB, images ≤ 175 KiB, fonts 83.4 KiB, CSS 20.2 KiB | `resource-summary` |
| Parse + execute | `bootup-time` 598–2,089 ms, `mainthread-work-breakdown` 3.1–6.9 s, 3–7 long tasks with the longest 190–317 ms (333 ms in the worst single run) | `bootup-time`, `long-tasks` |
| LCP paint | 3.88–4.75 s; LCP element is an above-the-fold image on 14 of 16 mobile combos, body text on `/ar` article and `/en` article | `largest-contentful-paint-element` |
| Layout stability | worst single shift 0.155 (`/ar` services, `section.py-8`), cause recorded by Lighthouse as **`Web font loaded`** for all four Tajawal files | `layout-shifts` |

The CLS table is the most actionable part of this baseline because Lighthouse names the cause:

| page | form/locale | CLS | shifts | worst selector | cause |
|---|---|---|---|---|---|
| `home` | mobile-ar | 0.067 | 15 | `section.relative > div.relative > div.relative > dl.mt-12` |  |
| `services` | mobile-ar | 0.173 | 6 | `body.min-h-full > div.min-h-screen > main#main > section.py-8` | Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `service-detail` | mobile-ar | 0.033 | 2 | `div.min-h-screen > main#main > div.pb-28 > div.mx-auto` |  |
| `offers` | mobile-ar | 0.041 | 5 | `html.__variable_c77384` | Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `cases` | mobile-ar | 0.045 | 5 | `body.min-h-full > div.min-h-screen > main#main > section.py-8` |  |
| `articles` | mobile-ar | 0.033 | 5 | `body.min-h-full > div.min-h-screen > main#main > section.py-5` |  |
| `article` | mobile-ar | 0.033 | 2 | `body.min-h-full > div.min-h-screen > main#main > article.py-5` |  |
| `contact` | mobile-ar | 0.035 | 6 | `body.min-h-full > div.min-h-screen > main#main > section.py-8` |  |
| `home` | mobile-en | 0.005 | 13 | `span.text-[var(--gold-start)]` |  |
| `services` | mobile-en | 0.001 | 1 | `section.py-8 > div.max-w-7xl > div.flex > button.px-5` | Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `service-detail` | mobile-en | 0.002 | 1 | `div.min-w-0 > section#overview > div > div.text-base` | Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `cases` | mobile-en | 0.001 | 1 | `section.py-8 > div.max-w-7xl > div.text-start > p.mt-3` | Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `article` | mobile-en | 0.007 | 1 | `body.min-h-full > div.min-h-screen > main#main > article.py-5` |  |
| `home` | desktop-ar | 0.064 | 15 | `section.relative > div.relative > div.relative > h1.mt-4` |  |
| `services` | desktop-ar | 0.011 | 2 | `header.relative > div.max-w-7xl > div.mt-8 > div.lg:col-span-7` | Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `service-detail` | desktop-ar | 0.007 | 2 | `div.mx-auto > div.grid > div.min-w-0 > h1.text-3xl` | Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `offers` | desktop-ar | 0.001 | 2 | `div.min-h-screen > header.fixed > div.max-w-7xl > nav.hidden` | Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `cases` | desktop-ar | 0.006 | 2 | `section.py-8 > div.max-w-7xl > div.text-start > h2.text-[22px]` | Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `articles` | desktop-ar | 0.003 | 2 | `main#main > section.py-5 > div.max-w-7xl > p.mb-6` | Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `article` | desktop-ar | 0.001 | 2 | `div.min-h-screen > header.fixed > div.max-w-7xl > nav.hidden` |  |
| `contact` | desktop-ar | 0.005 | 2 | `div.max-w-7xl > div.lg:col-span-5 > div.pt-2 > h2.font-black` |  |
| `home` | desktop-en | 0.113 | 15 | `section.relative > div.relative > div.relative > h1.mt-4` | Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `service-detail` | desktop-en | 0.001 | 1 | `div.mx-auto > div.grid > div.min-w-0 > h1.text-3xl` | Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `cases` | desktop-en | 0.001 | 1 | `section.py-8 > div.max-w-7xl > div.text-start > p.mt-3` | Web font loaded 21f8968c2a580335-s.p.woff2; Web font loaded 42cd8d2519ec1b18-s.p.woff2; Web font loaded 7360ced81bd46491-s.p.woff2; Web font loaded 9df8b88aaf5d46d7-s.p.woff2 |
| `contact` | desktop-en | 0.001 | 1 | `div.max-w-7xl > div.lg:col-span-5 > div.pt-2 > h2.font-black` |  |

17 of the 32 combinations name a webfont as the cause of their single worst shift.

Two things follow from that. First, `size-adjust`/metric-matched fallback is not decoration:
it is what stands between this site and the ≤ 0.05 budget, and the current
`tajawal Fallback` (`src/lib/fonts/index.ts`, `size-adjust: 94.43%`) is not close enough to
the real metrics for the hero. Second, the same swap explains why **Arabic** loses CLS and
English does not: the fallback is `local(Arial)`, which matches Latin metrics well and Arabic
badly. That is item 1's job, and item 1 now has a number to hit rather than a feeling.

### Accessibility and SEO deductions (the only ones)

`best-practices` and `seo` are 100 on all 32 combos with **no** failing audit in either
category. Accessibility loses points in exactly two places:

- **mobile-ar-home** a11y 96 / seo 100 / bp 100
  - target-size: Touch targets do not have sufficient size or spacing. → <button aria-label="الانتقال إلى المجموعة 2" aria-current="false" class="-m-2 h-6 p-2 bg-c
- **mobile-en-home** a11y 96 / seo 100 / bp 100
  - target-size: Touch targets do not have sufficient size or spacing. → <button aria-label="Go to group 2" aria-current="false" class="-m-2 h-6 p-2 bg-clip-conten
- **mobile-en-cases** a11y 100 / seo 100 / bp 100
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. → <button type="button" aria-label="View Id quis et aut sint est pariatur Amet et qui soluta
- **desktop-en-cases** a11y 100 / seo 100 / bp 100
  - label-content-name-mismatch: Elements with visible text labels do not have matching accessible names. → <button type="button" aria-label="View Id quis et aut sint est pariatur Amet et qui soluta → <button type="button" aria-label="View Ut quo recusandae Laudantium dolor result" class="g

`target-size` is the swiper pagination button (`-m-2 h-6 p-2`) on the home page in both
locales. `label-content-name-mismatch` is the result-case "View …" button whose `aria-label`
carries the seeded faker title — a content defect (Q-16) rendered visible, not a markup bug.
Both are outside §0b's scope (no page may change appearance) and are recorded for items 1, 5
and 7.

## Bundle analysis

First-load JS is what the browser actually pulled, taken from `script-treemap-data`
(`encodedBytes` = gzip bytes over the wire), median of the 3 runs:

| page | first-load JS (gzip) | unused JS | JS requests | CSS | fonts | images | largest image |
|---|---|---|---|---|---|---|---|
| `home` | 233.9 KiB (ar) / 233.9 KiB (en) | 76.3 KiB | 17 | 20.2 KiB | 83.4 KiB | 14 | 31.7 KiB |
| `services` | 218.8 KiB (ar) / 218.8 KiB (en) | 78.7 KiB | 15 | 20.2 KiB | 83.4 KiB | 15 | 17.2 KiB |
| `service-detail` | 243.8 KiB (ar) / 243.8 KiB (en) | 78.7 KiB | 18 | 20.2 KiB | 83.4 KiB | 6 | 17.2 KiB |
| `offers` | 221.6 KiB (ar) / 221.6 KiB (en) | 78.7 KiB | 15 | 20.2 KiB | 83.4 KiB | 11 | 31.7 KiB |
| `cases` | 228.5 KiB (ar) / 228.5 KiB (en) | 77 KiB | 17 | 20.2 KiB | 83.4 KiB | 10 | 27.9 KiB |
| `articles` | 223 KiB (ar) / 223 KiB (en) | 78.7 KiB | 15 | 20.2 KiB | 83.4 KiB | 14 | 19.7 KiB |
| `article` | 225.8 KiB (ar) / 225.8 KiB (en) | 77.4 KiB | 16 | 20.2 KiB | 83.4 KiB | 3 | 9.4 KiB |
| `contact` | 228 KiB (ar) / 228 KiB (en) | 77.3 KiB | 16 | 20.2 KiB | 83.4 KiB | 6 | 21.3 KiB |

Because the three largest chunks are the same on every page, the same table read two ways:

| chunk (gzip KiB / raw KiB on disk) | what it is | on every public page? |
|---|---|---|
| `9404-f25604c3edc94d73.js` 115.0 / 431.7 | **recharts** (+ d3 helpers) — the console's charts | **no** (0 of 96 public runs requested it) |
| `3794-0a1186eb85c3950f.js` 64.0 / 235.7 | React DOM half of the runtime (`Minified React error`, `useSyncExternal`) | yes |
| `4bd1b696-8a4ab4fdf0ae305a.js` 61.7 / 196.3 | React / scheduler half (`__reactContainer`, `matchMedia`) | yes |
| `framework-666c53740fc261c8.js` 58.4 / 185.2 | Next's framework chunk | **no** (present on disk, not requested by these pages) |
| `2651-0f6399001dbfe945.js` 40.9 / 124.3 | **framer-motion** (89 `motion`/`framer` markers) — 70% of it unused on `/ar` home | yes |
| `polyfills-42372ed130431b0a.js` 38.6 / 110.0 | core-js polyfills | **no** |
| `main-91940c8e95ada4ba.js` 38.1 / 130.9 | Next app runtime | **no** |
| `8064-a6b2626b59bfccca.js` 24.7 / 103.4 | **zod** (327 markers) | console-side forms |
| `1712.1376c01cce58e5cb.js` 21.8 / 72.1 | date + motion helpers | partially |

Whole-build totals for context: **132 client chunks, 814.8 KiB gzip / 2,647.4 KiB raw** and
**5 stylesheets, 36.2 KiB gzip / 205.9 KiB raw**. The public pages download 20.2 KiB gzip of
CSS (2 files: the site stylesheet `a55b8f8ec0ee129f.css`, 110.4 KiB raw / 18.5 KiB gzip on disk and **19.0 KiB transferred**, plus `e5843fe87b9ecb6d.css` at 1.2 KiB transferred) and **83.4 KiB gzip of fonts** — the four Tajawal faces
(`9df8b88aaf5d46d7-s.p.woff2` etc., ~21 KiB each) — on every page in both locales.

**Chunk names are not stable across builds of an identical tree.** The gate rebuild of this
same tree (19:37:11, `BUILD_ID 8rFROZu4x77RQE7K46BIK`, source files unchanged since 16:34) emits
`4e5f95117001f1db.css` instead of `a55b8f8ec0ee129f.css` at the same 113,080 B raw / 18.6 KiB
gzip, and the same 5 stylesheets totalling 210,830 B = 205.9 KiB raw, while every JS chunk named
above (`9404-…`, `3794-…`, `8064-…`, `2651-…`, `4bd1b696-…`, `framework`, `main`, `polyfills`)
comes back under the identical name. Match CSS by size, not by hash, when re-measuring.

**Attribution limit, stated plainly:** there is no bundle analyser in the project
(`@next/bundle-analyzer` is not a dependency), so module-level attribution is impossible
from this build. The library identification above is marker evidence inside the minified
chunks (`grep` counts of `recharts`, `zod`, `motion`, `Minified React error`), which names
what a chunk *contains* but cannot break a 64 KiB app chunk into its modules. Per-module
numbers need one analysable build, which is a dependency decision — deferred to item 7,
where the budget script needs it anyway.

Two facts that are already decision-ready: **41 KiB gzip of framer-motion ships on every
public page and roughly 70% of it is unused there** (Lighthouse `unused-javascript`: 75.2–78.7
KiB estimated savings per page, dominated by `2651` at 29.5 KiB / 70.3% and `3794` at
23.9 KiB / 36.3%), and **`unused-css-rules` reports 0 bytes** — the site CSS is not carrying
dead weight, so item 3's "unused CSS" question has a measured starting point of zero.

## DB timing per page

`DATABASE_LOG_QUERIES=1` makes `src/lib/db/index.ts:94` print `[dbq] <ms> <sql>` per
statement. Each URL was hit twice, one request at a time, and the log was read until it went
quiet before and after, so every line belongs to the request that caused it. **"DB ms" is the
sum of statement durations, not the request latency** — the pool runs statements concurrently,
so on `/ar` home 32 statements totalling 1,272.5 ms completed inside a 387 ms wall (the same
32 statements cost 724.5 ms on the warm repeat of the same URL).

| url | queries | DB ms (hit 1) | DB ms (hit 2) | wall ms (hit 1 / hit 2) | slowest statement on hit 1 |
|---|---|---|---|---|---|
| `/ar` | 32 | 1272.5 | 724.5 | 387 / 187 | select * from list_items where list_id = ? and status in (?, ?) and deleted_at is null order by position asc, uid asc — 249 ms |
| `/ar/services` | 21 | 242.2 | 107.7 | 90 / 88 | select * from list_items where list_id = ? and status in (?, ?) and deleted_at is null order by position asc, uid asc — 47 ms |
| `/ar/services/laser-hair-removal` | 31 | 137.1 | 113 | 136 / 99 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc — 46 ms |
| `/ar/offers` | 23 | 132.7 | 141.6 | 93 / 89 | select * from offers where status in (?, ?) and deleted_at is null order by position asc, slug asc — 59 ms |
| `/ar/results` | 25 | 122.9 | 153 | 104 / 82 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc — 31 ms |
| `/ar/blogs` | 27 | 113.8 | 220.5 | 145 / 131 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc — 24 ms |
| `/ar/blogs/laser-underarm-hair-removal` | 22 | 78.2 | 71.7 | 96 / 90 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc — 14 ms |
| `/ar/contact` | 19 | 46.6 | 35.4 | 43 / 33 | select setting_key, value from settings where group_name = ? and is_secret = ? — 4 ms |
| `/ar/about` | 19 | 56.6 | 40.1 | 36 / 35 | select title, description from seo_entries where entity_type = ? and entity_id = ? and locale = ? — 8 ms |
| `/ar/doctors` | 19 | 51.6 | 54 | 38 / 33 | select default_ar, default_en, pub_ar, pub_en from content_fields where field_key like ? and deleted_at is null and enabled = ? — 4 ms |
| `/ar/branches` | 19 | 46.1 | 39.8 | 48 / 35 | select setting_key, value from settings where group_name = ? and is_secret = ? — 4 ms |
| `/en` | 32 | 346.9 | 538.4 | 146 / 143 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc — 75 ms |
| `/en/services` | 21 | 186.4 | 174.1 | 81 / 72 | select * from list_items where list_id = ? and status in (?, ?) and deleted_at is null order by position asc, uid asc — 44 ms |
| `/en/services/laser-hair-removal` | 31 | 159.4 | 146.4 | 86 / 73 | select * from list_items where list_id = ? and status in (?, ?) and deleted_at is null order by position asc, uid asc — 39 ms |
| `/en/offers` | 23 | 183.1 | 131.1 | 76 / 81 | select * from list_items where list_id = ? and status in (?, ?) and deleted_at is null order by position asc, uid asc — 42 ms |
| `/en/results` | 25 | 90.5 | 163.9 | 69 / 82 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc — 18 ms |
| `/en/blogs` | 27 | 116.7 | 181.7 | 148 / 111 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc — 60 ms |
| `/en/blogs/laser-underarm-hair-removal` | 22 | 111 | 78.5 | 115 / 90 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc — 53 ms |
| `/en/contact` | 19 | 44.5 | 40.6 | 32 / 31 | select setting_key, value from settings where group_name = ? and is_secret = ? — 4 ms |
| `/en/about` | 19 | 33.9 | 48.6 | 32 / 42 | select setting_key, value from settings where group_name = ? and is_secret = ? — 3 ms |
| `/en/doctors` | 19 | 39.4 | 34 | 39 / 31 | select default_ar, default_en, pub_ar, pub_en from content_fields where field_key like ? and deleted_at is null and enabled = ? — 3 ms |
| `/en/branches` | 19 | 41.3 | 35.8 | 29 / 30 | select setting_key, value from settings where group_name = ? and is_secret = ? — 4 ms |

### The same statement issued over and over (grouped by exact SQL, hit 1 only)

| times issued across the 22 first hits | pages it fires on | total ms | SQL |
|---|---|---|---|
| 96 | 22 of 22 | 1403 | select * from list_items where list_id = ? and status in (?, ?) and deleted_at is null order by position asc, uid asc |
| 96 | 22 of 22 | 495 | select id from list_items where list_id = ? and status in (?, ?) and deleted_at is null limit ? |
| 96 | 22 of 22 | 245 | select id from lists where list_key = ? |
| 63 | 21 of 22 | 188 | select setting_key, value from settings where group_name = ? and is_secret = ? |
| 17 | 17 of 22 | 52 | select value from settings where group_name = ? and setting_key = ? and is_secret = ? |
| 14 | 14 of 22 | 49 | select default_ar, default_en, pub_ar, pub_en from content_fields where field_key like ? and deleted_at is null and enabled = ? |
| 11 | 11 of 22 | 42 | select title, description from seo_entries where entity_type = ? and entity_id = ? and locale = ? |
| 10 | 10 of 22 | 543 | select * from articles where status in (?, ?) and deleted_at is null order by published_at desc, slug desc |
| 8 | 8 of 22 | 183 | select * from pages where status in (?, ?) and deleted_at is null order by route asc |
| 7 | 7 of 22 | 64 | select id, slug, name_ar, name_en from categories where deleted_at is null |

The counts are the story, not the milliseconds:

- **Every page pays 19 queries before it renders any content.** On `/ar/contact` those 19
  statements total 46.6 ms and the slowest single one is 3.9 ms, inside a 43 ms page wall —
  the floor is query *count*, not query speed.
- **The same statement is re-issued 4–6 times per page.** `select * from list_items where
  list_id = ? … order by position asc, uid asc` ran 96 times across 22 first hits (1,403 ms
  total), each one preceded by `select id from lists where list_key = ?` (96) and followed by
  `select id from list_items … limit ?` (96). Three statements to read one list, four to six
  lists per page. `select * from pages where status in (?, ?) … order by route asc` — a
  full-table read of all 28 `pages` rows including both language bodies — ran once each on 8 of
  the 22 URLs and never on the other 14, which is itself a clue about which component asks for it.
- **Nothing is cached at any layer.** Hit 2 issues the identical query count as hit 1 on all
  22 URLs (32 → 32 on home, 19 → 19 on the light pages); only the milliseconds fall
  (1,272.5 → 724.5 on `/ar` home). Durations differ only because MariaDB's own buffer pool is
  warm — the app layer re-runs every read.
- **`select *` is the default.** The heavy reads (`pages`, `list_items`, `articles`) take every
  column including both language bodies, then use a handful of them.

This is item 7's shortlist in measured order, and item 12 (relations) and item 5 (editable
texts) both touch the same `list_items`/`content_fields` reads — worth knowing before those
items design on top of it.

## How to re-measure this

1. Rebuild the throwaway output: `NEXT_DIST_DIR=.next-build npm run build` (note the new
   `BUILD_ID`; a comparison across build ids is not a comparison).
2. Start a clean server on a free port and record its PID and start time:
   `NEXT_DIST_DIR=.next-build npx next start -p 3430`.
3. `npx lighthouse@12.8.2 <url> --output=json --only-categories=performance,accessibility,best-practices,seo
   --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate
   --chrome-flags="--headless=new" --quiet` (desktop: `--preset=desktop`), 3 runs per page,
   8 pages × AR/EN. Any other Lighthouse version is a different scoring model and the
   medians are not comparable.
4. DB timing: start a second server with `DATABASE_LOG_QUERIES=1` on another port, hit each
   URL twice serially, parse `[dbq]` lines. **Turn it off afterwards** — the comment at
   `src/lib/db/index.ts:90` says so and it allocates a string per statement.
5. The raw reports are ~80 MB and git-ignored (`/docs/perf/raw/`); `summary.json`,
   `bundle.json` and `db-timing.json` are the committed results. Re-running the summariser
   over the retained raw directory reproduces every number in this file.

## What this baseline cannot prove

- It cannot prove production speed. Localhost RTT is ~0 and the Slow 4G model is applied to
  the trace, not the wire; server latency is one MariaDB on the same machine with dev data.
- It cannot prove real INP (see the proxy caveat above) and cannot prove field LCP for
  Arabic-heavy viewports, because no field data exists yet.
- It cannot separate content weight from code weight, because the dev database is faker
  (Q-16): the 2,706-request `desktop-ar-home` is 2,661 prefetches of links that real content may not
  have in that quantity — but the *duplicate* pattern is code, and the English home proving
  15 prefetches (and mobile English home proving 3) is the control that says so. Both locales carry
  the same 68 `<a href="/…">` and each route 3–4 times, and those 2,661 prefetches resolve to only
  8 distinct targets, so the count cannot come from the markup either; it is logged as
  **Q-18** for item 7 to fix before any request-count budget means anything. The four CLS breaches
  and the font-swap asymmetry behind them are **Q-19** (design-versus-budget, the brief says report
  the conflict), and the two accessibility deductions are **Q-20**.
- Item 0a's caveat carries over: four files were modified in this working tree when the build
  was made (`TreatmentDetailClient.tsx`, `tests/service-page.test.ts`, `src/lib/copy/catalog.ts`,
  `docs/MASTER-REQUIREMENTS.md`), so the `service-detail` rows here include that in-flight styling.
