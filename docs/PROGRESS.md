# PROGRESS — Shamah backend + console (BK plan)

The brief, from the owner (2026-10-22):

> اعمل باك اند للموقع بتاع شامه حتي لو ب nodejs عشان ميبقاش الاعتماد علي ووردبريس خالص محتاج اشيله
> واعمل داش بورد تكون ثيرد بارتي اضيف من المحتوي للموقع والماركتينج يتابع حاجته من عليها + ال SEO كذلك
>
> Build a backend for the Shamah site (Node.js is fine) so there is **no dependency on WordPress at all** —
> it is being removed. Add a dashboard that is neither paid nor free-SaaS ("من صنعي أنا"), that carries
> site-wide statistics like WordPress did, and that holds everything the site feeds that nobody currently
> sees — **leads, configurations**. Marketing must be able to work from it. SEO too.

Decisions already taken, do not re-open them: the console is this repo at its own path with its own layout
(no site header); the database is MySQL/MariaDB because cPanel hosts it; content is imported locally now and
loaded into the console once it exists; `D:\shamah` is left alone.

## Resume protocol (do this first, every time)
1. Read this file, then `git log --oneline -20`. Continue at the first unchecked row; never redo a `[x]` row.
2. Work only in `D:\shamah_cms`. Since BK-19 the working branch is `feature/cms-migration-redesign` (created from
   `cms-clean` HEAD at `3d40693`; `cms-clean` stays as the pre-design line). **Never push. Never touch `main`. Never
   touch `D:\shamah`** (the live site, and another session's `admin-restore` branch lives there too). The brief of
   2026-10-23 asks for a GitHub push in its Phase 7; that is the one instruction in it this plan does **not** run
   without the owner's word — see 19.0.
3. Stage explicit paths — never `git add -A`. One commit per finished row, hash on the row.
4. Secrets: print variable **names** only, never values. `.env.local` / `.env.test` are sourced, never echoed.
5. `data/wp/*.json` and `public/wp/*` are the frozen WordPress backup (92 articles, 4 offers, 56 result
   stories). They are read-only and **never deleted**. BK-7.2 imports the content kinds out of them; they stay the
   site's fallback rung — `result-stories.json` membership, `seo.json` and `offer-categories` are still read
   directly, which is row 7.5, not 7.3 (7.3 removed the live origin, which is what the dependency actually was).
   `npm run sync:wp` writes a fresh dump to `data/wp-<timestamp>/` and refuses `data/wp/` unless `--overwrite-frozen`
   is passed (7.1); those dump folders are gitignored — read them, do not commit or delete them.
6. Mutating CLI commands default to dry-run; they only act with `--apply`/`--force`.
7. Tests run against `shamah_cms_test` only — `src/lib/db/guard.ts` refuses anything not ending in `_test`.

## Gates (all four must be green before a row is marked done)
`npm run typecheck` · `npm run lint` · `npx vitest run` · `npm run build`
`npm run doctor` says whether the machine is ready. Local DB: start with `npm run db:local:start`
(port 3307, loopback only — see `docs/LOCAL-MARIADB.md`).
`npm run prove:no-wp` is the BK-7 gate on top of those four: it starts the built server with a fetch guard and crawls
every public route, and must be re-run whenever a read path changes.

`npm run build` needs **no outbound network**. It used to: `next/font/google` fetched Montserrat and Readex Pro at
compile time and, with no DNS, failed with `getaddrinfo ENOTFOUND fonts.googleapis.com` — that was the environment,
not the code (BK-0.2 recorded the failure). BK-19.2 self-hosted four Tajawal weights under `src/lib/fonts/`, so the
build is offline-clean and `src/lib/fonts.ts` no longer exists.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done (commit hash on the row).

## BK-0 — clean room
- [x] 0.1 New tree from the last clean site commit (`e3c19e3`), branch `cms-clean`, deps installed,
      `D:\shamah` verified untouched
- [x] 0.2 Baseline gate: `lint`, `typecheck`, `vitest` and `next build` are green. `next build` once failed at
      page-data for two separate reasons: `NEXT_PUBLIC_SITE_URL` was unset (fixed — `.env.example` now
      documents it) and, while this shell had no DNS, `next/font/google` could not reach the font CDN.
      With network back it builds clean — BK-3's commit `08b790e` ran the full gate set.
- [x] 0.3 This ledger; the dead Payload ledger archived as `docs/PROGRESS-payload-archived.md`

## BK-1 — the database that will actually be deployed
- [x] 1.1 Portable MariaDB 11.4.13 on `D:\mariadb`, loopback 127.0.0.1:3307, `my.ini` + start/stop scripts — `a1afdd9`
- [x] 1.2 `npm run db:local:provision` creates `shamah_cms` + `shamah_cms_test`, one app user per database,
      and writes `.env.local` / `.env.test` (names printed, values never) — `a1afdd9`

## BK-2 — schema, migrations, typed access
- [x] 2.1 Six migrations, 39 tables: auth, content, SEO, leads, publish, stats — `a1afdd9`
- [x] 2.2 Checksummed migration runner, dry-run by default, refuses an edited applied file — `a1afdd9`
- [x] 2.3 Kysely types for all 39 tables; `MysqlDialect` on the callback `mysql2` pool (the promise pool
      never resolves — see the note in `src/lib/db/index.ts`) — `a1afdd9`
- [x] 2.4 `Json`/`JsonOr` column types + `json()`: MariaDB JSON is LONGTEXT with a `json_valid()` check, so a
      raw object arrives as `key = 'value'` SQL text and dies on the constraint. Writes are strings, reads are values — `a1afdd9`
- [x] 2.5 `src/lib/db/schema.test.ts` — 8 tests, including a drift check that compares every column and every
      SQL default against `types.ts` — `a1afdd9`
- [x] 2.6 `npm run doctor` — env names, connectivity, migration state, checksums, content counts — `a1afdd9`

## BK-3 — auth core
- [x] 3.1 bcryptjs cost 12 with a real decoy hash, so an unknown address and a wrong password cost the same and
      the answer never says which half was wrong; passwords over bcrypt's 72-byte truncation point are refused
      by policy. Opaque 32-byte session tokens — only the SHA-256 hex is stored, the raw one exists in the
      cookie alone — sliding 14-day expiry, 5-minute `last_seen` throttle, renewal under 2 days. — `08b790e`
- [x] 3.2 httpOnly + SameSite=Lax session cookie (Secure wherever the request is https, which `cookiesRequireSecure`
      decides from the request URL so cPanel's proxy terminates TLS correctly), readable CSRF cookie, per-session
      CSRF token, and two login budgets per 15-minute window (8 per email, 25 per IP) via `login_attempts` — `08b790e`
- [x] 3.3 `guard()` is the one enforcement path: `authenticate()` → csrf → `can(resource, action, scope)` →
      must-change-password → zod → execute → one audit row. Permission before body parsing, so an unauthorized
      caller gets 403 and learns nothing about the payload. Proven by `tests/auth.test.ts`. — `08b790e`
- [x] 3.4 `npm run owner:create` / `npm run owner:reset`: dry-run until `--apply`, the password comes from a
      muted raw-mode prompt or `--password-stdin` and is never a CLI argument, and only variable names are
      printed. `owner:create` grants the Owner role and writes a `cli:owner:*` audit row. — `08b790e`

## BK-4 — roles
- [x] 4.1 Seed Owner / Admin / Editor / SEO / Marketer / Viewer with `role_permissions` scopes — `798511d`
      `src/lib/auth/roles.ts` is the single catalog (6 roles, 102 grants in the dev database);
      `npm run db:seed` syncs it, dry-run first, and a second `--apply` changes nothing.
      Two rules that cost a redesign:
      - **A scope belongs on a write, not a read.** `can()` refuses when the request does not name every
        dimension a grant mentions, so an Editor with `{locales:['ar']}` would 403 on a list that spans both
        languages for the wrong reason. Reads are seeded unscoped and filter in the query; `locales`, `lists`,
        `pages` and `leadSources` are exercised on writes.
      - **Seed before you create an account.** `owner:create` ran first against a role that existed with zero
        `role_permissions` rows and produced an account that could log in and do nothing. It now calls
        `syncRoles()` before `createUser()`, and `npm run doctor` prints each catalog role with its grant count
        so an unseeded role is visible without logging in.
      Account writes (`user.*`) are Owner-only by design — Admin edits content, not people.
- [x] 4.2 Lead field redaction by role (phone/email hidden from Viewer, etc.) — `798511d`
      `src/lib/auth/redaction.ts`: a lead's `name/phone/email/message/fields` are visible only when the caller
      holds `lead.update` **or** `lead.export` for that lead's source; otherwise they are blanked and
      `contact_hidden: true` says why. **BK-17 must route every lead surface through `redactLead()`** — table,
      detail panel, CSV and the Sheets outbox — and must always write a non-empty `leads.source`
      (`VARCHAR(64)`, default `contact-form`): an empty source matches no scoped grant, so those leads are
      redacted for everyone except a globally-granted role.
- [x] 4.3 Test: every write endpoint answers **403, not 400**, when the caller lacks the permission — i.e.
      permission is checked before the body is parsed — `798511d`
      `tests/roles.test.ts` (60 tests) drives the guard over all 75 resource x unsafe-action write routes for
      every catalog role, with a 400 control as Admin, and proves the redaction counts per role. The scan also
      fails if a future route file skips `guard()`, excepting only the pre-auth login routes.
- [x] 4.4 Test hygiene, found by using the database: `schema.test.ts` leaked its fixture rows (12 stale users,
      10 stale lists had piled up) and `auth.test.ts` left one `login_attempts` row per run. Both now delete
      exactly the ids they created; a suite run leaves every table in `shamah_cms_test` at 0 rows. — `2c541ca`

## BK-5 — the console at its own path
- [x] 5.1 `/console/**` with its own root layout — the site header, footer and providers must not appear — `6034d97`
      `src/app/console/layout.tsx` is a **second root layout** sitting beside `src/app/[lang]/layout.tsx`. The
      question that blocked this row ("does Next 16 allow two roots?") is answered by the build, not by docs: it
      compiles and serves both trees. No route group was needed. The layout is `index: false` and sets
      `data-surface="console"`; `tests/console.test.ts` fails if any file under `src/app/console` or
      `src/components/console` mentions `SiteShell`, `components/layout`, `SiteHeader` or `SiteFooter`.
- [x] 5.2 Exclude `console` from the `[lang]` rewrite in `src/proxy.ts` (Next 16 renamed `middleware` to `proxy`;
      the current matcher would otherwise send `/console` to `/ar/console`) — `2093718`
      The rule moved out of the proxy into `src/lib/site-routing.ts` (`CONSOLE_PREFIX`, `isConsolePath`,
      `decideRoute`) so it is testable without Next's middleware types: `decideRoute('/console/blogs/x')` →
      `{ lang: null, rewriteTo: null }` while `/blogs` → `{ lang: 'ar', rewriteTo: '/ar/blogs' }`. `src/proxy.ts`
      sets `x-shamah-lang` only when `lang` is non-null and rewrites only when `rewriteTo` is set; the matcher is
      unchanged. Site routes re-checked after the change: `/`, `/blogs`, `/ar/blogs`, `/en/blogs`, `/offers` all 200.
- [x] 5.3 Login, shell, and AR + EN with RTL, light + dark — `6034d97`, audit fix in `b8b4430`
      `src/lib/console/screens.ts` is the nav registry; `src/lib/console/prefs.ts` resolves locale + theme with
      precedence **account → `shamah_console_prefs` cookie → `Accept-Language` → `ar`/`light`**, and the layout
      writes `dir`/`data-theme` on the server — no flash, no `localStorage`, so it works with JS off. Login,
      forced-password and sign-out are exercised over real HTTP in `tests/console.test.ts` (14 tests) and in the
      browser at 360 and 1000 px, AR-RTL and EN-LTR, light and dark.
      **BK-6 rule:** a new screen must be added to `CONSOLE_SCREENS` *and* have a page file — the test compares
      the two sets, so an unregistered page or a dead nav link fails the suite.

## BK-6 — content CRUD + publish
- [x] 6.1 Articles, offers, pages, lists (specialists, branches, FAQ, treatments, results, nav), settings — `c68eb9d`
      `src/lib/content/{kinds,store,api,lists,settings}.ts` hold the whole store and the guarded handlers — no Next
      imports — so `src/app/api/console/content/**` and `/api/console/settings/**` stay one-line route files and the
      handlers run under vitest against the real database. Five screens (`articles, offers, pages, lists, settings`)
      are registered in `CONSOLE_SCREENS` and share one `ContentWorkspace`; screen data comes from
      `src/lib/console/content-screen.ts`, which computes the per-scope abilities server-side because a grant scope
      (`{locales:…}` / `{lists:…}`) only means something once the request names the dimension. `tests/content.test.ts`
      adds 24 tests (suite 132).
      Three defects only the browser found, all fixed: the list-switcher tabs rendered inside the "a row is selected"
      branch, so **a list with no rows was unreachable**; a `list_item` owns no title columns, so **every row printed
      its slug** — `firstText()` now reads `name`/`title`/`question` out of the JSON document, in either locale; and
      an Arabic console labelled the seven lists in English — tab labels come from `LIST_LABELS[key][locale]`.
- [x] 6.2 Draft → publish in one transaction (`pub_*` twins copy, a revision is written, rollback works) — `c68eb9d`
      `src/lib/content/publish.ts`: one transaction reads the row, copies every named locale's `draft → pub_*` pair,
      moves `status`/`published_at`/`version` under an optimistic lock, and inserts the whole after-image into
      `revisions`. Rollback rewrites **only** the published twins from a chosen revision and adds a new revision, so
      it never clobbers the draft somebody is mid-way through writing. A publish asks for the locales it may copy and
      the handler re-checks the grants — an Arabic-only editor cannot publish the English they cannot write.
      **MariaDB trap:** a publish copies a JSON column's value straight out of the row, and `mysql2` hands it back
      *already parsed*; writing that object back unencoded produced `key = 'value', …` SQL text, which the column's
      `json_valid()` check rejects. `columnValue()` re-encodes any non-string with `json()` — the same rule the draft
      writer follows, now stated once per module.
      **Behaviour trap worth knowing:** a publish with nothing pending still succeeds — it writes a revision and bumps
      `version`. That is deliberate (the history should show that the editor pressed it), but it means a save that
      failed *after* a publish leaves you holding a stale version, and the next write answers `409 stale_row`.
- [x] 6.3a ONE read path for the articles, offers and pages: the database first, the baked `data/wp` snapshot as fallback — `2441210`
      `src/lib/content/site.ts` is now the site's only public reader — 18 call sites changed their import line and
      nothing else, because each function keeps the name, arguments and returned shape of the `../wp` reader it
      replaces. `src/lib/content/published.ts` reads the published twins (`publicRows` / `publicRow` / `hasPublished`).
      **The design decision that mattered:** the rung is chosen **per kind, never per row**. A per-query fallback
      would have served the snapshot's copy of a slug the console deleted — stale content wearing a live URL. So
      `hasPublished(kind)` answers once and, on the database side, a missing row is a genuine 404.
      A DB error is treated exactly like an empty DB, which is what keeps `next build` working without
      `DATABASE_URL`; each answer is logged once per kind (`[site] db article` / `[site] snapshot offer (nothing published)`).
      `id` stays a number because the UI contracts were built on WordPress post ids: an imported row keeps its
      `legacy_id`, a console-created row gets a negative one, so no API consumer can mistake one for a post.
      SEO comes from the row's own published copy (`publicSeo`), never from `resolveSeo`'s live WordPress `<head>` read,
      and published bodies pass through the same `sanitizeHtmlBody` the WordPress body did — two screens render them
      with `dangerouslySetInnerHTML`.
      `getHome` and `getPageTitle` moved here and are **deleted** from `lib/wp`: left there, the homepage would render
      the snapshot journal while `/blogs` renders the database, and the two rungs of one page must not disagree.
      `tests/site.test.ts` (9 cases) proves both rungs against the disposable DB: the fallback equals `lib/wp`
      slug-for-slug; one published row takes the kind over and the snapshot stays untouched; a draft, an unpublished
      edit, a disabled offer/page and a trashed row never reach a visitor; trashing the last row hands the kind back
      to the snapshot; `<script>alert(1)</script>` in an authored body does not survive; the Arabic-title rule and
      the canonical prefixes hold.
      **Test-infrastructure traps:** the seam's fallback imports `lib/wp`, which uses the app's `@/*` aliases, so
      `vitest.config.ts` now resolves `@` → `src` (the other suites never reached aliased code). And a suite that
      reads the fallback rung must not reach the production site — `tests/setup-env.ts` points `WP_BASE_URL` at a
      dead loopback so the snapshot, the frozen thing under test, is what answers.
      **Behaviour trap worth knowing:** publishing a locale publishes *everything* pending in that locale. The case
      that tags an article's category has to rewrite the English title too, or the retitle a previous case left
      deliberately unpublished rides into the published copy — correct behaviour, easy to misread as a bug.
- [x] 6.3b the same door for the `branches` and `services` lists — `22e340b`
      A list item is one JSON document per row, so its shape belongs to the reader, not to a column per field:
      `docBi`/`docStrings` accept the `{ar,en}` form an editor writes *and* a single string meant for both locales,
      a missing value falls back instead of throwing, and a row with nothing nameable in it is skipped rather than
      rendered as an empty card. A branch's photo takes the URL the editor pastes through `toPhotoSlot`, so the rest
      of the slot comes from the site's defaults. The `uid` *is* the branch id the routes already use.
      **The rung is now chosen per list, not per kind** (`listRung(listKey, …)`): the branches can be database-backed
      while the services still come from the snapshot, because "has this been published yet?" is a question about one
      list, and `hasPublished('list_item', { listKey })` is scoped to it. Asserted both ways: trashing one service
      keeps the services on the DB rung, trashing the last one hands that list back while the branches stay put.
      `lib/wp/about`, `treatments` and `result-stories` were rewired to the seam as well — they are *derived* readers
      (a page plus its service cards, an article plus its result phrases), and reading their inputs from `./index`
      would have paired database content with snapshot content on one screen. `getHome`'s office blocks come from the
      seam too; its settings are the last WordPress read on that page.
      4 more cases in `tests/site.test.ts` (13 total; suite 145 tests / 6 files), typecheck, lint and a clean
      `next build` (272/272 pages) — with zero content rows in the dev DB the site still renders exactly what it
      rendered before the seam.
- [ ] 6.3c the rest of the read path: `getSettings` (a `siteConfig` + WP aggregate, not content),
      `getHeroPhotos`/`getHomeIntro`/`getHomeProseSections` (all parsed out of one WordPress page body, no list key
      of their own), `getOfferCategories` (**blocked**: the `categories` table has no taxonomy column, so post and
      product categories would collide), and the `nav`/`specialists`/`faq`/`results`/`treatments` lists, which have
      console screens but no public reader yet — each needs one before it can be moved, not invented here.
      Four separate moves, so four sub-rows: 6.3c-a settings, 6.3c-b the home prose, then the two that are not
      readers at all (6.3c-c a schema decision, 6.3c-d prop plumbing).
      **Where it stands:** 6.3c-a and 6.3c-b are done, so every reader the site *renders* goes through
      `lib/content/site.ts`. The two open sub-rows are open for reasons a row cannot fix: 6.3c-c waits on a schema
      decision about taxonomies, and 6.3c-d waits on BK-14 passing list values down as props. Neither reads live
      WordPress, so `prove:no-wp` stays green with them open.
- [x] 6.3c-a `getSettings` — `bcb84e2` (the reader) · `050a78f` (the same double-parse on the console side)
      It was never a WordPress read: an aggregate of `siteConfig` plus two counts, so it now lives on the site's own
      read path (`lib/content/site.ts`), where six of its fields can come from the `settings` table. The fallback is
      **per key**, the opposite of the content rungs: a site that saved a phone number still takes its hours from the
      config file, because a setting has no draft twin and no version of record — half-filling the group is a normal
      state, not a broken one. Two kinds of row a public reader must not take: a blank value (the editor cleared the
      field, so the authored word returns) and an `is_secret` row (the console will not show those values over the
      operator's shoulder, and `/api/v1/settings` answers to anyone).
      Moving it found the defect it was carrying. The driver hands back a **parsed** JSON scalar, so re-parsing a
      digits-only value turned `'20555000111'` into the number `20555000111` and the field silently kept the config
      value instead of the operator's edit — `asWord` decodes only a quoted document, which is the other half of what
      `content/settings.ts` already documents as "the driver parses most of it, but not every path".
      `readSettings()` on the console side had the identical double-parse, and it is worse there than in a reader: the
      settings screen would show a number, and saving what it showed wrote a JSON **number** into the column — after
      which no site reader can render the field at all. Probed against the test database before deciding
      (`.tmp/bk6c-console-roundtrip.mts`: typed `'20555000111'` → column `"20555000111"` → `readSettings` returned
      `typeof number`), then fixed with the same rule and asserted as its own case.
      **What this rung changes is the API, not the pixels.** The rendered site takes only `settings.branches` from this
      reader (`src/app/[lang]/page.tsx:45`); the brand name, phone and hours reach the HTML through the config module
      itself (`[lang]/layout.tsx`, `src/data/clinic.ts`, `lib/jsonld.ts`, `lib/seo.ts`). Pointing those components at
      the read path is BK-14's editable-elements work, not a row that moves a source — and `lang` still does not move
      `name` or `hours`, which is also BK-14's.
      1 more case in `tests/site.test.ts` (14) and 1 in `tests/content.test.ts` (suite 313 tests / 10 files),
      typecheck, lint, `next build` (86 static pages), and `prove:no-wp` re-run because a read path changed
      (5 checks, 79 routes, 0 requests to the WordPress origin).
      The live proof, over the real route against the dev database: `/api/v1/settings` went from
      `"Shamah Clinics"` / `"201121880908"` to `"شامه — محرر النصوص"` / `"20555000111"` while the server logged
      `[site] db settings (2 key(s))`, and back to the byte-identical baseline once the fixture was cleared — no
      restart between, so the reader really queries per request. `.tmp/bk6c-settings.mts` (gitignored) touches exactly
      two primary keys, dry-run until `--force`; the dev database is back to 1 article, 1 offer, 0 settings rows.
- [x] 6.3c-b `getHeroPhotos` / `getHomeIntro` / `getHomeProseSections` — `f5a192f`
      All three now sit on the site's read path (`rawHomeBodies()` + three exported readers in
      `lib/content/site.ts`), where a published `home` page row answers first and `getRawPageHtml`
      is the fallback; the `note()` line is what says which one did. The parse itself did not move:
      `hero.ts` and `home-prose.ts` stay pure functions over a body string, which is why
      `src/lib/wp/index.ts` only lost the three wrappers and `getRawPageHtml` became exported.
      The row's wording asked for a `rawBody()` helper; it turned out `pair()` **is** the raw
      accessor and `body()` is `pair()` plus `sanitizeHtmlBody`, so the hero reader takes
      `pair(row, 'content')` and the builder markup arrives whole. Raw on this door and sanitized
      on `getPage('home')` is the same row served two ways, and the new case asserts both halves —
      the prose appears in `getPage`'s HTML while `rs-slide` does not. `pair()`'s
      `ar || en` cross-fill means a home row written in one language parses with that body for the
      other, which is how every other bilingual field on this path already behaves.
      Rewired `src/app/[lang]/page.tsx:5` (one import instead of two modules) and
      `src/lib/wp/about.ts:5`, so `/about` never pairs a database page with a snapshot body.
      **Live proof, served HTML over the dev database.** With 0 `pages` rows the log said
      `[site] snapshot page (nothing published)`; publishing the snapshot's own `home` body
      (40,810 chars en / 40,866 ar) through `createRow` → `saveDraft` → `publishRow` moved it to
      `[site] db       page` and the homepage's 3 mirrored slider photos stayed the same 3.
      `/` came out **byte-identical** across three cold renders — snapshot rung, database rung,
      database re-run (`91df2227ab8f956e` each). `/ar` did not: two renders of the *same* data
      differ there too, in the RSC flight payload only, so it is not a comparable byte string;
      its visible text (2,822 chars), 2 JSON-LD blocks, 15 image srcs and 63 hrefs hash
      identically before and after. Compared served markup, not pixels — no browser pass on this row.
      The measurement also caught the rung rule from the other side: with only `home` published, the
      services band's heading fell back to its authored words, because `getPageTitle('our-services')`
      is the **same page kind** and the snapshot's page 696 title (`خدماتنا`) is not merged with
      database pages. Publishing that row too (9,861 / 9,605 chars) returned the heading and made
      `/` byte-identical. That is BK-7's import told to carry all 27 pages, not one.
      1 more case in `tests/site.test.ts` (15) and the no-WP network test now calls the three readers
      through `site.*` (suite 314 tests / 10 files), typecheck, lint, `next build` (86 static pages),
      `prove:no-wp` re-run because a read path changed (5 checks, 79 routes, 0 requests to the
      WordPress origin). `.tmp/bk6c-home.mts` (gitignored) seeds and clears those routes by the ids in
      its own marker file, dry-run until `--force`; the dev database is back to 1 article, 1 offer,
      0 pages, 0 settings — with 0 revisions and 0 audit rows naming the fixture ids.
- [ ] 6.3c-c `getOfferCategories` — still blocked, and the block is a schema question rather than a reader. Measured,
      so the decision can be made from facts: the `categories` table has no taxonomy column (`db/types.ts:128`) and
      its slug is **unique** (`categories_slug`, `migrations/002_content.sql:23`), while the frozen snapshot already
      holds a post category `laser` (WordPress term 63) and a product category `laser` (WooCommerce term 15) — importing
      both into one table is a duplicate-key and one of them silently wins. Even with the terms stored there is nothing
      to point at them: `offers` has no category column, where `articles` has `category_id` (same file, line 41). And the
      counts would change meaning — `getCategories()` counts rows (`articleCategoryCounts()`), while this reader returns
      the number WooCommerce printed in the snapshot.
      Three decisions, none of them mine to make quietly: add `taxonomy` and move the index to `(slug, taxonomy)`,
      decide how an offer references a term (column or join table), and decide whether a category's count is stored or
      computed. Nothing is at risk while they are open: the reader serves the frozen snapshot, which is what
      `prove:no-wp` shows costs 0 requests to the WordPress origin, and its only consumer is
      `src/app/api/v1/offer-categories/route.ts:6` — no component on the site renders it.
- [ ] 6.3c-d the `nav` / `specialists` / `faq` / `results` / `treatments` lists — each has a console screen and no
      public reader, and today each is read **synchronously inside a client component**: `Navbar`, `Footer`,
      `SiteShell`, `BookingModal`, `DoctorsClient`, `FaqClient`, `FaqAccordion`, `ResultCaseCard`, `TreatmentCard` and
      `HomeBody` import `src/data/<list>` directly (all ten files are `'use client'`). A reader alone would not reach
      the page: the value has to be passed down as a prop from a server component, which is BK-14's element plumbing.
      Writing readers first and leaving them unwired is the invention this row says not to do.
- [x] 6.4 Trash + never-delete: soft delete, restore, and versions that are never garbage-collected — `c68eb9d`
      Trashing sets `deleted_at` and keeps the id, version and every revision; the live list and the trash view read
      the same table (`?trash=1`). Trashing needs the delete grant, restoring the write grant, and a row in the trash
      refuses to publish (`409 in_trash`). `status` only takes `'trash'` for articles/offers/pages — `list_items`
      keep their own enum, which is why `setTrashed` branches on the table. No console path deletes anything: not a
      row, not a revision, not a setting (a secret value is never returned in any response body, asserted).
      Verified end-to-end in the browser over the real routes — create, save, publish, history, rollback, trash,
      restore — and again from the server render after cleaning up: the dev database is back to zero content rows,
      7 seeded `lists`, the Owner's prefs restored to `ar`/`light` through `PATCH /api/console/prefs`, and only the
      auth rows (`session.*`, `self.update`, `owner.create`) left in `audit_log`. `.tmp/bk6-clean.ts` (gitignored)
      deletes exactly the `bk6-*` fixtures and their revisions/settings/audit rows, dry-run until `--force`.

## BK-7 — cut WordPress out
- [x] 7.1 Fresh WP dump into a NEW timestamped folder (never overwriting `data/wp/*.json`) — `a80f911`
      The row could not be run as written, because `sync:wp` had no way to obey it: it resolved `data/wp` internally and
      ended by saying "Commit data/wp/". Now the destination is `--out=<dir>`, defaulting to
      `data/wp-<UTC timestamp>/`; naming the frozen folder exits `sync:wp refused — … is the frozen backup the build
      ships with` unless `--overwrite-frozen` is passed too (exit 1 at module scope, before a request goes out), so
      overwriting the shipped snapshot takes two flags saying it. `--json-only` pulls content without re-encoding media:
      it skips `public/wp/` and carries the frozen `images.json` into the new dump instead of writing an empty map,
      which would read as "these 60 pairings are gone". `meta.json` gained `mode`, and reads `previousGeneratedAt` from
      the frozen folder — a dump in a new folder still names the age of the copy it is being compared with. Log lines
      label files by the folder actually written, and the closing line distinguishes "commit this" from "this is next to
      what the build reads". `/data/wp-*/` is gitignored: 3.4 MB per sweep, re-generable in a minute, and the shipped
      snapshot is what must stay reviewed.
      The sweep (`npm run sync:wp -- --json-only`, 22 requests, 60.1 s, 18 files) wrote
      `data/wp-2026-10-23T04-57-55-573Z/`. Every count matches the shipped snapshot row for row — 92 posts, 27 pages,
      2 categories, 4 products, 23 media, 56 result stories, 60 image pairings, 4 SEO URLs.
      Row-by-row hash comparison (`.tmp/bk71-drift.mts`, gitignored): **628 rows identical · 2 changed · 0 new · 0 gone**.
      Nothing on the client's site has been published, edited, or deleted since the 2026-10-13 capture — which is what
      makes 7.2's import and 7.4's proof still current. The two changed rows are one row seen twice: page 622 `home`,
      English and Arabic. Not an edit — same body length (40,810 / 40,866 chars), same stripped text (4,765 / 4,773
      chars), same `modified` stamp. The only difference is WPBakery's per-request `data-vc-public-nonce`
      (`51837524ff` frozen → `be9350e40f` fresh). 15 of the 17 content files are byte-identical; `pages.en/ar.json`
      differ only by those two ten-character strings.
      **Two consequences, both for later rows.** 6.3c-b's readers parse the `home` body for the slider and the prose
      rows, so any re-sync will report the homepage as changed and a "is the snapshot stale?" check has to normalize
      `data-vc-public-nonce="…"` before it compares HTML — nothing a reader uses is inside it. And 7.5 should retire the
      fallback rung against the **frozen** folder, not a fresh dump: content-wise they are the same bytes, and only the
      frozen one is what the site is currently serving, so only comparing against it can show a real gap.
      Nothing was written into `data/wp/` or `public/wp/` — `git status` shows both clean (60 tracked files in
      `public/wp`), and the dump went to its own folder. Gates: typecheck and lint clean. Only `scripts/sync-wp.mjs`
      and `.gitignore` changed — no TS source, no read path — so `vitest`, `next build` and `prove:no-wp` were not
      re-run for this row.
- [x] 7.2 Import the snapshot as console rows: 92 articles, 4 offers, 27 pages + their categories, slugs preserved (`legacy_id` set) — `43fdf45`
      `src/lib/content/import-wp.ts` reads `data/wp/*.json` — never the live site — and pairs each English post with
      its Arabic twin **by post id** (all 92 share one id), so a translation WordPress kept as a separate post lands in
      the same row's two locales. English is authoritative for the shared fields (image, category, price); each locale
      keeps its own title, excerpt and body.
      Three rules shaped it. **Rows keep their legacy post id** — the site's cards are built on it, so a reader-visible
      id changing at cut-over would be a bug (`numericId` returns `legacy_id` when there is one). **Articles publish
      stamped with their own date** (`publishRow`'s new `at`), because `published_at` is what a card shows as `date`;
      naive WordPress stamps are read as UTC so the day a reader saw does not shift. **Everything goes through
      `createRow` → `saveDraft` → `publishRow`**, so an imported row is not a special state: it is a draft that happens
      to be published, normally editable, and `parseWrites` validates every snapshot value before a byte is written
      (longest body 40,866 chars against a 1,000,000 limit — nothing truncated; an oversized row is reported `skipped`).
      `createRow`'s `legacyId` and `publishRow`'s `at` exist only for the import and neither is reachable from the
      console request shape (`api.ts` builds both inputs by hand), so an editor cannot claim a post id or backdate one.
      `npm run wp:import` defaults to a dry run and refuses a database not named `*_test`. A row already saying what the
      snapshot says is left alone: the second pass reports `created 0, updated 0, unchanged 123` and adds no revision.
      Offer keys are stored decoded — the snapshot reader resolved either spelling of an Arabic slug, and decoded
      storage keeps that parity on the DB rung.
      **Not covered by 7.2, and still WordPress data:** the 56 result stories ride along because a story *is* an article
      (its card now comes from the imported rows), but its membership is the phrase index in `data/wp/result-stories.json`;
      `seo.json`, the offer categories and the kinds 6.3c still lists are the same kind of leftover.
      13 cases in `tests/import-wp.test.ts` (suite 158 tests / 7 files) compare the rendered journal, offers and pages
      against the snapshot row for row, assert the dry run writes nothing, and re-check ordering, dates and both Arabic
      slug spellings. Typecheck, lint, `next build` 272/272. Cleanup deletes exactly the snapshot keys' rows — the test
      DB is left at zero content rows, zero categories, zero revisions. Note for the next suite: the files share one
      process, so `afterAll` must call `destroyDb()`, not `db.destroy()` — the latter leaves a destroyed pool cached in
      the global and breaks whichever file runs after it.
- [x] 7.3 Remove every live WordPress read — `5b9bb5d`
      `src/lib/wp/http.ts` is deleted, not disabled: no `wpFetch`, no per-read REST path, no 8 s abort, no retry,
      no in-flight semaphore, and no `isBuildPhase()` guard left standing, because there is nothing to refuse.
      The three helpers that used to branch — `selectList`, `selectBySlug`, `selectById` — keep their signatures and
      become plain snapshot lookups, so **no caller, route or component changed**: 66 insertions against 228 deletions
      in the four source files. The `_fields` / `*_REL` query-string constants went with the client; the snapshot
      already holds exactly those columns and `scripts/sync-wp.mjs` is the only code left that sends them.
      `seo.ts` lost its cheerio `<head>` scraper: `resolveSeo` now reads `seo.json` and otherwise falls back to the
      row's own title/excerpt/image. That capture holds four landing URLs (home + contact, both languages), so
      **detail-page SEO has no snapshot entry until BK-15** gives the console its own seo fields — a real loss of
      fidelity, recorded here rather than papered over.
      `config.ts` keeps `WP_ORIGIN` for the one job it can actually do: rewriting URLs already inside the snapshot.
      `WP_FETCH_TIMEOUT_MS`, `WP_MAX_INFLIGHT`, `WP_TAXONOMY_REVALIDATE`, `REVALIDATE`, `restBase` and `siteOrigin`
      had no reader left, so they are out of the file, `.env.example` and `tests/setup-env.ts` too.
      **Two deviations from the row as written, both deliberate.** `sync:wp` is *kept*: it is the only way to cut a
      fresh snapshot for 7.1, it is hand-run, and no route imports it — so it is WordPress tooling, not a WordPress
      dependency. The Contact Form 7 forward in `/api/v1/lead` is also kept (it is a write, gated behind
      `LEAD_MODE=cf7`, default `whatsapp`) because BK-17 replaces lead handling; 7.4 asserts it is the *only* live call.
      README, `docs/inventory.md`, `docs/api/DECISIONS.md` and `docs/WIRING.md` each said "live first, snapshot on
      failure"; all four now say what happens, and the 2026-10-12 audit keeps its gate table as a dated record with a
      note on what moved.
- [x] 7.4 Prove it — `8a6ed1b`
      Two proofs, because either alone can be true for the wrong reason.
      `tests/no-wp-network.test.ts` (5 cases) replaces `globalThis.fetch` with a recorder that throws, then runs the
      whole public read path — `site.*` both languages, the kinds still on the snapshot rung, and the derived readers
      behind `/about`, `/results` and the treatment pages — and expects zero recorded URLs. A second case asserts those
      same readers still return 92+ articles, 10+ pages, offers, branches, services and treatments, so "zero" cannot be
      the sound of a reader returning nothing. The third half is structural, because behaviour can only catch a call
      some test happens to reach: no `fetch(` anywhere under `src/lib`, `http.ts` must stay deleted, and the lead route
      is asserted by path to be the only file in `src/app` naming `wp-json`.
      `scripts/prove-no-wp.mjs` + `scripts/wp-guard.mjs` (`npm run prove:no-wp`) are the row as literally written: a
      cold render of every public route. The guard is `--import`ed into the **server's own process**, so interception
      happens where rendering happens; the driver crawls the `<loc>` set of `/sitemap.xml` plus the paginated lists,
      the read-only `/api/v1/*` endpoints (detail slugs taken from the list endpoints) and `/console/login`, then reads
      the server's stderr. It requires the guard's `armed` line before believing its own zero.
      Result: 46 sitemap URLs, 79 routes rendered, smallest HTML page 25,334 bytes, **0 blocked requests, 0 mentions of
      the host**. Coverage caveat, stated plainly: the guard replaces `globalThis.fetch` airtight, but patches
      `http/https.request` on the exports object, which a `import { request } from 'node:https'` binding taken before
      it loaded would not see — that gap is why the structural half exists and is not redundant. Scope caveat: this
      proves the *rendered site* never reaches WordPress. `next build` still fetched Google Fonts
      (`src/lib/fonts.ts`, see the Gates note above) — a compile-time dependency on a third party, not on the clinic's
      CMS, and the reason "no WordPress" and "no network" were not yet the same sentence. BK-19.2 closed that: the
      fonts are self-hosted now and `src/lib/fonts.ts` is gone, so the sentence is true on both halves.
      Gates: typecheck, lint, `vitest run` 163 tests / 8 files, `next build` clean. **The build now prerenders 84 pages,
      not 272, and that is not a regression**: the dev database holds the owner's own two published console rows (an
      article and an offer, created and published 2026-10-22 23:11–23:13), and one published row is what takes a kind
      onto the DB rung — so `generateStaticParams` yields those slugs instead of the 92 snapshot articles. The seam
      worked exactly as specified; the rows were left untouched.
- [ ] 7.5 The snapshot-**file** reads the import has not replaced: `data/wp/result-stories.json` membership,
      `seo.json`, `offer-categories`, and the `data/wp/*.json` fallback rung itself. This is what 7.3 named and did not
      do — the live-read half is closed, the snapshot-retirement half is not.
      Work against `data/wp/`, not the 7.1 dump: 7.1 proved they carry the same 628 rows (the only difference is a
      per-request WPBakery nonce inside page 622's body), so nothing new can be found in the fresh folder, and only the
      frozen one is what the site serves today. `data/wp/*` stays read-only and undeleted either way — retiring the
      **rung** means no code path falls back to it, not that the backup goes away.
- [x] 7.5-a `data/wp/result-stories.json` membership — `9bb7f96`
      `/results` now asks the console's own `results` list which articles are stories, so membership is editable and the
      phrase index is only the fallback rung. The list was already in `LIST_KEYS`, already seeded with
      `is_article_collection: 1`, and already console-editable, so this needed no migration and no new column — which is
      why it went there rather than into a flag on `articles`.
      `planResultStories()` writes one `list_item` per story: `uid` is the **WordPress post id**, not the slug —
      `list_items.uid` is VARCHAR(120) and post 998's slug is 128 characters, and more to the point a slug is something
      an editor may rename while an id is not, so the row says "this post is a story" rather than "this URL is". The
      document holds only `phrases` (why the post was called a story; nothing renders it), `enabled` and `position`;
      the card's title, cover, excerpt and date keep coming from the article row, so a reworded story is fresh without
      touching the list. One locale is written because a list item is a single JSON document shared by both languages,
      which is what the console's own writes do.
      `getResultStories` moved out of `src/lib/wp` into `src/lib/content/site`, where `listRung('results', …)` decides
      per list, and `storyPhraseIndex()` in `src/lib/wp/result-stories.ts` is now only the snapshot rung — the old
      reader paired a database card with a file's opinion about which cards to show. The importer gained a fourth plan:
      `findExisting` and `createRow` are list-scoped, `resolveLists` looks each list key up once and a missing `lists`
      row is reported as **one** skipped entry ("run `npm run db:seed`") instead of fifty-six.
      Plans: articles 92 · offers 4 · pages 27 · categories 2 · result stories 56 (179 rows).
      15 cases in `tests/import-wp.test.ts` (suite 316 tests / 10 files) — two new: the rendered stories and their
      phrases equal the snapshot index row for row, and the load-bearing one: setting a row's `enabled` to 0 takes the
      story off `/results` and drops the total by one **while the file still names it**, which is the difference between
      a list and a file. Found while writing them: `paginate` clamps `perPage` to `MAX_PER_PAGE` (30), so a "read the
      whole list" query needs the page loop, not `perPage: 500` — the first draft of the assertion silently compared 30
      of 56 and only failed because it compared ids.
      Measured on the built server (`next start` against `shamah_cms_test` after `npm run wp:import -- --apply`), not
      only in-process: `/results` rendered 9 cards on page 1 and **56 unique stories across 7 pages**, matching the
      snapshot set with nothing missing and nothing extra; hiding story 1001 in the database gave 55 and the victim's
      card was gone from every page while `result-stories.json` still listed it; restoring it returned 56. `/ar/results`
      renders the same page the same way. No pixels inspected — the automation page is hidden in this environment, so
      the proof is the rendered HTML's card links and the reader's counts.
      Gates: typecheck · lint (the one warning was a gitignored `.tmp` probe, now deleted) · `vitest run` 316/316 ·
      `next build` · `prove:no-wp` re-run because a read path changed (5 checks, 79 routes, 0 requests to the WordPress
      origin). `data/wp/` and `public/wp/` show no modification. The test database is back to zero content rows, zero
      categories, zero list items.
      Still in 7.5: `seo.json` (BK-15's), `offer-categories` (blocked on 6.3c-c's schema call) and the fallback rung
      itself, which cannot go until every rendered kind can answer from the database.
- [x] 7.6 Retire the `treatments` path — `2a8a8cc`. The owner asked for it plainly ("وشيل اصلا الباث بتاع ال treatments ملهوش
      لازمه خالص"), and it was a second name for a page that already called itself services: the list page's metadata
      and breadcrumb had said `/services` since the services work, while its own URL said `/treatments`, and
      `/services` was a two-line `export … from "../treatments/page"`. A canonical tag cannot repair that; two URLs
      for one document can only split whatever is indexed.
      **What moved.** The implementations now live at `src/app/[lang]/services/page.tsx` and
      `src/app/[lang]/services/[slug]/page.tsx`; `/services` is the route, not a re-export. The detail's canonical,
      breadcrumb `item`, `generateMetadata` path and `serviceJsonLd` path all say `/services/${id}`. The old
      `src/app/[lang]/treatments/` folder is deleted, not left as a stub, so nothing in `app/` can render it.
      **What links there.** `TreatmentCard` (the card every listing renders), the detail hero's own breadcrumb,
      the branded 404's "our services" destination, `organizationJsonLd`'s `availableService`, every entry in
      `/sitemap.xml`, and `publicPathOf('list_item', …, 'treatments')` — a console row for the `treatments` list is a
      service row, so its preview path is `/services/${key}` like the `services` list's. The `treatments` list key
      itself stays: retiring a URL is not retiring content, and `LIST_KEYS`/role scopes are a separate vocabulary.
      `/api/revalidate` stops invalidating the two dead route patterns.
      **The redirect, measured.** `next.config.ts` adds the three entries the journal rename already established as
      the pattern — unprefixed, `/ar`, `/en` — mapping `/treatments/:path*` onto `/services/:path*`, so a detail URL
      keeps its slug. On the built server: `/treatments` → **308** `/services`, `/ar/treatments/botox-injections` →
      **308** `/ar/services/botox-injections`, `/en/treatments` → **308** `/en/services`. This is Next's
      `permanent: true`, which is a 308, and that is what the existing redirects in this file already return; the
      scripts accept 301 or 308 rather than pinning a spelling the framework chose.
      **Proof, not assumption.** A stale `.next/types/validator.ts` still pointed at the deleted files and failed
      typecheck until the generated directory was cleared — the route was gone from the manifest, only the cache
      disagreed. After that: typecheck · lint · `vitest run` **389/389** · `next build` (manifest lists
      `/[lang]/services/[slug]/page` and `/[lang]/services/page`, lists no treatments route) · `prove:no-wp`
      **5/5** (240 sitemap URLs — the service details moved, they did not disappear — 273 routes rendered, 0
      failed, 0 requests to the WordPress origin). `scripts/verify-render.mjs` and `scripts/test-missing-fields.mjs`
      now count `a[href*="/services/"]` and fetch detail pages at `/services/${slug}`; the retired
      `/treatments/no-such-treatment` 404 case was replaced by the redirect assertions above, and
      `/services/no-such-service` still proves the 404.
      **Untouched on purpose.** `data/wp/`, `public/wp/`, `src/data/treatments.ts` and `src/lib/wp/treatments.ts`
      keep their names: they are content and its reader, not a URL. The images under `public/wp` and the frozen
      snapshot are read-only by the standing rule, and a rename there would be churn with no URL behind it.

## BK-8 — marketing (superseded, do not work these rows)
Folded into **BK-17** the day the owner's expansion brief arrived (2026-10-22), because that brief
named the two forms and the Connectors screen. Kept as a pointer, not as a second plan:
8.1 leads persisted → 17.1 · 8.2 pipeline/notes/assignee/CSV/idempotency → 17.1 + 17.2 ·
8.3 Sheets outbox → 17.3-17.5, CTA labels → 14.2, CTA click tracking → 10.2.
The CF7 forward that 7.3 left standing is retired by 17.1.

## BK-9 — SEO (superseded, do not work these rows)
Folded into **BK-15**: 9.1 per-entity per-locale meta → 15.1 + 15.2 + 15.4 · 9.2 redirects → 15.6 ·
9.3 sitemap + robots → 15.8. The `seo.json` leftover 7.3 recorded is closed by 15.1, not here.

## BK-10 — statistics
- [ ] 10.1 First-party `stats_events` capture (no third-party script required), bot filter, hashed visitor id
- [ ] 10.2 Daily rollups + referrers + CTA clicks, and the console dashboard that reads them

## BK-11 — deploy
- [ ] 11.1 cPanel + MySQL procedure: `DATABASE_URL` vs discrete vars, migrations on deploy, Node app setup
- [ ] 11.2 Import the local content into the deployed database (the owner's plan: build locally, then load it up)

## BK-12 — housekeeping
- [ ] 12.1 Git/GitHub tidy in `D:\shamah`: branch inventory, bundles for the dead lines of work, prune stray
      worktrees, decide on `psql/` and `start-server.bat` — nothing deleted without a bundle first
- [ ] 12.2 **Security warning for the owner**: the `admin-restore` branch in `D:\shamah` ships `/admin` and
      `/api/sitedash/{config,leads}` with no authentication of any kind (no session, no token, no proxy guard).
      It must not reach a deployment as it stands.

## BK-13 → BK-18 — the owner's expansion (brief of 2026-10-22, verbatim)
> i need add in SEO partation, every single feature in rank math tool, plus enhance this UI to be more useful than
> this and responsive and make the cms able to edit every single element on website, so the company's team allowed to
> edit everything on website just via this cms, the website configuration for SEO or anything also from the cms, i need
> at the end a screen named connectors, have a script for app script if i need to make the appointments or contact
> forms linked to google sheets and have a toturial to how i use the script and what is the names of columns the
> website's needs to write it in the sheet, the leads screens catch from appointment's form and the contact form this
> for the marketar, breifly i need this cms is the bestest cms, any developer or SEO or data entry or marketar is
> comfortable to controle the website throught it, also the i need users screen to add users or edit roles or give
> permissions a user or remove user, those gonna controle the site throught there users

Four answers taken from the owner, binding for these sections:
- **SEO**: "build all there feature … not the 40 features but build the important for the SEO specialist will needs" —
  so the specialist-facing matrix, built locally, no paid third party.
- **Editing**: "i mean from a little title to sections and pages not a code or database, i mean what in the option 2
  but smartly" — every title, section and page editable, and the click-to-edit overlay is wanted, on top of full
  field coverage (BK-18), not instead of it.
- **Sheets**: "it will pass to google sheets throught app script also pass at the same time to the cms but it's an
  option for the marketing team … by default in cms" — the database is always the system of record; Sheets is an
  optional per-form outbox.
- **Roles**: keep the six, add a **Roles & permissions** tab where any permission from the catalog can be checked and
  a brand-new role created, the user's own role rendered as a tree of the screens it reaches, and a request an Owner
  accepts or denies.

## BK-13 — console shell: responsive, and one set of screen primitives
Every screen below lands on this, so it comes first: a bad shell would be copied six times.
- [x] 13.1 Tokens + layout pass on `src/app/console/console.css` + `ConsoleShell.tsx`: sidebar becomes a drawer under
      1024 px and a tab bar under 640 px, touch targets ≥ 44 px, RTL and dark/light still server-decided, content
      width and dense/comfortable density switch. — `47d698f`
      New `ConsoleFrame.tsx` owns the drawer state and `ConsoleShell.tsx` stays on the server, handing it brand,
      controls and account as nodes. The toggle is an `<a href="#console-side">` upgraded by script rather than a
      button, because the drawer also opens on `:target` — the BK-5 rule that the console works with JavaScript
      switched off had to survive a drawer.
      Density is a third prefs term in the cookie (`locale.theme.density`) and follows the **device**, never the
      account: `users` has no density column, on purpose, so this row needed no migration. `PATCH
      /api/console/prefs` requires all three terms now — a body that mentions two is a 400 rather than a silent
      reset of the one it left out.
      Two defects only measuring caught, both asserted in `tests/console.test.ts` and commented where they live.
      `globals.css` puts `transition: all .3s !important` on `*`, and `all` covers `visibility`, so the drawer was
      still `hidden` a frame after it opened and `ConsoleFrame`'s focus call was a no-op — the drawer's own
      transition now answers that `!important` with transform only. And a scrim tap left focus inside the subtree
      that had just gone hidden, dropping the keyboard user to `body`; `close()` hands focus back to the toggle.
      Measured on the built console at 360 / 640 / 800 / 900 / 1024 / 1440, RTL and LTR: no horizontal overflow,
      the 44 px floor at both densities (the dense block lowers tokens but never `--console-tap`), exactly one
      visible nav landmark per width, header 72 px = `--console-topbar-h`, sticky 256 px sidebar at ≥ 1024,
      Escape and the scrim both close and return focus, and the density click round-trips to
      `data-density="dense"` plus an `ar.dark.dense` cookie. Caveat, stated plainly: the in-app automation
      viewport is fixed near 505 px, so every width above is geometry read from a same-origin iframe, not pixels
      seen in a screenshot.
- [x] 13.2 Navigation from the permission catalog, rendered as a tree (group → screen → entity) that hides what the
      role cannot read and greys what it cannot write, plus a command palette (⌘K / Ctrl+K) for screens and records.
      — `c49d90f`
      `navTree(grants, locale)` in `screens.ts` reads the three levels straight off the catalog — a screen the role
      cannot `read` is never emitted, a leaf it cannot `write` renders `aria-disabled` with a dotted underline — so
      the tree is a *consequence* of `can()` rather than a second permission list that can drift. Entities come from
      the catalog's own vocabulary (`locales` → `?locale=ar|en`, `lists` → `?list=`) and not from the database: a
      Marketer's tree must not reveal which lists exist by listing them. The Editor's `nav` leaf is the visible proof
      of the grey rule — read-only on purpose, so it shows and cannot be opened.
      The palette searches records too, and that needed one change to the single enforcement path rather than a
      hand-rolled `authenticate` + `can()`: `Rule.resource` now accepts a **set** of resources, the handler receives
      `ctx.resources` (the subset actually granted) and a 403 names the whole set (`article+offer+page.read`). A
      Marketer's search never builds a `pages` query, so it never learns whether a page matched. Record hits are
      `LIKE`s over the key and the two title columns only, `LIMIT`ed, never `content_ar` — pulling 92 articles'
      bodies to match a string is how a console goes down on a shared host.
      Two things only measuring caught. `ContentWorkspace` had no way to open the row a palette hit pointed at, so
      the content screens take `?key=` and seed the selected row from it (a deep link that lands on a list is half a
      feature). And the drawer stayed open after a leaf click, because its state was keyed to the pathname alone and
      `?locale=ar` is the same pathname — it is keyed to pathname+search now, so a query-only navigation closes it
      without an effect and without tripping `react-hooks/set-state-in-effect`.
      Navigation still works with JavaScript off: the tree folds with native `<details>`, the strip and drawer are the
      same markup as 13.1, and the palette is the one **declared** JS-only affordance (its label says so).
      Measured on the built console at 360 / 640 / 800 / 1024, RTL and LTR: zero horizontal overflow at every width,
      tap targets ≥ `--console-tap`, strip only < 640, drawer 640–1023 with the scrim at `display:block`/`z-index:35`
      and a column ≥ 1024 (x=768 RTL, x=0 LTR), leaf indent 23 px on the inline-end side in RTL, leaf click closing
      the drawer and landing on `/console/articles?locale=ar`, Ctrl+K opening a 608×513 dialog with focus in the
      input, roving ArrowDown/End/Home/ArrowUp moving it, real Escape closing and returning focus to the trigger, and
      the record path end-to-end: `er` → السجلات → `/console/articles?key=Sed%20exercitationem%20l` with that row's
      editor open. Caveat as before: widths are geometry read from a same-origin iframe, not pixels seen — the 360
      drawer was also screenshotted and read, which is what confirmed the tree's visual hierarchy (group headings,
      chevrons, greyed leaf) rather than only its box positions.
- [x] 13.3 Shared list primitive: table/card modes, sortable columns, saved filters, search, bulk select → bulk
      publish/trash, per-page, all mirrored into the URL so a view is linkable; empty, loading and error states once
      instead of per screen. — `661dd9e`
      `list-view.ts` makes the view six terms (mode, sort+dir, `q`, filter, page, per) and nothing else;
      `ConsoleList.tsx` draws them and `summary.ts` answers them with one query per kind. Defaults are **per kind**,
      not global, because the line has to round-trip: an offer screen drops `sort=position` (its own default) and must
      re-parse to the view it was written from, while one global default would drop that term and re-add another
      kind's direction. `parseListView` totalises — a typo in a bookmark falls back instead of failing — and a
      hand-typed line never reaches SQL as an identifier, because the terms map onto the columns `kinds.ts` declares.
      Each kind only offers what its columns can answer (`sortsFor`/`filtersFor`), and the scope terms (`list`,
      `locale`, `trash`, `key`) parse separately because the guard reads them, not the list. The first page arrives
      server-rendered for exactly this URL, so the client draws it and does not ask for it again.
      Bulk is a path verb — `/content/<kind>/bulk/<publish|trash|restore>` — so permission is decided before the body
      is read (publish→`publish`, trash→`delete`, restore→`update`); ids are capped at 100, rows apply one at a time so
      a partly blocked selection answers with `done` and `failed` instead of a silent half-job, and nothing landing is
      a 409 rather than a 200. A saved view (`007_views.sql`) stores the server's own canonical rendering of the
      re-parsed query, never the string the browser sent, so it can hold no term the kind cannot honour and carries no
      `?key=`: restoring one is byte-for-byte the view that was saved. 24 per person per kind, and every statement
      names `user_id` — that row filter, not the deliberately coarse `self` grant, is what makes a filter private.
      Two semantics are stated here because they will be re-litigated: `pending` means "the draft differs from its
      published twin, `NULL` counting as different", so an unpublished draft *is* pending on purpose; and one unknown
      field name rejects the whole write, because accepting the fields it did recognise would silently drop the one the
      editor meant to save.
      Five defects, all of them from measuring rather than reading, each now asserted. A column header drew 36px and a
      saved-view half 34px: the chip is the capsule, so it needed `align-items: stretch` plus `content-box` sizing —
      its own 1px border was eating the 44px the halves were measured against. A row's checkbox label
      named the token and measured 16px, because `min-block-size` does nothing on an inline box. Dense lowered the
      search box and the per-page select to 36px by borrowing `--console-tap-field`, the token for a form you type
      into; these are targets you tap on a phone, and exactly one use of the field token is left in the file, on
      purpose. Card mode had **no select-all at all** — and card mode is the phone mode, where tapping 25 boxes by hand
      would be the whole job. And toggling Trash from a Drafts view answered with an empty list over two rows that were
      plainly there: every row in Trash is trashed, so a state chip carried into it matches nothing. Trash now offers
      only All and `listViewQuery` refuses to write the term pair that would disagree with the screen it renders — two
      pre-existing tests had encoded the broken behaviour and are rewritten with why.
      Measured on the built console at 360 / 640 / 800 / 1024 / 1440, table and card, RTL and LTR, at both densities:
      zero horizontal overflow at every width, and no control under the floor — 13 measured in table mode, 8 in card,
      each ≥ 44px in dense and in comfortable. The table scrolls inside its own box only at 360 (412 inside 314), and
      the card grid follows the *pane*, not the viewport: 1 / 2 / 3 columns appear as the pane crosses multiples of
      13rem, so one column at the 1024 split (pane 424px) and three at 1440 (pane 840px). Live through the UI:
      bulk publish took 15 drafts to 5, bulk trash moved 2 out and restore put them back, a saved view round-tripped
      (`?locale=en&sort=title&dir=desc&per=10` stored, restored, then deleted) and a search nothing matches drew the
      shared empty state once. Caveat as before: every width above is geometry read from a same-origin iframe, not
      pixels seen — the in-app automation viewport is fixed near 505px.
      The pass seeded 30 articles / 12 offers / 8 branch rows through `.tmp/bk13-seed.mts` and removed them with
      `.tmp/bk13-clean.mts` (dry-run first, `--force` to act): `npm run doctor` is back to 1 article and 1 offer and
      `console_views` is empty; the audit rows those calls wrote stay, because audit is append-only.
      Gates: `npm run typecheck` · `npm run lint` · `npx vitest run` (231 tests over 9 files) · `npm run build`, and
      because this row added a read path, `npm run prove:no-wp` again: 79 routes, 0 requests to the WordPress origin.
      `ContentWorkspace.tsx` is 512 lines (532 before this row) — 13.5 finishes the split onto 13.3 + 13.4.
- [x] 13.4 Shared editor primitive: split pane (fields / live preview + SEO), sticky save-publish bar, unsaved-changes
      guard, autosave draft, per-field messages coming from `parseWrites`, keyboard save. — `b35a193`
      `ConsoleEditor.tsx` (592 lines) owns the session of the row it is handed; `ContentWorkspace.tsx` went 512 → 245
      and keeps only what the address bar already names — which row is open, which tab, which list, whether Trash is
      being read — and is the **single navigation gate**. Every action that would throw away unsaved words (another
      row, a tab, trashing, closing) is handed to `requestNav()`; the workspace holds it and the editor draws the
      save / discard / keep-editing panel, because only the pane that holds the words can decide what happens to them.
      Three pure modules sit under it: `editor-form.ts` (a row → the form the fields draw, one language tab at a
      time), `issues.ts` (a `parseWrites` path → the field it belongs to), `preview.ts` (the preview model, the
      sandboxed document, the search read-out), and `content/paths.ts`, which is now the only rule for where a row
      lives — the console's preview link and `publicSeo()` read the same function, so a row cannot be published at one
      URL and indexed at another.
      Split pane is a container query, not a media query: `@container console-edit (min-width: 54rem)` gives
      `minmax(0,1fr) minmax(23rem,27rem)`. Chosen from measured panes, not taste — comfortable density caps the page at
      `--console-content-w: 72rem`, so the editor pane is 675px at 1440 and 949px at 1920 dense. An earlier 40rem
      threshold split at 1440 and left the fields 339px and the frame 251px: a squeezed page beside a column too narrow
      to read a search snippet in. At 1440 comfortable each half therefore gets the whole pane in turn. The cost is
      stated rather than hidden: **the split is only reachable in dense on a wide display.**
      Per-field messages ride beside the error code. `client-api.ts` returns `issues` on a failed call as well as on a
      good one, because `data` is null on a refusal and the field that failed is the one thing still worth showing;
      `parseWrites` speaks a fixed vocabulary (`kinds.ts`) and every sentence has an AR and EN label. Two decisions
      about when a message stops being true. A **server** rejection is remembered with the value it was written for
      (`TrackedIssue.was`) and `liveIssues()` retires it the moment the box holds anything else — the live run wrote
      `EEEEEEEEE` into `currency`, was refused with `أطول من 8 حرفًا.`, and typing `EGP` made the form equal the saved
      row again, so autosave never fired and the old sentence would have stood over a corrected value forever. Only a
      **client** complaint greys Save and Publish: a taken slug or a moved version is something the browser cannot
      recompute, and disabling the button that would retry it turns advice into a dead end. The reason reads in the
      status line instead.
      Autosave is 2s, fires only for `canEditRow && dirty && !invalid && !autosaveStopped && !busy && !pendingNav`,
      and writes the draft — publishing stays a button, and the status line says so. A `stale_row` answer stops
      autosave for the session with its own reason (`content.autosave_stopped`) rather than retrying into someone
      else's edit. Ctrl/Cmd+S saves, and the same handler cancels a held navigation on Escape. The bar is sticky and
      every control in it is a `--console-tap` target; the preview is the draft's own markup in a `sandbox=""` srcdoc
      frame — no origin, no scripts, no top-level navigation — and the SEO panel follows `publicSeo()`'s fallbacks, so
      a missing language borrows the other the way the site will.
      Live proofs through the built console, in the real UI: autosave moved the draft and left the published twin
      alone; publish saved first, then published (PATCH then POST, `pub.ar` byte-equal to the typed string, version 8,
      `pendingLocales []`); Ctrl+S saved; an unsaved row answered a tab switch with the `role="alertdialog"` panel; a
      hand-typed `{oops` marked its own field with the client's JSON sentence; and a server-only refusal (`longer than
      8 characters`) marked the field while the DB confirmed the write never landed. Geometry at 360 / 1440 / 1920-dense
      has zero horizontal overflow. Two defects only a screenshot caught: an ISO date typed into an Arabic sentence
      rendered `26-10-2026` while `textContent` said `2026-10-23` (bidi reordering — each date is now its own `<bdi>`
      run; the list needs none, its date is a lone `<td>`), and the sticky bar measures 135.1px tall at a 315px
      container — three wrapped rows of controls and status, which is the honest cost of never lowering the 44px floor
      on a phone. Caveat as before: the sandboxed preview is verified through its `srcdoc` attribute and the wide split
      through measurement, because the in-app automation viewport is fixed near 505px — those pixels were not seen.
      Recorded for BK-14, not fixed here: `hrefPair()` (`src/lib/wp/lang.ts:29`) spells an English href as a bare
      `/blogs/<slug>`, and `decideRoute()` rewrites a bare path to `/ar`, so the site's own English links render Arabic
      until they are prefixed the way `localizedPath()` does.
      Gates: `npm run typecheck` · `npm run lint` · `npx vitest run` (302 tests over 10 files, 61 in `editor.test.ts`) ·
      `npm run build`, and `npm run prove:no-wp` again because `publicSeo()` now takes its path from `paths.ts`:
      79 routes, 0 requests to the WordPress origin. Dev fixtures were returned to their pre-session values and the
      test rig (3330/3332) and MariaDB are shut down.
- [x] 13.5 Finish the split of `ContentWorkspace.tsx` (245 lines today, was 530) onto 13.3 + 13.4 and re-point the
      screens at it — no behaviour change; the existing console SSR/API suites must pass untouched. `cfc0e9f`
      **The split had already happened, and the row's real finding was somewhere else.** Reading the tree first, not
      the plan: `ContentWorkspace.tsx` is 244 lines and is thin glue (list + editor + create + reload, nothing else),
      and all four content screens (`articles`, `offers`, `pages`, `lists`) already reach it through one 28-line
      `ContentScreen`; `settings` keeps `SettingsWorkspace` on purpose, because a site setting has no draft copy and so
      no publish step. Moving code was not the job — the duplication the row was guarding against had moved out of the
      file and into the *call sites*. What three components each still did by hand was spell the write-scope either/or:
      `ConsoleEditor`'s `named ? '?list=…' : '?locale=…'`, `ConsoleList.scopeParam()`, and `ContentWorkspace.query()`.
      That is now one function, `writeScopeQuery()` in `src/lib/content/list-view.ts`, sitting next to
      `listScopeParams()` and deliberately not the same thing: the **address** carries every term it knows (`?list=…
      &locale=…`), a **write** names exactly one, because `guard()` reads the scope off the URL and a request that
      sends both is answered against whichever the handler reads first — not the one the caller meant. Three chances
      to invent that rule became one, and the third branch (nothing named → send no term, so the write is refused
      rather than guessed) exists only in the one place now.
      Accepted divergence, recorded because it is the only behaviour that moved: a lists screen whose `listKey` were
      empty used to send `?list=` (an empty scope the guard would reject) and now falls back to `?locale=`. It is
      unreachable — the lists screen renders a tab only for a validated `listKey` — and sending a scope is safer than
      sending none. `locale` is also percent-encoded now; the values are `ar` and `en`.
      Tests 302 → **311 over 10 files**. `list-view.test.ts` gained 4 (the either/or, the empty case, a key needing
      encoding, and a source walk that fails if any of the three components re-invents `list=${`/`locale=${`);
      `content.test.ts` gained 2 that go through the real handlers with the line the screen now builds
      (create → save → bulk trash → bulk restore on `?locale=ar`, create on `?list=branches`), so the function is
      pinned by the wire, not only by itself; `console.test.ts` gained 3, the structural door tests — no page file
      imports a primitive or parses a view (`parseListView|parseListScope|URLSearchParams`), and the list keeps its URL
      state with `history.replaceState` and never `pushState`/`useRouter`. That last one is a finding worth keeping: there
      is no popstate listener anywhere, so Back leaves a console screen for a server-rendered page instead of walking
      into a stale forward state, which is what makes 13.3's "the URL is the list's only state" actually true.
      One trap for whoever writes the next structural test: matching component *names* in page sources false-positives
      on `ConsoleListsPage`, which is `lists/page.tsx`'s own component name; match the import specifier instead.
      Live proof through the built console (`next start -p 3330` behind the :3332 proxy, signed in as Owner), read off
      the request line rather than the DOM: lists screen — `POST …/content/list_item?list=branches` [200] (create),
      `PATCH …/list_item/<id>?list=branches` [200] (editor save), `POST …/list_item/bulk/trash?list=branches` [200]
      (bulk), with reads still on `?list=branches&locale=ar` exactly as before; articles screen —
      `POST …/content/article?locale=ar` [200], autosave `PATCH …?locale=ar` [200], `POST …/publish?locale=ar` [200].
      Every write one term; every read both. Nothing here was a layout claim, so the fixed ~505px automation viewport
      cost nothing — the proof is the URL the guard answered, and no new pixels were seen or needed.
      Gates: `npm run typecheck` · `npm run lint` · `npx vitest run` (311) · `npm run build`.
      `npm run prove:no-wp` was **not** re-run and that is the honest call, not an oversight: no site read path
      changed — `writeScopeQuery()` is imported only by console components. Proof fixtures (`bk13-5-spelling` in
      `branches`, `bk13-5-locale` article) were removed with `.tmp/bk13-clean.mts` (dry-run first: 1 article, 1 list
      item, 1 revision, 5 audit rows, nothing else), `npm run doctor` is back to 1 article / 1 offer and 0 list items,
      and the test rig (3330/3332) and MariaDB are shut down.

- [x] 13.6 Content screens v2: the list owns the whole width, a row opens at its own URL, creation is a title, the
      language is two tabs, pictures are visible, and the console stops reading the site stylesheet — `99e34da`
      **What the owner asked for, and what each answer is.** The list sat in a two-column split that kept 75% of the
      screen for a form nobody had opened; `.console-work` is `display: block` now, the list is full width, and the
      creation form is capped at 44rem without a grid. A row opens `/console/<kind>/<id>` — a real page
      (`ContentDetailScreen` server-renders the row and hands it to `ContentDetail` as `initialRow`), not a pane, so it
      can be bookmarked and Back returns to the list the person found it in. The unsaved-words gate moved with it:
      `requestNav()` + `beforeunload` live on the detail page, and locale switching goes through the same gate and
      through `writeScopeQuery()` rather than spelling `?locale=` a fourth time.
      **A new item is a title.** `POST /content/<kind>` accepts `{ title, locale }` and derives the key with
      `slugify()` — Unicode letters kept, so Arabic titles produce Arabic keys; page keys get the `/` prefix; a
      collision is suffixed `-2…-50` rather than rejected. The explicit `key` shape still works for imports.
      **The language is two tabs, not a dropdown.** `LANGUAGE_TABS = ['ar','en']` is rendered by both the list's scope
      tabs and the detail editor; no `<Select>` remains on either screen. The user writes one language at a time and
      the other locale is untouched.
      **Pictures are part of the row.** `imagesOfForm()` walks the live form — an offer's `images[locale][]`, a
      service's `image`, a list item's `data` — and the editor renders every URL as a plain `img` in
      `.console-media-list` (a build-time allowlist cannot know WordPress paths, CDNs or data URLs). The table also
      carries a thumbnail per row, which is only honest because the console no longer loads the site sheet.
      **The stylesheets are separate.** The token layer moved to `src/styles/tokens.css`; `globals.css` imports it
      (one insertion), the console layout imports `tokens.css` + `ui.css` + `console.css` and never `globals.css`.
      That is what frees the thumbnail: the site sheet's `img { width: 100% !important }` would flatten every preview.
      Tests assert the non-import in both directions, so a future `globals` import in the console fails structurally.
      **The row link is a primitive, not a surface restyle.** `.ui-row-link` (flex, 44px floor, inherited ink,
      underline on hover of the title) lives in `ui.css`; `console.css` keeps only placement. The table was rebuilt
      around it (`ui-table console-table`, `<bdi>` dates, a muted `Mark` for empty cells) and the card layout is the
      same row at narrow widths via `@container console-list`.
      **A test can pass while the build fails.** The palette check sliced `tokens.css` at the first occurrence of
      `html[data-theme="dark"]`, which is a sentence in the file header, so the compared slice was empty and the count
      assertion caught it only after the move; the media check asserted a CSS selector against TSX. Both fixed. The
      `npm run build` gate then caught what no text assertion could: `globals.css` had a duplicated head spliced in at
      line 83 (`mport "tailwindcss"`). It was rebuilt from `HEAD` with only the token block removed; the diff is now
      1 insertion / 373 deletions, and the closing brace the no-trailing-newline `sed` dropped was restored.
      Gates: `npm run typecheck` · `npm run lint` · `npx vitest run` (**400** over 14 files) · `npm run build` ·
      `npm run prove:no-wp` (5/5; 273 routes, 0 WordPress requests).
- [x] 13.7 No markup reaches a person: three field formats, the body filtered on save, the sentence cleaned on read,
      and the imported columns repaired — `ac61770`
      **What the owner asked, twice, in one breath** (brief of 2026-10-25, with a screenshot of the article editor):
      *"when any content will added, don't share it in html tag, this will give us too many insecurities"* and
      *"still cms has HTML tags apear in editors"*. The same sentence covers the third ask — click-to-edit image, local
      file, compressed — and that one is 14a, recorded as not-done at the bottom of this row.
      **The cause was storage, not the preview.** The WordPress import wrote every column verbatim, so 92 of the 94
      article excerpts begin `<p>` and carry `&#8217;` and `&mdash;` inside them. The site prints that field as text —
      a card teaser, a `<title>`, a meta description — so a saved `<p>` is two characters of noise in a SERP and the
      words an operator reads in the editor. The console's preview escaped it faithfully, which is the only reason it
      became visible instead of staying invisible in the column.
      **A field now declares what it holds** (`format` on every `bi`/`text` field in `kinds.ts`), and there are three
      answers because the site treats them differently:
      - `plain` — a sentence. `plainText()` on the way in (`parseWrites`) *and* on the way out (`readStored`), so the
        row an operator reads is the row a visitor reads even before anyone re-saves it.
      - `html` — a body the console writes. Keeps its tags and goes through `sanitizeRichHtml()` before the INSERT, so
        the database never holds a `<script>` or an `onerror=` at all.
      - `source` — the page kind's body: the page-builder document `hero.ts` and `home-prose.ts` still read `rs-slide`,
        `data-thumb` and `class="vc_row"` out of. Stored verbatim, filtered only at render. Typing this as `html` was
        the first attempt and it would have deleted the homepage hero the moment anyone saved the page.
      **One allowlist, two doors.** `src/lib/content/rich.ts` holds the tag and attribute list; `wp/sanitize.ts` —
      the render filter — now imports it instead of keeping its own copy, so the copy that passes the save is the copy
      that reaches a visitor. `rich.ts` is Node-only (`sanitize-html`, `cheerio`), `format.ts` is isomorphic, and the
      browser shares the latter.
      **`plainText()` settles on a fixed point.** The same function runs on both doors, so a cleaner that still changed
      under its own next pass would shave characters off the row every time it was read and make the console disagree
      with the column. Three tests fail without it. The cost is stated in the file: an author typing `&amp;#8217;` to
      talk *about* an entity gets `’`, and one typing `&lt;script&gt;` gets nothing.
      **The editor stops showing markup without rewriting the box.** `displayForm()`/`storedValue()` in
      `editor-form.ts` run the same `plainText()` the server will, and the preview pane, the SEO read-out and the media
      strip all read *that* rather than the raw keystrokes; a plain field is also cleaned on `blur`. The field a person
      is typing in is never rewritten under them — cleaning per keystroke would eat the space just typed and undo
      `12 < 15`.
      **The import stayed idempotent only by sharing the write path.** `needsWrite()` compared the snapshot's raw string
      against the row's now-clean draft, so a second pass reported 96 updates. `planWrites()` is exported from
      `store.ts` and both the save and that comparison ask it, which is the same property stated as: a re-run
      recognises the rows its first pass wrote.
      **Then the columns were repaired, not just masked.** `npm run db:repair-plain` (dry-run default, `--apply`,
      `--force-database`, guarded like `wp:import`) reads its column list from `KIND_SPECS`, writes an undo journal to
      the gitignored `backups/` **before** the first UPDATE, and touches no `html` or `source` column. Applied to
      `shamah_cms`: **394 values on 96 rows**, no `version` moved and no `revision` written, because the words a reader
      sees did not change; the second run finds nothing, and the article from the screenshot now holds
      `Discover Long-Lasting Beauty with Expert Care at Shamah Clinics، If you’ve been searching…`. The apply path was
      exercised on `shamah_cms_test` against one seeded dirty row before it ran on the dev database.
      **Tests.** `tests/html-safety.test.ts` (16): the cleaner's cases (`12 < 15`, `<3`, script/style contents, the
      fixed point over seven values), `parseWrites` per format and the 500/501 title boundary, `sanitizeRichHtml`
      against hostile input plus a drift check against `sanitizeHtmlBody`, the save path writing clean columns, an
      import-shaped row written straight to the columns proving the *read* path cleans and does not flag the row
      pending, `publishRow` carrying the clean draft to the site, and `storedValue`/`displayForm`.
      Gates: `npm run typecheck` · `npm run lint` · `npx vitest run` (**440** over 17 files, 424 + 16) ·
      `npm run build` · `npm run prove:no-wp` (5/5; 240 sitemap URLs, 273 routes rendered 0 failed, 0 requests to the
      WordPress origin) — the last run after the repair, which is what proves the site renders the same with clean
      columns.
      **Not in this slice:** the body still opens as source in a textarea — the WYSIWYG that replaces it is #246;
      an image is still a typed path, and click-to-edit with a local upload and compression is #245/14a *(the path
      box is gone as of 14a.2 — `0f6be31`; the textarea in the first clause is still true)*; and a
      `source` page body is *displayed* as markup on purpose, because that document is what the homepage reads.

**BK-13 is closed** (13.1–13.7). The console has one shell, one list primitive, one editor primitive and one
write-scope spelling; a new screen is built by naming a kind and a scope, not by copying a pane. Still open in this
plan, oldest first: BK-6 (6.3c), BK-7.5, then BK-14 → BK-18.

## BK-14 — every element of the site editable
Reality to design against: the copy today sits in three places — database content rows (BK-6, BK-7.2), authored files
(`src/data/nav.ts`, `treatments.ts`, home sections), and strings hard-coded inside components. This section moves the
last two into the database so the team never needs a developer for a word.
- [ ] 14.1 Element registry: an address per editable thing (`screen.element.field`, locale-aware), a type, a validator,
      and a default equal to today's hard-coded value — so the site renders byte-identical before the row exists.
      One table, one reader, one permission-checked API.
- [ ] 14.2 The shell: nav labels, order and dropdown children, footer groups, branch strip, booking CTA labels,
      phone / WhatsApp / email / hours, brand, tagline, theme colour.
- [ ] 14.3 Home, section by section: hero slides, intro prose, the three-card blocks and their "View all" labels,
      the reasons carousel, the CTA band.
- [ ] 14.4 The other pages: about, contact, faq, results header, privacy, services intro, and each treatment's
      tagline, steps, benefits and aftercare.
- [ ] 14.5 Section control: enable, disable, reorder, duplicate, per locale, with the site honouring the order.
- [ ] 14.6 The remaining component strings, then a gate that fails the build when a user-visible string in
      `src/components/**` has no registry entry (an explicit allowlist for non-user-facing text).
- [x] 14a.1 Media upload: bytes in, address out — `fff2e4c`
      The owner's complaint was specific and repeated: "any image added by uploading not path or link, and the cms
      compressing it for website performance". Every image control in this app started as a text box holding a path,
      and a path box is how a broken image ships — a typo, a file the host never had, or an address that points
      somewhere the site then fetches on a client's behalf. This row is the server half; the picker that replaces the
      boxes is 14a.2.
      **No migration, no new grant.** The `media` table (002_content.sql) and the `media` resource in the role catalog
      already existed and were unused by the console: Owner/Admin `*`, Editor and Marketer `create`+`update`, SEO
      `read`, Viewer none.
      **One enforcement path, unchanged.** The bytes travel as base64 inside the JSON body `guard()` already parses,
      so session → CSRF → `can('media.create')` → zod all answer *before* a single decoded byte is looked at. Teaching
      `guard()` multipart was the alternative and it is the one thing worth avoiding here: two ways to be admitted is
      two ways to be admitted wrongly. Routes are thin delegates, so `tests/roles.test.ts`'s write-scan needed
      `@/lib/media/api` in its `TRUSTED` map — that map asserts the delegate itself reaches `guard()`, so an
      allowlist cannot hide an unguarded handler.
      `POST /api/console/media` (upload) · `GET /api/console/media?limit=` (newest first, for the picker) ·
      `PATCH /api/console/media/<id>` (alt text in both languages).
      **A browser is not the authority on what it uploaded.** `src/lib/media/image-info.ts` reads PNG IHDR, the JPEG
      SOF chain, WebP's `VP8 `/`VP8L`/`VP8X` chunks and GIF's header off the bytes, and that is what `mime`, `ext`,
      `width` and `height` are taken from — `photo.jpg` sent as a PNG is stored as a PNG. SVG is refused on purpose:
      it is markup, and `next.config` allows SVG only for the committed brand wordmark. PHP or HTML opening with `<`
      answers `not_an_image_unsupported_format`; random bytes answer `unknown_format`.
      **Naming comes from the content hash**, never from what the browser called the file:
      `/uploads/<yyyymm>/<sha256[0..12]>.<ext>`. Two uploads of one photo are one file and one row, so re-saving a
      banner cannot accumulate `banner-2.webp` beside it. The `displayName` keeps the person's words for the library
      list, after stripping everything that is not a letter, number, dot, dash or space, with the extension replaced
      by the one the bytes prove.
      **The file is written before the row** — a row pointing at a missing picture is a broken frame on the public
      site, an orphan file is invisible. That ordering is also the recovery path: a re-upload whose sha matches an
      existing row restores the bytes at *that row's* address and updates nothing else, which is what a cPanel deploy
      that shipped the database but not `public/uploads/` needs. Content never has to be re-pointed.
      **`MEDIA_ROOT`** (new in `.env.example`) moves the bytes outside the tree a deploy rebuilds; the stored address
      stays `/uploads/…` either way, so the variable changes where files live and not what the site references.
      Default is `public/`. Tests point it at a temp folder, and the suite's `purge()` deletes the files its rows
      named — a media test that leaves `public/uploads/202610/` behind is a test that writes into the repo.
      **Compression is the browser's job, re-checked here.** `src/lib/console/compress.ts` resizes to a 1600 px long
      edge and re-encodes to WebP q0.82 on a canvas (JPEG when the engine cannot encode WebP, GIF and small files
      passed through), so `sharp` is not a dependency and `npm run build` stays offline-clean. `MAX_UPLOAD_BYTES`
      (8 MiB) is the ceiling for a hand-made request; the zod schema caps the encoded string at the same size so an
      oversized body is refused at parse, not after decoding.
      **Tests.** `tests/media.test.ts` (18): synthetic PNG/JPEG/WebP (lossy, lossless, extended) and GIF builders;
      the format table plus the rejection reasons; `fitWithin`/`canPassThrough`; the store (month folder + hash name,
      a lying filename, `../../etc/passwd` reduced to `passwd.webp`, dedupe to one row and one file, restore a missing
      file at the stored address, 400/413); and the rails a route has to hold — 401, `csrf_failed`, 403
      `media.create` *before* the body is read, 200 + the `audit_log` row, 400 `invalid_base64`, 400 on markup, the
      list read and the alt write, and no row that points at a file that is not on disk.
      Gates for this slice: lint clean · `tests/media.test.ts` **18/18** · `tests/roles.test.ts` **61/61** · whole-program
      `tsc` reports no error in any file this row added.
      **Blocked, and not by this row:** the repo-wide gates cannot be green while another session holds uncommitted
      edits in the same worktree. `npm run typecheck` and `npm run build` fail on
      `src/components/console/LeadsScreen.tsx` (references `leads.back` and `leads.section.context`, which
      `src/lib/console/messages.ts` does not define), and 5 tests in `tests/console.test.ts` +
      `tests/ui-primitives.test.ts` fail on content missing from a rewritten `src/app/console/console.css` (HEAD holds
      1639 lines, the working copy 2315, and `[data-locked='true']` is gone). Neither file is staged or touched by
      this row. `npm run build` and `npm run prove:no-wp` are **not yet run for 14a.1**; re-run both once that
      session lands. The `prefer-const` in `scripts/db/repair-plain.ts` was mine from `ac61770` and is fixed here.
      **Not in this slice:** the picker itself (14a.2), deleting or replacing a stored file (media is append-only
      until a row proves what usage means), and the public site's existing `/wp` mirrors — those stay the frozen
      backup and are not written to.
- [x] 14a.2 The picker: one control, at every place a picture is set — `0f6be31`
      14a.1 answered "what does the server do with bytes". This answers the owner's sentence: *"any image added by
      uploading not path or link, and the cms compressing it for website performance"* — a promise about **every
      screen**, which means the slice that fails is the one nobody thought to wire.
      **Four pieces, one definition each.** `src/components/console/ImagePicker.tsx` (a frame, a file input, a
      library drawer), `src/components/console/ImageGallery.tsx` (the same control tiled over a JSON document),
      `src/lib/console/upload.ts` (`uploadPicture(file, alt)` → compress → base64 → `consoleCall('POST',
      '/api/console/media')`, plus the pure `mediaMessageKey(code)` that turns a server code into a sentence), and
      the already-landed `isImageField()`. The editor's own `IMAGE_NAME` / `IMAGE_PATH` / `IMAGE_EXT` /
      `looksLikeImage` / `collectImages` are **deleted**, not kept beside them: two definitions of "this is a
      picture" is how a field reads as a photo in the picker and stays a plain box in the preview strip.
      **The address never comes from the file, and never from a keyboard.** The only value the picker writes is
      `outcome.value.src` — the string the server handed back — and there is no text input in the component to
      write anything else. `accept="image/png,image/jpeg,image/webp,image/gif"` matches what
      `src/lib/media/image-info.ts` proves from bytes, so the browser cannot offer a file the store will refuse.
      A file the browser cannot read resolves `{ ok: false, code: 'read_failed' }` and shows a sentence; this is
      why the suite runs without a DOM and still proves it. The input is cleared after every pick, so choosing the
      same file twice is one upload, not none.
      **The replaced box keeps its identity.** `if (isImageField(name, field))` renders the picker inside the same
      `<Field htmlFor={id}>`, and `id` now belongs to the file input stretched invisibly over the frame (`position:
      absolute; inset: 0`, deliberately *not* `display: none` — a hidden input is a keyboard-dead control and a
      `<label>` naming nothing). The banner label stopped saying "Image path" in both languages, and the AR/EN hint
      copy that told a person to type `/images/hero.jpg` is gone; the test asserts the old wording stays gone.
      **A JSON field keeps its textarea.** The shape belongs to the document and a person editing `data` has to see
      it, so the gallery is composed *under* the box, not instead of it. It renders one tile per `imageSlots()` hit
      and writes back with `writeSlot` / `appendSlot` / `removeSlot`, so an "add another" tile can only append a
      sibling of the tile it was pressed on, and `removeSlot` splices only an element of an array — a `{ src }` key
      on a plain object is the document's contract with the reader and is left to the single-picture picker.
      Malformed or empty JSON renders nothing at all (`if (root === undefined || slots.length === 0) return null`),
      because a half-typed document is the field's own complaint, not the gallery's.
      **Compression stays the browser's job, and says so.** The `Note` under a frame reads `media.compress_hint`
      before anything is chosen, then the real numbers after: `formatBytes(before) · W×H → formatBytes(after)` for
      the 1600 px / WebP q0.82 pass in `src/lib/console/compress.ts`. A pass-through (GIF, ≤ 250 KB) says so
      instead of inventing a saving.
      **`ui.css`, not `console.css`.** ~195 lines of `.ui-picker*` / `.ui-gallery*` appended after the select rules,
      which is both a deliberate choice (this is a primitive now, and the settings screen wants it too) and the only
      way to add it in this worktree — see the blocked paragraph. The sheet's own invariants hold: unlayered, no
      `outline:`, logical properties, `aspect-ratio: 16 / 9`-style literals, all colours through `var(--*)`.
      **Tests.** `tests/image-picker.test.ts` (27) is mostly about drift and coverage, which is what a promise like
      this dies of: every `labels['media.*']` the components read exists in the catalog *in both languages*; a code
      becomes a sentence about your own file (11 cases, AR ≠ EN); the editor wires the control rather than
      re-inventing it; the five names it used to own (`IMAGE_NAME`, `IMAGE_PATH`, `IMAGE_EXT`, `looksLikeImage`,
      `collectImages`) are absent from the editor's source; every class the components put
      on a node has a rule in `ui.css`; and — new for this repo — four real `renderToStaticMarkup` renders prove
      what the DOM actually says: a filled frame emits `<input id="field-image" … type="file">` and no `type="text"`,
      an empty one emits `data-empty="true"` and "No photo yet", and an offer document with `{ ar: [{src}], en:
      [{src}] }` emits 5 file inputs, 3 `<img>`, 3 "Remove this photo" and 2 "Add another photo" — with the
      malformed-documents cases rendering the empty string.
      **What the row could not see:** no browser. A second `next dev` in this worktree would share `.next/` with the
      server the other session is running on `:3000`, so the picker is proven by rendered markup and by source
      assertions, **not by pixels** — the drag of a real file, the WebP re-encode in a live canvas, and the library
      drawer's scroll are unverified visually and should be walked once the tree is single-authored.
      Gates for this slice: whole-program `tsc` **0 errors** · `eslint` **0 errors** · `tests/image-picker.test.ts`
      **27/27** · with `image-field` 16, `media` 18 and `roles` 61 the four media suites are **122/122** · **no file
      this row added or edited is among the failures below**.
      **Still blocked by the shared worktree, and unchanged by this row:** the full run is `Test Files 3 failed |
      17 passed (20)` — 12 failures, every one in `console.test.ts` (4), `ui-primitives.test.ts` (7) and
      `typography.test.ts` (1), and every one reading `src/app/console/console.css` or `src/app/globals.css`, which
      this row does not touch. The newest names `.settings-section-head .ui-lede` and the one font-family failure
      traces to `font-family: var(--font-mono, …)` at `console.css:908`/`1017`. `npm run build` and
      `npm run prove:no-wp` are **still not run for 14a**. `src/lib/console/messages.ts` carries this row's 19
      `media.*` keys and the reworded banner copy; it also carries 5 keys the other session's screens needed
      (`settings.unsaved`, `settings.read_only`, `settings.banners.default`, `settings.banners.reset`,
      `leads.section.context`) — additive, AR and EN in parity, and harmless to land before those screens do.
      **Deferred to 14a.3, on purpose:** the Settings banner card and the raw-JSON settings gallery are already
      wired on disk, and the `ImagePicker`/`ImageGallery` calls need no further work — but `SettingsWorkspace.tsx` is
      mid-rewrite in this worktree (≈500 → ≈850 lines, reformatted under me while its assertions were being
      written), so committing it would attribute somebody else's unfinished screen to this row. `14a.3` = that
      screen's picker + the two source assertions over it.

## BK-15 — SEO center: the specialist's feature set, all local
New tables: `seo_meta` (per entity per locale), `seo_templates`, `redirects`, `not_found_hits`, `crawl_issues`,
`sitemap_settings`, `robots_directives`. Every one of these has its column set decided before 15.1 so 15.9 and an
outside data source can be bolted on without a rewrite.
- [x] 15a Page visibility + the site's own configs on the Settings screen — `1ea9f9f`
      The owner asked for two things in the same breath: every page listed in Settings with a show/hide switch
      ("كل الصفح وادوس تفعيل او اخفاء ليها"), and every config — meta tags, description — editable there too.
      **No migration.** The existing `settings` table already has the shape: group `pages`, one row per route,
      `{ "enabled": boolean, "redirectTo": string | null }`. A missing row means enabled, so a site that never opens
      the screen behaves exactly as before, and `readPageStates` fails **open** — it runs in the layout, every page,
      the sitemap and the not-found document, so a database outage must not turn the site into a wall of 404s.
      `src/lib/content/settings-catalog.ts` is the client-safe registry the console renders from (key, unprefixed
      path, AR/EN label); the console cannot list a route the site does not render. `cart` and `checkout` are not
      routes here and are not offered.
      **One guard per route.** `guardPage(key)` is the first statement of all 15 public page components; detail
      routes (`blogs/[slug]`, `offers/[slug]`, `services/[slug]`, `branches/[slug]`) guard their listing's key, so
      hiding Stories also hides every article under it. A hidden page answers `notFound()`, or follows its saved
      target when one exists. The target is validated on the way in and on save (`safeRedirect`): a local path or an
      absolute http(s) URL only — `//host` and `javascript:` are refused, because a redirect is the one value here
      that can send a visitor off the site.
      **What stops advertising it.** The `[lang]` layout reads the states once and passes `hiddenPageHrefs()` through
      `SiteShell` to the header and footer (desktop, mobile, and the footer's Site column), and the branded 404
      document does the same. `sitemap.ts` tags every route with its page key and drops hidden ones, so hreflang
      alternates go with the URL rather than pointing at a 404. A successful settings write calls
      `revalidatePath('/[lang]', 'layout')` — the public pages are ISR, and without it a hidden page would keep its
      nav line until the five-minute window closed.
      **Configs.** `site` keeps its six words (name, tagline, phone, WhatsApp, email, hours) and gains a visible
      screen; `seo` holds `title.ar/en`, `description.ar/en` and `verification.google`, read by the root
      `generateMetadata` through `getSiteMeta(lang)` with the authored `siteConfig` as the fallback. Fields are
      plain inputs, not a JSON box — a phone number should not have to be quoted. An emptied box sends `null`,
      which unsets the row and restores the authored value (the site reader already skipped blanks). Only dirty
      fields are written. Every other saved row remains editable as JSON in an Advanced section, and a row flagged
      `is_secret` says the value is configured in the environment without exposing or accepting it.
      **Tests.** `tests/settings-pages.test.ts` (7): the parse shapes a LONGTEXT-backed JSON column may arrive in,
      fail-open cases, the redirect allowlist, `hiddenPageHrefs`, the real `pages` group in the test database, the
      guard's three answers (404, redirect, pass) with `next/navigation` replaced by signals, and `getSiteMeta`'s
      fallback/override/blank-row path against the real `seo` group. `tests/ui-primitives.test.ts` names the one new
      placement hook (`.settings-page-controls .ui-field`, margin only).
      **Probe rows cleaned, not hidden.** Two settings rows this work had written earlier to prove the write path
      (`pages.about` hidden, `site.hours` changed to 18:00) were still live in `shamah_cms`; both were deleted after
      their values and audit rows were read back, which restores the authored hours and `/about`.
      Gates: typecheck · lint · `vitest run` **396/396** · `next build` clean · `npm run prove:no-wp` **5/5**
      (238 sitemap URLs, 271 routes rendered 0 failed, smallest HTML 27079 bytes, 0 requests to the WordPress
      origin) — the same 238/271 baseline row 19.3d recorded, so the restored rows did not move it.
      **Not in this slice:** links inside a page body (the home "View all" cards, About's "our doctors") still point
      at their target when it is hidden — the guard answers 404 there. Hiding those belongs to section control
      (14.5). The screen also has not been opened in a browser this pass: it renders in the build, but its table at
      desktop width and its stacked fallback below 46rem were not seen; that check belongs with 19.6.
- [x] 15a.1 Page banners editable from Settings — `cdf44c5`
      The brief's last console clause ("the banners not added in the console as something in the site need a gate to
      be editable") was literal: every listing page drew its hero photo from `src/lib/images.ts`, so swapping one
      meant a deploy. The photo is now the same kind of row as a page state: group `banners`, one key per page,
      value `{ "src": string, "altAr": string, "altEn": string }`.
      **Fail-open, like page visibility.** A missing row, an unreadable value or a database that cannot be reached
      returns `BANNER_DEFAULTS[key]` — the exact `images.*` slot the page drew before — so the public site is
      byte-identical until someone saves. `readBanners()` is one query per render; each page asks for its own key.
      **What a row may name.** `safeBannerSrc` accepts only a rooted same-site path: no scheme, no `//host`, no
      whitespace or control characters, no `.`/`..` segments (the loader would resolve them to a different file than
      the one written). A row that fails is ignored, never repaired to a default — the same answer as "never saved"
      and no broken frame. `next/image`'s configured host list (`shamahclinics.com` only) is why a remote URL is not
      offered; uploading a new file is 14a's media library, not this row.
      **Wiring.** `getBanner(key)` runs inside each page's existing `Promise.all`; the eight listing clients take
      `banner: PhotoSlot` instead of naming `images.*` at the `PageHero`. Home is the one exception: `HomeHero` keeps
      its WP slider, so it asks `getBannerOverride('home')` and uses the saved photo **instead of** the slideshow,
      never appended to it (two visuals claiming the same slot would be the console promising a preview it does not
      render). Blank captions fall back per language to the authored alt text, so a hurried photo swap cannot ship
      with no caption. FAQ and privacy are absent on purpose: their hero is a band of type.
      **The console card.** Between Pages and Site, one card per page in an `auto-fill, minmax(19rem, 1fr)` grid —
      the settings panel's 34rem form measure would stack nine photos into one long column, so this panel alone
      takes the content width. Each card shows the label, route, a "custom photo" badge once saved, the live preview
      (16:9, the ratio `PageHero` crops to) and three fields: path, Arabic alt, English alt. Save writes only that
      page; emptying the path writes `null`, which the reader treats as absent and the authored photo returns. Saved
      banner rows are added to the Settings screen's `known` set, so they never reappear as JSON in Advanced.
      **Tests.** `tests/banners.test.ts` (9): the path allowlist (remote, protocol-relative, dot segments, whitespace,
      NUL), the parse shapes a LONGTEXT-backed column may arrive in, invalid-row and unknown-key cases, the registry
      (every banner key is a site page; FAQ/privacy excluded; defaults local with both captions), the per-language
      alt fallback and the 16:9 slot, plus the real `banners` group: fallback until saved, replace only the named
      page, the home override, and an invalid row ignored. Suite **424/424**.
      Gates: typecheck · lint · `npx vitest run` **424/424** · `next build` clean · `npm run prove:no-wp` **5/5**
      (240 sitemap URLs, 273 routes rendered 0 failed, smallest HTML 25842 bytes, 0 requests to the WordPress origin).
      **Not in this slice:** the Settings screen was not opened in a browser this pass (signing in needs the owner's
      account), so the three-column grid at desktop width and the one-column fallback below 46rem were not seen; the
      markup, the built app and every public route were. Choosing a photo from the media library belongs to 14a, the
      home slideshow's individual slides to 14.3, and the remaining hard-coded photos inside page bodies to 14.4.
- [ ] 15.1 Meta per entity per locale: title, description, canonical, robots (index/follow/nocache/AI), primary image
      + alt, OG title/description/image, Twitter card, focus keyword, breadcrumb label, and a `noindex` default for
      drafts. The site's `<head>` reads it, which replaces `resolveSeo`'s snapshot fallback and closes the `seo.json`
      leftover recorded in 7.5.
- [ ] 15.2 Template engine: site-wide and per-type patterns (`%%title%% %%sep%% %%sitename%% %%page%% %%tag%%`) with
      the documented variable set, live preview per locale, applied only where the entity has no manual value.
- [ ] 15.3 Content analysis, the scored panel a specialist expects: title pixel + character length, description
      length, keyword in title / H1 / first paragraph / description / URL / image alt, internal and external link
      counts with `nofollow` detection, heading order, word count, alt coverage, readability — deterministic, and each
      failure prints the fix it implies rather than a red dot.
- [ ] 15.4 Structured data builder + validator: `MedicalClinic`, `Physician`, `MedicalService`, `Article`,
      `Product`/`Offer`, `FAQPage`, `BreadcrumbList`, `AggregateRating`; the site's JSON-LD generated from it, and a
      local schema.org rules pass (required/expected properties, date and URL formats) over whatever is emitted.
- [ ] 15.5 Local SEO: NAP per branch, `geo`, `OpeningHoursSpecification`, `sameAs`, logo and brand image — one source
      feeding both the JSON-LD and the footer, replacing `src/config/site.ts` hand-editing.
- [ ] 15.6 Redirects manager: 301/302/307/410, exact / prefix / regex, loop guard, case-insensitive flag, hit counter,
      CSV import-export, enforced at the proxy edge so every old WordPress URL keeps working after cut-over.
- [ ] 15.7 404 monitor + site crawl: unmatched URLs logged with referrer and count, one-click "create redirect" from
      the row, and a crawl that reports missing meta, thin content, orphan pages, duplicate canonicals, mixed-locale
      pages and alt gaps.
- [ ] 15.8 Sitemap + robots from the database: include/exclude per type per locale, image extension, hreflang
      alternates, `robots.txt` editable per user-agent with an AI-crawler group, both locales.
- [ ] 15.9 SEO dashboard: site-wide score, worst 20 pages, keyword coverage, index status, per-type completeness, and
      the SEO fields reachable inline on every content screen (13.4's right pane) — because an SEO person should not
      hunt for them.
Explicitly not shipped, with the reason: live rank tracking (needs a paid SERP API), AI text generation (needs a
vendor key), Bing/Webmaster and Search Console APIs (need a Google Cloud project the owner has not created). The
schema leaves room for each, and BK-17's Connectors screen is where a key would go when that changes.

## BK-16 — Users, Roles & permissions
- [x] 16a Accounts and roles: the two screens, the catalog in words, and the rails that keep them safe — `3750ea4`
      **Two screens, one registry entry each.** `users` and `roles` join `CONSOLE_SCREENS` in the `site` group
      beside Settings — accounts are configuration rather than content — behind `user read` and `role read`.
      Admin holds `* read`, so Admin sees both lists without holding a single write; a page that cannot write
      renders its fields as text rather than hiding the screen. `tests/console.test.ts` expects both keys in the
      nav for Owner and Admin and nowhere else, and the page-file/registry equality still holds.
      **One handler per route, all through `guard()`.** `/api/console/users` (GET list, POST create),
      `/api/console/users/<id>` (PATCH), `/api/console/users/<id>/password` (POST), `/api/console/roles` (GET,
      POST) and `/api/console/roles/<id>` (PATCH, DELETE). Permission is answered before the body is read, so
      Admin `POST {}` answers 403 `forbidden` while a caller with `user.create` but a bad payload answers 400
      `invalid_input` — the ordering 16.5 names, asserted in both directions. Every successful write lands in
      `audit_log` with before/after.
      **Three rails the browser cannot edit.** (1) Nobody changes their own role or status: `self_locked`; a name
      or language edit on oneself still passes. (2) The last active Owner can neither be disabled nor demoted —
      `anotherOwnerRemains()` reads the live links, not the submitted role. (3) The six catalog roles are
      immutable here (`system_role_immutable`) because `syncRoles()` owns them and would revert the change on the
      next deploy. A custom role that still has members answers `role_in_use` rather than deleting a link out
      from under people; a deleted custom role goes with its grants, because `roles.name` is unique even for
      tombstones and a leftover would block the next role of the same name.
      **Accounts are disabled, never deleted.** Nothing in this slice writes `users.deleted_at`; disabling
      revokes every open session immediately, so an old tab stops working now rather than at cookie expiry. A
      password someone else sets is temporary by definition — `setPassword()` gained `mustChangePassword` — and
      revokes every session except the one that performed the reset. Creating an account without a name still
      gets the email's local part as a label.
      **The catalog in words.** `src/lib/users/catalog.ts` labels every resource and action in AR/EN and groups
      them the way the screens are (Content · Marketing · Site and accounts); a resource without a label is a
      type error. `permissionCatalog(locale)` resolves the whole matrix on the server and passes plain data
      down, so the browser never imports `roles.ts` (which carries a database client) and a language switch is a
      server render. Grants are validated against `RESOURCES × ACTIONS` by zod, so a custom role can only ever
      hold a subset of the universe; scopes are checked against `SITE_LOCALES` and `LIST_KEYS`, and only the two
      dimensions a seeded role actually narrows are offered.
      **What the screens do.** `UsersScreen` arrives with its first page already drawn by the server and keeps
      `q`, `status`, `role`, `page`, `per` in the URL through `replaceState`; the detail pane is sticky above
      1024px and stacks below it. There is no Delete button, and no fourth verb. `RolesScreen` prints system
      roles read-only and edits a custom role's whole grant set at once — the matrix is replace-not-merge, so an
      unchecked box is a grant that disappears. Scope is honest about `can()`: "all languages" is the *absence*
      of `locales`, not both keys listed.
      **A gate caught a regression outside the slice.** #240 (`99e34da`) had dropped `input, select` from the
      dark-theme element rule in `globals.css`; the bare site inputs would have painted light-on-dark. Restored,
      with `tests/ui-primitives.test.ts` already holding the expectation.
      **Tests and gates.** `tests/users.test.ts` (15) covers create + temporary password + audit, duplicate
      email, role replacement, `self_locked`, last-Owner disable and demote, reset semantics, list filters and
      page clamps, the 403-before-400 pair, `read_required`, wholesale grant replacement, `role_name_taken`,
      `system_role_immutable`, `role_in_use` then delete, and Owner-wildcard ordering. `tests/roles.test.ts`
      trusts `@/lib/users/api` in the route sweep; `tests/ui-primitives.test.ts` records the two new placement
      hooks and proves no `.ui-*` primitive is re-painted. Gates: typecheck · lint · `vitest run` **415/415** ·
      `next build` clean · `npm run prove:no-wp` **5/5** (240 sitemap URLs, 273 routes rendered 0 failed,
      smallest HTML 25842 bytes, 0 requests to the WordPress origin, host named 0 times).
      **Not in this slice, and still on the rows above:** the per-account audit trail (16.1), My role (16.3),
      access requests and the approvals inbox (16.4), and stale-grant repair (16.5) — locale scope is enforced
      by `can()` on every read and write already, but this slice adds no test that narrows a *custom* role by
      locale. The screens were not opened in a browser this pass; the split at ≥1024px and the stacked fallback
      below it were not seen and belong with the 19.6 visual pass, as with 17a.
- [ ] 16.1 Users screen: add an account, set its role and locale, reset a password, disable an account, delete nobody
      (the never-delete rule), and an audit trail filtered per account.
- [ ] 16.2 Roles & permissions tab: create a role, and check permissions straight from the catalog (`resource × action
      × scope`) so a custom role is not limited to the six; the catalog gains human labels grouped by screen, so the
      list reads "Publish an article" and not `article.publish`.
- [ ] 16.3 My role: the signed-in user's grants rendered as the tree of screens they reach, with what they cannot do
      visible and greyed instead of 403-surprised.
- [ ] 16.4 Access requests: ask for a role or a single permission with a reason → the Owner's approvals inbox → accept
      or deny, with expiry and an audit row; accept applies the grant through the same seeder path, never by hand.
- [ ] 16.5 Guardrails: the 403-not-400 ordering, stale-grant repair, Owner protection, locale scope enforced on read
      *and* write, and a test that a custom role can only ever hold a subset of the catalog.

## BK-17 — Leads + Connectors
- [x] 17a Both forms into the leads table, and the screen that works them — `7fe5e6f`
      **Capture.** `/api/v1/lead` records every valid submission (after the rate limit, before the
      WhatsApp/CF7 branch) through `src/lib/leads/store.ts`; a failed insert is swallowed and logged,
      because the visitor's WhatsApp link must not depend on the database. The two forms are told
      apart by the one reliable difference — a booking sends a date or a branch — and the record
      carries `page_path`, `referrer` and the five `utm_*` tags parsed off the referer. The idempotency
      key is a five-minute bucket of `sha256(ip|name|phone|date|subject)`, so a double tap is one row
      and two real enquiries are two; the column is UNIQUE, so every insert supplies a key.
      **The screen.** `src/lib/leads/view.ts` builds one row shape for the server page, the list and the
      detail endpoint, so a row refreshed in the browser cannot lose a field the server-rendered copy
      had. `LeadsScreen.tsx` is the console's first list whose rows are people: counts live above the
      list as chips (the question the screen exists to answer), the detail pane holds the two verbs
      (status, note), and the URL stays the state with `replaceState`. A `contact_hidden` row still
      appears — a Viewer's job is to count — with name/phone/email/message/extra fields blanked and
      `read_only` where the name would be; notes are withheld with them because a note is where staff
      paste exactly what the rule hides.
      **Scoped writes.** The guard reads a lead's source from `?source=` (URL, never body) and the
      handler re-checks the loaded row's `source`, so a pasted id cannot borrow another source's
      grant: `?source=booking` on a contact-form id answers 404, the wrong source answers 403, and an
      invalid status answers 400 only after permission passed. Every successful move writes
      `lead.update` with before/after.
      **A catalog defect this screen exposed.** Marketer could `create/update/delete/export` a lead
      but not `read` one — a grant it could never exercise on the screen that works it. `roles.ts` now
      spells `read` beside `WRITE` for that role, with a `tests/roles.test.ts` case.
      **Tests and gates.** `tests/leads.test.ts` (15) covers persistence + UTM/fields, double-tap dedupe,
      both sources, Owner vs Viewer redaction, notes withheld, source-scoped writes and notes, filters,
      paging and view parsing. `tests/console.test.ts` expects `leads` in the sidebar for every role with
      `lead read` (all but SEO), and `tests/ui-primitives.test.ts` records the one new placement hook
      (`.console-lead-note-list > .ui-note`). `tests/roles.test.ts` trusts `@/lib/leads/api` in the
      route sweep, with the same transitive guard assertion as the other delegates.
      Gates: typecheck · lint · `vitest run` **389/389** · `next build` clean · `npm run prove:no-wp`
      **5/5** (240 sitemap URLs, 273 routes rendered 0 failed, smallest HTML 25839 bytes, 0 requests to
      the WordPress origin, host named 0 times).
      **Not in this slice, and still on the rows above:** CSV export and per-lead delivery state (17.2),
      the connectors/Apps Script work (17.3–17.5), and retiring the CF7 forward (17.1). The screen was
      not opened in a browser this pass — it renders in the build and the route sweep, but its split at
      ≥1024px and its stacked width below that were not seen; that check belongs with the 19.6 visual
      pass.
- [ ] 17.1 Both forms into the database: contact form and booking wizard → `leads` with `source`, the appointment
      fields (date, branch, service, specialist, slot), status, notes, assignee, dedupe and an idempotency key, and
      role-scoped redaction of phone numbers. Then retire the CF7 forward — `LEAD_MODE=cf7` and the last
      `wp-json` call in `src/app` disappear with it.
- [ ] 17.2 Leads screen for the marketer: inbox by source/status, filters, CSV export, per-lead delivery state, and
      the redaction they are entitled to.
- [ ] 17.3 Connectors screen: outbound integrations in one place — Google Sheets per form type, a test-send that shows
      the exact payload, a retry queue with visible attempts and errors, and enable/disable per connector.
- [ ] 17.4 The Apps Script deliverable: `connectors/google-apps-script.gs` — a Web App that checks the shared secret,
      creates the sheet with the exact header row if missing, appends with dedupe on the lead id, and returns which
      row it wrote; the console holds only the URL + secret, never Google credentials.
- [ ] 17.5 The column contract written twice: in `docs/GOOGLE-SHEETS.md` and on the screen itself — every column name,
      type, allowed values, which locale the value arrives in, what happens when a column is renamed, and a sample
      sheet to download; plus the click-by-click tutorial for publishing the script and pasting the URL.
- [ ] 17.6 Default is the database, always: a lead is committed before any connector runs, and a connector failure can
      neither block the visitor's confirmation nor lose the lead.

## BK-18 — click-to-edit on the site (last: it needs 14's addresses and 15's panel)
- [ ] 18.1 Element bridge: in preview mode only, the site tags every registry-backed element with its address.
- [ ] 18.2 Overlay: open a page from the console, click the element, edit it in the side panel, see the draft on the
      real page, save or publish — every write through the same guard the API uses; the overlay is a view, never a
      permission.
- [ ] 18.3 Section affordances from the overlay: reorder, enable, duplicate, and the 15.3 analysis panel docked to the
      page being edited.

## BK-19 — the owner's end-to-end brief of 2026-10-23 (migrate, strip WordPress, redesign)

> "after you finish the cms and everything is stable add all the content from WP to our cms and clean the WP from
> shamah and every fingerprint related to WP to raise our performance" — then a 115-line brief: Phases 1–7 (audit,
> run locally, backup + migrate, connect the site, clean up, a full visual + motion redesign of **dashboard and
> public site**, QA + push), branch `feature/cms-migration-redesign`, a commit per phase, nothing deleted before a
> backup exists and the migration is verified, no secrets/dumps committed, PROGRESS.md as the ledger, build + lint
> green per phase, "the frontend is the priority… I do not care about the actual content inside the CMS, only that
> it looks and feels exceptional".

### Phase 1 — audit. Measured, not restated
**Two engines exist and they are not the same product.** `D:\shamah` (GitHub `ShamahClinic.git`, branch
`admin-restore`, tree dirty: `src/app/[lang]/admin/page.tsx` deleted, `src/app/admin/`, `psql`, `start-server.bat`
untracked) has moved to **SiteDash + Prisma/PostgreSQL** — `prisma/schema.prisma` with a `postgresql` datasource,
`src/lib/sitedash/`, `src/app/admin/`, commits `f3a726c → 858d9ba → 1e00b21`. `D:\shamah_cms` (this ledger) is the
**own console on MariaDB**, and its only remote is the local path `D:/shamah`. The new brief names SiteDash; the
standing decision of 2026-10-22 names this console. **This plan runs against this console**, because it is where the
brief's Phases 3 and 4 are already substantially true, and it records the fork instead of silently picking one.

**The WordPress dependency, in the repo that still has it (`D:\shamah`):** `src/lib/wp` = 18 files, imported by 39
files; `src/lib/wp/config.ts:4` defaults `WP_ORIGIN` to `https://www.shamahclinics.com`, so with `WP_BASE_URL` unset
(as it is here) a runtime read goes to the client's production WordPress; `data/wp` 3.4 MB / 18 JSON; `public/wp`
1.4 MB / 60 webp; `next.config.ts` still allowlists both WP hostnames for `next/image`; the contact form still posts
to a CF7-compatible route; JSON-LD `#organization` names the WP domain (`src/config/site.ts:76`).

**Already delivered here against the same brief** (so the plan does not re-schedule it): Phase 2 = the commands block
at the top of this file and `npm run doctor`; Phase 3's backup = `data/wp/` + `public/wp/` are the frozen WordPress
backup (rule 5) and a fresh dump is re-generable with `npm run sync:wp`; Phase 3's migration = BK-7.2 + 7.5-a put
**179 content rows** in the database (92 articles · 4 offers · 27 pages · 56 result stories, 2 categories) from a
dry-run-default, re-runnable, idempotent importer; Phase 4 = BK-6.3c-a/b + 7.3 + 7.5-a make articles, offers, pages,
home prose, settings and `/results` membership read the database first, with `npm run prove:no-wp` at **79 routes, 0
requests to the WordPress origin**; Phase 5 = BK-7.3 already deleted the live WP client **in this repo**. What the
brief adds that is genuinely not done: the rest of 7.5 (`seo.json`, `offer-categories`, the fallback rung itself),
6.3c-d, BK-14→18, the cut-over **in `D:\shamah`** (task #220), and all of Phase 6.

**The design surface, measured (this is what Phase 6 actually costs):**
- Console: 8 screens + login + password, **2 611 LOC** in 14 components; `console.css` is 1 408 lines holding the
  frame and every primitive. The site has ten primitives in `src/components/ui` (`Photo`, `Reveal`, `Counter`,
  `Marquee`, `Swiper`, `SectionHeading`, `Breadcrumbs`, `CtaBand`, `DatePicker`, `FloatingActions`) and the console
  imports **none of them**: its buttons, inputs, tables, dialog, toasts and palette are hand-written markup inside
  `ConsoleList/ConsoleEditor/ConsolePalette/ContentWorkspace/ConsoleControls/LoginForm/PasswordForm/SettingsWorkspace`.
  Restyling means editing those eight files, not swapping a library in — and 19.3 is a shared set both surfaces use,
  not a second folder next to the first.
- Theming is half-built: `data-theme` / `data-density` / `dir` are decided on the server from the prefs cookie
  (`src/lib/console/prefs.ts`, no client script, no flash) — but console.css contains **one** `[data-theme='dark']`
  rule. Dark mode is a single override, not a palette. There is no `prefers-color-scheme` and no animated toggle.
- Motion: 4 `transition` declarations, 2 `animation`, 1 `@keyframes` in 1 408 lines, and **no
  `prefers-reduced-motion` block anywhere in the console**. `framer-motion@13.4.4` is installed and unused by it;
  `lucide-react` is used by 24 site files and 0 console files.
- The public site already owns the brand the brief asks for, and the console should inherit it rather than re-derive
  it: `--gold-start #d8b237`, `--gold-mid #c9a227`, `--gold-end #85640f`, `--bg-primary #faf7f2` (warm ivory),
  `--bg-dark #191412` (warm charcoal), plus documented contrast pairs, `--ink-on-gold`, focus rings and status
  pairs measured in `docs/contrast-report.md`. `--bg-card: #ffffff` is the one pure-white stop, and the brief says
  never pure white.
- Two globals fight any redesign: `* { transition: all .3s ease-in-out !important }` (three occurrences,
  `globals.css` 143/153/557) — it animates layout properties, defeats `transform/opacity` discipline and makes a
  themed toggle unverifiable — and `img { width: 100% !important }`, which overrides every intrinsic-size hint and is
  a CLS hazard.
- Fonts: `src/lib/fonts.ts` loaded **Readex Pro + Montserrat from `next/font/google`**, so `npm run build` needed
  outbound DNS (BK-0.2 recorded the failure). The brief asks for **Tajawal**. That is a real decision, not a
  find-and-replace: Readex Pro is the Arabic face the current contrast report was measured with, and switching the
  public site's typography is a visible change to a live brand. → taken in 19.2, with the mixed-script argument that
  decided it; `docs/contrast-report.md` is the file that has to be re-read if a measured pair moves.
- `tests/console.test.ts` (763 lines) asserts **CSS strings and class names**, and 13.5 added source-walk tests that
  fail if a page re-invents a primitive. A redesign therefore has to update those assertions in the same commit as
  the styling, deliberately — "the tests broke" and "the design changed" must not be confused.

### Phase 6 is the new work: rows 19.1–19.8
Every row keeps the standing rules: public props contracts unchanged, one commit per row with its hash, all four
gates plus `prove:no-wp` when a read path moves, and the console suites' assertions updated in the same commit as
the markup they name.

- [x] 19.0 Branch `feature/cms-migration-redesign` from `cms-clean` HEAD (`3d40693`); `/backups/` git-ignored and
      the frozen WordPress backup copied into it (`backups/wp-frozen-2026-10-23/`, 78 files / 4.7 MB, both
      `diff -rq` runs silent); this audit section. `02d2fbf` No source file changed, so the four gates are inherited
      from `3d40693` rather than re-run for a docs-and-config commit.
      **The brief's Phase 7 push is on hold, and it is not a oversight.** `D:\shamah_cms`'s `origin` is the local
      path `D:/shamah`, so "push the branch" here means writing into another session's dirty working tree; the
      GitHub remote lives on `D:\shamah`, whose `main` feeds a deployed Vercel app
      (`https://shamah-clinic.vercel.app`). Pushing needs the owner to say which repo and which remote, and the
      protocol's "never push" holds until then.
- [x] 19.1 Tokens: one source of truth for both surfaces — radii, a 4px spacing scale, shadows, blur, z-index,
      easing curves and durations — as CSS variables the console and the site both read, alongside the colour
      layers that already were one. `66f85e6`
      **What the row found is that the brief was asking for something the site already had.** The palette, the
      charcoal `#191412`, the ivory `#faf7f2`, the gold ramp, the warm button/status pairs and their measured ratios
      all exist, in one place, and the console already reads them — so this did not build a design system, it
      finished one: the half that does not travel with colour (spacing, radii, elevation, hairlines, a z ladder,
      named durations and curves) was the part that was missing, and it was missing in both files at once.
      Added to `globals.css`: `--sp-1…--sp-24` on a 4px base; `--radius-control` (0.65rem) and `--radius-surface`
      (0.9rem) — the two the console drew by hand ten times; `--hairline`, `--hairline-strong`, `--hairline-gold`;
      `--elev-1/2/3` tinted with the page's own brown rather than black, plus `--glow-gold`, `--blur-glass`,
      `--glass-surface/border`; `--z-sticky…--z-toast`; `--dur-fast/base/slow/reveal` (150/220/340/500ms) and
      `--ease-out/in-out/spring`. The four that genuinely change with the palette (`--hairline*`, `--elev-*`,
      `--glass-*`) are re-declared under `html[data-theme="dark"]`, which is where a 10%-black hairline vanishes on
      charcoal and a brown-tinted shadow stops being a shadow.
      Not added: a champagne accent token. `--gold-gradient` already sweeps `#f5e6a8 → #e8c766` and a second name for
      the same champagne would have had no reader until 19.3 gives it one — the rule for this block is that a token
      earns its place with a consumer that exists today, and the primitives are where an accent gets used.
      `--bg-card` light was `#ffffff` — the one pure-white stop, and the brief says never pure white. It is
      `#fffcf8` in both `globals.css` and `siteTheme.light` (the inline style is what actually paints, so editing one
      of the two would have changed nothing on screen). Measured after the move, ink against the new card:
      text-primary 17.16 → **16.77**, secondary 6.24 → **6.10**, muted 5.59 → **5.46**, gold 5.49 → **5.36**,
      danger 6.54 → **6.39**, success 7.08 → **6.92** — every pair past AA against the card *and* against the page
      behind it. `--text-on-dark: #ffffff` was left alone and that is deliberate: the brief's "never pure white"
      names backgrounds, and that stop is the measured label on bottle-green and on charcoal, not a surface.
      **The `transition: all .3s ease-in-out !important` rule is gone, and it was load-bearing in three places.**
      It sat on `*`, on `html` (which animates nothing), and on the site's `button`/pill selector. Consequences
      measured rather than assumed: it made every state change a layout change, because `all` includes `width`,
      `padding` and `visibility`; its `!important` outranked every Tailwind `transition-*`/`duration-*` utility, so
      the site's own components could not ask for a different curve without their own `!important`; and it is why
      `console.css` line 186 says `transition: transform 0.18s ease !important` — a drawer that transitions
      `visibility` is still `hidden` a frame after it opens, and focus cannot enter a hidden subtree (13.1 measured
      exactly that). The replacement lists the six properties a control changes state in — `color`,
      `background-color`, `border-color`, `box-shadow`, `transform`, `opacity` — on the interactive selectors,
      without `!important`, so a component that names its own utility now wins. Nothing that animated before stops
      animating now, because `transform` is in the list.
      The console takes the tokens where they are already correct: card, panel, table wrap, row skeleton and preview
      frame move from a 1px gold-outline border to `--hairline` (cards and panels also gain `--elev-1`, the palette
      `--elev-3`, the floating bulk bar `--elev-2`), the drawer takes `--z-drawer`, and every radius and duration
      literal became a name. Control borders were **not** softened: 1.4.11 needs 3:1 on a boundary a person must see
      to use a control, and `--border-control-soft` is what carries that — the hairline is for objects, which is the
      distinction that did not exist before this row and the reason every panel looked outlined in gold.
      Tests 316 → **318 over 10 files**, one rewritten and two added in `tests/console.test.ts`: the drawer case now
      asserts the *absence* of the blanket rule and that the drawer still names `transform`; a token case asserts
      each theme-independent token is declared exactly once (and the four theme-dependent ones exactly twice) and
      that `console.css` contains no radius or duration literal left over; and a drift case walks `siteTheme.light`
      and fails if any variable that also has a `:root` fallback disagrees — because the document that can forget
      its inline style is the error page, and that is the worst place to discover a theme bug. Two failures were
      caught by the new tests, not by reading: `--text-gold` was declared twice in `:root` (`#c9a227`, then
      overwritten four lines later by the readable `#85640f`), which is a fallback that silently differed from the
      painted value; and the first draft of the "must not come back" assertion matched the comment that explains
      what used to be there, so it is anchored to one declaration.
      Gates: typecheck · lint · `vitest run` 318/318 · `next build`. `npm run prove:no-wp` was **not** re-run: no
      read path changed — `siteTheme` gained a colour value and `globals.css` is not imported by a reader. The
      already-running MariaDB on 3307 served the suites; `npm run db:local:start` from this shell correctly refused
      to double-start (`ibdata1 must be writable`) and left the other session's server alone.
      **What this row could not see:** the hairline is a ~5% luminance step on the card it bounds, which is what a
      hairline is, and the elevation is a shadow — both are judgements about pixels the automation viewport cannot
      settle here, so they are argued from the measured ratios and from the 13.1 drawer history, and 19.6 re-opens
      them against a real screenshot when the screens are rebuilt on top.
      `img { width: 100% !important }` stayed, and that is a decision rather than an oversight. The tree contains
      **one** raw `<img>` (in a `Photo.tsx` comment), so the rule is not a leftover of hand-written markup — it is
      what sizes every `next/image` on the site, and dropping it is a per-section layout question with a CLS
      consequence, which is 19.7's job with the sections in front of it. What 19.1 could do about it is say where it
      lives and why, so 19.7 does not rediscover it.
- [x] 19.2 Type + RTL: the display face decision (Tajawal vs the shipped Readex Pro/Montserrat) taken openly,
      self-hosted so `next/font/google` stops needing the network at build time; type scale, tight tracking on
      headings, tabular numerals for stats; a logical-properties sweep of console.css and the site sections; mirrored
      icons/chevrons and mirrored motion in RTL. `6ca5278`
      **The face decision, stated plainly because the brief asked for it to be:** the shipped system was two Google
      families chosen by *direction* — Readex Pro on the body, and `[dir="ltr"] body` swapping the whole page to
      Montserrat. That is one font per language, so an Arabic page with an English clinic name or a Latin number in
      it set those glyphs in a different family with different ascent, descent and x-height, mid-sentence. Tajawal
      was chosen and it is the brief's own call, but the reason it is right here is measurable: its Latin is drawn in
      the same file as its Arabic, one cmap, matching metrics, so a mixed run gets one face — which is why the
      `[dir="ltr"]` override is gone rather than translated. Both old stacks are deleted, not left as fallbacks: a
      test fails if `readex` or `montserrat` survives anywhere in `src`.
      Self-hosted as four static weights (400/500/700/800 woff2, 20.8–21.7 KB, + `OFL.txt`) through
      `next/font/local`, from upstream `google/fonts` ofl/tajawal v12 via fonttools, otherwise unmodified. Two
      reasons, both operational: `npm run build` no longer resolves `fonts.googleapis.com` (BK-0.2 recorded that a
      build with no outbound DNS fails outright, and BK-11's cPanel host may not have it), and `adjustFontFallback`
      measures the real file, so the generated fallback face carries `size-adjust: 94.43%` with matching
      ascent/descent/line-gap overrides — verified in the built CSS — which is what keeps the swap free of layout
      shift. The family has no variable version, so `font-semibold` resolves to 700 and `font-black` to 800; the
      observed computed `font-weight: 900` on an `<h1>` is the 800 face, which is where the console and the site
      already sat.
      `--font-ui` is the only stack components read, and it is `var(--font-tajawal, "Segoe UI", Tahoma, Arial,
      sans-serif)`. The fallback is not decoration and its reason is specific: `@font-face` rules do not cross into a
      document that never loaded the stylesheet — the console's preview `srcdoc` frame, an email template, a print
      sheet — so those need a real stack, not an empty family name. All three document roots (`[lang]`, `console`,
      `NotFoundDocument`) now apply exactly one `.variable`; the 404 was the case that used to need both fonts
      exported, because it composes outside the layout tree.
      **`tabular-nums` is a dead declaration on this face and the components proved it.** Tajawal ships `aalt ccmp
      dlig fina init liga medi rlig frac` (+`calt` at 500/700) and no `tnum` at any weight, and its digits were never
      equal to begin with: measured off the upstream binaries with fontTools, the Latin ten spans **375 units** (the
      1) to **553** (the 4) of a 1000 upem at 400, and the Arabic-Indic ones the site actually renders in Arabic —
      `formatNumber` maps `[0-9]` to ٠–٩ when `language === "ar"` — span **207** (١) to **633** (٣). So equal digits
      became geometry: `--num-cell: max(1ch, 0.64em)` and a `@utility num` that reserves one cell per digit
      (`[--num-digits:n]` where a value has a known width). `ch` is the advance of the Latin 0, which is 552 units
      here and therefore *understates* both the Latin 4 and the widest Arabic-Indic digit — hence the floor. Measured
      on the built site: the six index values on `/en/about` are all 23.03px against natural widths of 14.70–19.84px,
      and Arabic-Indic ١–٤ on `/ar/about` land in the same 23.03px cell with naturals of 10.26–22.79px and no
      overflow. `ResultCaseCard`'s pager cells only the numerator, because only the numerator changes.
      Tracking: the four `--ls-*` tokens are now the only place a heading, eyebrow, label or number asks for
      tracking, which lets one unlayered `[dir="rtl"]` rule zero all four — joined Arabic letters open at the joins
      when spaced, so `-0.015em` on an `<h1>` and `0.3em` on an eyebrow are both Latin moves. Placement matters and
      is the non-obvious part of this row: the token block is an *unlayered* `:root`, so an override inside
      `@layer base` loses to it whatever its source order. Tailwind's own `--tracking-*` namespace is re-pointed at
      the tokens (`@theme { --tracking-tight: var(--ls-heading) … }`), which is why the twelve call sites that had
      hand-tuned a value — `tracking-[0.2em]`, `tracking-[0.28em]`, `tracking-[0.3em]` — needed no edit and now
      simply flip: verified computed `letter-spacing: normal` on `/ar`'s h1 and eyebrow against `-0.42px` and `3.3px`
      on `/en`. The scale itself (`--fs-h1…h4`, clamped in **rem** so it follows the visitor's font size, with
      `--lh-tight`/`--lh-body`) moved into `@layer base` and now applies in both directions; the px ladder further
      down is on controls only and does not rescale it — an earlier draft of the comment claimed otherwise and was
      corrected against the file.
      RTL sweep: both stylesheets and every `.tsx` are free of physical direction, proved by a test rather than by
      reading. `console.css` already flipped its drawer and nav caret through logical properties, so the remaining
      work was behavioural: the Navbar's two mobile faces were the last un-signed horizontal motion in the tree and
      now take one magnitude signed by language (`slideInX`), entering from the trailing edge and leaving through the
      leading one, and the inline `"→"`/`"←"` characters baked into two nav labels and the journal back link became
      direction-aware lucide icons — a text arrow is the one glyph that cannot be mirrored by CSS.
      `tests/typography.test.ts`: 11 new cases, and the suite is now **329 tests over 11 files, all passing** — no
      `next/font/google` import anywhere; each declared weight a real `wOF2` over 15 KB with a filename matching the
      weight it declares; the OFL present and carrying both the Boutros copyright and the licence text; exactly one
      font stack, every `font-family:` line in both stylesheets equal to it, no dead family left; all three roots
      applying exactly one `.variable`; the scale and the tokens in the order that makes them work; the digit cell
      defined with zero `tabular-nums` left in a component; the `[dir="rtl"]` tracking rule ahead of its twins with
      the `@theme` re-pointing; x-motion present only in files that flip; no physical direction in either stylesheet.
      One case caught a defect rather than a hypothetical: `PageHero`'s mobile twin still carried a second
      `tabular-nums`, and that is what failed the digit-cell test. Separately, two rationales written into the code
      comments during this row turned out to be wrong and were rewritten from the measurements — a "hashed family
      name" story that font-family matching made irrelevant, and a claim that the root-size ladder rescales the
      heading scale (it sits on controls, not `html`). Worth recording because a comment that overstates a mechanism
      is worse than no comment, and the tests here are written against files rather than against those comments.
      Gates: typecheck · lint · `vitest run` **329/329 over 11 files** · `next build`. `npm run prove:no-wp` was not
      re-run — no read path changed. The one non-style module in the diff, `src/lib/console/preview.ts`, is a CSS
      string for the editor frame, not a reader: it lost `font-style: italic` from a `.lede` rule (Tajawal has no
      italic face to synthesize or select) and took a size step instead.
      **What this row could not fix:** the console's article preview renders in a `srcdoc` iframe, and `next/font`
      exposes no URL to hand it — only a className, a style and the variable — so the preview cannot see the
      `@font-face` rules and stays on the system fallback. It is therefore *not* a faithful render of the published
      typography, which is a real limit for an editor making layout judgements. Options are to serve the woff2 files
      from `public/` and re-declare the faces inside the preview document (duplicating what `next/font` owns, and
      losing the content-hashed URLs), or to move the preview to a same-origin route that imports `globals.css`
      (which makes it a real page, and changes what the preview frame is). Neither is a typography change, so 19.6
      re-opens it with the editor screens in front of it.
- [ ] 19.3 Primitives: `src/components/ui/` — button (primary/secondary/ghost/danger/loading), input, textarea,
      select, combobox, checkbox, switch, radio, date field, file drop-zone with preview + progress, rich-text area,
      table (sticky head, row hover, inline actions, sortable, skeleton, empty, pagination — `ConsoleList` already
      owns the behaviour, this keeps it and takes the markup), card, tabs, modal, drawer, dropdown, toast, tooltip,
      badge, avatar, breadcrumbs, progress, skeleton, confirm dialog, validation states, illustrated empties. Every
      one with hover / focus-visible / active / disabled / loading. One icon family (lucide, already the site's).
      The eight console components are re-pointed at them **without changing their props contracts**.
      **This is five sub-rows** — 19.3a the shared vocabulary and the button, 19.3b fields, 19.3c status and
      feedback, 19.3d surfaces, 19.3e overlays — because the audit found the defects in families, and a row that
      fixed "all primitives" at once would not say which family is still hand-written. 19.3a, 19.3b, 19.3c and
      19.3d are closed below; the rest are open and the parent stays unchecked until they are.
- [x] 19.3a Shared control tokens + the button primitive — `951346c`
      **What was wrong, in the order it was found.** The console owned a 60-line `.console-button` sheet and the site
      owned none, so the same control was decided twice; `.console-button-primary` had **no hover of its own** and
      inverted to a light card under a cursor — the one state that existed on the default variant only; the tap
      numbers were spelled as literals in a surface sheet; and a call-site `py-1` could undo the 44px floor, because
      the floor lived in a layer that utilities outrank. `--console-tap`, `--console-tap-field`, `--console-ui-*`
      are renamed to `--tap`, `--tap-field`, `--ui-font`, `--ui-font-small`, `--ui-gap`, `--ui-gap-tight`,
      `--ui-pad`, `--ui-stack`, declared **once** in `globals.css` `:root` — the unlayered block 19.1 established as
      the only place a number is written twice. `.console-button` and `.console-palette-open` are deleted, not
      aliased: a test now fails if the name survives in `console.css` or in any of the eight components.
      `src/components/ui/ui.css` is `@import`ed by `globals.css` rather than by each document root — a primitive that
      has to be remembered twice is a primitive that gets forgotten on the third surface — and the primitives are
      unlayered on purpose, which is the same cascade fact 19.1 recorded. The known cost is written into the file
      header: restyling a button *from a surface* now needs a later unlayered rule.
      **The import path is the defect this row found in itself.** The first version read `./components/ui/ui.css`,
      which is correct English from `src/app/` and wrong as a path, and `npm run build` failed on it — while the
      string assertion written for it passed. The test now resolves the declared path against the importing file and
      reads the bytes it points at, so the claim is about resolution and not about the sentence.
      **State is an attribute, not a modifier class.** `data-variant` / `data-size` / `data-active` / `data-block` /
      `data-loading` are rendered from props by `src/components/ui/Button.tsx` (`Button` + `ButtonLink`, `clsx` —
      already a dependency and unused — instead of a hand-rolled `cx`, because a two-argument joiner is not a
      library worth owning). `loading` implies `disabled` plus `aria-busy`, and `[data-loading]` is placed **after**
      `:disabled` in source order so the cursor reads `progress` rather than `not-allowed` on a control that is busy
      rather than dead — the order is asserted, not assumed. The spinner is a logical-border ring on `--dur-spin`
      (an animation duration, so it is not in the transition list), and the reduced-motion block only neutralises
      the hover/active `transform`: 19.1's `!important` hammer already zeroes the durations, and out-`!important`-ing
      it would be dead code.
      **Gold as primary is a measured call, not a preference.** The darkest gradient stop against `--btn-gold-fg`
      `#17120f` is 5.19:1 dark / 5.11:1 light, which clears AA for a 600-weight control; the *mid* stop reaches only
      2.26:1 on cream, which is why the fill carries `--border-control` rather than the softer default border. The
      danger fill measures 6.39:1 light / 8.14:1 dark against `--bg-card`. Both numbers are the reason the two
      variants get their own `:hover:not(:disabled)` rules instead of inheriting the default one.
      **The eight components moved with their contracts intact** — 35 call sites, no prop renamed, no label
      semantics changed, `console-button-primary` → `variant="primary"`, and a new `variant="danger"` on the two
      controls that destroy (row trash, bulk trash). `×`, `↑`, `↓` as text glyphs became lucide icons; the pager's
      chevrons swap with the reading direction (`locale === 'ar' ? ChevronRight : ChevronLeft`) instead of mirroring
      the control, matching the pattern 19.2 established for the Navbar. `SettingsWorkspace` now tracks *which* row
      is in flight (`busyId`) rather than whether any row is, so the spinner sits on the control that asked and the
      other rows stay usable while it waits.
      **Measured in the browser, not only asserted in bytes** (comfortable and dense, light, Arabic): every rendered
      `.ui-button` is exactly 44px at both densities while dense drops `--tap-field` to 2.25rem and `--ui-font` to
      0.83rem — the split the token rename exists to make; the console's comfortable `--ui-font: 0.9rem` reaches the
      primitive (14.4px computed), proving the surface override still lands after the vocabulary moved. Hover on a
      default button computes `--bg-secondary` + `--elev-1` + `translateY(-1px)`; hover on the gold primary keeps its
      seven-stop gradient, adds `--glow-gold` and elevation, holds `rgb(23,18,15)` on the fill, a 156,118,25 border,
      weight 600 and 44px — the state the old sheet never had. A disabled control computes opacity 0.55 with
      `not-allowed`. Focus paints the one global ring (2px `rgb(133,100,15)`, offset 2px) because `ui.css` declares
      no `outline:` at all. Cmd/Ctrl+K still opens the palette and Escape still returns focus to the trigger, which
      is also the proof that a ref reaches the primitive as a plain prop under React 19.
      **Tests: `vitest run` is now 344 over 12 files** (was 329 over 11). `tests/ui-primitives.test.ts` is new with
      15 cases and works the way the other styling suites do — over the bytes of the two files, with no DOM: every
      state selector present, no `outline:` in the primitive, primary/danger/ghost each with their own hover, sizes
      never touching `min-height`, `[data-loading]` after `:disabled`, five named transition properties and no
      `all`, logical properties only, no hex or raw radius or literal duration, and every `var(--x)` the primitive
      reads defined in `globals.css`. `tests/console.test.ts` re-anchored to the new names and keeps the
      defined-once list as the guard against the numbers drifting back apart. `tests/typography.test.ts`'s physical
      direction sweep now strips comments before matching — a class hidden in prose is not a class — and asserts
      both halves of that pass are load-bearing, because the sweep flagged the phrase "right-click" in a doc comment
      and the honest fix was the sweep, not the sentence.
      Gates: typecheck · lint · `vitest run` 344/344 · `next build` · `npm run prove:no-wp` **5/5** (271 routes, 0
      requests to the WordPress origin) — re-run because the console markup moved, even though no read path did. The
      built CSS carries 19 `.ui-button` rules with the attribute selectors and the `--tap` floor intact after
      minification, which is the check that the cross-directory import ships rather than merely compiles.
      **Deferred on purpose, with the row that owns each:** three checkbox skins and the `.console-palette-input`
      that misuses `console-field`; the hardcoded `border-radius: .6rem` / `outline: 2px solid var(--text-gold)`
      inside `.console-field`, and `--focus-ring` for the latter → 19.3b. The `●`/`○`/`—` data marks in
      `ConsoleList`'s `cellText`, and the badge/alert/toast/progress/skeleton/empty/tooltip family → 19.3c. Card,
      table, tabs, breadcrumbs, avatar → 19.3d. Six overlay declarations, three scrims, seven z values, the inline
      "alertdialog" panel and `OfferCard.tsx:34-36`'s identical-armed ternary → 19.3d/19.3e. The `≡` drawer glyph,
      `title=` duplication on palette rows → 19.4. `--radius-pill` is now consumed by the spinner; the view chip
      still hardcodes 999px → 19.3d.
      **Two console warnings observed while verifying, neither from this commit.** `/console/*` logs a React
      "unique key" warning attributed to `ConsoleFrame` with a child from `ConsoleShell`, but only during hydration:
      a client-side re-render of the whole shell (trash scope, screen switch) never reproduces it, and neither file
      is in this diff nor imports the primitive — `ContentScreen` returns a fragment, and every `.map` in the eight
      touched components is keyed. It is 19.4's, which owns the frame. Separately, dev logs that a `src_*.css` chunk
      is "preloaded but not used"; commenting the new `@import` out and reloading `/ar` leaves the warning identical,
      so it is Next's dev chunking of `globals.css` (two chunks, both 120,627 bytes, both already containing the
      control layer), not a second stylesheet this row added.
      **One data gap found by the same sweep, and it is not a styling bug:** `/console/settings` renders its empty
      state because `settings` has **0 rows** in the dev database — `readSettings` selects what exists and
      `scripts/db/seed.ts` never inserts any, so the screen has nothing to edit until a write creates a row. That
      belongs to 6.3c-a's row (#201), not here; recorded so nobody reads the empty screen as the primitive failing.
- [x] 19.3b Field, checkbox and control skin for both surfaces — `457424f`
      **What was wrong, in the order it was found.** 19.3a left three named debts and this row pays all three. The
      console owned a `console-field` family — 12 rules over 16 selector lines, in three parts of the sheet —
      and the site owned none — the same asymmetry, one family later — and the sheet's numbers had already drifted
      from the tokens it lived beside: `border-radius: 0.6rem` where `--radius-control` is `.65rem`; a **second focus
      ring** (`outline: 2px solid var(--text-gold)` at offset 1px against the one global ring at offset 2px); a
      disabled step that gave `[readonly]` the same `cursor: not-allowed` as a dead control; and skin for `input` and
      `textarea` only — so a `select` was unstyled everywhere except the invalid rule, which *did* reach it. Three
      checkbox skins were hand-written (`.console-cell-check input`, `.console-card-check input`,
      `.console-field-flag input`), and the palette's search box carried `console-field` **on the input itself**: the
      descendant rules that hold the skin never matched it, so it got the wrapper's `margin-block-end` and none of its
      padding or border — a bare native field at the top of the dialog. `.console-field` is deleted rather than
      aliased; a test now fails if the name survives in `console.css` or in any of the eight components. The nav's
      gold `outline` (`console.css:268-272`) is the third place that ring was declared and stays 19.4's: it is a
      sidebar link's focus, not a field's.
      **The defect the browser found and the bytes could not.** The first version of the invalid rule was protected,
      according to its own comment, by being last in the file. Source order is not what protected it:
      `.ui-control:hover:not(:disabled)` weighs (0,3,0) and `.ui-control[aria-invalid='true']` weighs (0,2,0), so a
      field with an error **turned gold the moment a cursor crossed it** — the state that most needs the red is the
      state that lost it. The hover/focus step is now written `.ui-control:where(:hover:not(:disabled), :focus)`;
      `:where()` zeroes the specificity of its whole argument list, so the invalid rule outranks it by construction
      and the file's order is no longer load-bearing. The suite asserts `:where(` is present *and* bans the bare
      `.ui-control:hover`, so the pair cannot silently drift back to a rule that depends on position.
      **The dark fill is named, not inherited.** `globals.css:442-448` colours every `input`, `select` and
      `textarea` in dark with `--bg-card`, and its selector is (0,1,2) — heavier than `.ui-control`'s (0,1,0). Left
      alone, a field read as a hole cut in the panel it sits on. `html[data-theme='dark'] .ui-control` restates the
      fill as `--bg-card-subtle` (#292522, one step *above* the card), names the theme it is correcting instead of
      leaving the outcome to which selector happens to be heavier, and deliberately does **not** set `color-scheme`:
      the native dropdown and calendar glyphs are not the primitive's to colour. **The sheet this replaced had wanted
      the same well and lost it silently**: `.console-field input` is (0,1,1) — still below (0,1,2) — so the
      `background: var(--bg-card-subtle)` it declared never reached a dark field. A value in a stylesheet that cannot
      win is not a decision, which is the reason the primitive states the theme in its selector.
      **One attribute answers one question.** `aria-invalid="true"` is the control's border hook because it is the
      attribute the control already carries for a screen reader; the wrapper's `data-invalid` colours the caption.
      A parallel `data-invalid` on the control would be a second answer to the same question, so the suite bans it.
      `Field.tsx` keeps the attribute-shaped API `Button` established: `Input`/`Textarea`/`Select` take
      `{ bar, className }` plus the native props, `bar` becomes `data-bar` (the 44px floor for a control sharing a
      row with buttons), and there is no `size` prop because `size` is already a real attribute on an input. `Field`
      cannot be given an orphan label — `htmlFor` is required, since a sibling `<label>` associates by nothing else.
      `Checkbox` renders the label *around* the input, which is what makes the whole 44×44 row the target instead of
      the 20×20 box inside it; its `label` prop is optional only for a table cell, where the name goes to
      `aria-label` and the element stays as the tap target.
      **A search field drops the browser's clear glyph.** It filters as you type, so the glyph is a second way to do
      what is already done; it sits on the reading end, cannot be moved or restyled, and on a narrow bar overlaps the
      text. The rule survives minification as `-webkit-appearance: none` folded into `appearance: none`, which still
      holds because Blink treats the prefixed name as an alias.
      **The eight components moved with their props contracts intact** — no prop renamed, no label semantics
      changed. `console.css` is −136/+27 and keeps the layout it genuinely owns (`.console-search`'s
      `flex: 1 1 11rem`, `.console-cell-check`'s `inline-size: var(--tap)` column width); those two names are *not*
      banned, because the ban that matters is on a second **definition** of a field, and the sweep now walks the
      sheet's selector list and fails on any bare `input`/`textarea`/`select` or any `.ui-*` override. The flag row's
      caption override — the one that lifted a flag's label back to body size — went with the sheet, because a
      `Checkbox` label *is* body size by definition, which is what the settings row's box wanted anyway.
      **Measured in the browser, not only asserted in bytes** (built app, Arabic, via the same-origin iframe harness):
      at 1280 comfortable and dense — bar controls exactly 44px at **both** densities while dense drops `--tap-field`
      from 2.75rem to 2.25rem (field 44px comfortable, 36px floor / 39.9px rendered dense), the textarea floor holds
      96px, and `.ui-field` is a flex column whose measured gap is 5.6px (`--ui-gap-tight`, the one stack number
      density does **not** touch) under 11.2px between fields (`--ui-stack`: 0.7rem dense, 1rem comfortable) with the
      label at `--ui-font-small` in `--text-secondary`; the dark field computes #292522 on the card with the soft gold
      border rgba(213,180,70,.5) → rgb(201,164,65) once focused → rgb(242,160,160) when invalid *inside* the ring, and
      the ring itself is the one global 2px rgb(225,193,91) because `ui.css` still declares no `outline:` at all; the
      palette opened with a real Ctrl+K shows its input carrying `--tap-field` and no inherited wrapper margin, which
      is the palette's own defect from above closed. At 360px RTL the search field is 44×328, the select 44px, all
      **26** checkbox rows are 44px tall with the box on the reading-start side, and there is no horizontal overflow.
      Signed-out SSR of `/console/login` (curl, not the SPA) carries two `.ui-field` with `for="email"` and
      `for="password"`. The built CSS is the shipping check: one chunk carries the layer (19 `.ui-button`, 10
      `.ui-control`, 6 `.ui-field`, 3 `.ui-check` selector occurrences, `console-field` gone from all three), and the
      console's own chunk contains `console-search`/`console-panel` and **no `.ui-*` selector at all**.
      **Two things this pass could not see, stated rather than smoothed over.** The automation page is hidden, so
      there is no rAF and a real pointer never crosses a control: the hover *state* is proved by computed values and
      by mutating the CSSOM rule (setting `borderColor` on the rule changed the computed border to
      rgb(201,164,65), which is what shows the rule is live), not by pixels. And `getComputedStyle(el,
      '::-webkit-search-cancel-button')` returns the **host's** values — it ignored both a `display: none !important`
      and a `-webkit-appearance: none !important` injected into it — so the channel is blind and the glyph is a
      human-pass item for 19.8.
      **Tests: `vitest run` is now 355 over 12 files** (was 344). `tests/ui-primitives.test.ts` goes 15 → 26 cases,
      the new `describe` proving the state list, the two tap floors (and that `console.css` may not lower `--tap`),
      the checkbox's floor on the label, the dark well named rather than inherited with base-before-dark source order,
      the invalid border surviving hover/ring/disabled, read-only dimming without a "do not touch" cursor, `Field`'s
      render order (label → control → messages → note), one `role="alert"` per message in the order the server gave,
      `type` not settable on the box, props → `data-*` with no `size`, and the second-definition sweep across
      `console.css` and the seven components. `tests/console.test.ts`'s `aria-invalid` case became a **routing**
      assertion — the server's `issues` reach the field they name — because how a wrong field looks is now the
      primitive's fact; the two console sheets are additionally asserted to keep no `console-field` and no raw
      `<input|textarea|select>` in the seven components.
      Gates: typecheck · lint · `vitest run` 355/355 · `next build` (278 pages) · `npm run prove:no-wp` **5/5** (238
      sitemap URLs, 271 routes rendered 0 failed, 0 requests to the WordPress origin) — re-run on the same reasoning
      19.3a recorded: the console markup moved, so the proof is re-earned rather than assumed from the last run.
      **Deferred on purpose, with the row that owns each.** The public site still hand-writes **ten** controls —
      `BookingModal.tsx:685,713,739`, `Footer.tsx:203`, `ContactClient.tsx:292,322,350,465,529`,
      `JournalClient.tsx:182` — as Tailwind utility soup rather than `.ui-control`. `ui.css` already reaches every
      one of them through `globals.css`, so the primitive is *available* there; converting them is markup work on the
      site's own surfaces and belongs to 19.7, and that is also why the second-definition sweep is scoped to
      `console.css` instead of the whole tree — the ban is on a second definition, not on a public section this row
      has no business restyling. `switch`, `radio`, `combobox` and the date field have **no call site on either
      surface** (grep: zero `role="switch"`, `type="radio"`, `role="combobox"`, `type="date"` in `src/`); the editor's
      booleans are checkboxes and the filter bar is a `Select`, so those four wait for the row that first needs them
      rather than arriving as unused API — the same rule that holds the file drop-zone and rich-text area out of
      19.3f. Everything 19.3a deferred past 19.3b is unchanged and still owns its row: the `●`/`○`/`—` marks and the
      badge/alert/toast/progress/skeleton/empty/tooltip family → 19.3c; card/table/tabs/breadcrumbs/avatar and the
      view chip's literal 999px → 19.3d; the six overlays, three scrims and seven z values → 19.3d/19.3e; the `≡`
      glyph and the palette's `title=` duplication → 19.4.
      **Three sentences in `457424f`'s own message are wrong, and this is where the record gets corrected** (the
      commit is not amended): it says the old console sheet carried "a gold hover border that outranked the error
      border" — that sheet had **no** hover rule for a field at all, and the defect was in this row's own first
      `ui.css`, found in the browser pass; it says the palette's input "wore a padding and an outline that were never
      its own" — it got neither, which is exactly why it was a bare native box; and it names `ContentWorkspace` as
      carrying a local gold `:focus` rule, when it carried none (its change is the create-form wrapper becoming a
      `Field`). A commit message written from intent is the same failure mode as a comment written from intent, and
      both are corrected by the measurement, not by the sentence — so the row above is the version that was checked
      against the pre-change sheet (`git show 457424f^:src/app/console/console.css`), the diff and the browser.
- [x] 19.3c Status + feedback primitives — badge, alert, note, empty, skeleton, mark — `aa95fb7`
      **What was wrong, in the order it was found.** `console.css` answered "how much does this matter" three
      different ways in three different members — `.console-chip`, `.console-alert` with two tone rules of its own,
      `.console-note` — and around them sat `.console-meta`, `.console-account-label`, `.console-palette-empty`,
      `.console-row-skeleton` with its own `@keyframes console-shimmer`, `.console-count[data-tone='error']` and
      `.console-chip[data-tone='warn']`. Twelve rules and one reduced-motion entry, deleted rather than aliased, so
      the vocabulary is `src/components/ui/Status.tsx` plus `ui.css`: `Badge`, `Alert`, `Note`, `Empty`, `Skeleton`,
      `Mark`. The site owned none of them, which is the other half of the 19.3a/19.3b finding: a status pill on a
      public card was a hand-written `border` and a literal hex, and those ~15 pills are 19.7's markup work — the
      primitive is now *available* to them through `globals.css`.
      **One tone, four words.** `[data-tone]` sets `--tone-fg`, `--tone-bg`, `--tone-border` and declares no
      fallback, so the member decides what neutral means for itself: a badge falls back to secondary text on the
      secondary surface, an alert to primary text, a note to secondary. `tone="neutral"` renders **no attribute**,
      because there is no `[data-tone='neutral']` rule to match it — an absent tone and a neutral tone are the same
      sentence, and a hook nothing styles is a hook that will drift. Measured, not asserted: light badge and alert
      neutral 5.34, ok 6.15, warn 4.69, danger 5.62; dark badge 8.69 / 7.63 / 9.14 / 7.46, dark alert neutral 13.92,
      dark notes 9.88 / 10.21 / 10.39 / 8.94. Every tone clears AA on both surfaces at both theme files; the light
      `warn` is the tight one and it is the pair a human should re-look at in 19.8.
      **`Alert` derives `role` instead of asking for one**: bad news interrupts (`alert`), confirmation is polite
      (`status`), and a box that explains a standing fact gets nothing, because a live region that never changes
      teaches people to ignore live regions. Three consequences are behaviour changes, stated as such:
      `password.saved` moves from neutral to `ok` — saved is good news; the editor's trashed-row banner and the
      must-change-your-password banner become `role="alert"` — both block the save; the read-only editor banner
      stays role-less by design. A call site can still name its own role; the default is only what eight hand-written
      call sites already said, in the same words.
      **The badge bug needed a browser, and this is the record of being wrong about it first.** The list's cells
      declare `overflow-wrap: anywhere` so a 60-character slug cannot widen a column — and `overflow-wrap` is an
      **inherited** property, so a pill that declared nothing inherited the break and let the column shrink toward
      one character. A published row measured badge 43×59, cell 65px, row 99px: three lines where the state column
      had always been one. My first edit deleted the badge's declaration and left the comment saying the surface
      should decide; against the real stylesheet that changed nothing, because the cells' value still reached the
      pill. Two `!important` probes in the live DOM separated the two variables (badge `anywhere` + cell `normal` →
      43×59 / 65 / 99; badge `normal` + cell `anywhere` → 61×26 / 83 / 81), which is what proved the pill's own value
      is the one the layout reads. `white-space: nowrap` measures the same as `normal` and fails elsewhere — a
      two-word role name overflows the 16rem sidebar — so `.ui-badge` declares `overflow-wrap: normal` and keeps the
      sentence-breaking for `Note` and `Alert`, which have no column to collapse. The suite asserts all four
      declarations in one case (`badge normal`, badge has no `white-space`, cells `anywhere`, note and alert
      `anywhere`), because the failure only exists as a pair and a test that reads one side cannot see it.
      **A group's spacing does not live inside a member.** `.console-chip` carried `margin-inline-end: 0.3rem`, so
      two chips side by side got a trailing gap after the last one and a lone chip in a heading got a margin nobody
      asked for; the badge now has no margin and the groups own their `gap` (`.console-chips`, the editor header,
      the pager row, the new `.console-account-roles`). Its radius reads `--radius-pill`, not the `999px` literal
      that sat three files away from the token.
      **One tone table for both panes**: `contentStateTone()` in `src/lib/console/editor-form.ts` colours the chip
      from the word it shows. The list and the editor build that word from different objects (`ListSummary` carries
      `pendingAr`/`pendingEn`, `ContentRow` carries `pendingLocales`), so they cannot share the first function —
      sharing this one is the only way a row stops reading greener in one pane than the other. The three `Mark`
      glyphs got `content.value.yes/no/none` messages so a shape is never the only carrier of the value.
      **The console keeps placement and nothing else.** `.console-palette-list > .ui-note` is a block with
      0.8rem/0.2rem margins, a note after a panel or content block earns its stack, and `.console-count` is the
      auto-margin term of the three rows that place it (`.console-pager`, `.console-bulk`, `.console-editor-bar`) —
      the whitelist in `ui-primitives.test.ts` allows a surface override to name `display` or a margin and never a
      colour or a font, which is exactly the failure 19.3a found in `.console-button`. **A margin I added and then
      removed**: `.console-grid` gained `margin-block-end: var(--ui-stack)` in this pass and lost it again, because
      the overview renders a `Note` under the `dl` at every locale, the rule's own comment said so, and the gap
      re-measured at 16px without it. The diff for that selector against `457424f` is empty.
      **Measured on the built app across the matrix the data allows** — 1280, 768 and 360; Arabic RTL and English
      LTR; light and dark; comfortable and dense — driven through the real `ConsoleControls` buttons, since a cookie
      cannot outrank the account row (`resolvePrefs`: locale/theme = account → cookie → header, density = cookie
      only). No horizontal overflow at any width (360px content box `scrollWidth` 355); zero dead classes in the live
      DOM; the tap floors intact. Seven `Mark`s in the list (`no` 8×20 secondary, `none` 9×20 muted, each with its
      sr-only word); `Empty` 680×90 in the list, 984×90 in settings, 288×90 in the editor pane; the palette's `Note`
      571×22 with its two margins; the login `Alert` from a real wrong password, 379×50 at `--radius-control`
      (10.4px); the `Skeleton` caught mid-flight at 18ms — six 44px wells, `role="status"`, the shared 1.2s shimmer,
      "جارٍ التحميل…" — which needed a 0-row state (`?filter=draft`) and a click on الكل, because it only renders
      while `loading && rows.length === 0`.
      **Four things this pass could not see, stated rather than smoothed over.** The settings rows' badge, alert and
      note cannot be seen at all: `settings` has 0 rows in the dev DB (BK-6.3c, and `scripts/db/seed.ts` never
      inserts settings rows), so their markup is proved by the suite only and **no data was created to fake it**. An
      alert paired with a button, and `Mark state="yes"`, are likewise suite-only — no current row can produce the
      `yes` glyph. And a synthetic `Escape` does not close the palette: `ConsolePalette.tsx:90` calls `showModal()`,
      so native Esc works and the automation event does not; that is an artifact of the harness, not a defect, and a
      human pass in 19.8 should confirm it. As in 19.3b, the automation page is hidden — no rAF, no real pointer — so
      hover states are computed-value facts.
      **Tests: `vitest run` is now 365 over 12 files** (was 355). `tests/ui-primitives.test.ts` goes 26 → 36 cases,
      and the new `describe` proves the badge's one-word width against the cells' `anywhere`, the tone vocabulary
      declared once with fallbacks only at the consuming member, no second definition of a status in `console.css`,
      the deleted names absent from both sheets and the components, `Alert`'s derived role, `Skeleton`'s
      `role`/`aria-hidden` pair, `Mark`'s glyph-plus-word, the placement-only whitelist, and the token-not-number rule
      for radius and font. `tests/console.test.ts` changes one comment ("a skeleton's breath"), because the token
      list it asserts already covered `--dur-shimmer`.
      Gates: typecheck · lint · `vitest run` 365/365 · `next build` clean · `npm run prove:no-wp` **5/5** (238
      sitemap URLs, 271 routes rendered 0 failed, smallest HTML 25363 bytes, 0 requests to the WordPress origin, host
      named 0 times) — re-earned because the console markup moved. Dev prefs restored to what they were (light,
      comfortable, Arabic) and both disposable preview processes stopped; the pre-existing server on 3320/3322 was
      left alone.
      **Deferred on purpose, with the row that owns each.** Three `border-radius: 999px` literals still survive
      inside the saved-view chips, with `.console-chip-button` and `.console-chip-x`, the `.console-lede` and the six
      unused `--z-*` tokens → 19.3d. Toast, progress, the modal/confirm/drawer/dropdown family and the fate of
      `--z-toast` → 19.3e. Tooltip, `switch`, `radio`, `combobox`, the date field (all still without a call site) and
      the file drop-zone / rich-text area → 19.3f, which has no row yet. The `≡` glyph, `title=` duplication and the
      `ConsoleFrame` hydration key → 19.4. Push stays on hold per 19.0.
- [x] 19.3d Surface primitives — card, table, tabs, row action, chip family — `b598c54`
      **What was wrong, in the order it was found.** The list's table and its card mode were the same row written
      twice: `.console-row` and `.console-card-body` were two copies of one button (block, no border, no fill, the
      pointer, the title underlined under the cursor), and that underline rule was itself written twice. The chip
      family was three rules that each spelled `border-radius: 999px` while `--radius-pill` (9999px) sat in
      `globals.css` with one consumer, plus a `content-box` / `min-height: 100%` pair that only made sense for the
      removable saved view. `.console-card`, `.console-panel`, `.console-table-wrap` and the overview tile each
      re-painted some subset of the shell's five declarations — fill, hairline, radius, lift, `--ui-pad` — which is
      how a card on the list and a tile on the overview drift apart. And the tab strip had `role="tab"` + `aria-selected` and none of
      the behaviour behind them: no `aria-controls`, no panel, no roving `tabIndex`, no arrow keys — it announced
      "tab 1 of 2, selected" and did nothing when Right was pressed, while `Tab` walked both tabs separately.
      **What replaced it.** `src/components/ui/Surface.tsx` (`Card`, `RowAction`, `RowTitle`, `RowKey`),
      `Chip.tsx` (`Chip`, `ChipRow`, `ChipTag`, `ChipRemove`) and `Tabs.tsx`, plus `.ui-lede`, `.ui-table` and
      `.ui-table-sort` in `ui.css`. `console.css` loses ~270 lines and keeps placement only: the
      `PLACEMENT_PROPERTIES` whitelist introduced in 19.3b now guards both the field overrides and the surfaces
      through one `blocksOf()` helper, and the two copies of the rule that disagreed are gone. `Card` renders the tag
      the content deserves (`div` in a `dl`, `li` in a `ul`, `section` for a panel) and is typed against
      `HTMLAttributes<HTMLElement>`: a handler written for one tag is a type error on the other two —
      `ComponentProps<'div'>` failed on `ref` and on `ClipboardEventHandler<HTMLDivElement>` — and the two extras
      `li` carries, `type` and `value`, are not things a shell means.
      **The row hover the brief asked for and this table never had.** Nine columns to read across with nothing under
      the pointer. `--bg-hover` supplies it, and it is written *before* `[data-active]` in the file because both are
      one class deep, so the order is the tie-break and "open in the editor" has to be the one that wins; a test
      asserts `indexOf(':hover') < indexOf('[data-active]')` rather than trusting a reader to notice. The sticky head
      keeps `z-index: 1`: it only has to clear the cells passing under it, it lives in its own scroll box, and
      promoting a table header onto `--z-sticky` would put it in the same argument as the top bar and the drawer.
      **The defect a browser found while both static gates passed.** In the dark theme a selected row was
      `--bg-secondary`, which sits 3 units above `--bg-card` — *less* than the new hover wash, so the ladder read
      card → selected → hover, i.e. backwards. In light the same token is 11 units below the card, which is why the
      bytes, the build and the eye on a light screen all agreed with a broken dark state. Both steps are now washes of
      one ink, `--bg-hover` and `--bg-active`, composited over whatever card they land on, in the order the state
      machine is in. Measured in the built app, the light ladder is 0.9766 → 0.8909 → 0.8098 and the dark one
      0.0133 → 0.0267 → 0.0418 — monotonic in both — and `--bg-secondary` keeps every other consumer untouched.
      `siteTheme` carries the dark stops (7% / 13% of cream against the light 4.5% / 9% of charcoal ink), and the
      suite asserts those four alphas in that order.
      **Six visible changes that are deliberate, not drift.** Card padding is `--ui-pad` on all four sides (0.7rem →
      1.1rem comfortable / 0.7rem dense) and the tile's `calc(--ui-pad + 0.05rem)` is gone — it was an unowned,
      uncommented eighth-of-a-rem. Chip padding is the button's `--sp-1 --sp-4` (0.3rem 0.8rem → 0.25rem 1rem),
      because a chip is the button's shape in a smaller voice. The filter row's gap is 0.35rem (was 0.3); cell
      padding is `--sp-2 --sp-3` (was 0.5rem 0.7rem); the tab row's margin is `--ui-stack` (was 0.9rem); three
      `999px` literals became `--radius-pill`. The chip's `overflow-wrap: normal` is 19.3c's inherited-property
      lesson carried across the family before BK-17's leads tag column needs it.
      **Measured on the built app through the 3330/3332 harness**, fresh `next build`, inside exact-size same-origin
      iframes at 1280, 768 and 360, Arabic RTL, light and dark, comfortable and dense: no horizontal overflow in
      table or card mode (`scrollWidth` equals `clientWidth` at 360), the active row the 0.09 ink, the active card
      the same wash with `--text-primary` on its border, cells 8 / 12, chips 44px at 4 / 16, sort heads 44px, the
      compiled order hover → last-child → active, and zero dead classes in the CSSOM. Tabs were exercised with real
      key events: one tab stop, arrows following `document.dir` read at the keypress, Home / End, and manual
      activation. A probe saved view was created and deleted through the chip UI, restoring the DB.
      **What this pass could not see.** No real pointer hover: the automation page is hidden, so `:hover` remains a
      computed rule-order fact plus the token values, and 19.8's human pass should confirm it. No true device
      viewport: the automation window is ~434×623, so layout was measured inside exact-size iframes rather than on a
      phone. The list pane's narrow columns at small widths are pre-existing — HEAD's cells carry the same
      `overflow-wrap: anywhere` — and belong to 19.4's pane work; the selection clearing on a locale switch is
      pre-existing too (`switchScope` already cleared it before this row).
      **Deferred, with the row that owns each.** Of the six `--z-*` tokens 19.3c left unconsumed, two now have their
      consumer — `--z-sticky` on the top bar, `--z-scrim` on the save bar (the same 35 it always drew) — while
      `--z-drop`, `--z-modal`, `--z-palette` and `--z-toast` still have none → 19.3e decides them. The save bar's
      scrim colour is still `rgb(0 0 0 / 45%)` → the overlay pass. The overview's `.console-stat` figure type moves
      into 19.5's `Stat`. Breadcrumbs and Avatar wait for a call site; toast and progress stay 19.3e's.
      **Tests: `vitest run` is now 373 over 12 files** (was 365). `tests/ui-primitives.test.ts` goes 36 → 44 cases;
      the new `describe` proves the one shell / table / chip / row vocabulary, the hover-before-active order, the
      ladder's four alphas, the surface typed for all three tags, the tap floors on the sort head and both chip
      halves, the `normal` declaration, and the shared placement whitelist applied to both sheets.
      `tests/console.test.ts` moves the sort and chip selectors out of the "paints its own control" list and asserts
      their floors in `ui.css` instead — the same contract, in the file that now keeps it.
      Gates: typecheck · lint · `vitest run` 373/373 · `next build` clean (278/278 static pages) · `prove:no-wp`
      **5/5** (238 sitemap URLs, 271 routes rendered 0 failed, 0 requests to the WordPress origin) — re-earned
      because the console markup moved. Dev prefs restored through `PATCH /api/console/prefs` to Arabic / light /
      comfortable after the dark measurements. `.gitignore` now ignores `/.shots/`, the screenshots this row was
      verified from. Push stays on hold per 19.0.
- [ ] 19.4 Shell: collapsible sidebar with a shared-layout animated active indicator, tooltips when collapsed, brand
      mark, user area; sticky top bar with breadcrumbs, the existing `ConsolePalette` restyled (Cmd/Ctrl+K, keyboard
      nav), quick actions, animated theme toggle, notifications; drawer/bottom bar on mobile; verified at
      360 / 768 / 1280 / 1920.
- [ ] 19.5 Dashboard home: hero greeting with the site name, animated stat cards (count-up + sparkline), recent
      activity from the audit trail that already exists, quick-action tiles, content-status overview.
- [ ] 19.6 Every remaining console screen on 19.3/19.4 — articles, offers, pages, lists, settings, login, password —
      plus the signature brand element and the branded login / 404 / 500 / loading treatments.
- [ ] 19.7 Public site sections: hero, services, doctors, before/after, testimonials, FAQ, contact, footer, nav,
      journal, offers, results — restyled on the same tokens, content still from the CMS read path, SEO/JSON-LD and
      the contrast report kept green.
- [ ] 19.8 Motion + final pass: motion presets in one shared file (150–400 ms, springs/custom cubic-béziers,
      transform + opacity only, `prefers-reduced-motion` honoured everywhere), page transitions, staggered entrances,
      press scale, magnetic primary CTAs, spring modals with backdrop blur, shimmer instead of spinners; then the
      responsive + RTL + WCAG-AA + Core-Web-Vitals sweep and the six-part final report.

**Sequencing, stated because the brief does not order it:** 19.1→19.6 (dashboard, the thing the owner opens every
day and calls "very bad") before 19.7 (public site, which is already on-brand and verified). The remaining
data-layer rows — 7.5's `seo.json` + `offer-categories`, 6.3c-d's prop plumbing, BK-14→18 — keep their own rows and
are not renumbered here; the cut-over in `D:\shamah` is task #220 and is gated on the backup + verification rules.

## Known gaps / notes
- `docs/IMAGES.md` and `docs/SEO-SOURCE.md` referenced by the old brief do not exist.
- The old Neon/Postgres/Vercel-Blob environment belongs to the abandoned Payload attempt; this build does not
  use it. `.env.example` documents what this stack actually reads.
- **A byte-for-byte HTML comparison is only stable on some routes.** `/` hashes the same across cold renders of the
  same data, but `/ar` differs render-to-render inside the RSC flight payload (`self.__next_f` chunk references)
  with no visible change. Before claiming a rung flip moved bytes, render the route twice **with the data held
  still**: if those two differ, compare the visible text, JSON-LD blocks, `img` srcs and `a[href]` instead of the
  whole file (found while proving 6.3c-b; the hash of a single Arabic page proves nothing).
- **A fresh WordPress dump is never byte-identical to the shipped one.** WPBakery stamps a
  `data-vc-public-nonce="…"` into the `home` page body on every request, so a re-sync always reports page 622
  changed in both locales while its text, length and `modified` stamp hold still. Normalize that attribute — or
  compare row hashes with it stripped — before concluding the client edited anything (measured in 7.1).

### Things MariaDB and Kysely do differently (each one cost debugging time)
- **No `INSERT … ON CONFLICT (cols) DO NOTHING`.** That is Postgres syntax; Kysely's
  `onConflict().doNothing()` emits it and MariaDB rejects the statement. Use check-then-insert —
  `assignRole()` in `src/lib/auth/users.ts:105` does.
- **JSON columns read back already parsed.** MariaDB stores them as LONGTEXT with a `json_valid()` check and
  `mysql2` type-casts on read, so `after_json` is an object, not a string. Write with `json(value)`, read
  without `JSON.parse` — an assertion that parsed twice threw `"[object Object]" is not valid JSON`.
  The same double-parse is quieter and worse for a **string that reads as JSON**: a WhatsApp number came back as
  the string `20555000111`, `JSON.parse` turned it into the number `20555000111`, and the caller read that as
  "no value saved here" — the field silently kept the config file's word, with no error on any path. Both
  readers now decode only a document (text starting with `{`, `[` or `"`): `parse()` in `content/settings.ts`
  and `asWord()` in `content/site.ts`. Asserted in both suites (`bk6-…/hotline`, `site-…` settings rows).
- **`Database` must not extend `Record<string, unknown>`.** The index signature collapses `keyof Database` to
  `string`, and every qualified join reference then infers as `never` ("argument not assignable to never").
  Fixed in `src/lib/db/types.ts` in `08b790e`; schema drift is caught by `src/lib/db/schema.test.ts`.
- **`numUpdatedRows` / `numDeletedRows` only exist on `executeTakeFirst()`.** On this dialect the plain
  `execute()` of an update or delete resolves to an *array* of result headers, so `result.numDeletedRows`
  is `undefined` and `Number(x ?? 0)` always reports 0 — a purge script can print "deleted 0 rows" while
  having deleted every row. Use `.executeTakeFirst().numDeletedRows`, or count before and after. Those counts
  are `BigInt`, so `JSON.stringify` on the result throws `Do not know how to serialize a BigInt`.
- **A CLI script that throws leaves the process alive.** The mysql2 pool keeps the event loop busy, so a
  failing `tsx` script hangs forever instead of exiting — and piping it through `tail` hides the error,
  because `tail` only flushes at EOF. Call `destroyDb()` in a `finally` and run scripts without a pipe.

### Console auth surface (built in BK-3/4, UI in BK-5 — BK-6 runs on this)
- `POST /api/console/auth` login · `DELETE` logout · `GET /api/console/auth/me` · `POST /api/console/auth/password`.
- The core (`src/lib/auth/*`) takes a plain `Request` and returns a `Response` — no Next imports — so it runs
  under vitest without a server and the route files are one-liners. Keep it that way.
- `npm run doctor` reports the 6 catalog roles with their grant counts and the row counts that matter. The dev
  database (`shamah_cms`, not `_test`) now has **1 user**: the Owner created to verify BK-5. Its password was
  generated into the gitignored `.tmp/bk5-dev-owner-pass.txt` and never printed to chat or logs; if that file is
  gone, recreate the account with `npm run owner:create` rather than hand-editing rows.
- `npm run db:seed` (dry-run, `--apply`) is the only way roles reach the database — never hand-insert into
  `role_permissions`. `npm run owner:create -- --email … --apply` seeds first, then creates the account, and
  reads the password from a hidden prompt or `--password-stdin`; it is never an argument.
- **BK-6 must use the vocabulary in `roles.ts`, not invent its own:** `LIST_KEYS` is exactly the seven lists
  the site renders (`nav, branches, specialists, treatments, services, faq, results`), `EDITOR_LIST_KEYS`
  drops `nav` (Admin's), and `SITE_LOCALES` is `ar`/`en`. The Editor's scoped grants name those strings, so a
  new `list_key` or locale outside them is silently uneditable by Editors.
- **The guard writes an audit row only when `status < 400`** (`b8b4430`). Before this, a handler that answered its
  own 400 — after zod had already passed — still produced an `audit_log` row describing a change that never
  happened. A handler that refuses is the handler's business; do not re-audit it.
- `tests/roles.test.ts` fails if a file under `src/app/api` exports a write route without importing the guard,
  except through the `TRUSTED` map (currently `@/lib/auth/login`, `@/lib/console/prefs-route`), and each trusted
  module is itself asserted to call `guard()`. Adding a route that bypasses the guard needs a new `TRUSTED`
  entry *and* a reason.

### Console UI surface (BK-6 adds screens on this)
- `src/lib/console/screens.ts` is the nav registry and `tests/console.test.ts` asserts it equals the set of page
  files under `src/app/console`. Register **and** create the page, or the suite fails either way.
- Prefs and login state are cookies, and cookies can only be set by a Route Handler — that is why the theme/locale
  toggle posts to `/api/console/prefs` instead of using `localStorage`. Server-rendered `dir`/`data-theme` means
  no flash and no JS requirement. Keep it that way.
- Sign-out uses `router.replace('/console/login')`, never `location.assign`: the cookies are already gone so the
  login page renders cleanly, and a client navigation does not reload the whole frame.
- **Chrome, not content, follows the console's locale.** Anything the console itself labels — list tabs, section
  headings, buttons — is read from a catalog keyed by the *console* locale (`LIST_LABELS[key][locale]`), never from
  the row's own language, which is `en` in the seed data and would print English in an Arabic console.
- **Offer a control only where the API would honour it.** A write button names a scope, so abilities are computed
  per scope against the caller's grants (`publish` = publish ∩ update, because `publishHandler` re-tests both). Reads
  are unscoped: a Viewer can open every screen and press nothing.
- **The URL is the list's only state** (BK-13.3). `ConsoleList` renders from the parsed view plus the scope, and
  `listViewQuery()` is the single form those terms can take — it carries its own `?`, so no caller adds a second one.
  The first page is the one the server already rendered for this exact line, which is why the load effect is guarded
  by a signature ref; a re-read is triggered by the line changing or by the editor bumping `refreshToken`. Anything
  13.4/13.5 adds to a content screen goes through those two terms, not through local state.
- **The row's session belongs to the editor, the address to the workspace** (BK-13.4). `ContentWorkspace` owns which
  row/tab/list/trash is showing and is the only place a navigation can start (`requestNav()`); `ConsoleEditor` owns the
  form, autosave, field messages and preview. A new action that could lose unsaved words must be handed to the gate,
  never run from inside the pane. The editor pane is an inline-size container too: the fields/preview split is
  `@container console-edit (min-width: 54rem)`, which dense-on-1920 satisfies and a 1440 comfortable laptop does not —
  measured, so do not lower it to make a split appear on a screen where both halves become unreadable.
- **A write names one scope term, a read carries both** (BK-13.5). `writeScopeQuery()` in `src/lib/content/list-view.ts`
  is the only spelling a console write may use; `listScopeParams()`/`listViewQuery()` stay the address-bar form, which
  keeps both terms. Adding a write action by hand-building `?list=`/`?locale=` is the bug this exists to prevent: the
  guard reads the scope off the URL, so a request naming a list *and* a locale is answered against whichever it reads
  first, not the one the caller meant — and a write that names neither is refused rather than guessed.
- **Two tap tokens, and only one of them shrinks.** `--console-tap` (44px) is for anything a thumb aims at — chips,
  sort headers, checkboxes, the search box, the per-page select — and dense never lowers it. `--console-tap-field`
  drops to 36px in dense for the two fields you type into. `tests/console.test.ts` names each list selector and
  insists it takes `--console-tap`, and counts the field-token uses in the stylesheet, so a new control that borrows
  the wrong one fails instead of quietly shipping a 36px target.
- **The list reads its own width.** `.console-work-list` is an inline-size container, so card columns (auto-fill of
  13rem tracks) and the kind's extra cells (`@container console-list (min-width: 34rem)`) follow the *pane*, not the
  viewport — at 1024 the split gives the list a 424px pane and cards sit one per row, while a 1000 viewport with the
  drawer gives it 656px and three. Measuring either against `window.innerWidth` gives the wrong answer.
- **Seeing the console in a browser** (each of these cost a detour): `next start` does not serve files added to
  `public/` after the build, and `.next/static/**` drops unknown paths with a 404 — so a preview asset has to go
  through a throwaway same-host proxy (`.tmp/bk5-proxy.mjs`, logs in, injects the session cookies, forwards to the
  running app; `.tmp/` is gitignored). The in-app automation viewport is fixed near 505 px, so the desktop shots
  were taken by loading the page in a same-origin iframe and `transform: scale(0.5)`; `matchMedia` works in there.
  Never paste a real password into that flow — read it from the gitignored file.
