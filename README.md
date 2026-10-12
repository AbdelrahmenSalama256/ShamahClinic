# Shamah Clinics — Next.js site on a read-only WordPress CMS

Arabic-first (RTL) bilingual site for Shamah Clinics. WordPress
(https://www.shamahclinics.com) is the **read-only** content source; Next.js is the
only mapping layer between the WP core REST + WooCommerce Store APIs and the UI.
Nothing is hand-copied from WordPress and WordPress is never written to.

## Commands

```bash
npm run sync:wp   # refresh data/wp/*.json + public/wp/*.webp from WordPress (run before deploying)
npm run dev       # dev server — reads live WordPress, snapshot as fallback
npm run build     # production build — reads ONLY data/wp/*.json
npm run start     # serve the build
npm run lint      # eslint (next lint was removed in Next 16)
npm run typecheck # tsc --noEmit
```

## Snapshot-first data flow

`next build` must never depend on the client's production WordPress, so content
travels through a committed snapshot:

1. `scripts/sync-wp.mjs` pulls **both** subsites (`/wp-json` and `/ar/wp-json`)
   with concurrency 2, 300 ms spacing, one retry with backoff and a 30 s timeout,
   and writes `data/wp/*.json`:
   `posts`, `posts-list`, `pages`, `pages-list`, `categories`, `products`,
   `offer-categories`, `media` (one batched `?include=` call), `seo` (parsed
   `<head>` for the marketing pages) and `meta` (generation stamp + counts).
   Lists never request `content`, and nothing uses `_embed`.
   It then downloads the images the site actually renders and commits them as
   `public/wp/<name>.webp` (sharp, 1280 px, q72) with the URL map in
   `data/wp/images.json`. `src/lib/wp/mirror.ts` applies that map inside the data
   layer, so both the API and the UI serve local files; anything not mirrored
   keeps its live WordPress URL, and the step is idempotent — only new URLs are
   fetched. **Run `npm run sync:wp` and commit `data/wp/` + `public/wp/` before
   every deploy**, because the build itself never touches WordPress.
2. **Build** (`NEXT_PHASE=phase-production-build`): `src/lib/wp` reads the
   snapshot only. `wpFetch` refuses to run, so a live request during a build is
   logged as `REFUSED` and fails the page — the build currently makes **zero**
   WordPress requests.
3. **Runtime** (ISR, `revalidate = 300`): live WordPress with an 8 s abort and one
   retry, at most 3 concurrent requests; on any failure the snapshot is served.
   Each decision is logged once per collection, e.g.
   `[wp] live     en posts-list (92 rows)` / `[wp] snapshot ar posts (fetch failed)`.

Refresh cadence: run `npm run sync:wp` locally and commit `data/wp/` before a
deploy; use `POST /api/revalidate` (header `x-revalidate-secret`) for on-demand
content refresh without a deploy.

## Bilingual model

EN and AR are parallel TranslatePress subsites that share post/page/term ids, so
`{ar, en}` fields are produced by reading the same id from both bases and merging.
The **site** owns URLs (`/x` = Arabic, `/en/x` = English) — WordPress permalinks are
reference only for canonical/hreflang, which point at `NEXT_PUBLIC_SITE_URL`.

Language is chosen on the **server**, from the URL: every route lives under
`src/app/[lang]/`, and `src/proxy.ts` rewrites the unprefixed Arabic URLs onto
`/ar/…` so the address bar never changes. `<html lang>`, `dir`, the title, canonical,
hreflang, Open Graph locale and JSON-LD are all rendered from that segment
(`src/lib/route-lang.ts`), so `curl /en/...` returns English HTML rather than Arabic
HTML re-labelled in the browser.

Two properties of the data worth knowing (the site shows them as they are):

- WooCommerce products are not translated on the AR subsite, so an offer's missing
  language falls back to the other language's name.
- WordPress regenerates post excerpts from the original English body, so 91/92 AR
  `excerpt` values are English text under an Arabic title.

## Content policy

The client's data-entry team owns every word and price through the WordPress
dashboard. The site displays what the API returns: it does not hide, merge, filter,
rewrite or invent content, and it adds no labels the data does not justify (a sale
badge only appears when WooCommerce says `on_sale`). Everything that has a WordPress
source comes from WordPress — posts, pages, offers, the services page, categories,
images and SEO fields — live at runtime, refreshed by ISR and `/api/revalidate`, with
`data/wp/*.json` as the build-time and outage fallback.

The only content with no WordPress source is static, and it is listed row by row in
`docs/inventory.md` under "Static content, not editable from the dashboard".

## Revalidation

- **Time-based**: every WP-backed route sets `revalidate = 300`, so a dashboard edit
  is picked up within five minutes with no deploy. `next.config.ts` sets
  `expireTime: 3600`, so a CDN serves the cached page while the refresh happens in
  the background instead of making a visitor wait on WordPress.
- **On-demand**: `POST /api/revalidate` with the secret flushes the `wp:en`, `wp:ar`
  and `wp:seo` fetch tags and every `[lang]` route pattern, both languages:

  ```bash
  curl -X POST https://<host>/api/revalidate -H "x-revalidate-secret: $REVALIDATE_SECRET"
  # or as a query param, which is what a webhook-friendly form accepts:
  curl -X POST "https://<host>/api/revalidate?secret=$REVALIDATE_SECRET"
  ```

  `POST /api/revalidate` compares the secret and returns the tags and route patterns
  it flushed. Nothing needs to be redeployed or re-synced for an edit to appear.

### Wiring the WordPress hook

Add this to the child theme's `functions.php` (or a small mu-plugin / Code Snippets
snippet) on https://www.shamahclinics.com. It calls the site whenever the data team
publishes, updates or trashes a post or a WooCommerce product:

