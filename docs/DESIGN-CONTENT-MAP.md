# Design → Content Map (Phase 0)

Derived from the code, not from guesses. Every rendered field on every route is
listed with the Payload home it moves to, whether it is required, whether it is
localized (per-field AR/EN), and how the UI behaves when it is empty. This is the
contract Phase 1's collections/globals are built from and Phase 2's seed is written
against.

> **A record of Phase 0** — Payload was later dropped for the console in `D:\shamah_cms`, and BK-14.2
> (2026-10-28) already moved the shell this map marks `STATIC`/`FILE`: the menu and the branch strip are
> console rows, the booking label is a Texts address, the clinic name is a Settings row, and
> `bookCta` no longer exists in `src/data/nav.ts`. For what the site reads today, see `docs/inventory.md`.

Legend for **Source**:
- `WP` — WordPress owns this today (`lib/wp/*` reads it at runtime/snapshot). One-time
  import into Payload, then published.
- `AUTH` — authored in `src/data/*` / inline literals, no WordPress field. Trust rule
  decides published vs DRAFT.
- `STATIC` — marketing/UI strings living inline in components. Move to a global so the
  dashboard can edit them; default to the current literal.
- `FILE` — stays a code file, not CMS (nav, theme, fonts).

Legend for **Empty** behaviour is what the *current* component already does (the UI
survives missing data), which the CMS must preserve.

Payload model target (Phase 1): globals `siteSettings`, `homeContent`, `homeLayout`,
`seoDefaults`; collections `posts`, `categories`, `offers`, `offer-categories`,
`services`, `specialists`, `results` (before/after cases), `faqs`, `branches`,
`pages`, `media`. Bilingual fields use Payload per-field localization (AR default,
RTL; EN). Drafts/versions on every content collection.

---

## Site-wide (all routes)

| Field | Where | Source | Req | Localized | Empty | CMS home |
|---|---|---|---|---|---|---|
| Absolute site URL (`SITE_URL`) | canonical, og:url, og:image, sitemap, robots `host`/`sitemap`, JSON-LD ids, pagination `<link>`s | `config/site.ts:4` ← `NEXT_PUBLIC_SITE_URL` | ✓ | no | build must fail if unset | env var only (task 55 build guard) |
| Brand name | navbar, footer, JSON-LD, page title suffix | `config/site.ts` `brand.name` | ✓ | yes | n/a | global `siteSettings.brandName` |
| Logo / theme colour | navbar/footer image, admin theming | `config/site.ts` `brand.logo/themeColor`, `images.ts` | ✓ | no | n/a | `media` (logo) + `siteSettings.themeColor` (STATIC) |
| Phone | JSON-LD `telephone`, hero/branch buttons, contact | `config/site.ts` `contact.phone` | ✓ | no | — | `siteSettings.phone` (AUTH, confirmed → published) |
| WhatsApp number | every `whatsappHref`, `clinicData.whatsappUrl` | `config/site.ts` `contact.whatsapp`, `lib/wp/config.ts` `WHATSAPP` | ✓ | no | — | `siteSettings.whatsapp` (AUTH confirmed) |
| Currency label | offer/price UI | `clinicData.currency` {ج.م/EGP} | ✓ | yes | — | `siteSettings.currencyAr`/`currencyEn` |
| Social links (Facebook, Instagram) | footer | `config/site.ts.socialLinks` | opt | no | footer row hidden if empty | `siteSettings.socialLinks[]` (STATIC) |
| Header nav + footer link group | navbar, footer | `src/data/nav.ts` `navItems`, `bookCta` | ✓ | yes | n/a | **FILE** — stays `nav.ts` per brief (keep nav.ts) |
| Dark/light theme variables | global CSS | `config/site.ts` `siteTheme` | ✓ | no | n/a | **FILE** — reused for admin theming in Phase 4, not CMS |
| Pre-footer CTA band (`CtaBand`) + `FloatingActions` | `layout/SiteShell.tsx:58,63` | STATIC titles/labels | opt | yes | renders on every route; keep component, move copy | `siteSettings` band copy (STATIC) |

