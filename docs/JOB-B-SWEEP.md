# Job B1 — the original site's service and offer surfaces, against this repository

Read-only sweep of `D:\shamah` (no file changed there), then an audit of the CMS. This is the
comparison the brief asks for: what the original genuinely ships, what must be ported, what
this repository already supports, and which existing data must survive.

## 1. The original site, as shipped

### Routes

| Surface | Arabic | English | Implementation |
|---|---|---|---|
| Service list | `/services` | `/en/services` | `src/app/[lang]/services/page.tsx:1` — a re-export of `/treatments` |
| Service detail | `/services/<slug>` | `/en/services/<slug>` | `src/app/[lang]/services/[slug]/page.tsx:1-5` — also a re-export |
| Offers list | `/offers` | `/en/offers` | `src/app/[lang]/offers/page.tsx:24` |
| Offer detail | `/offers/<slug>` | `/en/offers/<slug>` | `src/app/[lang]/offers/[slug]/page.tsx:40` |
| Home services band | `/`, `/en` | — | `src/components/home/HomeBody.tsx:97-137` (3 cards) |
| Home offers band | `/`, `/en` | — | `src/components/home/HomeBody.tsx:144-169` (3 cards) |

`/services` is an alias: both listing and detail re-export the `/treatments` pages, and the
canonical URL and card links point at `/treatments/...` while breadcrumbs say `/services`
(`TreatmentDetailClient.tsx:66-70`). This inconsistency is the original's, not a porting
decision, and the CMS already serves one canonical `/services/<slug>`.

### Where the service content comes from

- Page **id 696** of the WordPress site, parsed out of WPBakery HTML: `src/lib/wp/index.ts:556-564`,
  `src/lib/wp/mappers.ts:181-236`. The parser reads each `h2/h3` inside a column, its first
  `img`, and its joined `p` — three fields per service.
- Everything else the detail page displays (duration, sessions, benefits, steps, aftercare,
  ideal-for, price) is authored in `src/data/treatments.ts:12-34` — and **every row is
  commented out** (`:56-341`). At runtime those fields are empty and the detail page renders
  no block for them (`TreatmentDetailClient.tsx:55-57`).
- One service (botox) also has a WordPress page of its own (id 885) pulled into `body`.
- Claimed fields that have no source today: `priceStartingAt`, `idealFor`, `benefits`,
  `steps`, `aftercare`, `duration`, `sessionsRecommended`, `category`.

### What the original page actually renders

`TreatmentDetailClient.tsx` draws, in order: hero (photo, name, tagline, book button),
breadcrumb, description/body, ideal-for, benefits, steps, aftercare, a sticky booking aside
with duration/sessions/price, a WhatsApp button, a disclaimer line, related services, and
"browse all". Lists render only when non-empty; there is no gallery, no FAQ, no specialist or
branch relation, no per-service SEO fields, no section ordering, and no table of contents.

**There is no richer original single-service page.** The brief's fallback applies: the design
is ported from the cards, the listing page, the detail page as it exists, and the site's own
design system — not from an imagined page.

### Images, fonts, tokens

- Authored slots are `/images/treatment-*.jpg` (`src/lib/images.ts:72-115`), all present.
- WordPress section photos are mirrored to `/wp/*.webp` through `data/wp/images.json`
  (`src/lib/wp/mirror.ts:42-48`); 20 service-related files exist under `public/wp/`.
- Fonts, tokens and the RTL/LTR conventions are the same design system this repository
  already carries; no separate stylesheet is involved.

### CTAs and booking

- `BookButton` → `openBooking({ treatmentId })` (`src/components/shared/Actions.tsx:34-58`).
- The wizard is a five-step modal (`src/components/booking/BookingModal.tsx`): service
  multi-select, branch, specialist, date/time, name/phone/notes, then a confirmation and a
  WhatsApp hand-off. It posts `/api/v1/lead` with `service`, `offer`, `branch`, `specialist`
  and the attribution object.
- Per-service WhatsApp message: `TreatmentDetailClient.tsx:197-206`.
- No per-service booking URL, no offer eligibility, no offer-to-service relation.

### Metadata and structured data

`buildPageMetadata` per route; canonical is built from `/services/<id>` and therefore
disagrees with `/services/<slug>`; `serviceJsonLd` and `MedicalProcedure` exist
(`src/lib/jsonld.ts:145-161`) with `availability: InStock` hard-coded on offers (`:195`).
FAQPage schema exists on the FAQ page only. No per-service meta fields exist.

### Offers, as shipped

- WooCommerce Store API `/wc/store/v1/products` (`src/lib/wp/index.ts:60-61`), snapshot
  fallback in `data/wp/products.{en,ar}.json` — **4 products**: one real (899 EGP) and three
  placeholder "art prints" at 500 EGP with duplicated images.
- Consumed fields: `id, slug, name, prices.price, prices.regular_price,
  prices.currency_minor_unit, prices.currency_code, on_sale, images[], short_description,
  description`. Categories are `[]` on every product; `is_in_stock` is true but unread.
