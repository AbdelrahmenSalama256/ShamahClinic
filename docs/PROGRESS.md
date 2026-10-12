# PROGRESS — WordPress CMS integration brief

Resume protocol (do this first, every time):

1. Read this file, then `git log --oneline -15`.
2. Continue from the first row not marked `done`. Do not redo `done` rows.
3. Re-verify the tree with `npm run typecheck`, `npm run lint`, `npm run build` only — do not
   re-run a whole workstream that is already `done`.
4. After finishing one item: `git add -A && git commit -m "<short message>"`, then update its row
   here in the same commit. One item per commit so an outage loses at most one item.

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
| 1f | Shorter Home + exact cut list | done | Home = hero, short about, offers ≤4, branches strip, journal ≤3, one CTA; the 8-row cut list is in `docs/inventory.md` "## Home cuts" |
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
| C | Wire every item where a real WP source exists and delete the static copy | in progress | C1 nav labels + booking CTA from page titles (622/696/9/62/67/32, 837 AR) through `lib/wp/nav.ts` → layout/SiteShell/Navbar/Footer. C2 branch name/address/phone/photo from page 622 `.ws-contact-office-item` blocks (`lib/wp/branches.ts`) feeding /branches, branch detail, /contact, /doctors cards, footer, booking wizard, JSON-LD, sitemap; `clinicData.branches` + `clinicData.services` + `getBranch()` deleted. C3 page 696: 7 published sections → names/intros/section photos merged over the 10 authored rows through an explicit `SECTION_SLUG` alias table (5 match: skincare, laser-hair-removal, botox-injections, filler-injections, chemical-peeling; AR guard `arabicRatio` because sections 1+3 serve English bodies), merged rows now feed the Services dropdown, /services grid, /results table, detail "related", booking + contact pickers (props from the layout, `treatmentsData` imports removed) and `availableService` JSON-LD; `verifiedFacts` deleted, the home/about branch + treatment counters now count the WP lists. C4 about = page 32 parsed by `lib/wp/about.ts` (intro → hero lead, "The Story"/"قصتنا" and "The Process"/"عمليتنا" + 5 `<br>` lines + process photo) into `AboutClient`; `src/data/about.ts` is the outage fallback only. Also fixed `sanitizeHtmlBody` to mirror image srcs before link rewriting. C5-C6 pending |
| D | Write `docs/WIRING.md`: route | element | source | WP source exists (with endpoint/id/selector) | action | todo | |
| E | Keep the demo-text rule: authored static stays where WP holds lorem/placehold, with page id + quoted sample | todo | |
| F | `npm run sync:wp` + lint + typecheck + build + runtime re-verify, language still server-side, snapshot fallback intact | todo | |
| G | Update `docs/inventory.md` (+ DECISIONS) to match, commit | todo | |

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
