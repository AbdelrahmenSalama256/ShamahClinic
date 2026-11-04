# Visual golden set — the baseline every later item is compared against

Captured by `scripts/baseline-capture.mjs` (brief §0a) before any change in this pass, so
"the site looks unchanged" is a measurable claim instead of an opinion. One full-page PNG
per route per locale per viewport, 17 routes × AR/EN × 1440/390 = **68 shots**.

The PNGs are **not** committed (`docs/baseline/*.png` is git-ignored — the set is ~49 MB).
What is committed is [`capture.json`](file:///D:/shamah_cms/docs/baseline/capture.json): for
every shot the route, HTTP status, render milliseconds, file path, byte length and
**sha256**; and [`errors.json`](file:///D:/shamah_cms/docs/baseline/errors.json): the same walk
again with the console errors, page errors and non-prefetch failed requests drained **per
route**. A later run rewrites both files, and the pixel-parity work in §4c and the About check in
§6 diff against these hashes: same hash means the page did not move, different hash names the
file that changed.

## Provenance of this set

| fact | value |
|------|-------|
| branch / commit | `wip/snapshot-nov3` @ `4c7db0db1d65b7218e1cbf9129b777bcc3888ae7` |
| build (golden shots) | `NEXT_DIST_DIR=.next-build npm run build`, started 2026-11-04 17:27:14, exit 0, `BUILD_ID` **`MP2ZcyrA23IARTLbv9aHa`** |
| build (ledger re-walk) | same command after the last change in this item, exit 0, `BUILD_ID` **`02zpKI9iZLsh9fg1CxUyc`** |
| servers | disposable production `next start -p 3430`: PID **14800** for the shots, PID **23640** (started 18:17:48) for the re-walk — both `http://127.0.0.1:3430`, both stopped at the end of the item |
| capture finished | 2026-11-04T15:41:21.638Z (= 17:41 Cairo) for the shots; 2026-11-04T16:21:04.080Z (= 18:21 Cairo) for the ledger |
| re-based by MB-1 | the committed `capture.json` is now the walk of `BUILD_ID` **`iD0Fhk5kiUizYmdtpUT1J`** (build exit 0, `next start -p 3430` PID **9744** started 21:25:22, capture finished 2026-11-04T19:30:12Z = 21:30 Cairo): 68/68 shots, every route 200, `errors=0`, 610 aborted `?_rsc=` prefetches, 53,618,827 B of pixels, and **all 68 SHA-256s differ from the `MP2ZcyrA23IARTLbv9aHa` set — 0 identical, 0 added, 0 dropped**. Item 1 replaces the faces on every page, so that is the expected shape, not drift; items 4c and 6 diff against these hashes. `errors.json` was not rewritten (it is only written with `BASELINE_SKIP_SHOTS=1`); the per-route error ledger for this build is the `pageErrors` array inside each `capture.json` record |
| browser | Playwright 1.64 `chromium`, `headless`, `deviceScaleFactor: 1`, `locale: ar-EG`/`en-US`, `timezoneId: Africa/Cairo`, `reducedMotion: no-preference`; the page is scrolled one viewport at a time and returned to the top before the shot so reveal-on-scroll content is present |
| content database | dev database `shamah_cms` on `127.0.0.1:3307` (the test database `shamah_cms_test` is for vitest only and served nothing here) |
| owner's dev server | already running on **3100** (PID 21528) — this fork's `next dev` refuses a second instance, so the brief's port 3001 was not started; see `docs/OPEN-QUESTIONS.md` Q-14 |

**The tree was not clean when this was captured.** Four files carried an uncommitted edit
from the pass that owns the service detail page — `src/components/pages/TreatmentDetailClient.tsx`,
`tests/service-page.test.ts`, `src/lib/copy/catalog.ts` and `docs/MASTER-REQUIREMENTS.md` — so
`service-*` and the services list in these shots include that in-flight styling work. That is
the site the owner is looking at on 3100, which is what §0a asks to freeze; if that work is
later reverted, the service shots must be re-captured before they are used as a reference.

## Routes, and why these three services and these five articles

The brief fixes the page list; the slugs come from what the site itself links to, not from a
guess — `/en/services`, `/en/branches` and `/en/blogs` were fetched and their `href`s read.

- **Three service pages**: `skincare`, `laser-hair-removal`, `botox-injections` — the three
  rows whose published documents are real clinic services. `/en/services` also links
  `new-bs`, `tewst` and `mens-aesthetic-services`; the first two are placeholder rows and the
  third is the demo-junk row already logged in `docs/PROGRESS.md` (`name_en "Neil Hoff"`-class
  values), so none of them is a representative page.
- **Cases** is `/results`; **Doctors** `/doctors`; **Branches** `/branches`; **About** `/about`;
  **Blog list** `/blogs`.
- **Five articles**, chosen by measuring every published body in the database (length, `<table>`,
  `<h2>`, `<ul>`, `<img>`, cover):
  | pick | why |
  |------|-----|
  | `hifu-facial-skin-tightening` | the short article (5,531 chars EN, 8 `h2`) |
  | `laser-underarm-hair-removal` | the long article with a table (21,161 chars EN, 1 `<table>`) |
  | `morpheus-8-sessions` | table-heavy (13,577 chars, 2 `<table>`) |
  | `best-laser-clinics-near-me` | the list-rich authored article (6,000 chars, 7 `h2`, 1 `<ul>`) |
  | `laser-hair-removal-egypt-price` | the price/table article (6,956 chars, 1 `<table>`) |
- **No article carries an inline image.** Across all 94 published articles the count of `<img>`
  inside the body is zero; every picture on an article page is the `image` cover field. So the
  brief's "imported-with-images" representative does not exist in this data — logged as
  Q-15 rather than substituted with a page that would pretend otherwise.

## Result of this capture

Two production builds back this up, because the last change after the shots was documentation only and
the brief still requires "rebuilt and restarted after your last change":

| pass | build | server | result |
|------|-------|--------|--------|
| golden shots + `capture.json` | `MP2ZcyrA23IARTLbv9aHa` | PID 14800, port 3430, started 17:27:14 | 68/68 PNGs, every route 200 |
| ledger re-walk → `errors.json` | `02zpKI9iZLsh9fg1CxUyc` (`npm run build` exit 0, same tree, docs only) | PID 23640, port 3430, started 18:17:48 | 68/68 routes 200, `errors=0` |

- **68 of 68 shots, every route HTTP 200**, both locales, both viewports. No screenshot failed.
- **Zero `console-error` and zero `pageerror`** on every route, measured per route in `errors.json`
  (68 rows, each drained individually after its own route), not inferred from a tail of retained lines.
- 2,273 recorded "failed requests" are on `?_rsc=` URLs and every one observed carried
  `net::ERR_ABORTED` — the `<Link prefetch>` RSC requests Playwright cancels when a context closes.
  They are not broken resources; the page rendered the link and never needed the payload. (The golden
  pass counted 1,935 of the same class; the number moves with timing, the class does not.) That pass
  first looked like it held seven *real* failures; reading the untruncated URLs showed they were the
  same thing, and the 160-character slice that hid the `?_rsc=` suffix is fixed in the script.
- **No dead links on the offers list**, which is the only page whose hrefs are long Arabic slugs: all
  14 distinct `/offers/<slug>` hrefs from `/offers` and `/en/offers` were fetched and every one is
  200. A URL cut in the middle of a percent-escape sequence is a different story — the server answers
  500, not 404 (`GET /en/offers/%D9%A4-…-%D9%88%D8%AC%D9` → 500). Logged as Q-17; nothing in the site
  produces that URL, and a crawler with a truncated link can.

## What the baseline contains that is not real content

The golden set is a faithful picture of the site **as the dev database feeds it today**, and that
database still holds faker rows. They are in the PNGs, so a later pixel diff must not read them as
design. Every slug below was fetched on this build and every one answers **200** with a lorem-ipsum
`<h1>` — they are published, reachable pages, not drafts leaking into a list.

| route in the golden set | junk on the page | measured |
|-------|--------------|----------|
| `/ar/services`, `/en/services` | `mens-aesthetic-services` ("Aut officia ea nobis…"), `tewst` ("Quis duis non inventore…"), `new-bs` ("Pariatur Ipsa lorem ut…") | 9 links on the list; 6 are the real services |
| `/ar/blogs`, `/en/blogs` | `testttttt` ("Reiciendis quasi quasi…"), `Sed exercitationem l` — a slug with a literal space, served as `Sed%20exercitationem%20l` | 9 links on the list; `articles` holds 94 rows and these two have empty `content_ar` (`NULL` and `0`) |
| `/ar/offers`, `/en/offers` | `begneh` (AR name "Marshall Parsons", EN "Autumn Phillips", 15.00 EGP), `doloremque-consectetur-deleniti-sint-optio-assumenda` ("Leandra Hayden", 962.00, **currency "Velit a"**), `ازاله-شعر-بالليزر` (`name_ar` empty, `name_en` "Trevor Fisher") | `offers` rows `ecc65289…`, `be113b59…`, `c4e90308…`, all with `legacy_id` NULL; 4 of the 8 rows are `published` real offers |

Three findings inside that dirt, each logged for the owner rather than fixed here (Q-16):

- **One promotion is four rows.** `…-هدية` (899.00), `…-هدية-2` (500.00), `…-هدية-3` (500.00) and
  `4-full-body-sessions-free-face-and-eyebrow-bleaching` (500.00) — `legacy_id` 785, 781, 780, 581 —
  and the offers page shows all four. Two different prices for the same offer.
- **`name_en` holds Arabic text** for three of those four rows, which is why `/en/offers` prints
  Arabic titles. Not a rendering bug: the field itself.
- **`/blogs/testttttt` and `/en/blogs/testttttt` print the identical English title** while
  `content_ar` is `NULL` — the silent cross-language fallback the brief calls out in item 4a, already
  visible in the data today.

Also in the `services` list but *not* visible on the page: 5 faker rows whose `published.href` is a
truncated lorem fragment (`"Nihil lorem est mol"`, `""`, `"Mollit anim sint rep"`, `"Rerum consequat
Nes"`, `"Et accusamus omnis e"`) and whose `name_ar` is a person's name, plus 1 row that carries only
`name_en`. The page filters them out; the console list will not.

Nothing here deletes or renames a row. The baseline's job is to record what is on the pages now.

## Re-capturing

```
NEXT_DIST_DIR=.next-build npm run build
NEXT_DIST_DIR=.next-build npx next start -p 3430 &     # note the PID; it is the proof
PROOF_BASE=http://127.0.0.1:3430 node scripts/baseline-capture.mjs                 # golden PNGs + capture.json
PROOF_BASE=http://127.0.0.1:3430 BASELINE_SKIP_SHOTS=1 node scripts/baseline-capture.mjs  # errors.json only
```

The script exits non-zero if any route is not 200, if any shot is missing, or if **any route logged a
console error, a page error, or a failed request that is not an RSC prefetch** — so it is a gate, not
only a generator. Use the `BASELINE_SKIP_SHOTS=1` pass to re-prove the error claim after a change
without re-writing 49 MB of golden pixels; it walks the same routes and writes `errors.json`.
Keep the old `capture.json` (or its hashes) before a full re-run: the comparison is the point, and
item 4c and item 6 diff against exactly these files.

## Per-shot table
68 shots, 51106253 bytes (48.7 MiB). Every route
is HTTP 200 in both passes. Two runs back this table up:

- `capture.json` — the golden pass that wrote the PNGs (hashes below are the first 12 hex chars of
  SHA-256 over the PNG bytes; the full digests sit next to each record in that file).
- `errors.json` — the same walk with `BASELINE_SKIP_SHOTS=1`, which drains the error listeners after
  every route so each row is that route alone. It reports
  `errors=0` across all 68 routes:
  zero `console` errors, zero `pageerror`, zero failed requests other than RSC prefetches.

The `prefetch` column counts `?_rsc=` requests the router had not finished when the context closed
(2273 in total). They are not page defects, and the golden pass's own `pageErrors` arrays are
untrustworthy on that point: that pass kept only the last eight lines per shot and truncated URLs at
160 characters, which cut the `?_rsc=` suffix off long Arabic offer slugs and made seven benign
prefetches look like broken links. Both bugs are fixed in the script; `errors.json` is the ledger to
read. Re-check any future claim of "a failed request" against an untruncated URL before filing it.

| Locale | Viewport | Route | Shot | KiB | ms | prefetch | errors | sha256 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ar | desktop-1440 | `/ar` | `ar-desktop-1440-home.png` | 1265 | 37233 | 629 | 0 | `f1ec347da15b` |
| ar | desktop-1440 | `/ar/services` | `ar-desktop-1440-services.png` | 920 | 10236 | 24 | 0 | `13fa1f0a2210` |
| ar | desktop-1440 | `/ar/services/skincare` | `ar-desktop-1440-service-skincare.png` | 688 | 6172 | 15 | 0 | `7cf918132579` |
| ar | desktop-1440 | `/ar/services/laser-hair-removal` | `ar-desktop-1440-service-laser-hair-removal.png` | 676 | 6092 | 14 | 0 | `d097623b79de` |
| ar | desktop-1440 | `/ar/services/botox-injections` | `ar-desktop-1440-service-botox-injections.png` | 680 | 5595 | 13 | 0 | `66c868849c00` |
| ar | desktop-1440 | `/ar/offers` | `ar-desktop-1440-offers.png` | 1055 | 6854 | 20 | 0 | `2acc4e605fbe` |
| ar | desktop-1440 | `/ar/results` | `ar-desktop-1440-cases-results.png` | 828 | 7389 | 15 | 0 | `0f338a379f12` |
| ar | desktop-1440 | `/ar/doctors` | `ar-desktop-1440-doctors.png` | 1189 | 7839 | 14 | 0 | `928438228f27` |
| ar | desktop-1440 | `/ar/branches` | `ar-desktop-1440-branches.png` | 792 | 5796 | 22 | 0 | `9e310cf8e56a` |
| ar | desktop-1440 | `/ar/contact` | `ar-desktop-1440-contact.png` | 713 | 5424 | 12 | 0 | `75b20095330d` |
| ar | desktop-1440 | `/ar/about` | `ar-desktop-1440-about.png` | 984 | 6231 | 16 | 0 | `5efc8c7d8dfc` |
| ar | desktop-1440 | `/ar/blogs` | `ar-desktop-1440-blog-list.png` | 1001 | 7019 | 17 | 0 | `dfc0ef273e13` |
| ar | desktop-1440 | `/ar/blogs/hifu-facial-skin-tightening` | `ar-desktop-1440-article-short-hifu.png` | 1075 | 6728 | 14 | 0 | `1e2868a1fe13` |
| ar | desktop-1440 | `/ar/blogs/laser-underarm-hair-removal` | `ar-desktop-1440-article-long-table-underarm.png` | 1180 | 10032 | 11 | 0 | `28033cfe0618` |
| ar | desktop-1440 | `/ar/blogs/morpheus-8-sessions` | `ar-desktop-1440-article-two-tables-morpheus.png` | 1084 | 10695 | 14 | 0 | `6ae771a116a7` |
| ar | desktop-1440 | `/ar/blogs/best-laser-clinics-near-me` | `ar-desktop-1440-article-lists-clinics-near-me.png` | 941 | 10059 | 12 | 0 | `6699c837f62e` |
| ar | desktop-1440 | `/ar/blogs/laser-hair-removal-egypt-price` | `ar-desktop-1440-article-price-table.png` | 1190 | 8640 | 12 | 0 | `5b5a002c77b1` |
| ar | phone-390 | `/ar` | `ar-phone-390-home.png` | 426 | 30698 | 1088 | 0 | `7790e6007090` |
| ar | phone-390 | `/ar/services` | `ar-phone-390-services.png` | 383 | 3077 | 6 | 0 | `5c9f673fe829` |
| ar | phone-390 | `/ar/services/skincare` | `ar-phone-390-service-skincare.png` | 367 | 2177 | 1 | 0 | `d12756069831` |
| ar | phone-390 | `/ar/services/laser-hair-removal` | `ar-phone-390-service-laser-hair-removal.png` | 364 | 2199 | 3 | 0 | `b1bb773f1e66` |
| ar | phone-390 | `/ar/services/botox-injections` | `ar-phone-390-service-botox-injections.png` | 366 | 2558 | 2 | 0 | `a108db62022b` |
| ar | phone-390 | `/ar/offers` | `ar-phone-390-offers.png` | 491 | 2785 | 2 | 0 | `4c245acc0878` |
| ar | phone-390 | `/ar/results` | `ar-phone-390-cases-results.png` | 435 | 3019 | 4 | 0 | `517eeabd0c26` |
| ar | phone-390 | `/ar/doctors` | `ar-phone-390-doctors.png` | 445 | 2166 | 1 | 0 | `eb266cbb078f` |
| ar | phone-390 | `/ar/branches` | `ar-phone-390-branches.png` | 388 | 2208 | 4 | 0 | `6722f21f496d` |
| ar | phone-390 | `/ar/contact` | `ar-phone-390-contact.png` | 425 | 2354 | 1 | 0 | `182c5d2c67e2` |
| ar | phone-390 | `/ar/about` | `ar-phone-390-about.png` | 396 | 2077 | 1 | 0 | `987503e738fc` |
| ar | phone-390 | `/ar/blogs` | `ar-phone-390-blog-list.png` | 418 | 3064 | 6 | 0 | `573bb0fd23e0` |
| ar | phone-390 | `/ar/blogs/hifu-facial-skin-tightening` | `ar-phone-390-article-short-hifu.png` | 626 | 2737 | 2 | 0 | `c05cee3a468f` |
| ar | phone-390 | `/ar/blogs/laser-underarm-hair-removal` | `ar-phone-390-article-long-table-underarm.png` | 708 | 4088 | 2 | 0 | `14226cba70d1` |
| ar | phone-390 | `/ar/blogs/morpheus-8-sessions` | `ar-phone-390-article-two-tables-morpheus.png` | 693 | 4005 | 2 | 0 | `88efa3e53586` |
| ar | phone-390 | `/ar/blogs/best-laser-clinics-near-me` | `ar-phone-390-article-lists-clinics-near-me.png` | 622 | 3007 | 2 | 0 | `f90aef8cb72d` |
| ar | phone-390 | `/ar/blogs/laser-hair-removal-egypt-price` | `ar-phone-390-article-price-table.png` | 649 | 3568 | 2 | 0 | `c2b98b46f0f6` |
| en | desktop-1440 | `/en` | `en-desktop-1440-home.png` | 1387 | 6177 | 11 | 0 | `b28dd1ebcb61` |
| en | desktop-1440 | `/en/services` | `en-desktop-1440-services.png` | 919 | 4770 | 16 | 0 | `b101e1c0a5ae` |
| en | desktop-1440 | `/en/services/skincare` | `en-desktop-1440-service-skincare.png` | 690 | 9460 | 15 | 0 | `33a69ce2fbe8` |
| en | desktop-1440 | `/en/services/laser-hair-removal` | `en-desktop-1440-service-laser-hair-removal.png` | 678 | 6211 | 12 | 0 | `1a58e8d521f3` |
| en | desktop-1440 | `/en/services/botox-injections` | `en-desktop-1440-service-botox-injections.png` | 1113 | 7430 | 13 | 0 | `9cc6de4cdd18` |
| en | desktop-1440 | `/en/offers` | `en-desktop-1440-offers.png` | 1058 | 7526 | 19 | 0 | `2959f6aab82d` |
| en | desktop-1440 | `/en/results` | `en-desktop-1440-cases-results.png` | 835 | 7850 | 18 | 0 | `3d8728f48a0c` |
| en | desktop-1440 | `/en/doctors` | `en-desktop-1440-doctors.png` | 1190 | 7336 | 14 | 0 | `d9e08768a93f` |
| en | desktop-1440 | `/en/branches` | `en-desktop-1440-branches.png` | 794 | 5241 | 17 | 0 | `bbdf7e74acd4` |
| en | desktop-1440 | `/en/contact` | `en-desktop-1440-contact.png` | 714 | 5353 | 12 | 0 | `47f88b179d6f` |
| en | desktop-1440 | `/en/about` | `en-desktop-1440-about.png` | 1007 | 6030 | 12 | 0 | `54c016b5b72d` |
| en | desktop-1440 | `/en/blogs` | `en-desktop-1440-blog-list.png` | 1007 | 9862 | 20 | 0 | `d9d5d4ad36ea` |
| en | desktop-1440 | `/en/blogs/hifu-facial-skin-tightening` | `en-desktop-1440-article-short-hifu.png` | 1080 | 7983 | 11 | 0 | `28571a77ac6e` |
| en | desktop-1440 | `/en/blogs/laser-underarm-hair-removal` | `en-desktop-1440-article-long-table-underarm.png` | 1212 | 9280 | 10 | 0 | `2371f5733ee7` |
| en | desktop-1440 | `/en/blogs/morpheus-8-sessions` | `en-desktop-1440-article-two-tables-morpheus.png` | 1095 | 8304 | 11 | 0 | `7a4fe6e99fd7` |
| en | desktop-1440 | `/en/blogs/best-laser-clinics-near-me` | `en-desktop-1440-article-lists-clinics-near-me.png` | 934 | 4947 | 9 | 0 | `26c5da69eb95` |
| en | desktop-1440 | `/en/blogs/laser-hair-removal-egypt-price` | `en-desktop-1440-article-price-table.png` | 1196 | 3436 | 12 | 0 | `a060f49319b0` |
| en | phone-390 | `/en` | `en-phone-390-home.png` | 398 | 3053 | 1 | 0 | `a9bdf0d2a56c` |
| en | phone-390 | `/en/services` | `en-phone-390-services.png` | 388 | 1898 | 7 | 0 | `df05447e9f37` |
| en | phone-390 | `/en/services/skincare` | `en-phone-390-service-skincare.png` | 371 | 1610 | 2 | 0 | `ae08a57fd241` |
| en | phone-390 | `/en/services/laser-hair-removal` | `en-phone-390-service-laser-hair-removal.png` | 368 | 1574 | 2 | 0 | `dbb795fa5c7b` |
| en | phone-390 | `/en/services/botox-injections` | `en-phone-390-service-botox-injections.png` | 588 | 1913 | 1 | 0 | `7dd07c4c7757` |
| en | phone-390 | `/en/offers` | `en-phone-390-offers.png` | 494 | 1975 | 1 | 0 | `ac049a066342` |
| en | phone-390 | `/en/results` | `en-phone-390-cases-results.png` | 455 | 1698 | 3 | 0 | `a12be93392c0` |
| en | phone-390 | `/en/doctors` | `en-phone-390-doctors.png` | 448 | 1756 | 1 | 0 | `cd8c4f60c2a9` |
| en | phone-390 | `/en/branches` | `en-phone-390-branches.png` | 395 | 1533 | 3 | 0 | `443d846a74ef` |
| en | phone-390 | `/en/contact` | `en-phone-390-contact.png` | 430 | 1615 | 1 | 0 | `edf57a98561e` |
| en | phone-390 | `/en/about` | `en-phone-390-about.png` | 407 | 1788 | 1 | 0 | `1ee5ec0729a7` |
| en | phone-390 | `/en/blogs` | `en-phone-390-blog-list.png` | 424 | 1928 | 8 | 0 | `ddeaacacf44d` |
| en | phone-390 | `/en/blogs/hifu-facial-skin-tightening` | `en-phone-390-article-short-hifu.png` | 637 | 2174 | 2 | 0 | `4179d876e81b` |
| en | phone-390 | `/en/blogs/laser-underarm-hair-removal` | `en-phone-390-article-long-table-underarm.png` | 731 | 2825 | 2 | 0 | `241403322c32` |
| en | phone-390 | `/en/blogs/morpheus-8-sessions` | `en-phone-390-article-two-tables-morpheus.png` | 709 | 2487 | 1 | 0 | `d1bc9b2a2a2a` |
| en | phone-390 | `/en/blogs/best-laser-clinics-near-me` | `en-phone-390-article-lists-clinics-near-me.png` | 628 | 2065 | 1 | 0 | `80b26f481767` |
| en | phone-390 | `/en/blogs/laser-hair-removal-egypt-price` | `en-phone-390-article-price-table.png` | 663 | 2132 | 1 | 0 | `d2ff6f70a46f` |

## Where the time went

Full-page capture is slow by construction (goto, `networkidle`, a scroll pass, then one stitched
screenshot), so the golden-pass `ms` column measures a local production server doing oversized work,
not a phone. Item 0b takes the real numbers with Lighthouse. Slowest three shots:
- `/ar` at desktop-1440: 37233 ms, 1265 KiB
- `/ar` at phone-390: 30698 ms, 426 KiB
- `/ar/blogs/morpheus-8-sessions` at desktop-1440: 10695 ms, 1084 KiB

The ledger pass is the honest load signal: of its 68 routes the median is 1709 ms and
the minimum 1331 ms, on a local loopback production server with the dev database on the same
machine. 2 routes exceeded 3 s and the largest is
 26627 ms — the first route of a fresh browser context, which pays the cold read of
every layout chunk. Item 0b takes the real numbers with Lighthouse; these are the TTFB-plus-hydration
headroom it has to explain, not a mobile budget.

## Group sizes

| Locale / viewport | shots | MiB |
| --- | --- | --- |
| ar / desktop-1440 | 17 | 15.9 |
| ar / phone-390 | 17 | 8.0 |
| en / desktop-1440 | 17 | 16.5 |
| en / phone-390 | 17 | 8.3 |
