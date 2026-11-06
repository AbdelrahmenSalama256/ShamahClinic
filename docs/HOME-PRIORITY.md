# Home priority: services and CMS-authored reasons

Home shows the first three featured services and also renders the About page's
published "Why clients choose us" content. Both are CMS-backed: edit service cards
under Services, and edit the reasons under Console → Pages → About.

## 1. The section that was removed, and why its CMS content returned

Home's first band used to be the authored "Why clients choose Shamah Clinics" block:
a reception photo, a heading, and a carousel of four numbered claims
(`استشارة قبل أي إجراء`, `طاقم طبي نسائي بالكامل`, `أجهزة حديثة ومنتجات أصلية`,
`ثلاثة فروع قريبة منكِ`), with an "All reasons" link to `/about`.

The first implementation removed this hard-coded block because the claims duplicated
other pages and were not verified in the live content. The reasons are now authored in
the About page's CMS document, so they can be edited and published rather than embedded
in `HomeBody.tsx`.

| Section | Where its content comes from | Overlaps another section? | Links to a conversion action? | Verdict |
| --- | --- | --- | --- | --- |
| **Why Shamah** | The published `/about` page row; its heading, lead and reasons are edited in the About page's typed CMS form. | Some themes overlap the other pages, but the owner controls the exact wording. | The section links to `/about`; it is not presented as a clinical promise. | **Shown on Home and About** from the same published fields. |
| Offers | Live WordPress/WooCommerce (`/api/v1/offers`, Store API products with prices). | No — it is the only place discounted packages appear. | Yes — `احجزي العرض` opens the booking dialog, plus a WhatsApp deep link per card. | Stays. |
| Branches | Live WordPress (branch pages: names, areas, addresses, per-branch phones). | Partially with `/branches`, but on Home it is the tap-to-call entry. | Yes — `tel:` and WhatsApp links on every card. | Stays. |
| Journal | Live WordPress posts (92 EN slugs mirrored in the snapshot). | No. | Indirect — each card is a post, and posts carry the booking CTA. | Stays. |

The Home intro still links to `/about`, and the same CMS-authored reasons also appear in
a dedicated Home section below the intro/services band. The About page continues to
render them above "What we stand by."

## 2. Which three services, chosen by a deterministic rule

`getFeaturedServices(3)` in `src/lib/wp/treatments.ts`:

1. **WordPress order first.** Page 696 (`our-services`) publishes its service sections
   in a fixed order; the merged treatments are ranked by that order
   (`getServiceCards()`), so Home shows the services the client put at the top of
   their own services page, with no hand-picking.
2. **Only cards that render.** A candidate must have both a mirrored photo and a
   non-empty intro (`image.src` + `tagline.en|ar`); a service WordPress gives no photo
   for would show a placeholder card on the most-visited page.
3. **Near-duplicates are skipped.** Normalised names contained in one another
   (`skincare` / `deep cleansing skincare`) collapse to the earlier-ranked one.
4. **Optional override.** `src/config/home.ts` exports `featuredServiceSlugs`. It is
   empty, so the rule above is used; filling it pins those slugs when they exist.

Current result, identical in both languages:

| # | slug | WordPress position |
| --- | --- | --- |
| 1 | `skincare-deep-cleansing` | 1 on page 696 |
| 2 | `laser-hair-removal` | 2 |
| 3 | `botox` | 3 |

The services heading is page 696's own title (`getPageTitle("our-services")` →
`خدماتنا` / `Our Services`). The introduction heading beside it is the homepage's own
`#about` row heading (`The Best Aesthetic Center` in English; the Arabic row of that
page is still untranslated English, so the Arabic side keeps the authored
`لماذا تختار العميلات عيادات شامه؟`, exactly as `getHomeIntro()` documents).
`كل الخدمات` / `All services` links to `/services` whenever more than three exist
(12 merged services do).

## 3. Home layout

The intro/services band keeps its `Swiper` layout: `mobilePerView 1`, `tabletPerView 2`,
`desktopPerView 3`, `gap 16`, no autoplay. The Why Choose Us band renders the About
reasons as numbered cards; it is omitted when the About row has no published reasons.

## 4. Historical measured height before CMS reasons returned to Home

These measurements compare the layout before and after the services section replaced
the original hard-coded reasons section. They predate the CMS-backed reasons band
described above and are not measurements of the current Home. Playwright (Chromium)
compared `/` (after) with a
temporary `/preview-home-before` route that rendered the committed HEAD version of
`HomeBody.tsx` with the same data — the route and component were deleted afterwards.
`document.documentElement.scrollHeight`, light theme, Arabic and English:

