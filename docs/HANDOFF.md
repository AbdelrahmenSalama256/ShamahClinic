# HANDOFF — live state (written and updated during this session)

Last updated: 2026-11-07 (session 3, agent continuing WIP snapshot-nov3)
Branch: `wip/snapshot-nov3` (local work branch; release syncs `cpanel-upload/` to origin/main).

## DONE this session (committed)

| Commit | What |
|---|---|
| `9dc482b` | review+commit of the previous agent's tail work: `scripts/release.ps1` gained `-DryRun` (temp clone, prints A/M/D list, removes itself) and `-AllowDeletes` (refuses >25 tracked deletions); secret scan moved from repo root to the deploy mirror; doc updated. Editor test updated for this. |
| `216a22c` | `tests/article-preview.test.ts` updated to the frame contract actually shipped (previous agent had left the two suites asserting opposite contracts — full `npm test` would fail). |
| `c173f81` | **A4 root cause #1**: the preview iframe stayed on the loading splash because its sandbox made the frame's document an opaque origin; every `/_next/static` fetch from it carried `Origin: null` and Next's dev/prod servers answer 403 ("cross-origin ... from a privacy-sensitive or opaque origin"), so the streamed payload's swap script never ran (reproduced, then fixed). The page frame now points at the first-party draft route with **no sandbox** (route sanitizes server-side). Card frames keep `sandbox=""`. |
| `1a4d79b` | **A4 root cause #2**: the preview rail width was captured once (useEffect `[]`), so a stage mounting with the row's data never re-measured; the 1280px frame ran `scale(1)` clipped into a 397px stage (RTL: overflows left). Now a callback ref + node-keyed effect re-measures and re-observes on stage (re)mount. Verified live: frame `scale(0.310156)`, visual rect == stage rect. |

**A4 browser proof (44/44 ok)** — production build, `next start` on port 3621 with `.env.test`, Playwright `frameLocator().click()` throughout (`.tmp/a4-frame-proof.mts`, screenshots `.tmp/a4-frame-*.png`): for both AR and EN at 1280 and 390 — row screen 200, frame paints the article (not the splash), Arabic/English draft notice, FAQ opens on click, visible TOC link scrolls its (Arabic-transliterated, percent-encoded) heading into view, **zero console errors**. Note: dev-mode hydration stalls in this environment (Turbopack and webpack dev alike); all browser verification ran against the production build, which is also what ships.

## NEXT (Tier 1 order)

1. ~~A4~~ **DONE** (44/44 ok, see above).
2. Gate runs, one at a time: `npm run copy:check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (test DB must be alone — no concurrent vitest runs).
3. Sync `cpanel-upload/` (src, package.json, package-lock.json and anything else it mirrors — see docs/CPANEL-UPLOAD.md) and verify byte-identical hashes. TipTap + deps must be in BOTH package.json and package-lock.json of the mirror.
4. `powershell -ExecutionPolicy Bypass -File scripts\release.ps1 "dry run" -DryRun` — report the A/M/D list vs origin/main and whether npm ci / copy:check / typecheck / build passed in its temp dir. STOP there.

## Tier 2 (only if budget remains)

5. A5: extend `tests/fixtures/wp-articles.json` to ≥3 real WP-block articles from the DB export (include `derma-pen-with-mesotherapy-fusion` + one with lists/FAQ/tables); round-trip tests (open in editor model, save, HTML == sanitized original; headings/lists/FAQ intact).
6. Clean up test-DB rows created this session (prefixes `a4http-34d1a6ec`, `a4-browser-d83e6ec5` left by the earlier agent, plus `a4-proof-*`). `.tmp/db-look.cjs` is a helper for listing rows.
7. Report-only leftovers (see task list): notFound() streaming 200; previewableRow() list-scoped grants; layout.tsx meta.title default; JSON-document readers' language fallback.

## Hard reminders

- NEVER push; NEVER run release.ps1 without `-DryRun`; no force; leave `backup/main-before-local-sync-20261106` and `wip/snapshot-nov3` alone.
- `.tmp/secret.txt` + `bk5-dev-owner-pass.txt` are private — gitignored, never printed.
- One test run at a time on `shamah_cms_test`.