- Cards show badge, first image, title, subtitle, `<li>` bullets parsed out of the
  description, price, struck original, savings, booking and WhatsApp buttons
  (`OfferCard.tsx`). Detail adds a gallery and sanitised body.
- "Book offer" passes only the offer **name** (`OfferCard.tsx:119`); no service is
  preselected and no eligibility exists.
- No offer validity dates, no category filtering, no offer↔service relation anywhere.

## 2. What this repository already supports

| Capability | State | Evidence |
|---|---|---|
| Typed service list (JSON document behind a typed schema) | **Works** | `src/lib/content/list-schema.ts:98-142`; 9 rows in `list_items` |
| Service list + detail routes | **Works** | `src/app/[lang]/services/{page,[slug]/page}.tsx` |
| DB-first read path with snapshot fallback | **Works** | `src/lib/wp/treatments.ts:115-145` (`treatmentsFromDb` first) |
| Offers entity with typed columns and editor | **Works** | `offers` table (30 columns), `KIND_SPECS` offer entry, `/console/offers` |
| Offer retrieval from the DB | **Works** | `getAllOffers`/`getOffer`, `src/lib/content/site.ts:364-391` |
| Booking modal with service picker, lead persistence, attribution | **Works** | `BookingModal.tsx`, `/api/v1/lead`, `leads` table |
| Tracking helper and event names | **Works** | `src/lib/tracking/{client,events}.ts` |
| Copy store + Texts screen (shared editable sentences) | **Works** | `src/lib/copy/*`, `/console/texts` |
| SEO center / entity SEO overrides | **Works** | `src/lib/console/seo-center.ts`, `/console/seo` |
| Results (before/after) with service reference | **Works** | `results` list, `refs source:'services'` |
| Specialists, branches, FAQ, articles | **Works** | four lists + `articles` table |
| Console sandboxed draft preview | **Works** | `src/lib/console/preview.ts`, `previewDocument()` |

## 3. Partial or missing — the Job B gap

1. **The service document is thin.** It has name, intro, description, benefits, steps,
   aftercare (plain string lists), ideal, duration, sessions, price, image, alt, body,
   featured, category, href. Missing: hero headline/subheadline, per-language hero alt,
   typed CTAs, benefit titles/icons, who-should-not, results timeline, downtime, anesthesia,
   frequency, technology, preparation, safety, price range/currency/note/on-request, offer
   links, result cases, video, gallery with per-image captions, specialists, branches, FAQ
   references and inline Q&A, related services/articles, per-service SEO, and section
   visibility/order.
2. **No offer→service relation** and no eligibility in booking.
3. **No shared medical disclaimer field.** The copy store can hold the sentence, but no
   field exists yet and its wording is the owner's decision.
4. **No completeness meter or list warnings** for services.
5. **The console editor is one flat column** of fields; the brief's 14 groups are not drawn.
6. **The public detail page has no TOC, gallery, FAQ, specialist/branch cards, per-service
   JSON-LD beyond `MedicalProcedure`, or sticky mobile CTA.**
7. **Dev data carries import artefacts**: two placeholder service rows (`id-fugiat…` enabled,
   `est-ducimus…` disabled) and four placeholder/duplicate offers (`begneh` "Marshall
   Parsons", `doloremque…`, two 500 EGP duplicates). They are preserved, not deleted; the
   new model makes them visible as incomplete rather than silently good.

## 4. Fields that must be preserved

`list_items.uid`, `position`, `enabled`, `published`, and every existing document key
(`name_ar/en`, `intro_ar/en`, `description_ar/en`, `benefits_*`, `steps_*`, `aftercare_*`,
`ideal_*`, `duration_*`, `sessions_*`, `price`, `image`, `alt_ar/en`, `body_ar/en`,
`featured`, `category`, `href`). The offer columns `id, slug, status, name_*, excerpt_*,
body_*, pub_*, price, regular_price, currency, on_sale, images, enabled, position,
published_at, legacy_id, version`. All new fields are optional with defaults, so every old
record keeps rendering exactly what it renders today.

## 5. Decisions taken from the audit

- **One canonical service URL.** Keep `/services/<uid>`; the WP `/treatments` alias is not
  carried into the CMS (it never existed here).
- **Relationships are stored as IDs.** Services reference results, specialists, branches,
  FAQ, offers, other services and articles by their existing keys; offers reference services
  by service UID plus an explicit scope (`selected` / `all` / `unconfigured`). No duplicated
  content and no manually typed slugs.
- **Legacy offers are `unconfigured`, not `all`.** A missing relation must not grant access
  to every service.
- **The disclaimer is a shared site-text entry, empty by default.** Nothing is published
  until the owner supplies wording (question 5 in the final report).
- **Prices stay hidden unless configured.** The placeholder offers' 500 EGP is preserved as
  data, but nothing invents a zero or a currency.