| Viewport | Language | Home before | Home after | Δ |
| --- | --- | --- | --- | --- |
| 1440 × 900 | ar | 4333 px | 4209 px | **−124 px** |
| 1440 × 900 | en | 4437 px | 4339 px | **−98 px** |
| 390 × 844 | ar | 6669 px | 6774 px | **+105 px (+1.6 %)** |
| 390 × 844 | en | 6874 px | 6987 px | **+113 px (+1.6 %)** |

Band 1 specifically: 1440 → 566 → 562 px (ar), 620 → 643 px (en); 390 → 664 → 844 px
(ar), 761 → 950 px (en). The phone band is taller because a service card (362 px) is
taller than the text slide it replaces (~230 px) and the band now carries two headings
(the WordPress introduction and the services heading) instead of one. The rest of Home
got shorter on the phone (−68 px on Branches, −4 px each on Offers and Journal) thanks
to the Task-B guards, leaving +105/113 px overall.

Home is shorter on desktop and 1.6 % taller on the 390 px phone layout. The only ways
to make the phone layout exactly neutral would have been to show fewer than three
cards, hide the WordPress introduction text, or invent a compact card variant — all
three change content or the visual design, so the +1.6 % is left in place and
reported.

Playwright is not a dependency of this project (it was used once, ad hoc, from
`node_modules`); re-measuring needs `npm i -D playwright` plus a browser download.

### 4.1 The +105/+113 px was then taken back (2026-10-14)

The client asked for the phone layout to be no taller than before, changing section
paddings and gaps only. `HomeBody`'s band wrapper went from `py-5 lg:py-12` to
`py-4 lg:py-12` — four bands, four pixels top and bottom each, 32 px off the phone
document and nothing off the desktop one. Measured again on the production build
(`next build --webpack` + `next start -p 3100`), same probe, light theme:

| Viewport | Language | Home before Task C | Immediately after Task C | After the rhythm pass | Against "before" |
| --- | --- | --- | --- | --- | --- |
| 1440 × 900 | ar | 4333 px | 4209 px | 4253 px | −80 px |
| 1440 × 900 | en | 4437 px | 4339 px | 4363 px | −74 px |
| 390 × 844 | ar | 6669 px | 6774 px | **6656 px** | **−13 px** |
| 390 × 844 | en | 6874 px | 6987 px | **6825 px** | **−49 px** |

The desktop numbers moved +44/+24 px between the two after-columns because of the
later work (the 404 shell, the results page, the removed hours/email rows in the
footer), not because of this pass — `lg:py-12` is byte-for-byte what it was.

### 4.2 The offer cards gained their WordPress image (2026-10-14)

The client then reported that the WooCommerce products show no image, which is true:
the products carry one or three images each in the Store API snapshot and `OfferCard`
was the only card in the family that never asked for it. Putting it back costs the
phone layout the same row the three sibling bands already pay for — the offers band is
now `1834 px` (ar) of a `7367 px` document:

| Viewport | Language | §4.1 (no offer image) | With the card image | Δ |
| --- | --- | --- | --- | --- |
| 1440 × 900 | ar | 4253 px | 4507 px | +254 px |
| 1440 × 900 | en | 4363 px | 4618 px | +255 px |
| 390 × 844 | ar | 6656 px | 7367 px | **+711 px (+10.7 %)** |
| 390 × 844 | en | 6825 px | 7537 px | **+712 px (+10.4 %)** |

Desktop pays one image row because three cards sit side by side; phone pays three, one
per card. Measured on the same production build (`next build --webpack` +
`next start -p 3100`) at the default theme.

This is the one place where §4.1's "no taller than before" no longer holds, and it is
deliberate: the height is the client's own imagery, requested explicitly, at the ratio
every other card on the page already uses. The alternative — an image-less offer card
on Home and an image on `/offers` — would be the same content shown two ways.

## 5. Final Home section list, in order

| Band | Section | Cards on Home | "View all" |
| --- | --- | --- | --- |
| 1 | WordPress introduction (`#about` row of page 622) + Services (page 696 title) | 3 service cards | `كل الخدمات` / `All services` → `/services` |
| 2 | `#offers` — Seasonal packages | 3 offer cards | `كل العروض` / `All offers` → `/offers` |
| 3 | `#branches` — Our three branches | 3 branch cards | `تفاصيل الفروع` / `Branch details` → `/branches` |
| 4 | `#blogs` — From the Shamah blog | 3 article cards | `كل المدونات` / `All blogs` → `/blogs` |

Below the fold the page keeps its booking CTA band and the footer. The hero
(`HomeHero`) is untouched.
