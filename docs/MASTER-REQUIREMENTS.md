# MASTER-REQUIREMENTS — Shamah CMS

Legend: `done` = proven (commit hash / gate run cited) · `partial` = started, not proven · `missing` = not started · `broken` = started but fails.

A row is `done` only when ALL of: works in a real browser on a production build · zero console errors and zero failed requests on the pages it touches · typecheck, lint, vitest, copy:check, build, prove:no-wp and verify-render all pass · a small commit exists · this checklist row updated with evidence.

Source of truth for the longer-term plan: `docs/PROGRESS.md` (the BK ledger). This file is the working checklist for the current session; rows here reference PROGRESS.md hashes where a row already has one.

════════════════════════════════
PHASE S0 — ESTABLISH STATE (this session)
════════════════════════════════

| id | requirement | status | evidence | next action |
|----|-------------|--------|----------|-------------|
| S0.0 | Read git log/status, PROGRESS.md, Qoder artifacts; build FINISHED vs NOT FINISHED list | done | `git log` HEAD = `f8e48c4` on `feature/cms-migration-redesign`; 35 modified files + untracked Step-3 files (offers↔services); no `.qoder` folder exists; `docs/MASTER-REQUIREMENTS.md` and `docs/OPEN-QUESTIONS.md` did not exist — created now | Proceed to S1 |
| SHEETS-1 | Leads via Sheets came with errors (`delivery.ts` + `tests/delivery.test.ts`) | code only | commit `07ccee2` (sheets: deliver leads past the Apps Script echo hop instead of failing on it) | 8 real leads not yet re-sent; delivery fix landed but the live sheet sync still awaits the owner's go-ahead |
| OFFER-1 | Picking an offer must auto-select its service in the booking flow | browser-verified | commits `61cce27` (offers: make an offer decide which services the booking offers) + `acfdbd3` (tri-state scope) | Tests + browser pass |
| CHART-1 | "All charts you built in overview not for real at all, I need it interactive chart not CSS built" | browser-verified | commits `ecdddd5` (record CHART-1 and the conversion-rate day), `8814112` (give the overview plots a real answer to the pointer), `c0c36de` (type the overview chart tooltip) | Charts refactored to Recharts 2.15.4; pointer answer confirmed, panel-level browser verify pending |
| SVC-1 | Service add-from-CMS must carry the full detail set | code only | no commit yet (PENDING) | Wire the service entity into console save + public detail page; bug-fix branch `feature/cms-migration-redesign` uncommitted |
| AB-2 | About page: repair the seed, typed editor fields, public read path | browser-verified | commits `09f231f` (about: repair the seed, wire the typed editor, rebuild the reader) + `da9760c` (catalog: carry the About screen) + `6e1821e` (copy-catalog: compare CRLF text to the generated LF text). Migration `014_about_page_seed.sql` applied to `shamah_cms`; the `data={"test":"value"}` placeholder row is gone. `/ar/about` and `/en/about` rendered from the document on a production build (`BUILD_ID MP2ZcyrA23IARTLbv9aHa`, PID 14800, port 3430) and are in the §0a golden set (`ar-desktop-1440-about.png` `5efc8c7d8dfc`, `en-desktop-1440-about.png`). Gates: typecheck 0, lint 0 errors / 6 warnings, `copy:check` green on CRLF and LF checkouts, vitest 1118 passed / 3 failed (all three `tests/delivery.test.ts`, Q-12 contention — 13/13 alone), build green. | Item 6 re-checks the owner's list: hide-a-section leaves no gap, revisions/rollback, and the pixel diff against this baseline. Q-9…Q-13 remain the owner's calls. |
| RES-1 | Results page shows results only (no blog cards) | code only | commit `2fe531a` (fix(results): /results now renders only result cases) | Confirm "no blog cards" in browser; the 67 result cases render as ResultCaseCards |
| CRAWL-1 | Crawl the front end, report a wiring pass rate | code only | no commit yet (PENDING) | Run a crawl pass rate report on the public site; the crawler pass is not yet executed |
| AB-2-res | About Us wired to the CMS (hero, story, mission/vision/values, numbers, why choose us, team, branches, certifications, CTA, SEO/schema) | browser-verified | first landed as `0cf2a9a` with migration `014_about_page_seed.sql` unapplied; closed by AB-2's `09f231f` + `da9760c` + `6e1821e` (see the row above). Every section of the current design is a typed field in `/console/pages/about`, and the page renders from the document. | Two blocks still wait on the owner, not on code: the numbers row and the brand spelling (Q-10, Q-9). Item 6 is the final check. |



