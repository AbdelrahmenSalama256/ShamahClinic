# Inventory — UI section/field -> data source (contract)

Legend:
- `WP:<endpoint>` — real WordPress/WooCommerce data. Served **live** at runtime, from the committed
  **snapshot** during build and whenever live fails (see "Transport" below).
- `STATIC` — hand-authored module under `src/data` (no WP source exists, or WP has nothing translatable).
- `CONFIG` — app config under `src/config` / `src/lib/site.ts`.

Language model: EN is the base subsite (`/wp-json`), AR is the TranslatePress subsite
(`/ar/wp-json`); **same post ids** on both, so a `{ar,en}` pair is built by fetching the same id/slug
from both bases and merging (`?lang=` is *not* used — it does not separate the subsites).
Site owns the URLs (`/x` = Arabic default, `/en/x` = English), see docs/api/DECISIONS.md.
Routing matches the URL: every page lives under `src/app/[lang]/`, and `src/proxy.ts` rewrites the
unprefixed Arabic URLs onto `/ar/…` without changing the address bar, so `<html lang>`, `dir`,
canonical, hreflang, JSON-LD and all copy are decided on the server, not in the browser.
Nothing on the site is translated client-side-only: `useLanguage()` reads the same `/en` prefix the
server does.

## Transport (snapshot-first)
| Stage | behaviour |
|-------|-----------|
| `npm run sync:wp` (`scripts/sync-wp.mjs`) | pulls both subsites slowly (concurrency 2, 300 ms between requests, 30 s timeout, 1 retry with backoff, max 3 in-flight) into committed `data/wp/*.json`: `posts-list.{en,ar}`, `posts.{en,ar}` (full content), `pages-list.*`, `pages.*`, `categories.*`, `products.*`, `offer-categories.en`, `media.json` (one batched `/media?include=<ids>` per 100 ids), `seo.json`, `meta.json` (generatedAt, request count, byte size, row counts). It then downloads **only the images the site actually renders** (<=140, decided from the same `bestImageSrc` preference the UI uses), encodes them with sharp to `public/wp/<slug>-<hash>.webp` at 1280 px / q72, and records the URL -> file map in `data/wp/images.json`. Last verified run: 75 WP requests in 90.3 s, 53/53 images encoded into 1.1 MB. |
| `next build` | reads **only** `data/wp/*.json`. Zero WordPress requests: `src/lib/wp/http.ts` rejects any live fetch while `NEXT_PHASE === "phase-production-build"` and logs `[wp] REFUSED live request during build`. `generateStaticParams` returns **every** post per language (92 + 92) plus all offers and services, so the last page of the journal is prerendered, not paid for by a visitor; `dynamicParams` stays true so anything published after the build still renders. `next.config.ts` caps generation to 2 CPUs with `staticPageGenerationTimeout: 120` and sets `expireTime: 3600` (stale-while-revalidate). Last verified run: 277 static pages in 16.4 s, 0 REFUSED lines, 302 snapshot reads. |
| Runtime (ISR 300 s) | live WP with an 8 s abort + 1 retry and a global cap of 3 in-flight requests, deduped by URL; on error **or an empty list response** it falls back to the snapshot. Category + media reads cache for `WP_TAXONOMY_REVALIDATE` (3600 s) because a WP REST round trip here costs 4-6 s and the data team edits posts, not taxonomies. A page's independent reads run in `Promise.all`, so the worst case when the origin stalls is one 8 s budget per URL, not one per await. Every read logs its winner: `[wp] live en posts-list (92 rows)` / `[wp] snapshot ar posts (fetch failed)`. `/api/revalidate` (**POST**, secret-guarded) flushes the `wp:en` / `wp:ar` / `wp:seo` tags and the listed paths; it answers 401 on a wrong secret and 500 when `REVALIDATE_SECRET` is unset. |

### Images
`data/wp/images.json` maps a WordPress upload URL to its local `/wp/<file>.webp` mirror, and
`src/lib/wp/mirror.ts` applies it at the **data layer** — `bestImageSrc()`, `sanitizeHtmlBody()` and
`mapArticleCard()`/`extractServiceSections()` all return the local path, so `/api/v1/*` and the UI can
never emit a URL the mirror does not have. `mirrorSrc()` falls back to the live WordPress URL when a
file is not mirrored (an image uploaded after the last sync), so an unmirrored image still renders.
Verified on the production build: 0 `src` values pointing at `www.shamahclinics.com/wp-content` on
home, journal list, journal detail and offer detail; every image goes through `next/image`.