---

## HOME — `/` (`[lang]/page.tsx`)

Server fan-out: `getHome{offers:4,articles:4}`, `getMergedTreatments`,
`getHeroPhotos`, `getHomeIntro`, `getFeaturedServices(3)`, `getPageTitle("our-services")`.
Every band is guarded by list length / `hasIntro` — an empty Home renders no band.
`HOME_CARDS = 3` (`HomeBody.tsx:65`) caps every card band; "view all" link appears
only when the source total exceeds 3.

### Hero — `components/home/HomeHero.tsx:60-189`

| Field | Src | Req | Loc | Empty | CMS home |
|---|---|---|---|---|---|
| Backdrop photo carousel (7 s fade) | WP | ✓ | no (media shared, alt localized) | falls back to `images.hero` | `media[]` + `homeContent.heroSlides[]` (featured/order) |
| Eyebrow "عيادات شامه · القاهرة والجيزة" | STATIC | ✓ | yes | n/a | `homeContent.heroEyebrow` |
| H1 (3 fragments incl. gold span) | STATIC | ✓ | yes | n/a | `homeContent.heroTitle` (pre/`highlight`/post) |
| Lead paragraph | STATIC | ✓ | yes | n/a | `homeContent.heroLead` |
| Book + WhatsApp buttons (labels) | STATIC + `clinicData` | ✓ | yes | n/a | label in `homeContent`; number from `siteSettings` |
| Counter — Branches | WP office-block count | ✓ | no | 0 → hide | derived: `count(branches)` published |
| Counter — Treatments | merged services length | ✓ | no | 0 → hide | derived: `count(services)` published |
| Counter — "Female staff 100٪" | STATIC | ✓ | yes | n/a | `homeContent.heroStatFemaleStaff` (AUTH/unverified → keep as-is claim, label editable) |

Hero slider captions + "Book Now"/"Shop Now" buttons parsed from page 622 and
discarded today — do not reintroduce as rendered fields.

### Band 01+02 — Intro + Services — `HomeBody.tsx:85-142`

| Field | Src | Req | Loc | Empty | CMS home |
|---|---|---|---|---|---|
| Intro heading `#about` of page 622 | WP | ✓ | yes | fallback `homeIntroFallback`, else band collapses | `homeContent.introTitle/introLead` (WP import) |
| "Why clients choose Shamah" link → `/about` | STATIC label | opt | yes | hidden with intro heading | `homeContent.introCtaLabel` |
| Services section heading (= page 696 title) | WP | ✓ | yes | band hidden if no services | `homeContent.servicesTitle` (or read from `services` global) |
| Services lead "كل خدمة تبدأ…" | STATIC | ✓ | yes | n/a | `homeContent.servicesLead` |
| "All services" view-all → `/services` | STATIC, shown when total>3 | opt | yes | hidden when ≤3 | `homeContent` view-all label map |
| 3 service cards (Swiper 1/2/3) | WP+AUTH merge | ✓ | yes | band hidden when none | `services` featured+order (≤3 pinned on Home) |

TreatmentCard fields (also used on `/services` list): image, category badge (hidden
when WP none), name, 2-line tagline, "From N EGP" (empty span when `priceStartingAt`
null), Details link. → `services` collection fields.

### Side panel beside Home services — `HomeBody.tsx`

The title, lead and numbered reasons come from the published `/about` page document.
Edit them in **Console → Pages → About**, under **Why clients choose us**, then publish.
The same values render on `/about`; Home shows the panel in the original introduction
column beside the services cards, with the `/about` button below the reasons. It does not
add a separate band below services.

### Seasonal offers — `HomeBody.tsx`