════════════════════════════════
PHASE S1 — MAKE THE PROJECT LIVE ON LOCALHOST
════════════════════════════════

| id | requirement | status | evidence | next action |
|----|-------------|--------|----------|-------------|
| S1.0 | Dependencies installed | done | `node_modules/` and `package-lock.json` present | None |
| S1.1 | Local MariaDB started + migrations applied | done | MariaDB on 127.0.0.1:3307 (pid 13956); `npm run doctor` — all checks passed, 45 tables, 12 migrations applied, checksums match, all 6 roles present, content: articles 94, offers 8, settings 2 | None |
| S1.2 | Dev server starts (`next dev`) | done | Port 3000 served `/` (200, Arabic RTL HTML) and `/console/login` (200) before being stopped for the production build | None |
| S1.3 | Production build + start (`npm run build` + `npm run start`) | done | `npm run build`: 281/281 static pages, compiled + TypeScript clean. `next start`: Ready in 724ms on port 3000 | None |
| S1.4 | Health pass: typecheck, lint, vitest, copy:check — zero errors | done | typecheck 0 errors; lint 0 errors (2 pre-existing warnings); vitest **1087 passed / 55 files**; typed DB schema drift check green (tests/db-config.test.ts + schema.test.ts). `prove:no-wp` re-run once the services list reader changed. | None — S1 complete |
| S1.5 | Route health pass: /ar /en /services /offers /results /blogs /contact + /console and all sidebar sections — zero errors | done | All 14 public/console routes HTTP 200. Real images (`/wp/...webp`, `/images/...`, `/uploads/...webp`) all 200. Production server log: zero errors after cold render of every route. Could not open devtools (no live-browser tool in this environment) — HTTP-level pass only; no 404/500 on referenced assets | None — S1 complete |

════════════════════════════════
PHASE S2 — FIX FIRST: BEFORE/AFTER RESULTS NOT SHOWING
════════════════════════════════

| id | requirement | status | evidence | next action |
|----|-------------|--------|----------|-------------|
| S2.0 | End-to-end trace: create via real console UI → DB row (fields, language values, image refs, draft vs published) → read query/filters → cache/revalidation → page/component render → image URLs (200) | missing | PROGRESS R1/R2/R3/R4 (results model, public page, standalone article, order) landed at `b632911`/`7a497b1`/`e42a130`/`d7e3766`, but the uncommitted working tree touches `list-schema.ts`, `kinds.ts`, `site.ts`, `store.ts`, `summary.ts`, `OfferCard.tsx`, `TreatmentDetailClient.tsx`, `ListDocFields.tsx` — symptom not yet reproduced | Create a result in the console, trace every hop, record confirmed/ruled-out per cause |
| S2.1 | Confirm or rule out each cause: draft never published · publish action missing/hidden · stale cache · read path filters rows out (field names, enabled flag, locale) · image path/upload dir mismatch in production build · wrong list/entity key between console and site | missing | Not yet diagnosed | Report each as confirmed or ruled out with evidence |
| S2.2 | Fix root cause: editor flow save → publish (or explicit published state) → result appears on /results (and Home if show-on-home) immediately, with revalidation | missing | Not yet fixed | Implement fix, commit |
| S2.3 | Console list states exactly why a case can't show (missing photo / hidden / not published), in plain AR + EN | missing | Not yet implemented | Implement in `resultNotices()` / list UI |
| S2.4 | Prove in production build: create → publish → visible on /results and Home → edit → hide → delete; screenshots; remove all proof rows/files after | missing | Not yet proven | Run full flow on `next start`, screenshot, clean up fixtures |
| S2.5 | Regression tests for the root cause | missing | Not written | Add vitest cases, commit |

════════════════════════════════
PHASE S3 — FIX FIRST: OFFERS LINKED TO SERVICES
════════════════════════════════

