# Inventory — UI section/field -> data source (contract)

Per-element proof of what is wired and what is authored lives in **`docs/WIRING.md`** (160 rows, one
per visible text block and image, on every route, in both languages, each with the REST endpoint,
page/product id or HTML selector behind the verdict). This file is the summary contract.

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

## Transport (snapshot-only since BK-7.3, DB rung since BK-6)
| Stage | behaviour |
|-------|-----------|
| `npm run sync:wp` (`scripts/sync-wp.mjs`) | pulls both subsites slowly (concurrency 2, 300 ms between requests, 30 s timeout, 1 retry with backoff, max 3 in-flight) into committed `data/wp/*.json`: `posts-list.{en,ar}`, `posts.{en,ar}` (full content), `pages-list.*`, `pages.*`, `categories.*`, `products.*`, `offer-categories.en`, `media.json` (one batched `/media?include=<ids>` per 100 ids), `seo.json`, `meta.json` (generatedAt, request count, byte size, row counts). It then downloads **only the images the site actually renders** (<=140, decided from the same `bestImageSrc` preference the UI uses), encodes them with sharp to `public/wp/<slug>-<hash>.webp` at 1280 px / q72, and records the URL -> file map in `data/wp/images.json`. Hand-run only: never imported by a route or module, so it is the single place in the repo that reaches WordPress. Last verified run (2026-10-12): 22 WP requests in 82.4 s, 60/60 images encoded into 1.4 MB, `git diff data/wp/` = the `meta.json` timestamp only. |
| `next build` | reads **only** the DB (if a kind is published there) and `data/wp/*.json`. Zero WordPress requests — `src/lib/wp/http.ts` is deleted, so there is no live client left to refuse. `generateStaticParams` returns every post per language (92 + 92) from the snapshot **until the console publishes that kind**, then the published slugs; `dynamicParams` stays true so anything published after the build still renders. `next.config.ts` caps generation to 2 CPUs with `staticPageGenerationTimeout: 120` and sets `expireTime: 3600` (stale-while-revalidate). |
| Runtime | same as the build: no network. Each content kind is served entirely from MariaDB once it holds one published row (`hasPublished(kind)` in `src/lib/content/site.ts`), otherwise from the committed snapshot — the DB is a rung, not a fallback that can time out. Every read logs its source: `[wp] snapshot en posts-list (92 rows)`. A DB error is treated as an empty DB so `next build` still works without `DATABASE_URL`. `/api/revalidate` (**POST**, secret-guarded) flushes the `wp:en` / `wp:ar` / `wp:seo` tags and the listed paths; it answers 401 on a wrong secret and 500 when `REVALIDATE_SECRET` is unset. |

### Images
`data/wp/images.json` maps a WordPress upload URL to its local `/wp/<file>.webp` mirror, and
`src/lib/wp/mirror.ts` applies it at the **data layer** — `bestImageSrc()`, `sanitizeHtmlBody()` and
`mapArticleCard()`/`extractServiceSections()` all return the local path, so `/api/v1/*` and the UI can
never emit a URL the mirror does not have. `mirrorSrc()` falls back to the live WordPress URL when a
file is not mirrored (an image uploaded after the last sync), so an unmirrored image still renders.
Verified on the production build: 0 `src` values pointing at `www.shamahclinics.com/wp-content` on
home, journal list, journal detail and offer detail; every image goes through `next/image`.

Lists never request bodies: the snapshot holds only `id,slug,date,modified,link,title,excerpt,categories,featured_media`
per list row, full `content.rendered` per detail row, images in `media.json` and term names in
`categories.{en,ar}`. That shape was chosen by the sync's `_fields` query strings, which the deleted live
client used to send per read; `scripts/sync-wp.mjs` still sends them.

## Global / shell
| UI | source |
|----|--------|
| Brand name, tagline, currency, theme colour | CONFIG (`src/config/site.ts`) |
| Phone 01121880908, WhatsApp 201121880908, email, hours | CONFIG (contact info is not exposed by WP REST; from the client brief) |
| Primary nav (9 lines + 4 dropdown children) and the footer link group | **STATIC `src/data/nav.ts`** (`navItems`, `bookCta`) — authored by the client's decision on 2026-10-12: "NAV IS STATIC AGAIN… no WordPress dependency". Removing a page from the menu deletes one line in that file. A WordPress menu does exist (homepage item ids `870`→622, `717`→696, `755`→9, `643`→62, `646`→67, `647`→32, `838`→837); it is deliberately not followed, and `src/lib/wp/nav.ts` was deleted. Proof: `node scripts/verify-render.mjs` compares the rendered header/footer against the file, AR + EN |
| Booking CTA label (header, footer, hero, cards) | STATIC (`src/data/nav.ts` `bookCta`) |
| Logo image + alt | STATIC local wordmark (`public/images/logo.png`) — `media.json` does hold id 722 `Shamah_Header.png`, but swapping it would change the header, which the decision forbids |
| Social links | CONFIG |
| Footer branch strip | WP (page 622 office blocks, see Branches) |
| Service names in the dropdown | STATIC (`navItems[2].children`) — the WordPress-merged names are used on `/services`, `/results`, the pickers and the JSON-LD, not in the menu |

