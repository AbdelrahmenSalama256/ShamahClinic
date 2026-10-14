# PROGRESS — WordPress CMS integration brief

Resume protocol (do this first, every time):

1. Read this file, then `git log --oneline -15`.
2. Continue from the first row not marked `done`. Do not redo `done` rows.
3. Re-verify the tree with `npm run typecheck`, `npm run lint`, `npm run build` only — do not
   re-run a whole workstream that is already `done`.
4. After finishing one item: `git add <the paths that item touched> && git commit -m "<short message>"`
   — stage explicit paths, never `git add -A`: `docs/screenshots/` and `.tmp/` hold generated audit
   output. One item per commit so an outage loses at most one item.

Verification commands: `npm run typecheck` · `npm run lint` (eslint — `next lint` is gone in Next 16)
· `npm run build` · `npm run sync:wp` (before any deploy; also refreshes `public/wp/*.webp`).
Serve the build with `npx next start -p 3121` and test against that, never `next dev`.

## Standing rules (they outrank any older note in this file or in memory)

- Only **GET** to WordPress. Never write to it. Never submit the CF7 form (`LEAD_MODE` stays unset
  = `whatsapp`; `cf7` emails the clinic's real inbox).
- Never invent content. Everything shown is either WordPress (live/snapshot) or listed STATIC in
  `docs/inventory.md`. No hiding, merging, filtering or rewriting of dashboard data — prices,
  duplicate offer rows and English auto-excerpts under Arabic titles all render as entered.
- Do not touch the visual design. UI changes only where they are correctness or a11y attributes.
- No "open items for the client" in plans or reports; content questions are never asked — the data
  team owns every word.

## Brief items

| # | Item | Status | Evidence (one line) |
|---|------|--------|---------------------|
| 1a | Journal pagination `?page=N`, per-page canonical, `rel=prev/next`, reach last page | done | 92 posts ÷ 9 = 11 pages; page 2 canonical `?page=2` + prev&next, page 11 has 2 cards + `rel=prev` only; `?page=99` renders **and canonicalises** `?page=11` |
| 1b | Offers pagination / list as returned | done | `/offers` renders the 4 products of that language's REST base, 785/781/780/581 unmerged, prices 899/500 EGP from minor units, no sale badge while `on_sale:false` |
| 1c | "Load more" appends `/api/v1/posts?page=N+1` without reload, skeletons, no repeats | done | Browser: 9 → 18 cards, 18 unique hrefs, 0 duplicates, URL unchanged, counter "عرض 18 من 92"; `SkeletonCard` row renders while loading |
| 1d | Category filter + search | done | Chips carry `aria-pressed`; filtering runs in the data layer over merged cards — `ليزر` → 35, `Botox` → 11, `PRP` → 0 (nothing published contains it) |
| 1e | Detail pages: ISR 300, `generateStaticParams` = ALL posts per language, `dynamicParams` true | done | Build prerenders 277 pages incl. 92+92 posts; `[lang]/blogs/[slug]` is `●` SSG, dynamic params on |
| 1f | Shorter Home + exact cut list | done | Home = hero, short about, offers, branches strip, journal, one CTA; the 8-row cut list is in `docs/inventory.md` "## Home cuts". Superseded on card counts by N2 — every card section now shows at most 3 (was offers ≤4, journal ≤3) |
| 1g | Services pages use WP-parsed cards, never invent descriptions | done | `getMergedTreatments()` overrides name+tagline from page 696 where a section matches; unmatched cards unchanged; `GET /api/v1/services` = 7 cards |
| 1h | Forms through `POST /api/v1/lead`; honeypot, validation, rate limit; "Book this offer" prefills | done | 400 on missing name; honeypot `_website` dropped; 6/min per IP; browser: offer button opens wizard with الليزر `aria-pressed="true"` |
| 1i | If CF7 ever enabled: form 568 + `text-1/tel-1/date-1/text-3/textarea-1`, branch into `textarea-1` | done | Implemented and documented, never exercised — no test submission sent |
| 2a | `generateMetadata` on every route, canonical, hreflang via shared id, `<html lang>`/`dir` | done | All 17 `[lang]` pages export `generateMetadata`; per-page `ar`/`en`/`x-default` alternates in raw HTML |
| 2b | JSON-LD: MedicalClinic+LocalBusiness with 3 branches, WebSite, BreadcrumbList, Article, Offer | done | Home 2 blocks, `/blogs` 3, `/offers` 7 (4 Offer), detail 4 (Article `inLanguage ar_EG`, WP `dateModified`); 3 branches with addresses+phones |
| 2c | sitemap: all posts/pages/offers both languages, `lastmod` from WP `modified` | done | 240 URLs, 200 `lastmod`, 720 hreflang alternates, every URL 200; rows with no `modified` omit `lastmod` |
| 2d | robots.txt | done | 127 B, allow all, disallow `/api/`, sitemap + host |
| 3 | Language resolved on the server, proven with curl on the production build | done | `/` → `lang="ar" dir="rtl"` + Arabic H1; `/en` → `lang="en" dir="ltr"` + English H1; visible-text counts: `/en` 113 Arabic vs 4586 Latin |
| 4a | Every WP image through `next/image` + `remotePatterns`, sizes, priority on LCP, no CLS | done | 0 `wp-content` srcs in served HTML; `featured_media:0` posts render the empty aspect frame; CLS ≤ 0.015 |
| 4b | Mirror actually-used images to `public/wp/` with live URLs as fallback | done | `sync:wp` encodes 53 webp (1.3 MB) + `data/wp/images.json`; pages reference `/wp/*.webp` (home 33, `/blogs` 99, journal detail 50, offer detail 21) |
| 5 | Browser sweep on production build, AR+EN, all routes, console/broken images/RTL/switcher | done | All routes 200 (unknown `/fr` 404, trailing slash 308→200); 0 console messages; 0 broken imgs; switcher `router.push`es the same slug in the other language |
| 6 | Lighthouse mobile on Home/Journal/post, fix anything < 90 within our control | done | best-of-two: home AR 84, home EN 84, `/blogs` 84, `/offers` 83, detail 81-85, desktop 99; SEO 100 + a11y 96-100; residual is Render Delay (framer-motion 230 KiB + react-dom 223 KiB) = the approved animation system |
| 7a | `docs/inventory.md` — no stale rows | done | Rewritten: transport table, Images, Render model, JSON API, Home cuts, static-content list |
| 7b | `docs/api/DECISIONS.md` current | done | +9 sections this session incl. canonical clamping, eager first-row photos, modal code-split, outage budget, mixed-language Woo rows |
| 7c | README: run, refresh before every deploy, env, revalidation, WP hook | done | Sections: commands, snapshot-first flow, rendering model, revalidation + PHP hook snippet, env table |
| 8a | lint + typecheck + build clean | done | eslint 0, `tsc --noEmit` 0, `next build` EXIT=0, 277 pages in 15.9 s |
| 8b | Zero WordPress requests during build | done | Build log: `[wp] live` = 0, `REFUSED` = 0, 304 snapshot reads |
| 8c | No TODOs / placeholder text | done | 0 TODO/FIXME/lorem hits in `src`; `src/data/placeholders.ts` deleted |
| 8d | No design/style changes beyond the shorter Home | done | Diffs this session are metadata, a11y attributes, loading attributes, one dynamic import |
| 9 | Final report delivered | done | Reported: changes, Home cuts, curl language evidence, Lighthouse, pagination, static list, Vercel env, unverifiables |

## AUDIT brief — prove wired vs truly static (no design changes)

| # | Item | Status | Evidence (one line) |
|---|------|--------|---------------------|
| A | Map every `src/data` file + hardcoded UI string that the UI still imports, and what it feeds | done | 10 files under `src/data` enumerated with import sites; per-route element lists (15 routes x 2 langs) + hardcoded-literal file:line lists collected |
| B | Probe WordPress for each claimed-static item (page 885, product descriptions, WPBakery section images, pages 32/3/67/169, homepage nav, hero/slider media) | done | All live GETs: 885 real EN body (AR REST = same English); 696 = 7 sections + 7 images; 32 real bilingual; 67/169/3 theme demo; 622 office blocks EN-only via REST; menu item ids 870/717/755/643/646/647/838; 4 Store-API products |
| C | Wire every item where a real WP source exists and delete the static copy | done | C1 nav labels + booking CTA were wired from page titles, then **reverted to authored by client decision** — the whole header nav + footer groups now live in one file, `src/data/nav.ts`, and `lib/wp/nav.ts` is deleted (see N1). C2 branch name/address/phone/photo from page 622 `.ws-contact-office-item` blocks (`lib/wp/branches.ts`) feeding /branches, branch detail, /contact, /doctors cards, footer, booking wizard, JSON-LD, sitemap; `clinicData.branches` + `clinicData.services` + `getBranch()` deleted. C3 page 696: 7 published sections → names/intros/section photos merged over the 10 authored rows through an explicit `SECTION_SLUG` alias table (5 match: skincare, laser-hair-removal, botox-injections, filler-injections, chemical-peeling; AR guard `arabicRatio` because sections 1+3 serve English bodies), merged rows now feed the Services dropdown, /services grid, /results table, detail "related", booking + contact pickers (props from the layout, `treatmentsData` imports removed) and `availableService` JSON-LD; `verifiedFacts` deleted, the home/about branch + treatment counters now count the WP lists. C4 about = page 32 parsed by `lib/wp/about.ts` (intro → hero lead, "The Story"/"قصتنا" and "The Process"/"عمليتنا" + 5 `<br>` lines + process photo) into `AboutClient`; `src/data/about.ts` is the outage fallback only. Also fixed `sanitizeHtmlBody` to mirror image srcs before link rewriting. C5 interior H1s from their WP page titles (696/9/62/169/3), C6 treatment detail body from page 885, C7 hero background from the 622 revslider frames (`getRawPageHtml` → `heroPhotos`) |
| D | Write `docs/WIRING.md` with a row per visible text block and image per route, both languages | done | 18 sections, 160 element rows (script-counted): 63 rendered from WordPress, 74 authored with no WP record, 4 authored by client decision, 5 authored because WP is theme demo, 10 partial/adjacent, 4 cross-reference rows, 18 newly-wired rows in 9 groups, 4 dead-code findings — `docs/WIRING.md` commit `d08bfe2` |
| E | Keep the demo-text rule: authored static stays where WP holds lorem/placehold, with page id + quoted sample | done | WIRING §15 quotes the demo text of pages 169 (FAQ), 3 (privacy), 67 (contact), 62 (journal) and 13 with page ids, and records the opposite rule for Woo products 781/780/581, whose sample "These art prints have been hand painted…" prints verbatim because it is the clinic's own offer row |
| F | `npm run sync:wp` + lint + typecheck + build + runtime re-verify, language still server-side, snapshot fallback intact | done | sync 22 WP requests in 82.4 s, 60/60 images → 1.4 MB, `git diff` = `meta.json` timestamp only; typecheck 0, eslint 0, build EXIT=0 (277 pages, `[wp] live` = 0, REFUSED = 0, 326 snapshot reads); `next start -p 3100` + `scripts/verify-render.mjs` 42/42 AR+EN, `/` still `lang="ar" dir="rtl"` vs `/en` `lang="en" dir="ltr"` |
| G | Update `docs/inventory.md` (+ DECISIONS) to match, commit | done | inventory rewritten (nav STATIC row with the WP menu ids, 3-card home, per-route demo list, 15-row "not editable from the dashboard" table) `6778d20`; DECISIONS +6 sections and the reversed services-photo ruling `4dd9e8f`; README verification command + WIRING pointer `c665a10` |

## NEW DECISIONS (applied on top of the audit)

| # | Item | Status | Evidence (one line) |
|---|------|--------|---------------------|
| N1 | Nav is authored again: header + footer groups in one file, ar/en labels + hrefs in the current order, no WordPress dependency, same look | done | `src/data/nav.ts` holds `navLinks` + `footerGroups` + the booking CTA; `lib/wp/nav.ts` deleted, `SiteShell`/`Navbar`/`Footer` import only the data file; removing a page = deleting one line. `verify-render.mjs` asserts the header order and labels from the file itself |
| N2 | Home: every card section shows at most 3, in data order, with "View all" whenever the total is greater | done | `HomeBody.tsx` `HOME_CARDS = 3` + the `SectionCardLimit` probe keeps the 4th row as a "more exist" signal only; 01 reasons 3 of 4 → `/about`, 02 offers 3 of 4 WP products → `/offers`, 03 branches 3 WP offices → `/branches`, 04 journal 3 of 92 posts → `/blogs`; full lists and their pagination untouched on those pages |
| N3 | No content guard, filter, de-duplication or merging anywhere (offers included) | done | Grep of the offer/post paths: no `OFFERS_PRICES_CONFIRMED`, no predicate drops 785/781/780/581, price printed from `price` + `currency_minor_unit`, AR English auto-excerpts displayed as returned |
| N4 | Re-run the gate and prove it on the production build with a script over rendered HTML, in both languages; update inventory + WIRING; commit per item | done | 42/42 assertions on `next start -p 3100` (nav from `src/data/nav.ts`, 0 section over 3 cards, all four "View all" links present), one commit per item (`d08bfe2`, `6778d20`, `4dd9e8f`, `c665a10`) |

## Follow-up — "services not fetched": every page-696 section must reach the site

| # | Item | Status | Evidence (one line) |
|---|------|--------|---------------------|
| S1 | Find why services looked unfetched and wire what was missing | done | `/api/v1/services` always returned 7 real WP cards, but `getMergedTreatments()` only **overrode** the 5 authored rows it could alias, so `glow-brightening-injections` and `mens-aesthetic-services` never rendered. `495409e` appends every unmatched section as its own card + detail route + sitemap row + `availableService` entry, in WP order |
| S2 | Nothing invented where WordPress gives no value | done | `priceStartingAt: number \| null`, `category: TreatmentCategory \| null`: no badge, no "From … ج.م" (empty slot keeps the card row), no fact grid, no Ideal-for/Benefits/Steps/Aftercare headings, no schema.org `Offer`, excluded from the `/results` figure table. The build now prerenders 285 pages (was 277) because the 2 new slugs answer in both languages on both `/services/[slug]` and `/treatments/[slug]` |
| S3 | Re-verify on the production build, AR + EN | done | `sync:wp` 22 requests/80.7 s/no content drift, typecheck 0, lint 0, build EXIT 0 with `[wp] live` = 0 and 334 snapshot reads, `verify-render.mjs` **117/117**: 7 WP titles render on `/services` (12 cards), both WP-only detail routes 200 with the WP intro, mirrored photo, `MedicalProcedure` without `Offer`, 0 `wp-content` hotlinks, no price anywhere; the AR dashboard heading `3. إزالة الشعر بالليزر` is reported as trimmed to `إزالة الشعر بالليزر`, not silently |

## Not code, and not ours to do (host/client side)

| Item | Status | Note |
|------|--------|------|
| `REVALIDATE_SECRET` on the host | todo (client/host) | No `.env.local` locally, so `/api/revalidate` correctly returns 500 `REVALIDATE_SECRET not configured` |
| WordPress `transition_post_status` hook → `POST /api/revalidate` | todo (client/host) | Snippet is in README; installing it writes to the client's WordPress, which the rules forbid from here |
| `npm run sync:wp` + commit `data/wp/`, `public/wp/` before each deploy | standing | Snapshot is what makes the build reach zero WordPress requests |

## Not verifiable from this environment (recorded so a resumed session does not re-chase them)

- Scroll-dependent visuals as pixels: the automation tab has no rAF and cannot scroll, so
  curtain/reveal arming and the modal exit tween completion are proven by DOM state only
  (Escape restores `body.style.overflow`, wrapper reaches `opacity:0`).
- Real-device widths (375/390/430) — layout checked via bounding rects in Lighthouse's simulated
  mobile viewport, not driven in a browser.
- Production-host timings: every number is `localhost:3121` + simulated throttling on a network
  where one WP REST call costs 4-6 s and the origin intermittently 522s.
- Live-origin availability at deploy time (`sync:wp` needs a healthy WordPress).

## Tasks A + B + C (2026-10-13) — sweep, missing-data tolerance, services on Home

| # | Item | Status | Evidence (one line) |
|---|------|--------|---------------------|
| A1 | Discover every public URL from robots + sitemaps + internal links, fetch each rendered HTML GET-only (concurrency 2, 300 ms) | done | `scripts/wp-sweep.mjs`: 217 requests, 200 documents (193x200, 7 aborted), 19.4 MB, both locales |
| A2 | Search every still-authored item in that HTML (516 strings), wire what exists, keep the rest static with evidence | done | `docs/STATIC-SWEEP.md` is the item-by-item table (where searched / found? / URL + selector + quoted snippet / action). FOUND and wired: Home introduction row, the story + `#process` prose rows (now on `/about`). NOT found and left static, each with its negative search: specialists, before/after pairs, service steps/benefits/aftercare/durations, offer terms, emails (0 `mailto:` in 184 posts), hours, socials, FAQ, privacy, differentiators. Theme demo (`What is Artday?`, `Suggested text:`, `placehold.it`) never wired. Phone/WhatsApp found live and already matched the authored value |
| B | Make the UI survive missing / empty / very long / wrong-language data, design-neutral | done | `SectionHeading` renders nothing without a title, `Photo` → gold-tone logo frame, `Swiper` hides controls when all slides fit, price/tagline rows reserved not collapsed, `dir="auto"`, no `img[src=""]`. Fixture route `src/app/[lang]/preview-missing-fields/` (dev-only, noindex) + `scripts/test-missing-fields.mjs` = **86/86** AR + EN |
| C | Services on Home without adding a section, replacing the least impactful band | done | `docs/HOME-PRIORITY.md`: the authored reasons block (no WP source, no conversion action, overlaps `/about`) was replaced; Home keeps 4 card bands — services 3 of 12 + "All services", offers 3, branches 3, journal 3. Selection rule + `featuredServiceSlugs` override documented; measured heights at 1440 and 390 px in §4 (desktop −98/−124 px, phone +105/+113 px) |
| V | Gate: sync:wp, typecheck, lint, build with zero WordPress requests, extended `verify-render.mjs` | done, with one exception | `sync:wp` **blocked by the origin** (HTTP 500 after 15.5 s; REST timeouts at 90-120 s) — snapshot intact, nothing re-fetched. typecheck 0, lint 0, build EXIT 0 with `[wp] live` = 0 (`grep -i shamahclinics` on the build log = no hits), `verify-render.mjs` **151/151** on `next start -p 3100`, including the two-way "View all" rule (absent for the 3 branches) |

Uncommitted leftovers to ignore on resume: `docs/screenshots/` (123 MB of audit PNGs, now
gitignored) and anything under `.tmp/` are generated output — stage explicit paths only, never
`git add -A`. `scripts/audit-contrast.mjs` and `docs/contrast-report*.md/.json` **are** part of the
work: the brief asks for the audit script and its before/after report.

Also reported, not deleted: `src/components/home/BeforeAfterSection.tsx` has no importer anywhere in
`src` (WIRING §16). It is a Home component holding authored before/after claims the sweep proved
WordPress does not publish; deleting a component is a design change, so it waits for the client.

## Task E (2026-10-14) — the branded 404

| # | Item | Status | Evidence (one line) |
|---|------|--------|---------------------|
| E1 | Unknown URLs answer HTTP 404 with the branded page, Arabic by default, English under `/en`, server-rendered `<html lang dir>` | done | `experimental.globalNotFound` + `src/app/global-not-found.tsx`, which composes `src/components/pages/NotFoundDocument.tsx` (fonts, `globals.css`, theme map, `SiteShell`, `NotFoundClient`). `node scripts/verify-render.mjs`: `/does-not-exist` → 404 `<html lang="ar" dir="rtl">` + `<h1>يبدو أن هذه الصفحة غير موجودة</h1>`; `/en/does-not-exist` → 404 `<html lang="en" dir="ltr">` + "This page doesn't exist"; `/fr/does-not-exist` → Arabic |
| E2 | Language of a document the router renders, not a segment | done | `src/proxy.ts` stamps the resolved prefix on the request as `x-shamah-lang`; `NotFoundDocument` reads it back through `headers()`, so nothing about the language is decided in the browser. Root params are unavailable in this render (`create-component-tree.js:749`), which is why the header exists |
| E3 | Every dynamic route still calls `notFound()` for a missing slug | done | unchanged: `blogs/[slug]`, `offers/[slug]`, `treatments/[slug]` (+ its `services/[slug]` re-export), `branches/[slug]`. `/blogs/no-such-article`, `/offers/no-such-offer`, `/services/no-such-service`, `/treatments/no-such-treatment`, `/branches/no-such-branch` → 404 + `noindex` |
| E4 | Missing slugs render the branded UI too | done as far as the framework allows | `src/app/not-found.tsx` exports the same document, so the slug routes get the localized `<title>`/`robots` and, in a real browser, the full header + 404 card grid + footer + floating actions (`documentElement.lang="ar"`, `dir="rtl"`, `--bg-dark` resolved, 0 console errors). Their **raw** HTML is the framework's `<html id="__next_error__">` with an empty body: a mid-render `notFound()` is answered by the seed in `app-render.js:1322-1333`, which composes no user layout and no `global-not-found` — the only documented remedy is `dynamicParams = false`, and that would 404 every post or offer published after a deploy, i.e. break the CMS-first data layer |
| E5 | Build mode | done | `npm run build` is now `next build --webpack`. A Turbopack production build compiles `global-not-found.tsx` into `/_not-found` yet still serves the built-in document (proven with a marker build: `status=404 … marker? false`), while webpack honors it. `next dev` honors it on both bundlers |
| E6 | The `[lang]/[...rest]` catch-all was removed, not added | done, deliberate deviation | With a catch-all, `/ar/<anything>` *matches* a route, so the 404 becomes mid-render and drops to the `__next_error__` shell; without it the URL matches nothing and the routing-level branded document is served. Measured both ways on the same build: catch-all present → `<html id="__next_error__">`, absent → `<html lang="ar" dir="rtl">` + branded `<h1>` |

## Tasks D + F + G + the Home rhythm (2026-10-14)

| # | Item | Status | Evidence (one line) |
|---|------|--------|---------------------|
| D1 | One semantic colour contract per theme | done | `27afab6`: every button family carries its own `<bg, fg, border>` triple per theme (`--btn-wa-solid/outline/on-dark`, `--btn-gold-fg`), plus control borders, one focus ring, header opacity and the heights the layout clears. Root cause of the white-on-white WhatsApp button, recorded in that commit: an unthemed literal surface paired with an ink token that inverts — the baseline audit measures it as ink `rgb(255 255 255)` on bg `rgb(255 255 255)`, ratio 1.00 |
| D2 | Controls state the surface they belong to | done | `80be744` + `684f7bb`: no component borrows white or black from Tailwind any more; gold mid is only ever a fill, text on it uses `--text-gold`, and surfaces that stay dark in both themes take the `on-dark` ink pair |
| D3 | Header, focus ring, floating layers | done | `114b930`: sticky header 94% (97% scrolled) themed surface + border + shadow, one unlayered `:focus-visible` outline site-wide, `scroll-padding-top` for anchors, last block clears the floating control by its own size and margin, and the bubble hides while the booking modal is open |
| D4 | Playwright contrast audit, both themes × both languages × every named route, 390 + 1440 screenshots | done | `04fc224` closed the last two classes. BEFORE (`docs/contrast-report-baseline.*`, label `baseline`): 3346 findings, **3254 failures** (1130 focus ring, 1063 control border, 1021 text ratio, 40 "ink equals its background" — all 40 on the dark booking card: 20 literal white-on-white at ratio 1.00, 16 near-black service rows on near-black, 4 gold price rows on gold). AFTER (`docs/contrast-report-after.*`): 594 findings, **0 failures**, 0 layout findings, 0 exempt, 140 screenshots. The 594 are photo-backed REVIEW items, split 416 measured-and-passing / 154 no ratio / 24 below-threshold-over-photo, each of the 24 named and read in a crop in `docs/contrast-report.md` |
| F | Results from the API: sweep 92 posts × 2 languages + all media + live pages for before/after material | done | `docs/RESULTS-SOURCE.md`: **no result imagery exists in the CMS** — 23 media items are service/clinic photos, the 162 `<img>` across 27×2 rendered pages reduce to 37 unique sources with 0 result pairs, and the four posts titled "Before and After" (#974, #964, #1003, #958) carry 0 `<img>` and `featured_media: 0` |
| F | Wire the fallback the brief allows: result stories from those posts, 9 per page, no invented cases | done | `c720470`: `sync-wp.mjs` writes `data/wp/result-stories.json` (56 rows, phrase-indexed at sync time), `lib/wp/result-stories.ts` filters the live article cards by id, `/results` paginates 7 pages with clamped canonical + `rel=prev/next`, both languages, the page states it shows no before/after photos, and the four authored pairs moved to the unverified list |
| F | Fix found on the way: an English reader paginating `/blogs` landed on Arabic | done | `JournalClient.tsx` pushed bare `/blogs?...`, which `src/proxy.ts` rewrites onto `/ar`; it now builds the href through `getLocalizedHref` |
| G | Email + opening hours: swept the live JSON-LD, meta, footer, contact page and structured data | done | `docs/UNVERIFIED-FACTS.md`: the homepage `Organization` node has only `@type,@id,name,url,sameAs`; no `mailto:` in the served homepage HTML; no hours pattern anywhere; the only email in the CMS is the theme's `info@artday.com` |
| G | Remove them from the visible UI and the JSON-LD, keep phone/WhatsApp | done | `81d7c6c`: 21 files. Out of the footer, navbar, contact/privacy/branch views, booking modal, FAQ card, About and branches copy, three page descriptions and both `openingHoursSpecification` blocks + `email` + `priceRange`. Sweep of 15 routes × 2 languages for `info@shamah\|mailto:\|١٠ ص\|10am\|open daily\|مواعيد العمل` → 0 hits |
| G | Authored service prices and the schema.org Offers built from them | done | `81d7c6c`: the five authored rows (every `priceStartingAt`) are commented out, `serviceJsonLd` emits no `Offer`, `/services` and `faq-10` say the price is set after examination — quoted from posts #1125 and #1086 — and the `/results` figures table went with them. WooCommerce offer prices still render (16 currency marks + 4 `Offer` nodes on `/offers`) |
| G | Social handles | done | The three `sameAs` URLs the clinic publishes replace the guessed ones; the invented YouTube row is deleted. TikTok is verified but unwired because the footer draws only two glyphs (design, not data) |
| V2 | Mobile Home must not be taller than before Task C | done | `ade3a1e`: `py-5 lg:py-12` → `py-4 lg:py-12` on the four Home bands = −32 px at 390: **6656 px ar** (target ≤ 6669) and **6825 px en** (≤ 6874); desktop untouched at 4253/4363. Table in `docs/HOME-PRIORITY.md` §4.1 |
| V3 | Gate | done, with one exception | typecheck 0 errors, `npm run lint` 0 errors (2 warnings in gitignored `.tmp` scratch), `next build --webpack` EXIT 0 twice with 0 `shamahclinics` and 0 `[wp] live` lines in the build log, `scripts/verify-render.mjs` **195/195** on `next start -p 3100` (nav, ≤3 cards + the two-way "View all" rule, no empty headings, 404 in both languages, `/results` pagination), `scripts/test-missing-fields.mjs` **86/86**. `npm run sync:wp` **could not run**: this environment has no outbound route at all (`example.com` fails the same way `www.shamahclinics.com` does), so the site renders from the last committed snapshot and the gate was run against that |
| H | Offer images: find the root cause | done | **Not the CMS, not the mirror.** The Store API rows in `data/wp/products.*.json` do carry `images[]` (785: 1, 781/780/581: 3), all 6 distinct uploads are already mirrored in `data/wp/images.json` with their WebPs on disk in `public/wp/`, and `mapOffer` already read `images[0]`. The loss is one layer up: `offerToUI` (`src/lib/wp/ui.ts`) built the UI `Offer` from a shape (`src/data/offers.ts`) that **has no image field at all**, so `OfferCard` — the only card in the family without a `Photo` — rendered title, list and price and nothing else |
| H | Fix: full `images[]` through the mapper, card + gallery | done | mapper keeps every image in the order the store returns it, alt from the data and the product's own name when the CMS left `alt` empty (all 6 do); `image` stays `images[0]` so SEO/OG/JSON-LD URLs are untouched. `sync:wp` now seeds the mirror from **both** product lists (an Arabic-only upload used to be missed). `OfferCard` shows the first image like the service/journal cards; `OfferDetailClient` galleries every image with thumbnails, and one image means one photo with no controls and no empty slot; a product with no image in the data keeps the brand frame. An upload the mirror does not hold falls through to its live wp-content URL over `next/image` (`remotePatterns` already allows it) |
| H | Verify + V4 gate | done | `verify-render.mjs` grew 52 assertions (section 7): a card `<img>` per product on `/offers` and `/en/offers` with its src printed, 1/3/3/3 images on each of the 8 detail pages, mirrored files proven present on disk, zero CMS hotlinks → **247/247**. typecheck 0, lint 0 errors, build EXIT 0 with 0 `shamahclinics` lines, `test-missing-fields.mjs` **86/86**, gallery thumbnails measured 0 for the one-image product and 3 for the three-image ones |