Heading "باقات الموسم" + lead STATIC; view-all when offers>3 (API fetches 4 as
"more exist" probe); `offers.slice(0,3)` → OfferCard. → `homeContent.offersTitle/
offersLead` + `offers` collection (published, featured+order for Home).

### Band 04 — Branches strip — `HomeBody.tsx:172-260`

Heading "فروعنا الثلاثة" + lead STATIC; **"Branch details" view-all renders only when
branches>3** — with exactly 3 it is absent (asserted by `verify-render.mjs`). Inline
card: photo+gradient, "فرع N" chip, name over photo → `/branches/{id}`, area, address
(MapPin), `tel:` button, WhatsApp button (localized message). → `homeContent.
branchesTitle/branchesLead` + `branches` collection.

### Band 05 — Journal — `HomeBody.tsx:262-286`

Heading "من مدونة شامه" + lead STATIC; view-all when articles>3; 3 `ArticleCard`.
ArticleCard hides author byline for WP posts (`authorId:""`). → `homeContent.
journalTitle/journalLead` + `posts` collection (published, recent-by-date).

### Removed Home sections (git-confirmed) — DO NOT restore as authored content

`39c7c30` removed, from the pre-`pre-payload` `HomeBody.tsx`: long editorial intro +
**four differentiators** block, featured-treatment showcase w/ index rows, mid-page
`CtaBand`, results-preview `Swiper`, doctors strip, single featured offer, FAQ
accordion. Of the two survivors `2fff8b1` left orphaned, one is resolved:
`components/home/BeforeAfterSection.tsx` (dead since then, no importer) was deleted and
rebuilt as `components/home/ResultCompareSection.tsx`, driven by published results rows.
`data/images.ts`, which lost its last importer with that deletion, was removed in the A5
dead-code sweep; its `/images/*.svg` placeholders never resolved to real files.

**Four "why Shamah" differentiators — explicitly EXCLUDED per brief.** They moved to
`/about` (`AboutClient.tsx:25-54`, STATIC); `PAYLOAD-PLAN.md` marks them "removed as
unreal — DO NOT bring them back" (0 hits across 200 live WP docs, `STATIC-SWEEP.md`).
They must NOT become Home CMS fields.

For Phase 3 the recoverable, design-driven bands that may be re-added as **empty-
hidden, CMS-driven** sections (only if the dashboard supplies verified content):
results preview (from `results`/result-stories), doctors strip (from `specialists`,
DRAFT until verified), before/after (`results` cases, DRAFT). `homeLayout` (ordered
section list + per-band card cap + pin toggles) drives which bands show and in what
order; a band with no published items renders nothing.

---

## `/services` + `/services/[slug]` (= re-export of `/treatments`)

List (`treatments/page.tsx`): H1 WP page 696 title; STATIC lead + hero photo +
breadcrumb + price disclaimer; 6 STATIC category chips (`treatmentCategories`);
12 merged `TreatmentCard` (7 WP sections over authored rows; 2 WP-only cards render
no badge/no price).

Detail (`treatments/[slug]`, `TreatmentDetailClient`): WP name/lead/photo; fact cards
duration/sessions/price **STATIC, block hidden for WP-only services**; long-form body
from WP page 885 (`getMergedTreatment`, AR falls back to authored); benefits/steps/
aftercare lists STATIC, hidden when empty; related = same category or featured.

→ `services` collection fields: `slug(id)`, `name`, `tagline`, `description`,
`benefits[]`, `steps[]`, `aftercare[]`, `idealFor`, `duration`,
`sessionsRecommended`, `priceStartingAt` (nullable), `image`, `category`/`categoryName`
(nullable), `body` (lexical), `featured`, `order`, `status`. Category chips list →
`siteSettings` or a `service-categories` concept (currently STATIC enum; keep optional).

---

## `/doctors` (`DoctorsClient`) — ALL STATIC today, zero WP source