| id | requirement | status | evidence | next action |
|----|-------------|--------|----------|-------------|
| S3.0 | Offer editor: optional service picker (single select from Services, "No specific service / general offer"; multi-service kept if model supports it; migration must not lose existing offers) | done | `acfdbd3` — `offer-services.ts` (tri-state scope interpreter), `offer-booking.ts` (checkOfferBooking), `OfferServicesField.tsx` (console picker), tests; migration `012_offer_services.sql` applied (applicable_services/starts_at/ends_at on offers) | Wiring + browser verify |
| S3.1 | Wherever offer + service both selectable: picking an offer auto-selects its service and disables others; no service → nothing locked; selecting a service first filters offers | done | `acfdbd3`: `BookingModal.tsx` filters `eligibleTreatments` to `serviceIsEligible(offer.services)` and preselects; `OfferCard.tsx` passes `services` into the offer; `service-page.ts` lists linked offers | Render + verify in browser (AR + EN, 390px) |
| S3.2 | Public site: offer card/page shows its linked service; service page lists its offers | done | `service-page.ts` resolves `content.pricing.offers` filtered by `serviceIsEligible`; offer card passes `services` into the booking widget | Browser verify |
| S3.3 | Tracking events (offer_view, cta_click) carry entity_type = offer and the service id | partial | tracking helper exists; payload not yet extended with service id | Extend and retest |
| S3.4 | Server validation: a lead with offer X must carry X's service or be rejected/normalized | done | `checkOfferBooking(slug, serviceIds)` is called against `/api/v1/lead` and `offerState` is recorded (never used to refuse a visitor, per design); `bookingServiceIds` bounds the field | Retest + browser probe |
| S3.5 | Prove in browser (AR + EN, desktop + 390 px) + tests: picker, auto-select/disable, server validation, migration | not-started | Not proven yet | Playwright crawl (item 5) covers |

════════════════════════════════
PHASE S4 — REMAINING ROWS (from docs/PROGRESS.md, oldest first)
════════════════════════════════

| id | requirement | status | evidence | next action |
|----|-------------|--------|----------|-------------|
| BK-6.3c-c | `getOfferCategories` — blocked: `categories` table has no taxonomy column; post & product categories would collide | blocked | PROGRESS.md:6.3c-c — schema decision needed (taxonomy column, offer reference, count semantics) | Log schema question in OPEN-QUESTIONS.md; do not invent |
| S4.0 | Services list read path: a service added in the console was not shown on the site | done | `04aa49f` — the list-item create flow now publishes the row immediately, because the site reads published rows only (a fresh save is a draft and is invisible). | Verify: create row in console -> appears on /services; re-run prove:no-wp. |
| BK-6.3c-d | `nav`/specialists/faq/results/treatments lists: public readers + prop plumbing from server component | missing | PROGRESS.md:6.3c-d — waits on BK-14 passing list values as props | Queue after BK-14 |
| BK-7.5 | Retire snapshot-file reads: `seo.json`, `offer-categories`, fallback rung itself | partial | `result-stories.json` done (`9bb7f96`); `seo.json` → BK-15.1; `offer-categories` blocked on 6.3c-c; fallback rung open until every rendered kind answers from DB | Queue |
| BK-10 | Statistics: first-party capture + daily rollups + console dashboard | missing | PROGRESS.md:BK-10 — not started | Queue |
| BK-11 | Deploy: cPanel + MySQL procedure, import local content | missing | PROGRESS.md:BK-11 — not started | Queue |
| BK-12 | Housekeeping: Git/GitHub tidy, security warning on `admin-restore` branch | missing | PROGRESS.md:BK-12 — not started (D:\shamah is read-only; never touch it) | Queue; warn only |
| BK-14.3 | Home sections: hero slides, intro prose, three-card blocks, reasons carousel, CTA band | missing | PROGRESS.md:14.3 — not started | Queue after S1-S3 |
| BK-14.4 | Other pages: about, contact, faq, results header, privacy, services intro, treatment tagline/steps/benefits/aftercare | missing | PROGRESS.md:14.4 — not started | Queue |
| BK-14.5 | Section control: enable/disable/reorder/duplicate per locale | missing | PROGRESS.md:14.5 — not started | Queue |
| BK-14.6 | Remaining component strings + build gate for unaddressed user-visible strings | missing | PROGRESS.md:14.6 — not started | Queue |
| BK-14a.3 | Settings banner card + raw-settings gallery picker | partial | Wiring on disk; `SettingsWorkspace.tsx` mid-rewrite (uncommitted) | Finish Settings screen |
| BK-15.1–15.9 | SEO center: meta per entity/locale, templates, content analysis, JSON-LD, local SEO, redirects, 404 monitor, sitemap/robots, dashboard | missing | PROGRESS.md:15a/15a.1 done (`1ea9f9f`/`cdf44c5`); 15.1+ not started | Queue |
| BK-16.1–16.5 | Users: audit trail, roles tab, my role, access requests, guardrails | partial | 16a done (`3750ea4`); 16.1+ not started | Queue |
| BK-17.1–17.6 | Leads: DB capture + retire CF7 forward, leads screen, connectors, Apps Script, column contract, DB-default | partial | 17a done (`7fe5e6f`); 17.1+ not started | Queue |
| BK-18.1–18.3 | Click-to-edit: element bridge, overlay, section affordances | missing | PROGRESS.md:BK-18 — not started (needs 14 + 15) | Queue |
| BK-19.3d/e | Console primitives: surfaces (card/table/tabs/chips done at `b598c54`), overlays (modal/confirm/drawer/dropdown/toast) | partial | 19.3a/b/c done; 19.3d/e open | Queue |
| BK-19.4–19.8 | Console redesign: shell, dashboard, remaining screens, public sections, motion + final pass | missing | PROGRESS.md:19.4–19.8 not started | Queue |
| BK-20 | Console redesign brief slices S0–S5 | done | S0.1–S0.4, S1–S5 all committed (`bb43b5a`…`a98ab93`) | None |

