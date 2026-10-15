# PROGRESS — Payload CMS migration

Resume protocol (do this first, every time):
1. Read `docs/PAYLOAD-PLAN.md` (the brief), then this file, then
   `git log --oneline -20`.
2. Continue from the first row not marked `done`. Do not redo `done` rows.
3. Never touch `main`; commit only to `payload-migration`. Stage explicit paths,
   never `git add -A`. Never commit `.env.local` or secrets.
4. Env for every command: `TEMP=/d/tmp TMP=/d/tmp
   PLAYWRIGHT_BROWSERS_PATH=/d/playwright-browsers npm_config_cache=/d/npm-cache`;
   CLIs from `/d/tools/node_modules/.bin`. Never use port 3000.
5. Do NOT run `payload migrate` or the seed on Neon `main` — only on branch
   `payload-dev`. `.env.local` points at `payload-dev`.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (last commit hash on the row).

## Phase 0 — design-first content map
- [x] 0.1 Cloud resources created + tested (Neon shamah-cms, Blob shamah-media,
      Vercel env vars, password rotation) — `bab28af`
- [x] 0.2 Write `docs/PAYLOAD-PLAN.md` + this `docs/PROGRESS.md`; archive old
      progress as `docs/PROGRESS-site.md`; confirm on `payload-migration` — `<pending>`
- [ ] 0.3 Read current Payload docs; verify Payload ↔ Next 16.3.6 compatibility
- [ ] 0.4 Read repo docs (WIRING, inventory, RESULTS-SOURCE, HOME-PRIORITY,
      STATIC-SWEEP, UNVERIFIED-FACTS, api), git log, lib/wp, src/data, pages,
      components, /api/v1, scripts
- [ ] 0.5 Recover removed/hidden sections from git history (do NOT restore the 4
      "why Shamah" differentiators)
- [ ] 0.6 Write `docs/DESIGN-CONTENT-MAP.md` (page→section→field→CMS home,
      required/optional, localized, empty behaviour)

## Phase 1 — install + data model
- [ ] 1.1 Set Vercel function region `fra1` via `vercel.json` (`"regions":["fra1"]`)
- [ ] 1.2 Create Neon branch `payload-dev`; repoint `.env.local` pooled+direct to it
- [ ] 1.3 Install payload + @payloadcms/db-postgres + richtext-lexical +
      storage-vercel-blob + sharp; admin at `/admin`
- [ ] 1.4 Middleware/sitemap/hreflang/lang routing exclude `/admin`+Payload routes;
      robots disallow `/admin`
- [ ] 1.5 Localization ar(default,rtl)+en per field; data-layer-only fallback
- [ ] 1.6 Auth: admin/editor roles, no public signup, lockout, strong pw, secure
      cookies, GraphQL off, REST published-read-only
- [ ] 1.7 Drafts + versions + autosave on content collections
- [ ] 1.8 Media: localized alt, focal point, sharp WebP, presets 1600/1400/800/400,
      8 MB cap, random suffix
- [ ] 1.9 Collections + globals from content map (posts, categories, offers,
      services, specialists, results, faqs, branches, pages, media; siteSettings,
      homeContent, homeLayout)
- [ ] 1.10 Pinning (featured+order → ≤3 on Home) + afterChange/afterDelete
      revalidate both langs
- [ ] 1.11 SITE URL: single-source NEXT_PUBLIC_SITE_URL everywhere; build guard when
      missing; curl verify no www.shamahclinics.com in canonical/og
- [ ] 1.12 Measure public JS bundle size before/after admin (must not grow)

## Phase 2 — seed (on payload-dev)
- [ ] 2.1 `scripts/seed-cms.ts` idempotent upsert by slug + `seedSource` field
- [ ] 2.2 wordpress→published (92 posts+cats, 4 products w/ images, 7 services from
      page 696, branches, about, hero + chosen images)