```php
add_action('transition_post_status', 'shamah_next_revalidate', 10, 3);
function shamah_next_revalidate($new_status, $old_status, $post) {
    if ($new_status !== 'publish' && $new_status !== 'trash') return;
    if (!in_array($post->post_type, ['post', 'page', 'product'], true)) return;
    wp_remote_post(
        'https://<host>/api/revalidate?secret=<REVALIDATE_SECRET>',
        ['timeout' => 5, 'blocking' => false]
    );
}
```

`blocking => false` keeps the WordPress save fast, and the endpoint only compares the
secret, so this is a fire-and-forget ping. The five-minute ISR window stays as the
safety net if the hook ever fails.

## Environment

Copy `.env.example` → `.env.local`. The build reads the snapshot and needs none of
these to reach the network; runtime and forms do:

| Variable | Default | Purpose |
|----------|---------|---------|
| `WP_BASE_URL` | `https://www.shamahclinics.com` | WordPress origin; AR is the same host under `/ar` |
| `NEXT_PUBLIC_SITE_URL` | `https://shamahclinics.com` | canonical origin for metadata, hreflang, sitemap, robots |
| `LEAD_MODE` | `whatsapp` | `whatsapp` returns a prefilled `wa.me` link; `cf7` emails the clinic's real inbox — do not set it without confirmation |
| `CF7_FORM_ID` | `568` | Contact Form 7 form on booking page 837 |
| `REVALIDATE_SECRET` | — | required by `POST /api/revalidate`; the route 500s if it is unset |
| `WP_FETCH_TIMEOUT_MS` | `8000` | abort + one retry for a live WP read before the snapshot serves |
| `WP_MAX_INFLIGHT` | `3` | global cap on concurrent live WordPress requests |
| `WP_TAXONOMY_REVALIDATE` | `3600` | cache TTL for category/media reads (posts and products stay at 300 s) |

On Vercel set: `NEXT_PUBLIC_SITE_URL`, `REVALIDATE_SECRET`, `WP_BASE_URL` (if the
canonical host differs), and leave `LEAD_MODE` unset.

## Rendering model

The animation system never hides content from the first paint. Above-the-fold
reveals are CSS keyframe animations (`reveal-mount-*`) that start on the first
frame; scroll reveals and photo curtains render **visible** and a
`useLayoutEffect` arms the hidden state only for elements already off screen,
with an IntersectionObserver releasing them as they enter. `prefers-reduced-motion`
skips both, and a `priority` image is emitted with no filter or opacity class at
all (a `blur(0)` transition would put the LCP image on a filtered layer).

Measured on the production build, simulated mobile (the host gives ±5 points
between runs, so these are best-of-two): home 84 (AR) / 84 (EN), `/blogs` 84,
`/offers` 83, a journal detail 81-85, `/privacy` 89 — SEO 100
everywhere, accessibility 96 on home and 100 elsewhere, CLS ≤ 0.015. The LCP
phase left on these pages is render delay from main-thread work (React hydration
plus the framer-motion bundle, 230 KiB + 223 KiB chunks), which is only removable
by dropping the approved animation system. Desktop preset: performance 99, LCP 0.91 s. Full breakdown in `docs/api/DECISIONS.md`.

## Reading material

- `docs/inventory.md` — every UI field → its source (`WP:<endpoint>` or `STATIC`),
  including what was cut from the shortened home.
- `docs/api/DECISIONS.md` — endpoint probes and the decisions they forced.
- `docs/api/probe/` — raw probe responses from the discovery phase.

## Stack

Next.js 16 App Router (Turbopack) · React 19 · TypeScript · Tailwind v4 ·
Framer Motion · lucide-react · cheerio + sanitize-html for WP HTML.