## Home (SHORTER — full cut list at the bottom)
Every card list on Home renders at most 3 cards (`HOME_CARDS` in `src/components/home/HomeBody.tsx:60`)
plus a "View all" link **only when records are left out** — the three branches are the whole network, so
that band carries no dead link; both the cap and the link's presence/absence are asserted against the
rendered HTML in AR and EN by `scripts/verify-render.mjs`. Final sections: 01 WordPress introduction row +
02 services **3 of 12** (→ `/services`), 03 offers **3** (WP, 4th row fetched only as the "more exist"
probe, → `/offers`), 04 branches **3** (WP office blocks, → `/branches`), 05 journal **3** (WP posts,
→ `/blogs`), then one CTA band. Why services took the differentiators' place, and the measured height
before/after, is `docs/HOME-PRIORITY.md`.

| Section | source |
|---------|--------|
| Hero photos (backdrop slider) | WP — the `rs-slide` images of page 622's Revolution Slider, parsed from the **raw** rendered body (`src/lib/wp/hero.ts`), mirrored to `/wp/*.webp`; `images.hero` only when the page has no slider |
| Hero headline, sub, CTAs | STATIC — the slider's own captions ("Book Now", "Shop Now") are per-slide button labels and are dropped by design; the headline sentence "The Best Aesthetic Center" is genuine client copy but lives only inside the slider markup, see `docs/STATIC-SWEEP.md` |
| 01 introduction (heading + lead) | WP — page 622 row 1 (`The Best Aesthetic Center` + "Discover the highest standards…"), parsed by `src/lib/wp/home-prose.ts` through `getHomeIntro()`; the authored `homeIntroFallback` only when the dashboard changes the row beyond recognition |
| 02 services (max 3) + "All services" | WP:pages/696 order, first three whose card renders with a photo and an intro (`getFeaturedServices` in `src/lib/wp/treatments.ts`); `featuredServiceSlugs` in `src/config/home.ts` overrides, empty means computed. Selection rule and the current three slugs in `docs/HOME-PRIORITY.md` |
| 03 Offers (max 3) + "All offers" | WP:offers (WooCommerce Store API, the products that language's base returns, in WP order — nothing merged or filtered) |
| 04 Branches strip (max 3) with call / WhatsApp | WP — page 622 `.ws-contact-office-item` blocks (name EN, address, phone, photo) over `src/data/branches.ts` for the Arabic side |
| 05 Latest journal (max 3) + "All blogs" | WP:posts (4 fetched, 3 shown, both subsites) |
| One strong CTA band | STATIC |

## Services (`/services` + `/services/[slug]`, aliases of `/treatments*`)
| Field | source |
|-------|--------|
| Page H1 | WP — `getPageTitle("our-services")` = page 696 title (`خدماتنا` / `Our Services`), authored fallback. Same pattern on `/offers` (9 `العروض`/Offers), `/blogs` (62 `معلومات طبية`/Journal), `/faq` (169 `أهم الأسئلة الشائعة`/FAQ) and `/privacy` (3, EN only — its AR title is untranslated) |
| Category chips | STATIC (`treatmentCategories`) — WP has no service taxonomy (`categories.*` is a post taxonomy: `Laser`, `laser session`) |
| Card titles + taglines | WP:pages/696 — **all 7** image-bearing WPBakery sections render, in the order the page lists them (the 5 that name an authored treatment override its title/tagline/photo; the 2 that do not — `glow-brightening-injections`, `mens-aesthetic-services` — are appended as their own cards and detail routes). Arabic comes from the AR subsite wherever `arabicRatio` says it is really Arabic, otherwise from the authored row. Nothing published on 696 is left out |
| The 2 WP-only services | WP gives a title, one intro paragraph and a section photo, and that is all the site shows: no category badge (WP has no service taxonomy), no "يبدأ من / From" price (WP publishes none — the card's price slot stays empty rather than showing 0), no Benefits / How the session works / Aftercare block, no session length or course, and no `Offer` in the JSON-LD. They are excluded from the `/results` comparison table, whose every column is a figure WP does not hold |
| Heading normalisation | The AR dashboard holds a stray list number on one heading (`3. إزالة الشعر بالليزر`); `extractServiceSections` trims a leading `N.` so the card reads `إزالة الشعر بالليزر`. Asserted out loud in `scripts/verify-render.mjs` rather than done silently |
| Card photos | WP — the section's own image replaces the stock photo where the dashboard publishes one (all 7 sections now render their image: Skincare, Laser-Hair-Removal, Botox-Injections, Filler-Injections-1, Glow-Brightening-Injections, Chemical-Peeling, Mens-Aesthetic-Services, plus each section's AR twin); the authored `lib/images.ts` slot stays on the 5 authored rows WP has no section for |
| Detail body | WP when the dashboard gives the service its own page — page 885 `botox-injections` (EN 2 084 chars, 7 headings, `Botox-Injections4.png`) renders on `/en/services/botox`; the AR REST body of 885 is identical English, so Arabic shows the authored description. A WP-only service is looked up under its own section slug, so a page the team publishes for it later is used with no code change; today no other page exists in `/wp/v2/pages` |
| Detail steps / aftercare / benefits / prices | STATIC — long-form authored per service; page 696 gives one intro per section and no prices |
| JSON API | `GET /api/v1/services` (raw parsed cards, `?search=` supported) |

## Offers (`/offers`, `/offers/[slug]`)
| Field | source |
|-------|--------|
| Page H1 | WP — page 9 title (`العروض` / `Offers`) with authored fallback |
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
| Page H1 | WP — page 62 title (`معلومات طبية` / `Journal`), authored fallback; the lead stays authored because 62's whole body is "Set your Journal page to display blog posts." |
|-------|--------|
| Article cards (title, date, image, category, excerpt) | WP:posts list projection + `media.json` + `categories.{en,ar}` — each language shows its own subsite's `excerpt.rendered`. 91/92 AR excerpts are English auto-excerpts because WordPress generates them that way; the site displays that and does not rewrite it |
| Card without a featured image | 15/92 posts have `featured_media: 0`. `<Photo>` renders the empty aspect-ratio frame (no `<img>`, no layout shift) instead of substituting a stock photo |
| Article body | WP:posts `content.rendered`, sanitized (`sanitize-html`), only fetched on detail |
| Category filter, search | `GET /api/v1/posts?category=&search=&page=` — the filter runs over the rows the data layer already has (live or snapshot), not a second WordPress query. Category matches the merged card's `categorySlug`; search is a case-insensitive substring of title + excerpt in **both** languages, so an Arabic term finds a post whose English subsite holds the slug (e.g. `search=ليزر` -> 35 of 92, `search=Botox` -> 11, `search=PRP` -> 0 because no published title or excerpt contains it). The visible filter is a URL state (`/blogs?category=…`), so it is shareable, prerendered and crawler-visible. |
| Pagination | in-memory over the filtered list (92 posts, 9/page -> 11 pages, last page 2 items); `/blogs?page=N` is a real URL with an absolute per-language canonical and `<link rel=prev/next>` in `<head>`; an out-of-range `?page=` (99) renders **and canonicalizes** the last real page, so it cannot duplicate page 11 under a second canonical; "Load more" appends `/api/v1/posts?page=N+1` without a reload, so no page repeats or skips |

## Doctors (`/doctors`), Results (`/results`), FAQ (`/faq`), Privacy (`/privacy`)
| Route | what is WP | what stays STATIC, and the proof |
|-------|-----------|----------------------------------|
| `/doctors` | the branch pills on each card (page 622 offices) | the whole team: no doctors/team page exists among the 27 EN + 27 AR rows of `pages-list.*`; نورهان/Nourhan/سلمى/Salma/ريم/Reem have **0 hits** across all 18 `data/wp/*.json`; `media.json` (23 items) has no portrait; "doctors" appears only as prose on pages 32 and 622 |
| `/results` | the service names in the table (page 696, merged) | the before/after cases: `MEDIA` has no result pair; 7 of the 92 posts have before/after **titles** ("Fractional Laser for the Face Before and After", …) but they are journal articles, not case records with image pairs — they stay on `/blogs` |
| `/faq` | the H1 (page 169 title) | the Q&A itself: page 169 is theme demo ("What is Artday? Artday is an online destination that tells stories behind interesting design objects and creators…") |
| `/privacy` | the H1 in English (page 3 title; its AR title is untranslated, so Arabic falls back) | the policy body: page 3 is the WordPress default ("Who we are Suggested text: Our website address is: https://shamahclinics.com") |

## Branches (`/branches`, `/branches/[slug]`)
WP — the office blocks of page 622 (`.ws-contact-office-item`: `strong` name, address lines, `P:` phone,
`img`), parsed by `src/lib/wp/branches.ts` and merged over `src/data/branches.ts`. English name,
address, phone and photo follow the dashboard; the Arabic subsite serves those blocks in English (169
Arabic characters in a 40 KB body), so the Arabic name/address stays authored. An office the dashboard
adds with no authored row is **appended**, so `/branches` can grow past three without a code change.
STATIC and with no WP source: `branchesData.features` ("what this branch offers"), opening hours, and
the `/branches` band headline. `clinicData.branches` and `getBranch()` were deleted by this audit.

## About (`/about`)
WP — page 32 parsed by `src/lib/wp/about.ts`: the intro becomes the hero lead, "The Story"/قصتنا and
"The Process"/عمليتنا plus their 5 `<br>` lines and the process photo become the two editorial splits.
Those two splits come from page **622** (the homepage rows `#process` and the story band) through
`getHomeProseSections()` — the dashboard writes them on the homepage, and the About page shows them so
the copy is not stranded on Home; the client's own Arabic homepage serves those rows in English, which is
why the English line stands in for Arabic there (`docs/STATIC-SWEEP.md`). `src/data/about.ts` is now only
the outage fallback. STATIC with no WP source: the four "why clients choose Shamah" reasons — Home no
longer spends a section on them (`docs/HOME-PRIORITY.md`), so `/about` holds the full list, reached from
Home's introduction row — the three "what we stand by" values, the two teasers, the 100٪ female-staff
figure. Branch and treatment counters count the WordPress lists.

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
because the live site has no equivalent record. Two searches stand behind the table: the REST responses
in `data/wp/`, and the 2026-10-13 sweep of every public URL the sitemaps and internal links disclose
(200 documents, both languages, 516 searched strings) in `docs/STATIC-SWEEP.md`, except the two rows
marked *by decision*:

| What | File | Why it cannot come from WP |
|------|------|---------------------------|
| Branch ids, Arabic names/addresses, features, hours | `src/data/branches.ts` | no branch CPT/taxonomy; the AR subsite serves the office blocks in English, and no WP record lists a branch's features |
| Phone 01121880908, WhatsApp 201121880908, email, working hours | `src/data/clinic.ts`, `src/config/site.ts` | `/wp/v2/settings` exposes none of them. The **phone is** in the live HTML (`div.mobile-floating-menu` → `tel:+201121880908`) and matches the authored value, so nothing changes; the only emails WordPress holds are `info@artday.com` / `press@artday.com` / `shipping@artday.com` on page 67, and 0 `mailto:` links exist across 184 posts |
| FAQ page answers | `src/data/faq.ts` | page 169 is ArtDay demo markup ("What is Artday? …"), no clinic Q&A |
| Doctors / specialists list | `src/data/specialists.ts` | no doctor page or CPT, and no team URL among the crawled documents; 0 name matches in any snapshot or sweep; no portrait in `data/wp/images.json` (60 entries) |
| Before/after result cases | `src/data/results.ts` | no case records and no before/after media; the before/after **titled** posts (#974, #964, #1003) each carry 0 `<img>`, so there is nothing to pair |
| Hero headline, sub, CTAs | `src/components/home/HomeHero.tsx` | page 622's slider captions are per-slide button labels ("Book Now", "Shop Now"), and the one genuine client sentence inside the slider ("The Best Aesthetic Center") is Home's introduction heading instead — the hero already says something else, and putting slider markup in the headline would be a redesign. Its **photos** are WP |
| The "why clients choose Shamah" reasons (now on `/about`) | `src/data/about.ts`, `src/components/pages/AboutClient.tsx` | 0 hits for the four claims in either language, in the REST bodies or in the sweep — authored from the client brief |
| Interior/stock photography where WP publishes no image: `/services` + `/offers` + `/blogs` + `/about` + `/contact` band photos, `/privacy`/CTA band photo | `src/lib/images.ts`, `public/images/*` | pages 9 and 62 have 0 images and no `featured_media`; 696's 7 images all belong to individual sections (already used per card); `images.json` holds only slider frames, section images, `booking1.png` and the logo. Home no longer spends a photo slot on its own introduction row |
| Treatment detail steps, aftercare, benefits, prices, durations | `src/data/treatments.ts` | page 696 gives one intro per section and no prices; the WP botox body (885) is wired separately. The only prices WordPress publishes are two Woo products (899.00 / 500.00 EGP), which are offers rather than a service price list — the service post bodies say the figure comes from a consultation, so `priceStartingAt` stays authored and is flagged for the client |
| Service category chips | `src/data/treatments.ts` (`treatmentCategories`) | WP has no service taxonomy |
| Offer package terms + the 3 card labels | `src/components/pages/OffersClient.tsx`, `OfferDetailClient.tsx`, `cards/OfferCard.tsx` | the Store API returns name, price, image, description only — 0 products carry an inclusion `<li>` |
| Nav labels + footer link group + booking CTA | `src/data/nav.ts` | *by decision* (2026-10-12): the client wants the menu in one authored file with no WordPress dependency, although a WP menu exists (ids in "Global / shell") |
| Header logo | `public/images/logo.png` | *by decision*: "Do not change the look of the header or footer" — `media` 722 `Shamah_Header.png` is the alternative |
| About "what we stand by" values + the two teasers | `src/components/pages/AboutClient.tsx` | page 32 has no values block; page 32's story/process copy and the two homepage prose rows are now WP |
| Privacy policy body + last-updated line | `src/components/pages/PrivacyClient.tsx` | page 3 is the WordPress default text ("Who we are Suggested text: …") |
| `/contact` and `/branches` band headlines, form field labels, booking wizard steps/periods, `.ics` | `ContactClient.tsx`, `BranchesClient.tsx`, `BookingModal.tsx` | contact/booking copy is UI; page 67 is demo text and page 837 is only a CF7 form, which the site must not submit |
| Newsletter field + confirmations | `src/components/layout/Footer.tsx` | WordPress exposes no subscriber endpoint and no provider is authorised |

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

## Missing or inconsistent WordPress data
Nothing on the site assumes a complete record: a section, block, badge, price or byline renders only when
its own field has content, and a missing image falls back to the gold-tone logo frame instead of an empty
box. `src/app/[lang]/preview-missing-fields/page.tsx` is a **dev-only** fixture route (`force-dynamic`,
`noindex`, `notFound()` in a production build) that renders the real card and Home components against
synthetic records — no photo, no tagline, no price, no excerpt, no author, 600-character titles, an
English title served to the Arabic locale, and Home with every list empty. `node
scripts/test-missing-fields.mjs` reads that HTML and fails on an empty heading, a text-less section, an
`img[src=""]`, an unmirrored WP image, `undefined`/`NaN` in the copy, or a "View all" link with nothing
behind it (86 checks). The design-neutral fixes themselves are in `SectionHeading`, `Photo`,
`TreatmentCard`, `OfferCard`, `ArticleCard`, `ResultCaseCard`, `HomeBody` and `Swiper`.

## Home cuts (removed vs the previous full home — everything dropped is still on its own page)
Verified against `git diff` of `src/components/home/HomeBody.tsx` (7 numbered sections -> 4 + CTA):
1. Section 01 "Editorial intro, asymmetric split" (long about) -> condensed short about block with the
   differentiators as a 4-card swiper.
2. Section 02 "Featured treatment + index rows" (services showcase) -> dropped; lives on `/services`.
3. Mid-page `<CtaBand>` with props -> the single closing `<CtaBand />` at the end of the page.
4. Section 03 "Results preview" swiper -> `/results`.
5. Section 04 "Doctors" staggered `DoctorCard` strip -> `/doctors`.
6. Section 05 "Featured offer" (one) -> up to 3 live WP offer cards + "All offers" (now position 02).
7. Section 06 "Branches as cards" -> compact strip with call / WhatsApp actions (max 3, WP offices).
8. Section 07 "Blog" -> up to 3 latest WP posts + "All blogs".
9. 2026-10-13: the short about block's four "why choose us" reasons -> `/about` (`docs/HOME-PRIORITY.md`);
   the same band now shows 3 WordPress service cards + "All services", and the WordPress introduction row
   is its heading column.
Home is now: hero, WordPress introduction + services (<=3 cards), offers (<=3), branches strip (<=3),
journal (<=3), one CTA.