- [ ] 2.3 confirmed→published (phone/WhatsApp, branch data matching live site)
- [ ] 2.4 authored-unverified→DRAFT only (specialists, results, FAQ, treatment
      details, extra services, offer terms, privacy, AR branch names, email/hours)
- [ ] 2.5 seed table (collection|lang|published|draft) + `docs/CMS.md` "Needs real
      content"

## Phase 3 — data layer swap + restored sections
- [ ] 3.1 `lib/cms` mirrors `lib/wp` getters/types/pagination via Local API;
      Lexical→sanitized HTML; published-only
- [ ] 3.2 Switch importers to `lib/cms`; delete static content files + dead code
      (keep nav.ts); `/api/v1` contract preserved
- [ ] 3.3 Restore designed sections driven by CMS + homeLayout; hidden when empty;
      Home renders as today with near-empty content
- [ ] 3.4 `scripts/export-cms.ts` → `data/cms-snapshot.json`; DB-unreachable fallback
      + log line; build never hangs
- [ ] 3.5 Archive `lib/wp`/`data/wp`; deprecate `sync:wp` (document)
- [ ] 3.6 sitemap/JSON-LD/hreflang/canonical/metadata/pagination/load-more/lang
      switcher work from new data (no empty JSON-LD fields)

## Phase 4 — dashboard experience
- [ ] 4.1 Admin foundation: RTL AR (EN avail), local Tajawal, Shamah logo/icon,
      gold/ivory CSS-var theme light+dark, spacing/radii/borders, icon family,
      ≥4.5:1, fill missing AR strings
- [ ] 4.2 Sidebar groups + AR labels + draft badges, collapsible/drawer
- [ ] 4.3 Top bar: search, lang switch, "إضافة جديد" dropdown, "عرض الموقع", user menu
- [ ] 4.4 Custom Dashboard view (greeting, setup checklist from real data, stat
      cards, quick actions, needs-review, recent edits, help card; no fake analytics)
- [ ] 4.5 List screens: status pills, translation badges, row actions, filters,
      bulk publish, drag-reorder, icon empty states, table→cards on mobile
- [ ] 4.6 Edit screens: sticky action bar, side panel, tabs (SEO collapsed),
      dropzone+focal, drag repeatables, AR hints/validation, confirms, toasts
- [ ] 4.7 First-login 3-step welcome (per user, dismissible)
- [ ] 4.8 Login screen (logo, AR welcome, clinic photo, errors, forgot-password)
- [ ] 4.9 `docs/ADMIN-GUIDE-AR.md` + rendered as in-admin help page

## Phase 5 — verify
- [ ] 5.1 lint / typecheck / build clean
- [ ] 5.2 update verify-render.mjs + test-missing-fields.mjs; AR+EN HTML diff = none
- [ ] 5.3 prove publish/unpublish doctor → appears/vanishes both langs; anon cannot
      read drafts; bundle sizes not grown; Lighthouse mobile no regression
- [ ] 5.4 admin checks AR/EN, light/dark, 1440+390, keyboard, contrast; screenshots
      in docs/screenshots/admin/
- [ ] 5.5 `docs/CMS.md` full (collections, page reads, env vars, Vercel deploy,
      first admin, seed+export, payload-dev→production procedure, Payload limits)
- [ ] 5.6 `docs/CMS.md` "Hardening before launch" (restore Sensitive type in
      Production+Preview + exact commands)
- [ ] 5.7 Final report (resources, seed table, hidden sections, render diff, bundle
      sizes, screenshots, limits, injection-tool list, unverified items)

## Known gaps / notes
- `docs/IMAGES.md` and `docs/SEO-SOURCE.md` referenced by the brief do not exist.
- Vercel stored DATABASE_URI/_DIRECT/PAYLOAD_SECRET as Sensitive (write-only) by
  default; re-added as Config so `vercel env pull` works. Phase 5 re-hardens to
  Sensitive for Production+Preview.