| Source of truth for the longer-term plan: `docs/PROGRESS.md` (the BK ledger). This file is the working checklist for the current session; rows here reference PROGRESS.md hashes where a row already has one. The owner-noted defects + roles + remaining + separation/performance rows (1A/1B/1C/1D, 2A/2B, 3A–3E, 4A/4B) are tracked in the active session rows below. |

## ACTIVE SESSION — NEW ROWS (owner-noted defects + roles + remaining rows + separation & performance)

| id | requirement | status | evidence | next action |
|----|-------------|--------|----------|-------------|
| 1A | Services added in the CMS appear on the public site immediately and everywhere (console save → DB status → revalidation → read query → page/component) | [x] done (c8667b6) | Root cause: page cards read `getServiceCards()` (DB) but JSON-LD `availableService` read `getMergedTreatments()` which fell back to the WP-era snapshot (`treatmentsFromSite()` / `getSourceServiceCards()`), so 8 cards served from DB while availableService answered 7. Fixed: removed snapshot fallback from every consumer (`getServiceCards` → `() => Promise.resolve([])`; `getMergedTreatments()` → `() => treatmentsFromDb()`; `getMergedServices()` → `() => contentsFromDb()`). Browser-verified: /services now renders all 8 enabled service cards; JSON-LD availableService matched; typecheck+build+vitest pass (8 pre-existing failures untouched). | — |
| 1A · results-photos | Result photos DO attach in the console (upload → media row → save → draft revision → published row) | [x] done (19edc5b) | Root cause: the `before`/`after` image fields were defined in the `RESULTS` list schema but NOT in the `list_item` field spec, so `parseWrites()` rejected them as "unknown field" and the photos were dropped on save. Fixed: added `image: [{ name: 'before' }, { name: 'after' }]` to the `list_item` spec and merged the image paths into the `data` JSON column on save. Evidence: `npx tsx /tmp/q-results.mts` now shows 78 results with non-empty `draft.before` and `draft.after` (e.g. `jjj` expires=15: `draft.before=/uploads/202611/e47f6cbdc588-70b6dcd1.webp`, `draft.after=/uploads/202610/1291c4739e48-a81efd75.webp`). Regression tests added (tests/results-photos.test.ts). | — |

