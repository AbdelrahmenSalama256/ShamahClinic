# Task F — what the CMS actually holds for "Results"

Question: does Shamah Clinics publish real before/after material in WordPress that
`/results` can be built from?

Scope searched (read-only, GET only, concurrency 2, 300 ms spacing — same rules as the
sweep in `docs/STATIC-SWEEP.md`):

| source | volume | how read |
| --- | --- | --- |
| Posts, both subsites | 92 ids × 2 languages, full `content.rendered` | `data/wp/posts.{en,ar}.json` |
| Pages, both subsites | 27 slugs × 2 languages, full `content.rendered` | `data/wp/pages.{en,ar}.json` |
| Media library | 23 attachments (`id, source_url, alt_text, media_details`) | `data/wp/media.json` |
| Live rendered HTML | every public URL found through robots + sitemaps + internal links | `docs/STATIC-SWEEP.md` |

Search terms: `قبل`, `بعد`, `نتيجة`, `نتائج`, `before`, `after`, `result`, `results`, plus
the compound outcome phrases (`قبل وبعد`, `before and after`, `نتيجة العلاج`,
`نتائج العلاج`, `النتائج بعد`, `after treatment`, `after results`, `before/after`) and the
markup a case gallery would leave behind (`<img>` `src`/`alt`, `<figcaption>`,
`wp-block-gallery`, `gallery`).

## Finding: there is no before/after imagery in the CMS

- **Media library: 0 matches.** All 23 attachments are service or hero photography, each
  with the *service name* as its alt text (`Green Peel`, `Laser Underarm Hair Removal`,
  `Plasma Zoom`…). Nothing is named, captioned or alt-tagged as a before, an after, a
  result or a case.
- **Post and page bodies: 162 `<img>` tags, 37 unique sources — 0 of them a result photo.**
  The unique sources are 18 service/clinic photos reused across articles (the same
  `Botox-Injections`, `Filler-Injections`, `Skincare`, `Laser-Hair-Removal`,
  `Chemical-Peeling`, `Glow-Brightening-Injections`, `Mens-Aesthetic-Services`,
  `shamaclinics1/3/4/5` set), 12 size variants of 4 Instagram-import thumbnails
  (`/2016/07/…_n.jpg` at `-300x300`, `-475x530` and full), 4 theme/demo artifacts
  (`placehold.it/555x640`, `555x700`, `370x210` and `revslider/…/dummy.png`) and 3 brand
  assets (the logo, a locations map, a shop header strip). None carries a before/after or
  result `alt`, and the list is reproduced in full below so the negative is checkable.
- **0 `<figcaption>` hits** in any post or page body.
- **The four posts that *say* "before and after" in their title carry no image at all**:
  #974 `fractional-laser-for-the-face-before-and-after`, #964 `fractional-laser-before-and-after`,
  #1003 `laser-hair-removal-before-and-after-…`, #958 `the-appearance-of-the-face-after-fractional-laser`
  — `content.rendered` holds 0 `<img>` and `featured_media` is 0. They are articles, not
  case records: no paired photos, no area, no session count, no consent marker.

So the branch the brief allows is the second one: the material that exists is **articles
that describe outcomes**, not result records.

## What `/results` now renders

WordPress gives no `results` post type, no gallery and no case taxonomy — the site has
2 categories (`laser`, `laser-session`), so the only data-side signal that an article
*is* a result story is the article's own text naming an outcome. `/results` therefore
lists those posts as result stories: cover, title, excerpt and link, all from the post.

- **Rule** — `collectResultStories()` in `scripts/sync-wp.mjs`: a post qualifies when its
  title, excerpt or body contains one of the nine outcome phrases above (kashida-tolerant,
  matched in whichever language subsite, ids merged because TranslatePress keeps one id per
  article). 40 English-side + 44 Arabic-side hits → **56 distinct posts**.
- **Where it runs** — at sync time, from bodies already downloaded. `next build` stays
  WordPress-free and a request does not re-scan 92 articles. The artifact is
  `data/wp/result-stories.json` (`{ id, slug, phrases }[]`), counted in `meta.json`.
