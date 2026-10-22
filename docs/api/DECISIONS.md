# DECISIONS — data-layer contract

## Language mechanism (corrects the initial probe)
The first probe only tried `?lang=ar|en` on the English REST root and correctly found it does
nothing. A follow-up probe found the real mechanism:

- The Arabic site is a **parallel subsite served from the path prefix `/ar/`**, backed by
  **TranslatePress** (`trp-form-language` field on the booking form, `dir="rtl" lang="ar"` on
  `/ar/` pages). It exposes its **own REST** at `https://www.shamahclinics.com/ar/wp-json/`.
- `https://www.shamahclinics.com/wp-json/` = **English** content.
- `https://www.shamahclinics.com/ar/wp-json/` = **Arabic** content (translated titles, bodies,
  `/ar/<slug>/` permalinks).

Therefore **language is selected by the REST base URL**, not a query param and not guessing.
`lib/wp/lang.ts` still implements the requested classifier (link `/ar/` first, Arabic-script ratio
fallback) but it is used as a *validator*, not the primary switch.

## Split counts + pairing (validated against live REST)
| type | EN total | AR total | pairing |
|------|----------|----------|---------|
| posts | 92 | 92 | **same id** in both subsites -> 1:1 by id |
| pages | 27 | 27 | same id -> 1:1 by id |
| products | 4 | 4 | identical in both (TranslatePress does not translate Woo names) |

- Post 1182: EN "Dermapen with LC Mesotherapy..." <-> AR "ديرما بن بالميزوثيرابي LC...", same id,
  AR link `/ar/dermapen-with-lc-mesotherapy-for-hai/`. The switcher maps `/<slug>/` <-> `/ar/<slug>/`
  (id is the stable join key).
- Arabic-script ratio: 92/92 EN posts classify Latin, 92/92 AR posts classify Arabic -> ratio agrees
  with the subsite split for every post.

## Offers (products) are messy — and displayed exactly as the data returns
4 products, all currency=EGP, prices in minor units (string):
- 785 "4 Full Body Sessions + Complimentary Face & Brow Bleaching" - 89900 -> 899.00 EGP, not on sale.
- 781 / 780 / 581 - all "٤ جلسات جسم كامل + تشقير وجه وحواجب هدية" - 50000 -> 500.00 EGP, identical
  name+price (duplicate rows with -2/-3 permalink suffixes). All four have `on_sale: false` and the
  Store API returns no `modified` for them.

**Superseded decision (was: de-duplicate by `name|price` -> 2 cards).** The data-entry team owns the
catalogue: `/offers` renders the products returned by that language's REST base, as they are, with
the price/regular price the Store API returns. Nothing hides, merges or filters a product, and no
sale badge or struck price appears unless the data says `on_sale`.