H1/lead STATIC; 3 DoctorCard (name, title, focus/specialties, photo, branch pills WP);
4 "first visit" steps STATIC. → `specialists` collection: `name`,`title`,`credentials`,
`bio`,`specialties[]`,`experienceYears`,`branches[]`,`image`,`status`. **All DRAFT**
(unverified — no WP team page/portraits). Branch pills resolve against `branches`.

---

## `/results` (`ResultsClient`) — WP-derived since `c720470`

The 56 of 92 posts whose body names a result (`result-stories.ts` phrase index, 9/page);
card = cover/title/excerpt/date from posts. Before/after gallery (`resultsData` /
`ResultCaseCard`) and timing table **deleted from page** (`c720470`,`81d7c6c`) — files
unreferenced. STATIC H1/lead + "no before/after imagery" disclosure remain.

→ Two homes:
1. Result *stories* = `posts` flagged `resultStory: boolean` (+ kept `phrases`) —
   published (they ARE real WP posts). Replaces the phrase-index sync.
2. Before/after *cases* = `results` collection (`treatment`,`area`,`sessions`,`note`,
   `before`,`after`) — **DRAFT** (illustrative stock, unverified; matches the
   "no before/after imagery" disclosure). Not shown publicly until consent photos exist.

---

## `/blogs` + `/blogs/[slug]`

List (`JournalClient`): breadcrumb; WP H1 (page 62 `getPageTitle("journal")`) + STATIC
lead + hero photo; "All" + WP category chips (terms); search; count line; 9 ArticleCard
per page; load-more via `GET /api/v1/posts`; prev/next `<link>`s; disclaimer.
Detail (`JournalArticleClient`): all content WP — title/excerpt/featured image, date,
computed read time, parsed body sections+bullets, TOC, category-as-tag pills, share,
related posts. Author byline/box never render.

→ `posts` collection: `slug`,`title`,`excerpt`,`content`(lexical: headings/paras/
bullets),`image`,`categories[]`,`date`,`modifiedIso`,`resultStory`,`status`.
`categories` collection: `slug`,`name`,`count(derived)`. `/api/v1/posts` contract
preserved in Phase 3.

---

## `/offers` + `/offers/[slug]`

List (`OffersClient`): WP H1 (page 9 `getPageTitle("shop")`); STATIC lead/hero photo/
breadcrumb; all `PRODUCTS` as OfferCard (4 today, no cap); STATIC "Package terms" +
WhatsApp. 3 of 4 products carry ArtDay demo copy (rendered verbatim — seed as-is).
Detail (`OfferDetailClient`): WP H1/lead/hero; "What the package includes" **hidden**
(0 `<li>` in descriptions); WP body HTML; STATIC package terms; sticky OfferCard aside.

→ `offers` collection: `slug`,`name`,`excerpt`,`description`(lexical/html),`images[]`,
`regularPrice`,`salePrice`,`price`,`currency`,`discountPercent`,`onSale`,`badge`,
`popular`,`href`,`status`. `offer-categories` collection (currently EN-only names).
Note price comes from Store API minor-units conversion; keep numeric + currency field.

---

## `/branches` + `/branches/[slug]`

List (`BranchesClient`): STATIC H1/lead/hero + WP branch cards (`getBranchList`,
page-622 office blocks) + STATIC hours line. Detail (`BranchDetailClient`): all WP
(name/address/landmark/phone/photo) + STATIC features list (`branchesData.features`) +
hours; aside = other branches + booking CTAs.

→ `branches` collection: `id/slug`,`name`,`area`,`address`,`phone`,`image`,`intro`,
`features[]`,`landmark`,`status`. Published (phone/address match live site = confirmed).
The STATIC "hours line" reintroduces unverified hours — treat as empty/removed unless
dashboard confirms (see UNVERIFIED-FACTS).

---

## `/faq` (`FaqClient`) — STATIC, outside nav

