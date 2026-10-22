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
2. Work only in `D:\shamah_cms` on branch `cms-clean`. **Never push. Never touch `main`. Never touch
   `D:\shamah`** (the live site, and another session's `admin-restore` branch lives there too).
3. Stage explicit paths — never `git add -A`. One commit per finished row, hash on the row.
4. Secrets: print variable **names** only, never values. `.env.local` / `.env.test` are sourced, never echoed.
5. `data/wp/*.json` and `public/wp/*` are the frozen WordPress backup (92 articles, 4 offers, 56 result
   stories). They are read-only until BK-7 imports them and are **never deleted**.
6. Mutating CLI commands default to dry-run; they only act with `--apply`/`--force`.
7. Tests run against `shamah_cms_test` only — `src/lib/db/guard.ts` refuses anything not ending in `_test`.

## Gates (all four must be green before a row is marked done)
`npm run typecheck` · `npm run lint` · `npx vitest run` · `npm run build`
`npm run doctor` says whether the machine is ready. Local DB: start with `npm run db:local:start`
(port 3307, loopback only — see `docs/LOCAL-MARIADB.md`).

`npm run build` needs outbound network: `next/font/google` fetches Montserrat and Readex Pro at compile time
(`src/lib/fonts.ts`). Offline it fails with `getaddrinfo ENOTFOUND fonts.googleapis.com` — that is the
environment, not the code. Self-hosting the two fonts would remove the dependency; do that only if deploys
turn out to need it.

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
      `contact_hidden: true` says why. **BK-8 must route every lead surface through `redactLead()`** — table,
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
- [ ] 7.1 Fresh WP dump into a NEW timestamped folder (never overwriting `data/wp/*.json`)
- [ ] 7.2 Import 92+92 articles, 4 offers, 56 result stories with slugs preserved (`legacy_id` set)
- [ ] 7.3 Remove every live WordPress read (`src/lib/wp/http.ts`, `src/lib/wp/index.ts:119`) and `sync:wp`
- [ ] 7.4 Prove it: zero requests to `shamaclinics.com` from a cold render of every public route

## BK-8 — marketing
- [ ] 8.1 Leads persisted (today `/api/v1/lead` only composes a WhatsApp text and keeps counters in memory)
- [ ] 8.2 Status pipeline, notes, assignee, CSV export, idempotency key
- [ ] 8.3 CTAs + follow-up actions, click tracking, optional Google Sheets outbox

## BK-9 — SEO
- [ ] 9.1 SEO center per entity per locale (title, description, OG, hreflang, JSON-LD, head tags)
- [ ] 9.2 Redirects table honoured at the edge of the site, with a loop guard
- [ ] 9.3 sitemap.xml + robots.txt generated from the database, both locales

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

## Known gaps / notes
- `docs/IMAGES.md` and `docs/SEO-SOURCE.md` referenced by the old brief do not exist.
- The old Neon/Postgres/Vercel-Blob environment belongs to the abandoned Payload attempt; this build does not
  use it. `.env.example` documents what this stack actually reads.

### Things MariaDB and Kysely do differently (each one cost debugging time)
- **No `INSERT … ON CONFLICT (cols) DO NOTHING`.** That is Postgres syntax; Kysely's
  `onConflict().doNothing()` emits it and MariaDB rejects the statement. Use check-then-insert —
  `assignRole()` in `src/lib/auth/users.ts:105` does.
- **JSON columns read back already parsed.** MariaDB stores them as LONGTEXT with a `json_valid()` check and
  `mysql2` type-casts on read, so `after_json` is an object, not a string. Write with `json(value)`, read
  without `JSON.parse` — an assertion that parsed twice threw `"[object Object]" is not valid JSON`.
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
- **Seeing the console in a browser** (each of these cost a detour): `next start` does not serve files added to
  `public/` after the build, and `.next/static/**` drops unknown paths with a 404 — so a preview asset has to go
  through a throwaway same-host proxy (`.tmp/bk5-proxy.mjs`, logs in, injects the session cookies, forwards to the
  running app; `.tmp/` is gitignored). The in-app automation viewport is fixed near 505 px, so the desktop shots
  were taken by loading the page in a same-origin iframe and `transform: scale(0.5)`; `matchMedia` works in there.
  Never paste a real password into that flow — read it from the gitignored file.