Lists never request bodies: `_fields=id,slug,date,modified,link,title,excerpt,categories,featured_media`.
`_embed` is not used anywhere — images come from `media.json` (plus a batched live `/media?include=`
for ids the snapshot does not know), term names from `categories.{en,ar}`. Full `content.rendered`
is fetched only for detail views.

## Global / shell
| UI | source |
|----|--------|
| Brand name, tagline, currency, theme colour | CONFIG (`src/config/site.ts`) |
| Phone 01121880908, WhatsApp 201121880908, email, hours | CONFIG (contact info is not exposed by WP REST; from the client brief) |
| Primary nav (Home, About, Services, Offers, Blog, Branches, Contact, Booking) + AR labels | CONFIG (`src/lib/site.ts`) — hardcoded from the live menu; WP `menus` endpoint is 404 |
| Service names shown in the nav dropdown | STATIC (`treatmentsData`, featured 4) — WP names are merged only on `/services` itself |
| Logo, social links | STATIC local wordmark (`public/images`) + CONFIG |

## Home (SHORTER — full cut list at the bottom)
| Section | source |
|---------|--------|
| Hero (headline, sub, CTAs, images) | STATIC — the live hero is a Revolution Slider whose images are JS-loaded, so they are not present in WP REST or the page HTML |
| Short about block (heading, lead, 4 differentiators) | STATIC — hand-authored claims from the client brief; WP page 32 copy is theme demo text and is not used (see About) |
| Offers (max 4) + "All offers" | WP:offers (WooCommerce Store API, the products that language's base returns, in WP order — nothing merged or filtered) |
| Branches strip (3) with call / WhatsApp | STATIC (`src/data/branches.ts`) — WP has no branch CPT |
| Latest journal (max 3) + "All blogs" | WP:posts (3 most recent, both subsites) |
| One strong CTA band | STATIC |

## Services (`/services` + `/services/[slug]`, aliases of `/treatments*`)
| Field | source |
|-------|--------|
| Category chips | STATIC (`treatmentCategories`) — WP has no service taxonomy |
| Card titles + taglines | WP:pages/696 (`/services/` page, 7 image-bearing WPBakery sections parsed into typed cards) merged over `src/data/treatments.ts` — WP is the naming authority where a section matches; the static entry is kept where WP has none. Not visible text invented: unmatched cards are unchanged static content |
| Card photos | STATIC (`src/data/treatments.ts` / `lib/images.ts`) — the WP section images are page-builder assets; swapping them would change the approved visual concept, so photography stays as authored |
| Detail body (steps, aftercare, FAQ per service) | STATIC — long-form authored per service; the WP services page has one intro per section, no per-service body |
| JSON API | `GET /api/v1/services` (raw parsed cards, `?search=` supported) |

## Offers (`/offers`, `/offers/[slug]`)
| Field | source |
|-------|--------|
| Title, image, permalink | WP:offers (`wc/store/v1/products`) |
| Price EGP | WP product `price` + `currency_minor_unit` (89900 / 100 -> 899 EGP) — never hand-typed |
| regular / sale price | WP `regular_price` and `price` as returned; shown exactly as the dashboard holds them |
| on_sale / discount | WP `on_sale` (currently none on the live store), percent derived from regular vs price |
| Duplicate rows | Kept, not merged: 781 / 780 / 581 carry the same name and price with `-2` / `-3` permalinks because the client's team entered them that way. Each language renders the 4 products its own REST base returns |
| AR names | WP products are not translated on the AR subsite (identical EN strings) — recorded here rather than inventing an Arabic label |
| Description text | Products 781 / 780 / 581 still hold the WooCommerce sample `short_description` ("These art prints have been hand painted… Lorem ipsum…") **in the client's own store**. The site prints it as the dashboard returns it, in the offer body and in the `Offer` JSON-LD, exactly like every other WP field — no code decides that a WordPress field is not real content |
| Package terms / inclusions | STATIC (authored) |

## Journal (`/blogs`, `/blogs/[slug]`)
| Field | source |
|-------|--------|
| Article cards (title, date, image, category, excerpt) | WP:posts list projection + `media.json` + `categories.{en,ar}` — each language shows its own subsite's `excerpt.rendered`. 91/92 AR excerpts are English auto-excerpts because WordPress generates them that way; the site displays that and does not rewrite it |
| Card without a featured image | 15/92 posts have `featured_media: 0`. `<Photo>` renders the empty aspect-ratio frame (no `<img>`, no layout shift) instead of substituting a stock photo |
| Article body | WP:posts `content.rendered`, sanitized (`sanitize-html`), only fetched on detail |
| Category filter, search | `GET /api/v1/posts?category=&search=&page=` — the filter runs over the rows the data layer already has (live or snapshot), not a second WordPress query. Category matches the merged card's `categorySlug`; search is a case-insensitive substring of title + excerpt in **both** languages, so an Arabic term finds a post whose English subsite holds the slug (e.g. `search=ليزر` -> 35 of 92, `search=Botox` -> 11, `search=PRP` -> 0 because no published title or excerpt contains it). The visible filter is a URL state (`/blogs?category=…`), so it is shareable, prerendered and crawler-visible. |
| Pagination | in-memory over the filtered list (92 posts, 9/page -> 11 pages, last page 2 items); `/blogs?page=N` is a real URL with an absolute per-language canonical and `<link rel=prev/next>` in `<head>`; an out-of-range `?page=` (99) renders **and canonicalizes** the last real page, so it cannot duplicate page 11 under a second canonical; "Load more" appends `/api/v1/posts?page=N+1` without a reload, so no page repeats or skips |

## Doctors (`/doctors`), Results (`/results`), FAQ (`/faq`), Privacy (`/privacy`)
No WP source (or the matching page is theme demo) -> STATIC (`specialists.ts`, `results.ts`, `faq.ts`, `privacy` page copy).

## Branches (`/branches`, `/branches/[slug]`)
STATIC (`branches.ts`, addresses/hours from the client brief) — WP has no branch records.

## About (`/about`)
STATIC (`AboutClient`) — live page 32 is theme demo content, so the authored story/process copy is used and marked here.

## Contact (`/contact`) + Booking
STATIC info + contact form UI -> `POST /api/v1/lead`. `LEAD_MODE=whatsapp` (default) returns a prefilled
`wa.me/201121880908` link that the UI opens; `LEAD_MODE=cf7` POSTs to the real CF7 `feedback` endpoint
(`/wp-json/contact-form-7/v1/contact-forms/568/feedback`, unit `wpcf7-f568-o1`, field names
`text-1 / tel-1 / date-1 / text-3 / textarea-1`) — **not enabled without client confirmation,
it emails the live inbox.** Honeypot + validation + per-IP rate limit.
| Booking wizard (`BookingModal`) | STATIC client-side flow. Step 4 posts the same brief to
`POST /api/v1/lead` (services, offer, chosen branch, date, reference + slot + specialist, notes) so the
lead is validated, rate-limited and — if CF7 mode is ever set — emailed, with the branch written into
`textarea-1`. Step 5 keeps its WhatsApp deep link with the full brief plus a local reference and an
`.ics` download; a failed lead POST never blocks that link (nothing is stored server-side).
| Footer newsletter | STATIC UI only — submit validates the email locally and shows a thank-you; it
stores and sends nothing. WordPress exposes no newsletter endpoint and the client has not authorised a
list provider, so there is no transport to wire; the copy promises only that they may be contacted. |

## SEO (per item)
| Field | source |
|-------|--------|
| title / description / og:image | WP `<head>` of the item URL, cheerio-parsed, lazy + cached per URL (`revalidate 86400`, tag `wp:seo`); never fetched for list pages. The snapshot pre-seeds home (AR+EN) and contact; `/about-us/` and `/services/` HTML 404 on the live site so those rows are absent and fall back |
| fallback | own title + excerpt/first-paragraph of the translated body |
| canonical, hreflang ar/en | site-owned URLs (single mapping layer) — never the WP permalink. Both are the **language in the URL**: `ar`/`en`/`x-default` alternates on every page, `x-default` = Arabic. React 19 serialises the attribute as `hrefLang="en"` in the raw HTML; HTML attribute names are ASCII case-insensitive, so crawlers read it (verified in the production build's bytes) |
| `<html lang>` / `dir` | from the `[lang]` segment on the server (Arabic `ar`/`rtl`, English `en`/`ltr`) |
| JSON-LD | composed per language: MedicalClinic + LocalBusiness with all 3 branches, WebSite, BreadcrumbList, Article (`inLanguage` + `dateModified` from WP `modified`), Offer with the price the Store API returns |
| sitemap.xml | every post, page, service, branch and offer in both languages; `lastmod` from WordPress `modified` (omitted where the data has none) |
| robots.txt | allow all, disallow `/api/`, sitemap + host |

## Static content, not editable from the dashboard
Everything else on the site comes from WordPress. These are the only hand-authored entries, each
because the live site has no equivalent record (verified against the REST responses in `data/wp/`):

| What | File | Why it cannot come from WP |
|------|------|---------------------------|
| Branch addresses, hours, phones (3 branches) | `src/data/branches.ts` | no branch CPT/taxonomy in WP |
| Phone 01121880908, WhatsApp 201121880908, email, working hours | `src/data/clinic.ts`, `src/config/site.ts` | contact details are not exposed by WP REST |
| FAQ page answers | `src/data/faq.ts` | page 169 is generic WooCommerce/Amaze demo markup, no clinic Q&A |
| Doctors / specialists list | `src/data/specialists.ts` | no doctor CPT in WP |
| Before/after result cases | `src/data/results.ts` | WP has no structured case records |
| Hero headline, sub, CTAs and imagery | `src/components/home/HomeHero.tsx`, `src/lib/images.ts` | the live hero is a Revolution Slider rendered by JS — its slides are not in REST or the page HTML |
| Photography on services, branches, about, contact, results | `src/lib/images.ts`, `public/images/*` | the WPBakery section images are page-builder assets; replacing them changes the approved visual concept |
| Treatment detail bodies (steps, aftercare, per-service FAQ) | `src/data/treatments.ts` | WP page 696 gives one intro per section, no per-service body |
| Service category chips | `src/data/treatments.ts` (`treatmentCategories`) | WP has no service taxonomy |
| Offer package terms / inclusions | `src/components/pages/OfferDetailClient.tsx` | the Store API returns only name, price, image, description |
| Navigation labels and footer link groups | `src/lib/site.ts`, `src/config/site.ts` | WP `menus` endpoint is 404 |
| Static page copy for About and Privacy | `src/components/pages/AboutClient.tsx`, `src/app/[lang]/{about,privacy}/page.tsx` | pages 32 and 3 are theme demo copy |
| Booking time slots, booking reference format, `.ics` download | `src/components/booking/BookingModal.tsx` | client-side booking aid, no WP source |

## Render model (what the server HTML contains)
Reveals and photo curtains never hide content in the bytes the server sends:

- `<Reveal trigger="mount">` (above-the-fold) is a CSS `animation` (`reveal-mount-*` keyframes) —
  it animates from the first frame, with no JS gate.
- `<Reveal trigger="scroll">` and `<Photo curtain>` render **visible** on the server. A
  `useLayoutEffect` measures the element and only then adds the hidden class (`reveal-armed` /
  `photo-curtain`) when the element is not on screen, and an IntersectionObserver
  (`rootMargin: 0 0 -80px 0`) removes it as it enters. Anything already visible at first paint is
  never taken away, so the LCP element is never waiting on hydration.
- `prefers-reduced-motion` skips both paths, and a `priority` `<Photo>` emits no filter or opacity
  at all (a `blur(0)` transition still puts the image on a composited layer).
- On `/blogs` the LCP element is the first card photo, so `JournalClient` passes `priority` for the
  first two cards (the mobile row): `loading="eager"` + `fetchpriority="high"` and no curtain. The
  cards below the fold keep the curtain, where a visitor is scrolling anyway.
- The booking wizard is the only lazily-loaded client bundle (`next/dynamic`, `ssr: false`, mounted
  on the first `openBooking()`), so its framer-motion/form/`.ics` code is absent from every page's
  initial JS.
- Verified against the production build: `grep 'style="[^"]*opacity:0'` returns 0 on `/ar`,
  `/ar/blogs` and a journal detail.

## JSON API (`/api/v1/*`)
`posts`, `posts/[slug]`, `pages`, `pages/[slug]`, `offers`, `offers/[slug]`, `offer-categories`,
`categories`, `services`, `settings`, `lead` — all bilingual, all normalised through `lib/wp`, all
accepting `?lang=ar|en` (Route Handlers cannot read the `[lang]` segment). Each item's `href` pair
is the **route this site serves**: `/blogs/<slug>` for posts (`lib/wp/mappers.ts`
`mapArticleCard`) and `/services` for a WordPress service section, which is a section of page 696
rather than a page of its own.

## Home cuts (removed vs the previous full home — everything dropped is still on its own page)
Verified against `git diff` of `src/components/home/HomeBody.tsx` (7 numbered sections -> 4 + CTA):
1. Section 01 "Editorial intro, asymmetric split" (long about) -> condensed short about block with the
   differentiators as a 4-card swiper.
2. Section 02 "Featured treatment + index rows" (services showcase) -> dropped; lives on `/services`.
3. Mid-page `<CtaBand>` with props -> the single closing `<CtaBand />` at the end of the page.
4. Section 03 "Results preview" swiper -> `/results`.
5. Section 04 "Doctors" staggered `DoctorCard` strip -> `/doctors`.
6. Section 05 "Featured offer" (one) -> up to 4 live WP offer cards + "All offers" (now position 02).
7. Section 06 "Branches as cards" -> compact 3-up strip with call / WhatsApp actions.
8. Section 07 "Blog" -> up to 3 latest WP posts + "All blogs".
Home is now: hero, short about, offers (<=4), branches strip, journal (<=3), one CTA.
