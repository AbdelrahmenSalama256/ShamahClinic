# Job A — evidence manifest

This is the A4.5 record for the Home Before/After work (A1–A5). It names every check that was
run, the counts it reported, the files it produced, where those files went, and what remains
unverified. Proof records lived in the disposable test database (`shamah_cms_test`) and in the
gitignored `.tmp/` folder; both were cleaned after testing (section 7).

Build identity: `D:\shamah_cms`, branch `feature/cms-migration-redesign`, base `524ccf6`,
`next build --webpack` (Next 16.3.6), production server on `http://127.0.0.1:3357` started with
`.env.test` so every browser proof and every render check read the disposable database, never
`shamah_cms`.

## 1. Test names and pass/fail counts

| Suite | Result |
|---|---|
| Full `npm test` (vitest, 47 files) | **913 passed, 0 failed** |
| `tests/alt-migration.test.ts` (legacy shared alt → per-image alt) | 33 passed |
| `tests/visibility.test.ts` (order, enabled, `showOnHome`) | 10 passed |
| `tests/results-page.test.ts` (results read path, page shape, pair rule) | 25 passed |
| `tests/list-doc-fields.test.ts` (typed results fields, bilingual names) | 11 passed |
| `tests/editor.test.ts` (editor form model, changed by A3.1) | 83 passed |
| `npm run copy:check` | 224 entries current, 98 data-driven calls skipped |
| `npm run verify-render` equivalent: `node scripts/verify-render.mjs http://127.0.0.1:3357` | **259 checks passed, 0 failed** |

The render gate's `/results` section was exercised in three states while A6 was open: three
published cases (single page → 255/0), ten cases (page 2 and the out-of-range clamp → 259/0,
with seven marked `render-gate-page-*` rows inserted and removed by the probe), and the final
cleaned database (no published cases → the frozen 56-story fallback paginates → 259/0).

## 2. Production-build browser proof counts

All runs were Chromium against the production build above; each script asserts and counts its
own statements and exits non-zero on the first failure.

| Proof | Statements | Result |
|---|---|---|
| A4.3 real-console upload workflow (`/console/lists/results` → Add → upload Before → upload After → Show on Home → Save → `/results` → Home → reorder → hide → delete) | 56 | 56/56 |
| A4.4 SEO and public-page isolation (`/`, `/en`, `/results`, `/en/results`) | 142 | 142/142 |
| A1/A4.5 band stability (EN/AR × 390/1350: height before and after decode, layout-shift sources, both pictures painted) | 12 | 12/12 |
| A4.2 console preview painted screenshots (editor + preview, EN/AR × 360/480) | 8 screenshots | produced, inspected |
| A3.1/A3.2 console notices and accessible names | 6 screenshots + assertions | produced, inspected |

The band kept its height across every run — 797.7→797.7 px (EN 390), 754.5→754.5 (AR 390),
847.7→847.7 (EN 1350), 821.7→821.7 (AR 1350) — and recorded **0** layout shifts with a source
inside `#before-after`.

The real-console workflow uploaded through the picker's file input (`POST /api/console/media`)
and never inserted a row directly: the case was created with the console's Add action, enabled
with the real control, saved, published, reordered, hidden and deleted through the UI, and the
after-assertions looked at `/results`, Home, the database and the upload folder.

## 3. Lighthouse reports

Lighthouse 13.6.0 / Chrome 156, eight runs against the production build (mobile is the default
mobile emulation, desktop the default desktop preset). The brief's thresholds are Accessibility,
Best Practices and SEO ≥ 90; Performance is listed for completeness.

| Form | URL | Perf | A11y | BP | SEO | CLS |
|---|---|---|---|---|---|---|
| mobile | `/en` | 63 | **97** | **100** | **100** | 0.004 |
| mobile | `/ar` | 81 | **97** | **100** | **100** | 0.064 |
| mobile | `/en/results` | 64 | **100** | **100** | **100** | 0.001 |
| mobile | `/ar/results` | 69 | **100** | **100** | **100** | 0.064 |
| desktop | `/en` | 100 | **100** | **100** | **100** | 0.010 |
| desktop | `/ar` | 95 | **100** | **100** | **100** | 0.129 |
| desktop | `/en/results` | 99 | **100** | **100** | **100** | ≈0 |
| desktop | `/ar/results` | 98 | **100** | **100** | **100** | 0.003 |

Every row reported `shiftElements: []` — Lighthouse attributed no shift to a specific element.
The separate `a44-cls` trace identified the AR page's shifts as coming from the H1, nav,
breadcrumb and prose blocks arriving, never from `#before-after`. The band's own height is
reserved by the frame's aspect ratio, which is why the scroll-stability run above sees none.

## 4. Screenshot paths (produced, then removed)

- `.tmp/a31-ar-notice.png`, `a31-en-bulk.png`, `a31-en-legacy-moved.png`,
  `a31-en-legacy-notice.png`, `a31-en-services-names.png`, `a31-en-stray.png`
- `.tmp/a42-editor-{en,ar}-{360,480}.png`, `a42-preview-{en,ar}-{360,480}.png`
- `.tmp/a43-before.png`, `a43-after.png`, `a43-editor-uploaded-en.png`,
  `a43-results-en.png`, `a43-results-after-move-en.png`, `a43-home-en.png`,
  `a43-home-ar.png`, `a43-home-after-hide-en.png`