H1 WP (page 169) but lead + all 4 category groups/12 Q&A STATIC (`data/faq.ts`;
WP body is ArtDay demo). Not in header/footer nav — reachable by URL/sitemap only.
→ `faqs` collection: `question`,`answer`,`category`,`order`,`status`. **DRAFT**
(authored/unverified). `faqJsonLd` currently emits these; keep FAQPage JSON-LD only
from published items so an all-DRAFT seed emits no FAQ schema.

---

## `/about` (`AboutClient`)

Was: H1/lead + Story/Process sections WP (page 32), WP branch/treatment counters, and
STATIC hero photo, "Female staff 100", "What we stand by" values, teasers and the four
"why Shamah" reasons. → `pages` collection, and AB-2 did it: the row whose route is
`/about` carries `title`, `lead`, three photo slots with both descriptions, the story and
process headings with 2 and 5 paragraphs, `staffValue`, the reasons (4) and the values (3)
each behind their own heading and lead, and a `numbers` block the console can grow. The
document is `ABOUT` in `src/lib/content/list-schema.ts`, published through the row's
`pub_data`, read by `getAboutPage()`; `/console/pages/about` is the screen. The branch and
treatment figures are counted from the published lists rather than stored, and the two
teasers plus the three labels under the counted band stay site wording on `/console/texts`.
The values and reasons are no longer AUTH/STATIC — they are the row's, in both languages.

---

## `/contact` (`ContactClient`)

STATIC H1/lead/channel cards (WhatsApp + phone from `clinicData`, verified vs live
HTML); WP branch call list + WP-merged service picker; STATIC booking form →
`POST /api/v1/lead`. Email + hours cards deleted (`81d7c6c`) — site claims neither.
→ content from `branches` + `services`; form is a lead endpoint, not CMS. Channel
numbers from `siteSettings`.

---

## `/privacy` (`PrivacyClient`)

H1 = WP EN title (page 3; AR falls back to authored, untranslated). Body 5 blocks +
"last updated" STATIC (WP page 3 is WordPress default text). Not in nav.
→ `pages` collection (slug `privacy`): `title`,`sections[]`,`lastUpdated`. **DRAFT**
(WP content is placeholder default — needs real clinic policy).

---

## 404 (`NotFoundDocument`)

Giant "404" watermark, localized H1/lead, Home link, 6 localized quick links
(`/treatments`,`/offers`,`/branches`,`/blogs`,`/contact`); language from requested URL.
Renders outside `[lang]` layout.
→ STATIC UI labels; quick links derived from routes. No CMS fields needed (optional
`siteSettings.notFoundCopy`).

---

## `/preview-missing-fields`

Dev-only test fixture that forces every field empty to prove the UI degrades safely.
Not CMS content; keep as a dev route (or move behind a flag).

---

## Seed / trust roll-up (feeds Phase 2)

- **Published** (WP or live-confirmed): posts+categories (92), offers+offer-cats (4),
  services (7 WP sections), branches (3, phone/address), about page (32), home hero +
  intro + services-page title, result-stories flag, contact channel numbers.
- **DRAFT** (authored, unverified — never invent): specialists (all 3), faqs (12),
  before/after `results`, privacy page body, treatment extra details (benefits/steps/
  aftercare/duration/sessions), offer package terms, AR branch names where subsite
  served English, hero authored copy where WP gave none.
- **Excluded / do not restore as Home content**: the four "why Shamah" differentiators.

## Payload / Next compatibility (0.3)

Next pinned `16.3.6`, React `19.2.8`, build `next build --webpack`. Community +
release notes confirm Payload ≥3.73.0 with Next ≥16.2 as production-ready; the
open Next-16 friction is **turbopack** dev HMR (Payload discussion #14330), which we
sidestep because this project builds with **webpack**. Install `payload`,
`@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`,
`@payloadcms/storage-vercel-blob`, `sharp` at their latest compatible 3.x in Phase 1.3.
Serverless/Neon pooling caveat: use the **direct** connection for migrations and the
**pooled** URI at runtime (already provisioned; `payload-dev` branch for migrate/seed).
