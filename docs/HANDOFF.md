# HANDOFF — live state (written and updated during this session)

Last updated: 2026-11-08 (session 4, bug-fix release pass)
Branch: `wip/snapshot-nov3` (local work branch; release syncs `cpanel-upload/` to origin/main).

## DONE this session (committed)

| Commit | What |
|---|---|
| (working tree) | **Bug 1 root cause found, reproduced, fixed**: `ListDocFields` read `event.currentTarget.open` *inside* a `setShut` updater. A `<details>` fires `toggle` when React sets `open` on mount (soft navigation), and React runs the updater after dispatch, when `currentTarget` is null — `TypeError: Cannot read properties of null (reading 'open')`, the console crash screen. Fixed by capturing `open` before `setShut`. Regression `tests/list-doc-toggle.test.ts` fails on the old code with the exact error and passes after. |
| (working tree) | **Bug 2 root cause**: the console `error.tsx` fallback stayed mounted across client navigations, so the URL moved and the screen did not. It now resets on `usePathname()` change. (`window.history.replaceState(null, …)` is not the cause: Next 16 patches `replaceState` and copies its own internals, see `node_modules/next/dist/client/components/app-router.js`.) |
| (working tree) | **Bug 3 (in progress)**: shared `Breadcrumbs` rewritten (RTL chevrons, `aria-current=page` on the last crumb, `min-w-0` + `overflow-wrap:anywhere`, duplicate-key-safe). Service detail now uses the shared component instead of its own dot-separated trail. Public overflow audit running at 320/360/390/414/768 AR+EN. |

## Key evidence so far

- Unminified stack (build with `productionBrowserSourceMaps: true` in the *local* `next.config.ts`; this flag is **not** to be shipped): `8733-*.js:3:8061` → `src/components/console/ListDocFields.tsx:147:103 name:'open'`.
- Playwright soft-nav repro (test DB, production build, port 3632): create service → `router.push` detail → pageerror exactly `Cannot read properties of null (reading 'open')`; editor count 0. With the fix the detail editor mounts.
- Test seeds: `.tmp/fix-seed.mts` (owner `fix-proof@example.invalid`, service uid `fix-proof-empty-service`), session in `.tmp/fix-session.json`. Cleanup: rows prefixed `fix-` only.

## NEXT

1. Finish the overflow audit; fix only real offenders (no `overflow-x:hidden` on body/html).
2. Rebuild production (`NEXT_DIST_DIR=.tmp/next-build-fix`, env from `.env.test`) and re-run browser proof: soft nav create/open empty service, Back/Forward chain, AR+EN, public empty service page.
3. Gates one at a time: `npm run copy:check`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (test DB alone).
4. Remove the temporary `productionBrowserSourceMaps: true` from `next.config.ts` before any commit/release.
5. **Release blocked: `scripts/ship.ps1` does not exist.** Do not release by another route until the owner provides it.

## Hard reminders

- `.tmp/fix-session.json` holds a test-DB session token; `.tmp/bk5-dev-owner-pass.txt` and `.tmp/secret.txt` are private — never print/commit.
- One test run at a time on `shamah_cms_test`. Never touch `.env.local` or `shamah_cms`.