- **What stays live** — `src/lib/wp/result-stories.ts` joins the index to `getAllArticles()`,
  so title, excerpt, cover, date and the article link come from the posts API at render
  time; a reworded article updates without a re-sync, and a deleted one drops out of
  `/results` immediately. A post published *after* the last sync is not in the index yet,
  so it appears on `/blogs` first and joins `/results` on the next `npm run sync:wp`.
- **Order** — the posts API's own order (newest first). Nothing is ranked by hand.
- **Pagination** — 9 per page, 7 pages for the current 56. `?page=N` is server-rendered with
  a page-specific canonical and `rel=prev/next` (the same contract `/blogs` uses), so the
  crawlable pages exist, not only a "load more" button.
- **Both languages** — `/results` and `/en/results`, cards linking to `/blogs/<slug>` and
  `/en/blogs/<slug>`.
- The page states plainly that it shows no before/after photos because the clinic has
  published none, instead of presenting anything as a visual result.

## The authored before/after pairs are not verified, so they are off the page

`src/data/results.ts` carried 4 pairs (treatment + area + session count + note + a
before/after image pair). None of it is in the CMS, and the imagery is studio photography
from `public/images`, not a client of Shamah:

| id | what it claimed | why it cannot stay on a "Results" page |
| --- | --- | --- |
| `pigmentation-peel` | Yellow Peel, cheeks, 3 sessions, tone-evening pair | the dashboard holds no pair for it; the "3 sessions" is ours, not the clinic's |
| `acne-course` | "Acne skincare course", cheek and jaw, 4 sessions | no such service exists in page 696's sections, so no CMS row to check it against |
| `laser-hair-removal-course` | Laser hair removal, forearms, 6 sessions | the live site prices and plans laser per consultation; a fixed 6-session course is our number |
| `melasma-course` | "Melasma and pigmentation plan", forehead and cheeks, 3 sessions | no melasma service or plan is published by the dashboard |

They are listed here as **unverified** and no longer rendered. `src/data/results.ts` is gone and
`src/components/cards/ResultCaseCard.tsx` is not — the results page renders it through
`ResultsClient.tsx`, from rows the console publishes. The home page's band that used to sit beside
them, `src/components/home/BeforeAfterSection.tsx`, was deleted rather than left orphaned: it held
the hard-coded pair below, and `src/components/home/ResultCompareSection.tsx` now draws the same
comparison from a published row. If the clinic ever uploads real consent-given pairs, they land in
the console and reach both places with no code change.

## Evidence table — the 56 result stories

`images in body` counts `<img>` elements in both language bodies of the post (it is 0 for
every row, which is the point of the table). Cover URLs are the WordPress source; the site
renders the mirrored `/wp/*.webp` copy.