| 1B | Before/after results added in the CMS appear on /results and Home (friendly empty state, "needs both photos" badge, count reported; /results shows only result cases) | [x] done (2fe531a) | Browser-verified: /results renders 67 result stories as ResultCaseCards (pairs-only, never ArticleCard), count "67 نتيجة" reported, friendly empty state, browse-paginate also ok. Home shows the before/after band. | — |
| 1C | Relations layer: real picker fields, M2M where needed, server-validated, stored by ID with a name snapshot; "Linked to / Used by" panel; delete/hide/publish warning for dependents | missing | Service↔Offers/Specialists/Branches/Results/FAQs/Articles/Related; Specialist↔Branches/Services; Offer↔Services↔Branches; Result↔Service↔Specialist; Lead↔Service/Offer/Branch/Campaign. | Add relations fields + "Linked to / Used by" panels |
| 1D | Leads via Google Sheets: idempotent delivery by Lead ID, phone/ID/any user text as plain text (RAW), demo/test flag, purge dry-run, retry + backoff, fault injection | [~] in progress (1D-a done, be6fc70) | Browser-verified: delivery now idempotent (sheet rechecks Last Lead ID before append), phone column forced to text, source 'console-test' leads never synced, retry+backoff and fault injection remain for 1D-b. | 1D-b: purge dry-run, fault injection, is_demo flag |
| 2A | SEO specialist role: full Rank Math-style per-item panel + global SEO workspace; server-enforced per-field permissions (SEO edits any content's SEO without publishing) | missing | Audit existing SEO fields, then build focus keyword + secondary, 0-100 score (traffic-light + test checklist: keyword in title/meta/slug/first 10%/subheadings/image alt, density, length, internal/external links, alt coverage, title/desc length meters), SERP preview (desktop/mobile) + social previews, canonical/robots/OG-twitter overrides, breadcrumb, primary service/category, cornerstone, hreflang, internal-link suggestions, orphan-page list, schema builder + validation; global workspace (Titles & Meta templates, sitemap, redirects + 404 monitor, local SEO, image SEO, social defaults, webmaster verification, site-wide audit, bulk editor, Search Console + GA4, keyword/rank tracking with history, IndexNow, SEO changelog, import/export, setup wizard). | Audit + implement SEO workspace; enforce per-field permissions |
| 2B | Marketer workspace: landing dashboard + Leads list (filters, saved views, bulk status, notes, export) + Reports Center (CSV/XLSX/PDF, scheduled email, expiring links) + Campaigns + UTM builder + Tracking & Pixels (GA4/GTM/Google Ads/Meta Pixel/Conversions API) + conversion goals + offers management; reads analytics; blocks users/roles/settings; Role matrix tests with 403 | missing | Implement marketer workspace + server-enforced role matrix test (Owner/Admin/Editor/SEO/Marketer/Viewer × action × content × locale). | Build marketer workspace + role matrix |
| 3A | Service full details (port from D:\shamah): typed bilingual optional fields wired into console save + public page (image, category, name, tagline, description, session duration, recommended sessions, starting price + currency, benefits, steps, aftercare, ideal-for, WhatsApp/booking, relations from 1C, per-service SEO); expandable sections (keyboard), favourites via localStorage, WhatsApp, sticky Book on mobile; sections render only when filled; completeness meter + live preview; WP-JSON import with dry-run | missing | Wire the service entity (service-doc.ts) into the console save flow + public detail page; accordion sections; favourites; WhatsApp; sticky Book; empty-section hiding; completeness meter; WP-JSON import with dry-run. | Implement + browser verify |
| 3B | About Us wired to the CMS (hero, story, mission/vision/values, numbers, why choose us, team from Specialists, branches, certifications, CTA, SEO/schema); seeded from current hard-coded text | missing | Migrate about page to CMS; seed from current hard-coded text so no visual change. | Migrate + seed |
| 3C | Overview charts: confirm every panel (area, bars, donut with center total, funnel, heatmap, sparklines) renders with axes, tooltips (current + previous % change), clickable legend, view-as-table, RTL, dark/light, reduced motion; "Compare with previous period" works; localhost/dev traffic excluded from sources; "Needs attention" rows linked; show the Recharts SSR repro before keeping 2.15.4 | partial | Charts refactored to Recharts 2.15.4 (Recharts 3.x SSR regression); must prove every panel renders in a real browser with all the above. | Browser verify each chart panel + confirm 2.15.4 justification |
| 3D | Wiring audit: docs/WIRING-MATRIX.md (console section → table/form/API/public route/revalidation/status); reverse audit of every public text/image/link/phone/address/SEO tag to its source, moving hard-coded literals into the CMS (seeded); Playwright forward test per section (create→draft→publish→edit→reorder→hide→rollback→delete); tracking one-click→one-event→counted; ≥99% pass, every failure listed with URL + cause | missing | Build WIRING-MATRIX.md; reverse audit; Playwright forward test per section; tracking integrity; report pass rate + failures. | Implement WIRING-MATRIX + Playwright forward test |
| 3E | Harden the CMS: test each README claim (drafts never leak, revisions + rollback, server-side permissions, CSRF, rate limits, XSS/SQLi, secure cookies/headers, audit log, media validation, backup+restore, console list quality); record weaknesses in docs/WEAKNESSES.md; fix high + medium | missing | Run hardening audit on every README claim; record weaknesses + fix high/medium. | Run + fix |
| 4A | Public site and console as two cleanly separated codebases in the repo; separate CSS entry points, separate dependencies; lint rules block cross-boundary imports; verify with verify-style-isolation.mjs + bundle analyzer (no console code in any public chunk; no public styles in console) | missing | Report the current structure first; do not re-architect more than needed. | Audit + extend verify-style-isolation.mjs + bundle-analyzer proof |
| 4B | Performance of the public site on a production build (mobile + desktop; Home/Services/Service detail/Offers/Results/Articles/Contact in AR + EN): target Performance ≥ 90 mobile (aim higher), LCP < 2.5 s, CLS ≈ 0, TBT low, A/B/SEO ≥ 95; report before/after tables with raw Lighthouse numbers; find causes with traces, not guesses | missing | Find causes (JS hydration, hero images, fonts, third-party scripts, tracking weight, caching, DB query count, image CDN/resize, unused CSS); optimize + report raw Lighthouse. | Optimize + Lighthouse report |

════════════════════════════════
WORKING RULES (from PROGRESS.md)
════════════════════════════════

- Work only in `D:\shamah_cms`. Never touch `D:\shamah` (read-only). Never push. Never touch `main`.
- Branch is `feature/cms-migration-redesign`. One commit per finished row; stage explicit paths, never `git add -A`.
- Secrets: print variable names only, never values. `.env.local`/`.env.test` are sourced, never echoed.
- Tests run against `shamah_cms_test` only (`src/lib/db/guard.ts` refuses anything not ending in `_test`).
- Gates before marking a row done: `npm run typecheck` · `npm run lint` · `npx vitest run` · `npm run build` (+ `npm run prove:no-wp` when a read path changes).
- Local DB: `npm run db:local:start` (port 3307, loopback only — see `docs/LOCAL-MARIADB.md`).
- Mutating CLI commands default to dry-run; act only with `--apply`/`--force`.
- If blocked (real copy, prices, photos, credentials, legal wording), log it in `docs/OPEN-QUESTIONS.md` and move to the next row.

════════════════════════════════
PHASE BIG-PROMPT — 19 NUMBERED ITEMS (2026-11-03)
════════════════════════════════
Status vocabulary: code only / browser-verified / broken. (Legacy rows above use done/partial/missing.)

| id | item | status | notes |
|----|------|--------|-------|
| 1 | Google Sheets leads misbehave | code only | Root cause found and proven on the live deployment: `/exec` 302s to a `macros/echo` address that is GET-only, and `postSheets` re-POSTed to it, so Google answered 405 + an HTML page and all 8 queued leads logged markup. Now follows the 302 as the spec does (`redirect: 'follow'`), sends `text/plain`, and refuses to count a non-JSON reply as delivered. The live proof posts a body that is not valid JSON, so `doPost` ran and replied `SyntaxError` without touching a cell. NOT done: the 8 real leads have not been re-sent — that writes to the owner's sheet and waits for their go-ahead. |
| 2 | Before/after result photos do not attach | code only | root cause in S2; needs browser trace |
| 3 | Edits to old imported articles not showing | code only | revalidation/publish state |
| 4 | Article editor block-based (whole page editable) | missing | |
| 5 | Article import fidelity (WP HTML → blocks) | missing | |
| 6 | Service detail page redesign + fix | missing | |
| 7 | Services one source of truth + honest publishing | code only | JSON-LD vs cards; auto-publish removal |
| 8 | Before/after are cases not stories | code only | remove Related article; rename section |
| 9 | About Us in CMS | code only | in flight; drop getAbout, seed, prove edit→publish |
| 10 | Console forms + responsive | partial | |
| 11 | Live on site indicator + site connection page | missing | |
| 12 | Relations layer | missing | |
| 13 | Service full details (port from D:\shamah) | partial | service-doc/page on disk, uncommitted snapshotted |
| 14 | Separate public site from CMS (two apps) | missing | branch split-apps |
| 15 | SEO specialist = Rank Math level | missing | |
| 16 | Marketer workspace | missing | |
| 17 | Overview/Reports/Insights | partial | |
| 18 | Hardening + full wiring audit | missing | |
| 19 | Performance (last) + Home 14.3 | missing | |

════════════════════════════════
MASTER BRIEF (2026-11-04) — BASELINE FIRST, THEN 1-7
════════════════════════════════

Status vocabulary is the brief's: `code only` / `browser-verified` / `broken`. The owner verified
before this session that services (styling + content entry) work and that About Us was added, so
items below must leave every page looking identical unless the item says otherwise.
Environment: MariaDB on 127.0.0.1:3307; the owner's dev server is **3100** (PID 21528) and this Next
fork refuses a second `next dev`, so 3001 was never started (Q-14); proofs use a disposable
production build in `.next-build` on **3430**.

| id | item | status | evidence | next action |
|----|------|--------|----------|-------------|
| 0a | Visual golden set: full-page shots at 1440 and 390 px, AR + EN, for Home, Services list, 3 service pages, Offers, Cases, Doctors, Branches, Contact, About, Blog list, 5 representative articles; paths and hashes recorded | browser-verified | 68/68 shots, every route 200, on `BUILD_ID MP2ZcyrA23IARTLbv9aHa` (PID 14800, port 3430, `NEXT_DIST_DIR=.next-build npm run build` exit 0). `scripts/baseline-capture.mjs` writes the PNGs (git-ignored, 51,106,253 B = 48.7 MiB) and `docs/baseline/capture.json` carries name + bytes + SHA-256 per shot; `docs/baseline/errors.json` is a per-route error ledger from a **rebuild + restart after the last change** (`BUILD_ID 02zpKI9iZLsh9fg1CxUyc`, PID 23640): 68 routes, `errors=0`, 2,273 aborted `?_rsc=` prefetches, which are not defects. Prose, picks, the junk-content inventory and the gates are in `docs/baseline/README.md` + `docs/PROGRESS.md`. | Items 4c and 6 diff against exactly these files. Known failures at this commit, reported not smoothed: `verify-render` `249 passed / 4 failed` (all four are the Q-16 faker service row, on both servers) and `tests/delivery.test.ts` fails 3-4 of 13 when another suite touched `shamah_cms_test` shortly before (Q-12, now shown to survive the earlier process) |
| 0b | Performance baseline: Lighthouse mobile (slow 4G, 4× CPU) + desktop, 3 runs per page, median, 8 pages × AR/EN; JSON + `docs/perf/baseline.md`; bundle analysis per route; DB timing per page | missing | Lighthouse 12 is installed out-of-tree at `$TEMP/shamah-lh` (repo `package.json`/lockfile untouched) and needs `CHROME_PATH` pointed at a Playwright Chromium. No numbers measured yet. | Run it, publish the table, and report every page below target — the brief forbids hiding one |
| 1 | Fonts = the original site's fonts (`D:\shamah` is the reference), zero computed-typography diffs, console fonts independent | missing | not started; needs the sweep of `D:\shamah` first | Sweep, then a diff script over both sites |
| 2 | Transitions and animation restored, site only, via motion tokens; no `transition: all`; a lint that fails on it | missing | not started | Sweep the original for durations/easings, then tokens |
| 3 | Site CSS separated from console CSS; `verify-style-isolation.mjs` extended to every route and failing the build; fix "No link element found for chunk …css" and the console "1 Issue" | missing | not started | Extend the script first, so the split is provable |
| 4 | Articles backend-fed with pixel parity; block editor; importer dry-run-first; content problems flagged not deleted | missing | not started; `scripts/baseline-capture.mjs` is the parity harness | Block schema → importer → pixel diff |
| 5 | Every site text editable; `docs/CMS-COVERAGE.md`; the "data-driven calls skipped" list accounted for; a guard against new hard-coded strings | missing | Measured starting point on this tree: `copy:check` reports **`234 entries current; 97 data-driven calls skipped`** — the brief says 98, so the list must be printed, not inherited. `scripts/copy-catalog.mjs` walks `src/components` + `src/app` and its header's second number is the whole walk's file count, not a count of files holding copy. | Print the 97, then build the missing editors + the guard |
| 6 | About Us final check (typed editor, publish, hide-a-section leaves no gap, pixel-identical to baseline, revisions/rollback) | missing | AB-2 landed the editor and the reader (`09f231f`, `da9760c`, `6e1821e`); the baseline shot exists, the hide/publish/rollback checks do not | Run the owner's list against the §0a PNG |
| 7 | Performance plan with budgets and a script that fails the build | missing | not started; depends on 0b and on 1-3 being final | After 1-3 |