- `.tmp/a44-band-{en,ar}-{390,1350}.png`
- `.tmp/a44-seo-{en,ar}-{home,results}.png`
- Reports/logs: `.tmp/a41-lighthouse.json`, `.tmp/a44-band.log`,
  `.tmp/a44-seo-isolation.log`, `.tmp/a44-cls.log`, `.tmp/a44-page-problems.json`

They are gitignored and were deleted with the rest of the Job A scaffolding after the numbers
in this file were recorded.

## 5. Temporary proof record and file identifiers

All of these existed only in `shamah_cms_test`:

- Results rows `a6-proof-pair-a`, `a6-proof-pair-b`, `a6-proof-pair-c` (the three left at the
  end; the earlier `a6-proof-half`, `-hidden`, `-legacy`, `-legacy2`, `-legacy3`, `-legacy4`,
  `-stray` were removed by the workflows that created them).
- Render-gate rows `render-gate-page-1` … `render-gate-page-7` (inserted and deleted by the
  pagination probe).
- Users `a6-proof-owner@example.invalid`, `a6-proof-owner-ar@example.invalid`, and the
  pre-existing `hs-proof-owner@example.invalid`.
- Media rows `hs-proof-media-1`, `hs-proof-media-2` (pre-existing from the HS stage).
- Their sessions, `login_attempts` rows, `user_roles` rows and `audit_log` entries.

The A4.3 upload produced its own media rows and four files on disk; that script deleted them in
its `finally` block and asserted their absence before reporting 56/56.

## 6. Images used for the proof

The two pictures compared in the band during the proof were `/uploads/202610/1291c4739e48-…`
and `/uploads/202610/657b26bae846-…` — existing clinic uploads already referenced by the dev
database. No stock or generated image was introduced, and **no real patient photograph was
published for this work**. The patient-photo / consent / disclaimer questions remain with the
owner (section 8).

## 7. Cleanup confirmation

Deleted from `shamah_cms_test` (single pass, all counts verified as 0 afterwards):

| Table | Rows deleted |
|---|---|
| `audit_log` | 57 |
| `sessions` | 21 |
| `login_attempts` | 21 |
| `user_roles` | 3 |
| `list_items` | 3 |
| `media` | 2 |
| `users` | 3 |

Post-clean queries: proof users **0**, proof list rows **0**, proof media **0**, proof audit
entries **0**, sessions belonging to a proof user **0**.

Upload files were **not** deleted: every candidate (`1291c4739e48`, `657b26bae846`,
`6edfc5228975`, `78b28c2911c2`, `9f3cdd1ee53c`, `ae6c22147bfa`, `b378f8ed79d3`,
`d149c07959fb`) is still referenced by rows in the dev database (`shamah_cms`), so they are real
content. The only proof-only files were A4.3's four, removed by that proof itself.

`.tmp/` Job A artifacts were deleted (`a31-*`, `a32-*`, `a41-*`, `a42-*`, `a43-*`, `a44-*`,
`a5-*`, `a6-*`). After cleanup `/`, `/en`, `/results` and `/en/results` all answered 200, and
the full seven-gate set plus `verify-render` was re-run on the cleaned state (section 1).

## 8. Remaining unverified items

1. **Mobile Performance is below 90** on Home and Results (63/81/64/69). The brief's A4.1
   threshold is Accessibility / Best Practices / SEO ≥ 90 and CLS attributable to the section;
   Performance was not a stated threshold. It is still the honest number for a mobile emulated
   run and is recorded here rather than omitted.
2. **AR page CLS (0.064 mobile, 0.129 desktop)** is not from the band. It comes from the H1,
   nav, breadcrumb and prose blocks; no shift was attributed to an element at all. This predates
   Job A and was not changed by it.
3. **Owner questions, deliberately unanswered** (the brief forbids deciding them):
   which real Before/After photos to use; the exact patient-consent wording; whether a new
   disclaimer field is wanted and what it should say. The implementation works without them —
   the band shows only what the console publishes and hides itself when nothing is eligible.
4. **Untranslated offer-image alt text on Home** in the non-source locale (pre-existing).
5. **A result with only one language for its caption** shows that language on both pages; no
   translation is invented. This is the existing fallback rule of the copy layer.
6. **Test-suite side effect:** `tests/content.test.ts` deletes and re-inserts the `lists` rows
   with new UUIDs, orphaning pre-existing `list_items` in the disposable test database. It does
   not touch `shamah_cms`. Proof runs must be sequenced after the suite (or the rows re-pointed),
   which is why the A6 sequence is: clean → gates → build → server → render gate.
7. **Non-JS reading of the band**: the first case is server-rendered, but switching cases and
   dragging require JavaScript. Without it the page still carries the first pair and its text.

## Reproduce

```sh
npm run typecheck && npm run lint && npm run copy:check
npm test
npm run build
npm run prove:no-wp
node --env-file=.env.test node_modules/next/dist/bin/next start -p 3357
node scripts/verify-render.mjs http://127.0.0.1:3357
```

The browser scripts were one-shot `.tmp/` probes and are intentionally not committed; their
assertions are described above and their counts are those printed at run time.