## Services / branches / contact / faq
- Services: no CPT. Source = page `our-services` (id 696), 7 WPBakery cards (العناية بالبشرة،
  إزالة الشعر بالليزر، حقن البوتوكس، حقن الفيلر، حقن النضارة والتفتيح، التقشير الكيميائي،
  خدمات التجميل للرجال) each with title + /wp-content/uploads/2025/10/*.jpg. Parsed with cheerio.
- Branches: no CPT; brief supplies 3 branches verbatim -> **STATIC** (src/data/branches.ts).
- Contact: page 67 is theme demo (placehold.it, General/Press/Shipping) -> contact info **STATIC**.
- FAQ: page 169 is generic Woo/Amaze demo -> **STATIC** (keep authored src/data/faq.ts).
- Hero slides: Revolution Slider renders via JS (dummy.png, no data-lazythumb) -> not parseable ->
  hero imagery stays **STATIC** (existing local image system).

## Forms
- Real CF7 form on **booking page (id 837)**: form id **568**, unit `wpcf7-f568-o1`.
  Fields: text-1 (name), tel-1 (phone), date-1 (date), text-3 (service/subject), textarea-1 (message).
  When LEAD_MODE=cf7: POST /wp-json/contact-form-7/v1/contact-forms/568/feedback/ (urlencoded, same names).
  The CF7 form has no branch field, so `POST /api/v1/lead` writes the **chosen branch into textarea-1**
  (plus the preferred date) alongside the visitor's own note.
- Default LEAD_MODE=whatsapp (prefilled wa.me/201121880908). **No test submission sent** (emails the
  real client) - awaiting explicit confirmation before switching to cf7.
- Both forms go through `POST /api/v1/lead`: the contact form (`ContactClient`) and the booking
  wizard (`BookingModal` step 4 -> Confirm). The wizard sends name, phone, date, services, the offer
  it was opened from, the chosen branch, the reference + time slot + specialist in `subject`, and any
  notes; it fails open, so a network error never blocks the WhatsApp confirmation link the visitor
  is shown in step 5.
- Anti-abuse on the route: honeypot `_website` (silently dropped), name/phone validation, and an
  in-memory 6-per-minute per-IP rate limit.

## Env
WP_BASE_URL (default https://www.shamahclinics.com — only used to rewrite URLs already in the snapshot
and to reach Contact Form 7; BK-7.3 removed the last runtime read of it), REVALIDATE_SECRET, LEAD_MODE,
CF7_FORM_ID (568), NEXT_PUBLIC_SITE_URL (site-owned canonical origin, drives canonical, hreflang,
sitemap, robots).
The build needs none of them to reach the network: it reads `data/wp/*.json`.

## Transport: snapshot-only, then the DB (BK-7.3)
Motivation (historical): the client's WordPress host is shared and slow; a build that fetched it would be
flaky and would hammer the origin, and a runtime fetch with no floor would take pages down whenever WP
hiccuped. That is why the live read was made optional first and then removed.

- `npm run sync:wp` (`scripts/sync-wp.mjs`) writes the committed snapshot `data/wp/*.json` (both subsites,
  concurrency 2, 300 ms spacing, 30 s timeout, 1 retry with backoff; one batched `/media?include=` per
  100 ids) **and** mirrors the images the site renders into `public/wp/*.webp` + `data/wp/images.json`.
  It is the **only** code in the repo that talks to WordPress, it is never imported by a route or module,
  and it is run by hand to cut a new snapshot folder.
- Since BK-7.3 there is **no live content read anywhere**: `src/lib/wp/http.ts` is deleted, and every
  reader in `src/lib/wp/index.ts` and `src/lib/wp/seo.ts` returns from the snapshot. The build-time
  guard (`isBuildPhase()` + `[wp] REFUSED live request during build`) went with it — there is nothing
  left to refuse. `tests/no-wp-network.test.ts` holds the replacement proof: it spies on `globalThis.fetch`,
  renders every public reader, and asserts zero requests.
- Content source is now a **rung**, not a fallback: a kind is served from MariaDB as soon as it holds one
  published row (`src/lib/content/site.ts`, `hasPublished(kind)`), otherwise from the committed snapshot.
  So `generateStaticParams` emits the console's published slugs once the console owns the kind, and the
  92 + 92 snapshot articles until then; `dynamicParams` stays true either way.
- SEO `<head>` comes from `data/wp/seo.json` only (home + contact, AR + EN). The live parse and cheerio
  scraper are gone, so detail-page SEO uses the row's own title/excerpt/image until BK-9 gives the
  console its own seo fields.
- `_embed`, `_fields` and the per-list REST query strings are gone with the live client; the snapshot
  already holds exactly those columns.
- Refresh flow: `npm run sync:wp` locally, commit the snapshot folder, deploy (documented in README);
  `POST /api/revalidate` (`?secret=` or `x-revalidate-secret`) flushes the `wp:en` / `wp:ar` / `wp:seo`
  tags between syncs. The route is POST-only (a GET answers 405), answers 401 on a wrong secret and 500
  with `{"ok":false,"error":"REVALIDATE_SECRET not configured"}` when the variable is unset — which is
  exactly what happens on a host where it was forgotten, so it must be set before go-live.
- The one live WordPress call left in the app is the Contact Form 7 forward in `POST /api/v1/lead`,
  gated behind `LEAD_MODE=cf7` (default `whatsapp` stores nothing). BK-8 replaces lead handling entirely.

## Arabic excerpts are English (observed, no longer filtered)
The AR subsite translates titles (91/92) and bodies (91/92) but WordPress regenerates the
*auto-excerpt* from the English body, so 91/92 AR excerpts are English.

**Superseded decision (was: omit the AR teaser via `biExcerpt()`).** The site displays what the
dashboard returns: each language renders its own subsite's `excerpt.rendered`, including an English
auto-excerpt under an Arabic title. `honestText()`/`DEMO_COPY` filtering is gone — no code decides
that a WordPress field is "not real content".

## Routing: `[lang]` segment + proxy rewrite (server-rendered language)
Language must be known on the server, not switched in the browser, so `<html lang>`, `dir`,
canonical, hreflang, JSON-LD and the Arabic/English copy all render per URL.

- `src/app/[lang]/…` holds every page; `generateStaticParams` on the root layout emits `ar` + `en`,
  so both languages are prerendered.
- Arabic stays the **unprefixed** default: `src/proxy.ts` (Next 16's rename of `middleware.ts`)
  rewrites `/`, `/offers`, … onto `/ar/…` without changing the browser URL. `/en/…` and `/ar/…`
  match directly. The old `next.config.ts` rewrites for `/en` and `/ar` are removed.
- Server components read the segment through `src/lib/route-lang.ts` (a `next/root-params` getter),
  which `lib/seo.ts` and `lib/jsonld.ts` use. Route Handlers cannot import `next/root-params`, so
  `/api/v1/*` takes `?lang=ar|en` instead (`lib/http-api.ts` `readQuery`).
- An unknown segment (e.g. `/fr/`) is not a route: the layout calls `notFound()`.
- Optional catch-all `[[...lang]]` was tried first and is impossible here — "Optional catch-all must
  be the last part of the URL" rejects `/[[...lang]]/about`.

## Pagination links (`rel=prev/next`)
Next 16 metadata has no `alternates.prev` / `alternates.next` (`TS2353`), so `/[lang]/blogs` renders
real `<link rel="prev|next" href>` elements in the page; React 19 hoists them into `<head>`
(verified against the production build's raw HTML). Each paginated/filtered URL also gets its own
canonical plus per-language `hreflang` alternates, and `x-default` stays Arabic.

## Title composition
`buildPageMetadata` appends the brand (`… | عيادات شامه` / `… | Shamah Clinics`) **unless the
WordPress SEO title already carries it** — otherwise `/en` rendered
"Home — Shamah Clinics | Shamah Clinics".

## Images
Every WordPress image (post featured image, service card, offer image) goes through `next/image`
via `toPhotoSlot()` -> `<Photo>`; `remotePatterns` allows `www.shamahclinics.com/wp-content/**`.
Posts with `featured_media: 0` (15 of 92) render the empty frame instead of a broken `<img>`, and
no placeholder photo is substituted — the aspect box keeps its height, so no layout shift.
The home hero and every interior-page hero photo carry `priority` (they are the LCP element).

**Superseded by the mirror (see below):** remote `wp-content` URLs alone. The live origin serves an
image in 2-4 s, which Lighthouse charged to LCP as Load Time, so the rendered set is now mirrored.

## Image mirror: `public/wp/*.webp` (workstream 4)
`scripts/sync-wp.mjs` decides which images the site actually renders — the same `bestImageSrc`
preference (large -> medium_large -> full -> medium) over post/page/product HTML and featured ids —
downloads at most 140 of them, and encodes each to `public/wp/<slug>-<sha1(url)[0:8]>.webp`
(sharp, 1280 px wide, q72, 12 MB input cap, `.rotate()` to honour EXIF). The URL -> file map is
committed as `data/wp/images.json` and applied in `src/lib/wp/mirror.ts`:
`bestImageSrc()`, `sanitizeHtmlBody()` (every `<img src>` in a post/page body) and the mappers all
return the local path, so **no API response and no `<img>` can point at the origin for a mirrored
file**. Anything not in the map keeps its live URL, which is why `remotePatterns` stays.
The step is idempotent: an unchanged URL with an existing file is skipped, so a sync only encodes
what is new. Last run: 53/53 encoded, 1.1 MB in `public/wp/`, 7 KB map.
Measured effect: journal-list LCP Load Time went from 3.43 s (remote) to ~0 s (local), and a
production-build sweep shows 0 `www.shamahclinics.com/wp-content` `src` values on home, `/blogs`,
a journal detail and an offer detail.

## Server HTML is never hidden (LCP "render delay")
The animation system used to ship content invisible: `Reveal` passed framer-motion
`initial={{ opacity: 0 }}`, and `<Photo curtain>` wrapped images in `clip-path: inset(0 0 100% 0)`.
Both only become visible after hydration + an IntersectionObserver, so Lighthouse recorded the LCP
element as 3-4 s of **Render Delay** on every page — the bytes were there, the pixels were not.

Now:
- Above-the-fold reveals (`trigger="mount"`) are pure CSS `@keyframes` (`reveal-mount-*`,
  `animation-fill-mode: both`) that start on the first frame — no JS gate.
- Scroll reveals and photo curtains render **visible**, then a `useLayoutEffect` measures the
  element and arms the hidden class (`reveal-armed` / `photo-curtain`) **only when it is already off
  screen**; an IntersectionObserver (`rootMargin: 0 0 -80px 0`) disarms it as it enters. Nothing the
  user can already see is ever taken away, so first paint is complete.
- `priority` images get no `filter`/`opacity` class at all: even `blur(0)` inside a transition puts
  the LCP image on a filtered composited layer and cost ~0.8 s of paint.
- `prefers-reduced-motion` bypasses both the arm step and the CSS animation.
- Evidence: `grep 'style="[^"]*opacity:0'` on `/ar`, `/ar/blogs` and a journal detail returns 0, and
  every LCP phase is now "Render Delay" (84-89 %) rather than Load Time — the network cost is gone.

## Why mobile performance stays at 79-89 (and what it would take)
Final round, simulated Moto-class mobile (4× CPU throttle, Lighthouse 12 in `lh/`):
`/ar` 82 (a11y 96, SEO 100), `/en` 85, `/ar/blogs` 81 (100/100), `/ar/offers` 79 (100/100),
journal detail 83 (100/100), `/ar/privacy` 89. Desktop preset `/ar` is 99 (a11y 96, SEO 100) with
LCP 0.89 s.
TTFB ~0.46 s, CLS 0.000-0.015, TBT 72-181 ms, page weight 460-565 KiB.
The residual is main-thread work, not the network: `mainthread-work-breakdown` on the simplest page
(`/ar/privacy`, 406 elements, no carousels) is still 3.03 s with **Style & Layout 1.02 s + Rendering
0.54 s + Other 0.84 s**, and the two client chunks are framer-motion (230 KiB) and react-dom
(223 KiB). Cutting that means removing the animation system or the page-transition shell — both are
the approved visual design, which the brief puts out of scope. Everything that was ours to fix
(lazy LCP image, remote-origin images, JS-gated paint) is fixed and measured.

Residual accessibility (home 96, all other pages 100): `target-size` on the two pagination dots of
the home "لماذا تختار العميلات شامه" swiper (`src/components/ui/Swiper.tsx:172`). The hit areas are
24×24 px at a 16 px pitch, so spacing them to 48 px would widen the row and change the approved
layout; the WCAG 2.5.8 equivalent-control exemption applies because the same navigation is available
from the labelled arrows and swipe.

## API `href` fields point at routes this site serves
`/api/v1/posts` items carried `hrefPair(slug)` (`/dermapen-…`), which is not a route here — the
journal lives at `/blogs/<slug>`. Nothing in the UI read it (cards build their own link), so the
wrong value was invisible but a landmine for any API consumer; `mapArticleCard` now emits
`blogs/<slug>`. A WordPress service section is a section of page 696, not a page of its own, so
`mapServiceCards` emits `/services` rather than `/services/<wp-slug>` (6 of the 7 WP titles have no
authored treatment detail, and those URLs 404). Verified: every one of the 240 sitemap `<loc>`
entries returns 200 on the production build, including all 92 posts in both languages.

## Dialog and toggle semantics
The booking wizard renders through `AnimatePresence` without any role, so assistive tech saw a
plain `<div>`: the overlay box now carries `role="dialog" aria-modal="true"
aria-labelledby="booking-modal-title"`, pointing at the step heading that already names it.
Journal category chips were selected by colour only; they now expose `aria-pressed` (the All chip is
pressed while no category filter is active). Neither change alters a pixel.

## React 16/19 attribute serialisation (accepted, not a bug)
`next/image` in this version does not emit `fetchpriority` from `priority` alone (it is set
explicitly), and React serialises `fetchPriority` / `hrefLang` in camelCase —
`<link rel="alternate" hrefLang="en" …>` in the raw bytes. HTML attribute names are ASCII
case-insensitive, so crawlers and the browser parse them correctly; verified in the production
build's `<head>` and in the live DOM (`l.hrefLang` resolves).

## Origin outage is the normal worst case
During the final verification pass the client's host was returning **HTTP 522** (Cloudflare could
not reach the origin) after ~20 s for every path, `/wp-json` and `/ar/wp-json` alike. The site was
unaffected: `next build` finished 277 pages reading only the snapshot (0 live requests, 0 REFUSED,
302 snapshot reads) — proven with the origin actually down, not merely disallowed — and the running
server kept answering from the prerendered HTML and the snapshot. One structural fix came out of it:
`/[lang]/blogs/page.tsx` awaited the posts list and then the categories list, so an outage cost two
back-to-back 8 s budgets; the two reads now run in `Promise.all`, bounding a page to one budget per
URL. Cold-render cost during the outage measured 38 s before that change and the pages served
afterwards are 30-60 ms.

## Mixed-language WooCommerce rows are rendered as entered
Three of the four products carry Arabic names with the WooCommerce *sample* English
`short_description` ("These art prints have been hand painted… Lorem ipsum…") in the store itself.
That text reaches the offer body and the `Offer` JSON-LD verbatim because the content policy says
the dashboard owns every word: no `DEMO_COPY` blocklist, no heuristic that decides a WordPress field
is not real content. Recorded in `docs/inventory.md` under Offers so the mapping is auditable.

## Origin latency budget
Measured from the development network: **every** WP REST call costs ~4-6 s (even a 118-byte
`categories` response), which made a cold `/blogs?page=2` render take 12.8 s. Response:
- `next.config.ts` `expireTime: 3600` gives ISR routes stale-while-revalidate, so a CDN serves the
  cached page while the content refreshes in the background.
- BK-7.3 removed the origin from the render path altogether: every read is a local file or the DB, so
  the budget no longer applies. (Until then the mitigation was a 3600 s cache on taxonomy + media reads
  and an 8 s abort with snapshot fallback — both deleted with `lib/wp/http.ts`.)

## sitemap lastmod
`lastmod` comes from WordPress `modified` (posts) or the page's `modified` for the mapped static
pages; entries with no `modified` in the data omit `lastmod` rather than shipping a fabricated date.

## Services cards: WP names over static cards
Live page 696 has 7 image-bearing WPBakery sections with a title + short intro each; they are the
clinic's own wording, so `getMergedTreatments()` overrides the static card **name, tagline and photo**
where a section matches (exact slug, then normalized-title containment) and leaves everything else
untouched. The section's own image replaces the stock photo when the dashboard publishes one
(`treatments.ts:99`, alt = the section title); where WP has no image the authored slot stands. Photos
were originally kept authored on the theory that page-builder assets should not move the visual
concept — the AUDIT reversed that, because the alternative was hiding a dashboard image behind a
local file. Two published sections (`glow-brightening-injections`, `mens-aesthetic-services`) have no
authored row to attach to, so they are not shown; recorded rather than invented.
Exposed raw at `GET /api/v1/services`.

## Pagination canonical follows the clamped page
`paginate()` clamps `?page=99` onto the last real page, so `/blogs?page=99` renders page 11. The
canonical is taken from `paged.page`, not from the requested query, otherwise an out-of-range URL
would publish the same content under a second canonical. `rel=prev/next` are computed from the same
clamped value, so page 99 points at page 10 rather than at page 98. `generateMetadata` calls the
same `read()` helper as the page; the reads are per-URL deduped, so metadata costs no extra
WordPress round trip.

## Journal first-row photos are eager
Lighthouse flagged `lcp-lazy-loaded` on `/blogs`: the LCP element there is the first card photo,
which was `loading="lazy"` and, worse, sat behind the scroll curtain (`blur-md opacity-0` until an
IntersectionObserver fires). `ArticleCard` now takes `priority`, and `JournalClient` passes it for
the first two cards (the mobile row). Eager + `fetchPriority="high"` + no curtain: the frame is
never withheld from the first paint. Below the fold the curtain still runs, so the reveal design is
unchanged where a visitor actually scrolls.

## Booking wizard is a client-only dynamic import
`BookingModal` was imported eagerly by `BookingContext`, which sits in `SiteShell`, so the wizard's
framer-motion + form + `.ics` code was parsed on all 277 pages although only a click reaches it. It
is now `dynamic(..., { ssr: false })` and mounted on first `openBooking()` (`bookingSession > 0`),
which keeps the exit animation working on later opens. Verified on the production build: the dialog
still opens with the offer's treatment preselected (`aria-pressed="true"`), `role=dialog` +
`aria-modal` + labelledby intact, body scroll lock applied, and Escape restores it.

## Nav is authored again — a client decision, not a data finding
`src/data/nav.ts` now holds the whole header menu (9 lines + 4 dropdown children) and the footer link
group, bilingual, in display order, with `bookCta` for the button. `src/lib/wp/nav.ts`, which derived
those labels from WordPress page titles, is deleted (`e39f950`), as are `primaryNav` /
`featuredServices` from `src/lib/site.ts`.

The evidence that a WordPress menu exists is preserved here on purpose: the live homepage HTML carries
`menu-item-870`→page 622, `717`→696, `755`→9, `643`→62, `646`→67, `647`→32, `838`→837. The site
chooses not to follow it, because a dashboard slug edit silently renames the navigation. Removing a
page from the menu is one deleted line in `src/data/nav.ts`. `scripts/verify-render.mjs` asserts the
rendered header order/labels against that file in both languages, so a future "wire the nav to WP"
change cannot pass the gate unnoticed.

## Home card sections are capped at three, with a "View all"
`HOME_CARDS = 3` in `src/components/home/HomeBody.tsx:60` applies to every list Home renders: services
3 of 12, offers 3, branches 3, journal 3. The full lists stay on `/services`, `/offers`, `/branches`,
`/blogs` (and `/about` for the reasons) with their existing pagination. Home still fetches a 4th offer
and article (`page.tsx:29` `{offers: 4, articles: 4}`) — that row is only the probe that more content
exists, so the "All offers"/"All blogs" links are honest instead of decorative.

The link is **conditional in both directions**: it renders only when records are left out, so the
branches band carries no "View all" at all — the dashboard holds exactly three offices, and a link to a
list the page already shows is decoration. `scripts/verify-render.mjs` asserts that both ways against the
rendered HTML in AR and EN, taking each section's total from the same `/api/v1/*` endpoints the page reads
(presence when total > 3, absence when it is not).

## Interior page headings follow their WordPress page title
`getPageTitle(slug, authored)` (`src/lib/wp/index.ts:422-432`) reads the same `getAllPages()` list the
nav used to, so this costs no extra request. Five routes now take their H1 from the dashboard: 696
Our Services/خدماتنا, 9 Offers/العروض, 62 Journal/معلومات طبية, 169 FAQ/أهم الأسئلة الشائعة, 3
Privacy Policy. Arabic keeps the authored fallback whenever `arabicRatio ≤ 0.3` — that is why
`/privacy` still reads سياسة الخصوصية while `/en/privacy` reads the WP title, and it is the same guard
the service names use. Leads stay authored: every WordPress `excerpt.rendered` on those pages ends
`[…]`, which is an auto-generated truncation rather than a sentence the clinic wrote.

## The botox page body needed a render-path fix, not a data change
Page 885 was already being fetched for `/services/botox`, but only inside `generateMetadata`, which
reads `name`, `tagline` and `image.src` and discards `body`; the page component rendered rows from
`getMergedTreatments()`, which never sets `body`. So the dashboard's long-form botox article was
invisible. `e6e6181` moves the render path to `getMergedTreatment(slug)`. The Arabic side of 885 is
untranslated English (`arabicRatio` 0.000), so `treatments.ts:128` leaves Arabic on the authored
description; the audit rule is to show what WP returns **in the language it returns it**, not to put
English text under an Arabic heading.

## Theme demo content: the two different rules, and why they differ
Where a WordPress page is ArtDay/WooCommerce sample text, the authored copy stays and the page id plus
a quoted sample go in `docs/WIRING.md` §15 (pages 169, 3, 67, 62, 13). Where the same kind of demo
text sits in a **WooCommerce product**, the site prints it — 781/780/581 render "These art prints have
been hand painted…" as the offer lead and body. The distinction is not taste: the demo page has no
record of being clinic content, while a product row is the clinic's own catalogue entry, and the
content policy forbids the code deciding that a WordPress field "is not real content".

## A WordPress section is a service even when we author no row for it
The audit wired page 696's sections over the authored catalog and left a note that two of them
(`glow-brightening-injections`, `mens-aesthetic-services`) "are not shown", because there was no
`treatmentsData` row to attach their name to. That is the code deciding which WordPress content is
displayable — exactly what the content policy forbids — so `495409e` appends every unmatched section
as its own card and detail route, in the order the page lists them.

The second half of the same decision is what the UI must **not** do once a service has no authored
row: WordPress gives a section a title, one paragraph and an image, so those cards carry nothing else.
`priceStartingAt` became `number | null` and `category` gained `null`, and every consumer treats
"no value" as "no block": no category badge, no "يبدأ من / From … ج.م" line (an empty slot keeps the
card's flex row, so the layout does not move), no duration/course/price fact grid, no Ideal-for,
Benefits, Steps or Aftercare heading over an empty list, no `Offer` in the JSON-LD (schema.org wants a
real price, and a 0 would be a fabricated one), and no row in the `/results` comparison table, whose
three data columns are figures WordPress does not hold. They do appear in the booking and contact
service pickers, in `availableService` and in the sitemap — 12 services now, up from 10.

`extractServiceSections` also trims a leading list number from a section heading; the Arabic dashboard
holds `3. إزالة الشعر بالليزر` while every other heading is unnumbered. That is a formatting trim, not
a dropped word, and the verification script prints both strings so the substitution is never silent.

## Verification is a script over rendered HTML, not a claim
`scripts/verify-render.mjs` parses `src/data/nav.ts` (bracket depth separates top-level lines from
dropdown children), reads page 696 out of `data/wp/pages.{en,ar}.json` for the service sections, fetches
the built pages for both locales, and asserts header order and labels, the footer link group, the
booking CTA, the four card sections at ≤3 cards with their "View all" links present exactly when a
total exceeds the cap, all 7 WordPress service titles rendered on `/services` (12 cards), and — per
WP-only service — a 200 detail route with the WordPress intro, a mirrored photo, `MedicalProcedure`
JSON-LD that carries no `Offer`, no price fact and no empty Benefits/Steps/Aftercare heading. 151 checks,
AR + EN, against `npx next start -p 3100`.

## What Home shows is what the dashboard holds
The reasons block was Home's 01 section for the whole project: four authored claims, no WordPress source,
and `docs/STATIC-SWEEP.md` found none in 200 live documents either. Task C replaced it with three service
cards drawn from page 696, in the dashboard's own order, keeping the band's heading style, container,
reveal timing and carousel. The claims are not deleted — they moved to `/about`, which already had a
"why us" surface, and Home's introduction row links there. Selection rule, decision table and the
measured height before/after are `docs/HOME-PRIORITY.md`.

The cap and the section count are the constraint that made this possible rather than a compromise: Home
still has four card bands, and the desktop page came out shorter.

## A missing WordPress field is a rendering case, not an error state
The content policy forbids dropping records, so the UI has to survive the shapes WordPress actually
returns: a service with no price, an offer with no inclusion list, an article with no author, a branch
whose image 404s, a 600-character title, an English string served to the Arabic locale. `src/app/[lang]
/preview-missing-fields/page.tsx` renders the **real** card and section components against synthetic
records for each of those cases (dev-only, `noindex`, `notFound()` in a production build), and `node
scripts/test-missing-fields.mjs` reads that HTML and fails on an empty heading, a text-less section, an
`img[src=""]`, an unmirrored `wp-content` URL, `undefined`/`NaN` in the copy, a "0 EGP" price the
dashboard never set, or a "View all" with nothing behind it. 86 checks, AR + EN.

The fixes are deliberately smaller than the report they came out of: `SectionHeading` returns null
without a title, `Photo` falls back to the gold-tone logo frame instead of an empty box, `Swiper` hides
its arrows and dots when every slide already fits (dead controls otherwise cost the band its height),
card tagline slots are reserved rather than collapsed, and mixed-language strings render as stored with
`dir="auto"`. No new component system, no abstraction layer.

## The live site can be down while this site is not
`npm run sync:wp` did not complete on 2026-10-13: the homepage answered HTTP 500 after 15.5 s and REST
requests timed out at 90-120 s on repeat. `data/wp/` and `public/wp/` stayed untouched, the build read the
existing snapshot, and every verification script ran green against it. That is the snapshot-first design
doing its job, recorded here so a future run does not read a failed sync as a code defect — and so nobody
"fixes" it by pointing the render path at the live origin.
Scroll-dependent visuals still cannot be proven from pixels in this environment (see PROGRESS "not
verifiable"), so this covers the DOM contract only.