| id | date | title (EN) | images in body | matched phrases | cover (WordPress) | links |
| --- | --- | --- | --- | --- | --- | --- |
| 1182 | 2026-08-29 | Dermapen with LC Mesotherapy for Hair: The Modern So | 0 | after treatment | [shamaclinics1.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics1.png) — “Dermapen with LC Mesotherapy for Hai” | [EN](https://www.shamahclinics.com/dermapen-with-lc-mesotherapy-for-hai/) · [AR](https://www.shamahclinics.com/ar/dermapen-with-lc-mesotherapy-for-hai/) |
| 1174 | 2026-08-25 | Benefits of Stem Cells in Dermapen Treatments | 0 | before and after, after treatment, قبل وبعد | [Shamah_Header.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/Shamah_Header.png) — “Dermapen with Stem Cells” | [EN](https://www.shamahclinics.com/dermapen-with-stem-cells/) · [AR](https://www.shamahclinics.com/ar/dermapen-with-stem-cells/) |
| 1176 | 2026-08-21 | Derma Pen with Mesotherapy Using DX Technology Hair  | 0 | before and after | [Skincare3.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/Skincare3.png) — “Derma Pen with Mesotherapy using DX Technology” | [EN](https://www.shamahclinics.com/derma-pen-with-mesotherapy-using-dx-technology/) · [AR](https://www.shamahclinics.com/ar/derma-pen-with-mesotherapy-using-dx-technology/) |
| 1178 | 2026-08-21 | Derma Pen with Cosmo Medica Mesotherapy for Hair: An | 0 | قبل وبعد | [Botox-Injections4.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/Botox-Injections4.png) — “Derma Pen with Cosmo Medica Mesotherapy” | [EN](https://www.shamahclinics.com/derma-pen-with-cosmo-medica-mesotherapy/) · [AR](https://www.shamahclinics.com/ar/derma-pen-with-cosmo-medica-mesotherapy/) |
| 1186 | 2026-08-20 | Plasma Filler “Plasma Zoom”: The Modern Solution to  | 0 | after treatment | [Glow-Brightening-Injections.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Glow-Brightening-Injections.jpg) — “Plasma Zoom” | [EN](https://www.shamahclinics.com/plasma-zoom/) · [AR](https://www.shamahclinics.com/ar/plasma-zoom/) |
| 1172 | 2026-08-14 | Therapeutic Dermapen with DX Mesotherapy for Scars,  | 0 | after treatment, نتائج العلاج | [Glow-Brightening-Injections-1.webp](https://www.shamahclinics.com/wp-content/uploads/2025/10/Glow-Brightening-Injections-1.webp) — “Therapeutic Dermapen with DX Mesotherapy” | [EN](https://www.shamahclinics.com/therapeutic-dermapen-with-dx-mesotherapy/) · [AR](https://www.shamahclinics.com/ar/therapeutic-dermapen-with-dx-mesotherapy/) |
| 1162 | 2026-05-20 | Cosmetic Threads: The Perfect Solution for a Sagging | 0 | نتائج العلاج, النتائج بعد | [shamaclinics3.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics3.png) — “Cosmetic Threads for Men and Women” | [EN](https://www.shamahclinics.com/cosmetic-threads/) · [AR](https://www.shamahclinics.com/ar/cosmetic-threads/) |
| 1158 | 2026-03-19 | Non-Surgical Face Lifting Types | 0 | قبل و بعد | [5b52e9a1-7b27-4e71-8dec-9ea7be6f20ac.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/5b52e9a1-7b27-4e71-8dec-9ea7be6f20ac.png) — “Derma Pen with Mesotherapy Fusion” | [EN](https://www.shamahclinics.com/non-surgical-face-lifting/) · [AR](https://www.shamahclinics.com/ar/non-surgical-face-lifting/) |
| 1166 | 2026-03-18 | Therapeutic Dermapen with Cosmo Medica Mesotherapy:  | 0 | after treatment, نتائج العلاج | [Skincare3.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/Skincare3.png) — “Derma Pen with Mesotherapy using DX Technology” | [EN](https://www.shamahclinics.com/therapeutic-dermapen-with-mesotherapy/) · [AR](https://www.shamahclinics.com/ar/therapeutic-dermapen-with-mesotherapy/) |
| 1119 | 2026-03-17 | Chin and Perioral Filler Injections for Attractive a | 0 | before and after, قبل وبعد | [shamaclinics-Slider2.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics-Slider2.png) — “Chin and Perioral Filler Injections” | [EN](https://www.shamahclinics.com/chin-and-perioral-filler-injections/) · [AR](https://www.shamahclinics.com/ar/chin-and-perioral-filler-injections/) |
| 1123 | 2026-03-17 | Korean Hyaluronic Injections Secret to Natural Korea | 0 | قبل وبعد | [shamaclinics-Slider3.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics-Slider3.png) — “Salicylic Acid Peel” | [EN](https://www.shamahclinics.com/korean-hyaluronic-injections/) · [AR](https://www.shamahclinics.com/ar/korean-hyaluronic-injections/) |
| 1139 | 2026-03-17 | Carbon Laser Peeling: Restore Skin Radiance and Reju | 0 | نتائج العلاج | [Laser-Hair-Removal-Egypt-Price.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Laser-Hair-Removal-Egypt-Price.jpg) — “Carbon Laser Peeling” | [EN](https://www.shamahclinics.com/carbon-laser-peeling/) · [AR](https://www.shamahclinics.com/ar/carbon-laser-peeling/) |
| 1141 | 2026-03-17 | Discover the Power of Green Peel for Healthy, Radian | 0 | after treatment | [booking1.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/booking1.png) — “Green Peel” | [EN](https://www.shamahclinics.com/green-peel/) · [AR](https://www.shamahclinics.com/ar/green-peel/) |
| 1145 | 2026-03-17 | Discover the Power of TCA Peeling for Radiant and Yo | 0 | before and after, قبل وبعد | [Chemical-Peeling.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Chemical-Peeling.jpg) — “Yellow Peel” | [EN](https://www.shamahclinics.com/tca-peeling/) · [AR](https://www.shamahclinics.com/ar/tca-peeling/) |
| 1147 | 2026-03-17 | Yellow Peel The Golden Solution for Skin Renewal | 0 | النتائج بعد | [Chemical-Peeling.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Chemical-Peeling.jpg) — “Yellow Peel” | [EN](https://www.shamahclinics.com/yellow-peel/) · [AR](https://www.shamahclinics.com/ar/yellow-peel/) |
| 1156 | 2026-03-17 | Filler Injections for Men: Rebuilding Facial Feature | 0 | after treatment | [Mens-Aesthetic-Services.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Mens-Aesthetic-Services.jpg) — “Men’s Skin Peels” | [EN](https://www.shamahclinics.com/filler-injections-for-men/) · [AR](https://www.shamahclinics.com/ar/filler-injections-for-men/) |
| 1184 | 2026-03-17 | Dermapen with LC Mesotherapy for Skin: Effectively R | 0 | after treatment | [Filler-Injections.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Filler-Injections.jpg) — “Dermapen with LC Mesotherapy for Skin” | [EN](https://www.shamahclinics.com/dermapen-with-lc-mesotherapy-for-skin/) · [AR](https://www.shamahclinics.com/ar/dermapen-with-lc-mesotherapy-for-skin/) |
| 1107 | 2026-03-16 | Cheek Filler: Achieve Natural and Lifted Facial Cont | 0 | before and after, after treatment, قبل وبعد | [shamaclinics-Slider2.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics-Slider2.png) — “Chin and Perioral Filler Injections” | [EN](https://www.shamahclinics.com/cheek-filler/) · [AR](https://www.shamahclinics.com/ar/cheek-filler/) |
| 1109 | 2026-03-16 | Forehead Filler: Restore the Beauty and Smoothness o | 0 | before and after, قبل وبعد | [booking1.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/booking1.png) — “Green Peel” | [EN](https://www.shamahclinics.com/forehead-filler/) · [AR](https://www.shamahclinics.com/ar/forehead-filler/) |
| 1111 | 2026-03-16 | Lip Filler: The Secret to Natural Attraction with Sh | 0 | after treatment | [Filler-Injections-1.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Filler-Injections-1.jpg) — “Lip Filler” | [EN](https://www.shamahclinics.com/lip-filler/) · [AR](https://www.shamahclinics.com/ar/lip-filler/) |
| 1102 | 2026-03-15 | Gummy Smile Botox The Secret to a Perfect Smile and  | 0 | نتائج العلاج, النتائج بعد | [Filler-Injections-1.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Filler-Injections-1.jpg) — “Lip Filler” | [EN](https://www.shamahclinics.com/gummy-smile-botox-the-secret-to-a-perfect-smile-and-irresistible-attraction/) · [AR](https://www.shamahclinics.com/ar/gummy-smile-botox-the-secret-to-a-perfect-smile-and-irresistible-attraction/) |
| 1097 | 2026-03-14 | Botox Injections for Facial Wrinkle Tightening Resto | 0 | after treatment, نتائج العلاج | [Glow-Brightening-Injections-1.webp](https://www.shamahclinics.com/wp-content/uploads/2025/10/Glow-Brightening-Injections-1.webp) — “Therapeutic Dermapen with DX Mesotherapy” | [EN](https://www.shamahclinics.com/botox-for-facial-wrinkle-tightening/) · [AR](https://www.shamahclinics.com/ar/botox-for-facial-wrinkle-tightening/) |
| 1099 | 2026-03-14 | Expression Line Botox The Key to Lasting Beauty and  | 0 | before and after, after treatment, قبل وبعد, النتائج بعد | [shamaclinics1-Slider.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics1-Slider.png) — “Expression line Botox” | [EN](https://www.shamahclinics.com/expression-line-botox/) · [AR](https://www.shamahclinics.com/ar/expression-line-botox/) |
| 1086 | 2026-03-10 | Facial Botox Injections: The Secret to Youthful, Rad | 0 | after treatment | [Glow-Brightening-Injections.webp](https://www.shamahclinics.com/wp-content/uploads/2025/10/Glow-Brightening-Injections.webp) — “Under-Eye Filler” | [EN](https://www.shamahclinics.com/facial-botox-injections/) · [AR](https://www.shamahclinics.com/ar/facial-botox-injections/) |
| 1088 | 2026-03-10 | A Gum-Free Smile with Gummy Smile Botox at Shama Cli | 0 | after treatment | [Filler-Injections-1.jpg](https://www.shamahclinics.com/wp-content/uploads/2025/10/Filler-Injections-1.jpg) — “Lip Filler” | [EN](https://www.shamahclinics.com/gummy-smile-botox/) · [AR](https://www.shamahclinics.com/ar/gummy-smile-botox/) |
| 1090 | 2026-03-10 | Forehead Botox Injections The Secret to Youthful Nat | 0 | النتائج بعد | [Shamah_Header.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/Shamah_Header.png) — “Dermapen with Stem Cells” | [EN](https://www.shamahclinics.com/forehead-botox-injections/) · [AR](https://www.shamahclinics.com/ar/forehead-botox-injections/) |
| 1092 | 2026-03-10 | Under-Eye Botox: Restore the Freshness of Your Eyes  | 0 | after treatment, نتائج العلاج | [Glow-Brightening-Injections.webp](https://www.shamahclinics.com/wp-content/uploads/2025/10/Glow-Brightening-Injections.webp) — “Under-Eye Filler” | [EN](https://www.shamahclinics.com/under-eye-botox/) · [AR](https://www.shamahclinics.com/ar/under-eye-botox/) |
| 1094 | 2026-03-10 | Chin and Neck Botox Injections for a Youthful and At | 0 | قبل وبعد, النتائج بعد | [Glow-Brightening-Injections.webp](https://www.shamahclinics.com/wp-content/uploads/2025/10/Glow-Brightening-Injections.webp) — “Under-Eye Filler” | [EN](https://www.shamahclinics.com/chin-and-neck-botox/) · [AR](https://www.shamahclinics.com/ar/chin-and-neck-botox/) |
| 1062 | 2026-03-08 | Laser Underarm Hair Removal..A Bold Experience and A | 0 | before and after, قبل وبعد | [Laser-Hair-Removal-3.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/Laser-Hair-Removal-3.png) — “Laser Underarm Hair Removal” | [EN](https://www.shamahclinics.com/laser-underarm-hair-removal/) · [AR](https://www.shamahclinics.com/ar/laser-underarm-hair-removal/) |
| 1068 | 2026-03-08 | Laser Hair Removal for the Back: Say Goodbye to Unwa | 0 | النتائج بعد | [shamaclinics-Slider3.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics-Slider3.png) — “Salicylic Acid Peel” | [EN](https://www.shamahclinics.com/back-laser-hair-removal/) · [AR](https://www.shamahclinics.com/ar/back-laser-hair-removal/) |
| 1070 | 2026-03-08 | Laser Hair Removal for the Abdomen;The Ultimate Expe | 0 | before and after, after treatment, قبل وبعد, النتائج بعد | [booking1.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/booking1.png) — “Green Peel” | [EN](https://www.shamahclinics.com/abdomen-laser-hair-removal/) · [AR](https://www.shamahclinics.com/ar/abdomen-laser-hair-removal/) |
| 1072 | 2026-03-08 | Laser Hair Removal for Arms; An Unmatched Experience | 0 | before and after, after treatment, قبل وبعد | [shamaclinics6.png](https://www.shamahclinics.com/wp-content/uploads/2025/07/shamaclinics6.png) — “Abdomen Laser Hair Removal” | [EN](https://www.shamahclinics.com/abdomen-laser-hair-removal-2/) · [AR](https://www.shamahclinics.com/ar/abdomen-laser-hair-removal-2/) |
| 1074 | 2026-03-08 | Laser Leg Hair Removal: The Fastest Way to Smooth, A | 0 | قبل وبعد, النتائج بعد | [shamaclinics1-Slider.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics1-Slider.png) — “Expression line Botox” | [EN](https://www.shamahclinics.com/laser-leg-hair-removal/) · [AR](https://www.shamahclinics.com/ar/laser-leg-hair-removal/) |
| 1038 | 2026-02-28 | Scar and Burn Mark Treatment with the Latest Technol | 0 | نتائج العلاج | *(no cover)* | [EN](https://www.shamahclinics.com/scar-and-burn-mark-treatment/) · [AR](https://www.shamahclinics.com/ar/scar-and-burn-mark-treatment/) |
| 1040 | 2026-02-28 | Morpheus 8 Sessions: The Ultimate Experience for Ski | 0 | before and after, after treatment, قبل وبعد, النتائج بعد | [shamaclinics-Slider3.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics-Slider3.png) — “Salicylic Acid Peel” | [EN](https://www.shamahclinics.com/morpheus-8-sessions/) · [AR](https://www.shamahclinics.com/ar/morpheus-8-sessions/) |
| 1042 | 2026-02-28 | Collagen Threads the Secret to Youthful Beauty at Sh | 0 | after treatment, نتائج العلاج, النتائج بعد | [Glow-Brightening-Injections-1.webp](https://www.shamahclinics.com/wp-content/uploads/2025/10/Glow-Brightening-Injections-1.webp) — “Therapeutic Dermapen with DX Mesotherapy” | [EN](https://www.shamahclinics.com/collagen-threads/) · [AR](https://www.shamahclinics.com/ar/collagen-threads/) |
| 1044 | 2026-02-28 | Mesotherapy the Secret to Renewed Skin and Hair at S | 0 | قبل وبعد | [booking1.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/booking1.png) — “Green Peel” | [EN](https://www.shamahclinics.com/mesotherapy/) · [AR](https://www.shamahclinics.com/ar/mesotherapy/) |
| 1050 | 2026-02-28 | Infini RF The Technology Redefining Deep Skin Tighte | 0 | قبل وبعد, النتائج بعد | [shamaclinics-Slider2.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics-Slider2.png) — “Chin and Perioral Filler Injections” | [EN](https://www.shamahclinics.com/hifu-facial-skin-tightening-3/) · [AR](https://www.shamahclinics.com/ar/hifu-facial-skin-tightening-3/) |
| 1052 | 2026-02-28 | Cosmetic threads for facial lifting.. the secret to  | 0 | نتائج العلاج | [Shamah_Header.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/Shamah_Header.png) — “Dermapen with Stem Cells” | [EN](https://www.shamahclinics.com/facial-thread-lifting/) · [AR](https://www.shamahclinics.com/ar/facial-thread-lifting/) |
| 1034 | 2026-02-26 | Cholesterol Deposits Around the Eyes: Causes, Health | 0 | after treatment | [Shamah_Header.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/Shamah_Header.png) — “Dermapen with Stem Cells” | [EN](https://www.shamahclinics.com/cholesterol-deposits-around-the-eyes/) · [AR](https://www.shamahclinics.com/ar/cholesterol-deposits-around-the-eyes/) |
| 958 | 2025-12-06 | The Appearance of the Face After Fractional Laser | 0 | after treatment | *(no cover)* | [EN](https://www.shamahclinics.com/the-appearance-of-the-face-after-fractional-laser/) · [AR](https://www.shamahclinics.com/ar/the-appearance-of-the-face-after-fractional-laser/) |
| 1008 | 2025-11-30 | Laser Hair Removal Sessions | 0 | before and after, قبل وبعد, نتائج العلاج, النتائج بعد | *(no cover)* | [EN](https://www.shamahclinics.com/laser-hair-removal-sessions/) · [AR](https://www.shamahclinics.com/ar/laser-hair-removal-sessions/) |
| 1014 | 2025-11-29 | Shama: The Best Laser Center for Long-Lasting Result | 0 | after treatment | [shamaclinics4.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics4.png) — “Laser Hair Removal for Men” | [EN](https://www.shamahclinics.com/shama-the-best-laser-center-for-long-lasting-results/) · [AR](https://www.shamahclinics.com/ar/shama-the-best-laser-center-for-long-lasting-results/) |
| 984 | 2025-11-28 | When Do Fractional Laser Results Appear? Shama Clini | 0 | after results, قبل وبعد | [ليزر.webp](https://www.shamahclinics.com/wp-content/uploads/2025/10/ليزر.webp) — “Facial Laser Cost & Safe Hair Removal” | [EN](https://www.shamahclinics.com/when-do-fractional-laser-results-appear-shama-clinics-guide-to-rejuvenated-and-radiant-skin/) · [AR](https://www.shamahclinics.com/ar/when-do-fractional-laser-results-appear-shama-clinics-guide-to-rejuvenated-and-radiant-skin/) |
| 967 | 2025-11-22 | The Price of a Fractional Laser Session at Shama Cli | 0 | before and after, after treatment, قبل وبعد, نتيجة العلاج | *(no cover)* | [EN](https://www.shamahclinics.com/the-price-of-a-fractional-laser/) · [AR](https://www.shamahclinics.com/ar/the-price-of-a-fractional-laser/) |
| 995 | 2025-11-21 | Everything You Need to Know About the Side Effects o | 0 | before and after, قبل وبعد, النتائج بعد | *(no cover)* | [EN](https://www.shamahclinics.com/everything-you-need-to-know-about-the-side-effects-of-laser-hair-removal-and-your-safe-experience-at-shama-clinic/) · [AR](https://www.shamahclinics.com/ar/everything-you-need-to-know-about-the-side-effects-of-laser-hair-removal-and-your-safe-experience-at-shama-clinic/) |
| 1016 | 2025-11-21 | Laser Hair Removal Price in 2026 | 0 | after treatment, النتائج بعد | [shamaclinics-Slider3.png](https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics-Slider3.png) — “Salicylic Acid Peel” | [EN](https://www.shamahclinics.com/laser-hair-removal-price-in-2026/) · [AR](https://www.shamahclinics.com/ar/laser-hair-removal-price-in-2026/) |
| 1011 | 2025-11-19 | Best Laser Hair Removal Center for Men in Egypt | 0 | before and after, قبل وبعد | *(no cover)* | [EN](https://www.shamahclinics.com/best-laser-hair-removal-center-for-men-in-egypt/) · [AR](https://www.shamahclinics.com/ar/best-laser-hair-removal-center-for-men-in-egypt/) |
| 1001 | 2025-11-17 | How to Determine the Cost of a Facial Laser Session  | 0 | before and after, قبل وبعد | [ليزر.webp](https://www.shamahclinics.com/wp-content/uploads/2025/10/ليزر.webp) — “Facial Laser Cost & Safe Hair Removal” | [EN](https://www.shamahclinics.com/how-to-determine-the-cost-of-a-facial-laser-session-and-your-safe-experience-at-shama-clinic/) · [AR](https://www.shamahclinics.com/ar/how-to-determine-the-cost-of-a-facial-laser-session-and-your-safe-experience-at-shama-clinic/) |
| 974 | 2025-11-15 | Fractional Laser for the Face Before and After | 0 | before and after, after treatment, after results, قبل وبعد, نتائج العلاج | *(no cover)* | [EN](https://www.shamahclinics.com/fractional-laser-for-the-face-before-and-after/) · [AR](https://www.shamahclinics.com/ar/fractional-laser-for-the-face-before-and-after/) |
| 1003 | 2025-11-13 | Laser Hair Removal Before and After: Your Complete G | 0 | before and after, قبل وبعد, النتائج بعد | *(no cover)* | [EN](https://www.shamahclinics.com/laser-hair-removal-before-and-after-your-complete-guide-to-smooth-and-healthy-skin-at-shama-clinic/) · [AR](https://www.shamahclinics.com/ar/laser-hair-removal-before-and-after-your-complete-guide-to-smooth-and-healthy-skin-at-shama-clinic/) |
| 964 | 2025-11-06 | Fractional Laser Before and After | 0 | before and after, after treatment, after results, قبل وبعد | *(no cover)* | [EN](https://www.shamahclinics.com/fractional-laser-before-and-after/) · [AR](https://www.shamahclinics.com/ar/fractional-laser-before-and-after/) |
| 992 | 2025-10-26 | Everything You Need to Know About Full-Body Laser Se | 0 | النتائج بعد | *(no cover)* | [EN](https://www.shamahclinics.com/everything-you-need-to-know-about-full-body-laser-session-prices-and-your-exceptional-experience-at-shama-clinic/) · [AR](https://www.shamahclinics.com/ar/everything-you-need-to-know-about-full-body-laser-session-prices-and-your-exceptional-experience-at-shama-clinic/) |
| 986 | 2025-10-11 | Types of Laser Devices: A Comprehensive Guide to Cho | 0 | before and after, after treatment, قبل وبعد | *(no cover)* | [EN](https://www.shamahclinics.com/types-of-laser-devices-a-comprehensive-guide-to-choosing-the-best-device-for-smooth-and-safe-skin/) · [AR](https://www.shamahclinics.com/ar/types-of-laser-devices-a-comprehensive-guide-to-choosing-the-best-device-for-smooth-and-safe-skin/) |
| 998 | 2025-10-10 | Everything You Need to Know About Whether Laser Hair | 0 | before and after, قبل وبعد | *(no cover)* | [EN](https://www.shamahclinics.com/everything-you-need-to-know-about-whether-laser-hair-removal-provides-permanent-results-and-your-safe-experience-at-shama-clinic/) · [AR](https://www.shamahclinics.com/ar/everything-you-need-to-know-about-whether-laser-hair-removal-provides-permanent-results-and-your-safe-experience-at-shama-clinic/) |
| 978 | 2025-10-07 | Fractional Laser for the Face – My Experience with S | 0 | before and after, after treatment, after results, قبل وبعد, النتائج بعد | *(no cover)* | [EN](https://www.shamahclinics.com/fractional-laser-for-the-face-my-experience-with-shama-clinic-renewed-skin-with-complete-confidence/) · [AR](https://www.shamahclinics.com/ar/fractional-laser-for-the-face-my-experience-with-shama-clinic-renewed-skin-with-complete-confidence/) |

## Appendix — every image source that appears in a post or page body

37 unique sources across 162 `<img>` tags; none is a before/after, result or case marker.

- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Botox-Injections4.png` — alt: “Derma Pen with Cosmo Medica Mesotherapy”
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Skincare.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Laser-Hair-Removal.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Botox-Injections.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Filler-Injections-1.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Glow-Brightening-Injections.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Chemical-Peeling.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Mens-Aesthetic-Services.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/499681450_17864341677394859_3613073881417896282_n-300x300.jpg` — alt: “4 Full Body Sessions + Complimentary Face &amp; Brow Bleaching”
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/549220869_17879018322394859_7463942622215656831_n-300x300.jpg` — alt: “٤ جلسات جسم كامل + تشقير وجه وحواجب هدية”
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/539975999_17876816397394859_766565143121795196_n-300x300.jpg` — alt: “٤ جلسات جسم كامل + تشقير وجه وحواجب هدية”
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/521569149_17871844698394859_850867644392777533_n-300x300.jpg` — alt: “٤ جلسات جسم كامل + تشقير وجه وحواجب هدية”
- `https://www.shamahclinics.com/wp-content/uploads/2025/07/cropped-Shamah-Clinics-300x300.png`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/5b52e9a1-7b27-4e71-8dec-9ea7be6f20ac.png` — alt: “The Process”
- `//www.shamahclinics.com/wp-content/plugins/revslider/public/assets/assets/dummy.png`
- `http://placehold.it/555x640` — alt: “placeholder555x640”
- `http://placehold.it/555x700` — alt: “placeholder555x700”
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Skincare3.png`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Laser-Hair-Removal-3.png`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Filler-Injections3.png`
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/499681450_17864341677394859_3613073881417896282_n.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/549220869_17879018322394859_7463942622215656831_n.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/539975999_17876816397394859_766565143121795196_n.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/521569149_17871844698394859_850867644392777533_n.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/Filler-Injections.jpg` — alt: “Beauty Journey with Shamah Clinic”
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinicslocatins-683x1024.png`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics5.png`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics4.png`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics3.png`
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/shamaclinics1.png` — alt: “Dermapen with LC Mesotherapy for Hai”
- `https://www.shamahclinics.com/wp-content/uploads/2025/10/ليزر-1024x681.webp` — alt: “Facial Laser Cost & Safe Hair Removal”
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/499681450_17864341677394859_3613073881417896282_n-475x530.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/549220869_17879018322394859_7463942622215656831_n-475x530.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/539975999_17876816397394859_766565143121795196_n-475x530.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2016/07/521569149_17871844698394859_850867644392777533_n-475x530.jpg`
- `https://www.shamahclinics.com/wp-content/uploads/2016/01/shop-header-bg-3.jpg`
- `http://placehold.it/370x210` — alt: “placeholder370x210”
