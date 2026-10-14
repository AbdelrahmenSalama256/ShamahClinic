# Contrast and layout audit — before and after

`scripts/audit-contrast.mjs` drives a real Chromium over the **production build**
(`npm run build --webpack` + `npx next start -p 3100`, never `next dev`) and measures every
rendered colour the way a browser resolves it: each value is painted into a 1×1 canvas, twice —
once over black, once over white — which recovers the alpha a browser refuses to serialise and
turns Tailwind v4's `oklch()` / `color-mix()` into sRGB numbers. An element's background is the
ancestor chain composited in order, gradient stops are sampled individually, and text sitting on a
photograph is reported as needing the screenshot rather than guessed at.

| Covered | Value |
|---|---|
| Routes | `/`, `/services`, `/services/laser-hair-removal`, `/services/botox-injections`, `/offers`, one live offer, `/blogs`, one live post, `/about`, `/branches`, `/contact`, `/faq`, `/results`, `/doctors`, an unknown URL — plus one offer and one post **discovered from each language's own list page**, so Arabic reads `/blogs/slug` and English `/en/blogs/slug` |
| Surfaces | every page, the booking modal opened on `/services/laser-hair-removal` (the densest form surface on the site), and `/contact` with its validation errors rendered |
| Themes × languages | light + dark × ar + en |
| States | default, `:hover`, `:focus-visible`, `:disabled` |
| Thresholds | 4.5:1 body text · 3:1 large text, icons, control borders, focus rings |
| Photo-backed text | always `REVIEW`, never `FAIL`, and scored at 3:1 — the runner will not certify pixels it cannot read, so the screenshot decides (see below) |
| Layout | horizontal scroll at 360, 390 and 768 px |
| Screenshots | 390×844 and 1440×900, both themes, both languages, every route |

`globals.css` puts `transition: all .3s ease-in-out !important` on every element, so a reading
taken right after a hover or focus lands mid-interpolation — the focus ring measures as the UA
default instead of the shipped 2px token. The runner calls `finish()` on every running animation
before each measurement, which is exact where a wait is either too short or far too slow.

## Before

`docs/contrast-report-baseline.md` / `.json` (label `baseline`, screenshots
`docs/screenshots/baseline-*.png`) — the build **before** any of the Task D commits:

| Findings | Failures | Review |
|---:|---:|---:|
| 3346 | 3254 | 92 |

Failure classes, as the runner groups them:

| Count | Class | What it was |
|---:|---|---|
| 1130 | `FAIL: focus ring … below 3:1 or missing` | one unthemed outline (or none) shared by both themes; on a dark panel the cream ring read 1.2:1 |
| 1063 | `FAIL: control border … at N:N` | hairlines tuned for cream, drawn on cream *and* on near-black; a gold border on a gold hover fill vanished |
| 1021 | `FAIL: N:N, needs N:N` | literal `text-white` / `text-black` / `text-gray-*` on surfaces that change with the theme |
| 40 | `FAIL: ink equals its background` | the white-on-white family, below |

The run's 4 layout rows were not sideways scrolling — no route overflowed at 360, 390 or 768 px
then either. They were `/offers/[detail]` and `/blogs/[detail]` for each Arabic theme: the runner
could not reach a detail page at all, because it only accepted a three-segment path and Arabic is
the prefix-less locale. That is the bug `79d658e` fixed.

**Root cause of the white-on-white WhatsApp button.** All 40 `ink equals its background` findings
were measured on one surface: the booking modal opened from `/services/laser-hair-removal`.
38 of them are light-theme readings, and they come in two directions of the same mistake:

| Count | Ink | Background | What the numbers say |
|---:|---|---|---|
| 20 | `rgb(255 255 255)` | `rgb(255 255 255)` | ratio 1.00 — literal `text-white` over a surface the browser composited to pure white: the modal's card was `bg-white` (`BookingModal.tsx:311` at the baseline commit) while its heading, lead, `احجزي موعدك` / `واتساب` controls and branch links carried `text-white`, `text-white/65` and `border-white/25` — the classes that same markup uses on the dark band |
| 16 | `rgb(33 26 22)` | `rgb(25 20 18)` | the other direction: the light theme's own `--text-primary` (#211a16) landing on `--bg-dark` (#191412) — the service rows (`العناية بالبشرة`, `حقن الفيلر`, …, ar + en) |
| 2 | `rgb(133 100 15)` | `rgb(139 105 20)` | `يبدأ من ٣٢٠٠ ج.م` / `From 3200 EGP`: gold ink on the gold fill, light theme |
| 2 | `rgb(201 164 65)` | `rgb(194 158 60)` | the same two price rows, dark theme |

Neither half was a token holding the wrong value. Both were a component pairing an ink with a
surface by eye instead of asking the theme for the pair, so no theme switch could rescue it.
`27afab6` gave every button family its own `<bg, fg, border>` triple per theme
(`--btn-wa-solid-*`, `--btn-wa-outline-*`, `--btn-wa-on-dark-*`, `--btn-gold-fg`), and `80be744` +
`684f7bb` made each control state the surface it actually sits on instead of borrowing white or
black from Tailwind.

The price rows left with the content, not with a colour change: that text no longer exists on the
site — see `docs/UNVERIFIED-FACTS.md`, Task G.

## After

`docs/contrast-report-after.md` / `.json` (label `after`, screenshots
`docs/screenshots/after-*.png`) — the build after `27afab6`, `80be744`, `684f7bb`, `114b930` and
`04fc224`:

| Findings | Failures | Review | Exempt | Layout |
|---:|---:|---:|---:|---:|
| 594 | **0** | 594 | 0 | 0 |

**Zero contrast failures, and no route scrolls sideways at 360, 390 or 768 px.** Every class the
baseline reported is gone from the shipped build; the 594 items left are the ones the runner is
written to refuse rather than guess about, broken down below.

The last two fixes (`04fc224`) came out of this loop rather than ahead of it:

- the 404 destination cards: their children named the on-dark ink, but the `<a>` wrapping them
  inherited the light theme's near-black, so the card's own boundary measured 1.01:1 on a
  near-black panel. The anchor names the ink too now.
- `GoldLink` on hover: the fill turns gold and the border stayed a gold hairline — 1.73:1 in
  light, 1.18:1 in dark, under the 3:1 a control boundary needs. The hover border takes the
  label's ink.

## What the runner refuses to decide, and what the screenshots show

All 594 remaining items are `REVIEW`, not `FAIL`: each one is text with a photograph somewhere in
its paint stack. Once image pixels are in the stack the colours computed beneath them are a guess,
so the runner either reports the scrim it found and no ratio, or a ratio against the last
non-photographic candidate it can still see. It splits three ways.

| Count | What it is | How it was settled |
|---:|---|---|
| 416 | a photo in the ancestry, but every remaining candidate clears its threshold — 4.78:1 at the low end, 14.4:1 median, 17.2:1 best | no action: the number already passes; the flag only says the runner will not certify pixels |
| 154 | the photo is the only background left, so no ratio is computed (`n/a`); 150 of them sit under a 0% scrim and 4 under 60%, and they are all in the hero/CTA bands of `/contact` (68), `/` (52) and `/services/laser-hair-removal` (34) | read in `docs/screenshots/after-home-*-390.png`, `after-contact-*-1440.png`, `after-services-laser-hair-removal-*-1440.png` — the ink lands on the dark, low-detail side of each frame |
| 24 | a numeric candidate under its threshold, all of them light theme, ar + en, and all of them white or light ink on a photo: 4 per language on the Home branch band, 8 per language on the two `/about` teaser panels | read at 2× / 3× crops of the shipped build |

By state the 594 are 390 default, 184 `:focus-visible` and 20 `:hover`; by surface 464 page, 76 the
contact form with errors shown and 54 the booking modal.

Each of the 24 was checked against a crop of the shipped build rather than against the tool's
guess, and the guess is worth stating precisely: for the titles and subtitles the only candidate
left after the photo is discarded is the page's own cream (`rgb(244 236 228)`), so the printed
`1.17` is white ink on cream — a background no reader ever sees — not white ink on the photograph.

- **Home branch band** (the `فرع ١/٢/٣` pills plus the first card's branch name, ar + en): white
  ink on photos whose own pixels are pale — `shamaclinics3/4/5.webp` are bright, overexposed
  interiors. The pill sits at the *top* of the card, where the band's
  `from-black/70 via-black/20 to-transparent` is fully transparent, so its only defence is its own
  `bg-black/40`; the title sits at the bottom over the 70% stop and carries `drop-shadow-md`.
  Legible at 1440, marginal at 390. Recorded here as the design's weakest text; the scrim strength
  is the visual design's, which this brief does not restyle.
- **`/about` teaser panels** (`الفريق الطبي` / `فروعنا` and their subtitles): the same family one
  level deeper — the caption block is `absolute bottom-0 p-7`, so the h3 and the line under it sit
  in the gradient's `via-/30` band while its darkest stop (`from-[var(--bg-dark)]/85`) is the 28 px
  of padding below them. Light ink (`--text-on-dark`, `--text-on-dark-muted`) on a bright interior
  photo, above the point where the scrim finishes tightening.
- **`/about` panel links** (`تعرّفي عليهن`, `اختاري الفرع`, `Meet them`, `Choose a branch`):
  dark-gold ink `rgb(133 100 15)` on the panel's `bg-card/95` pill, which the runner composites to
  `rgb(178 171 164)` — 2.42:1 against the 3:1 a large bold label needs. In the crop the pill reads
  lighter and the label stays legible; no action.

No item in the after run is a wrapper anchor hiding an unread colour: where an inherited colour
really was near-black on near-black, the component was fixed (`04fc224`) instead of the rule being
relaxed, so the same strictness still applies to everything else. Disabled controls — which WCAG
1.4.3 excludes from contrast — measured none on this build, so the exempt column is honestly zero.

## Screenshots

`docs/screenshots/` holds both runs, named `<label>-<route>-<lang>-<theme>-<width>.png`
(`after-does-not-exist-ar-light-390.png`, `baseline-home-en-dark-1440.png` for the home page).
390×844 and 1440×900, both themes, both languages, every route in the table above, plus the
booking modal as its own surface (`after-booking-*-1440.png`, 4 shots). The after run is **140
PNGs** and the baseline **108** — the baseline predates the detail-page fix and the 404 route, so
it never reached the unknown URL, `/services/botox-injections` or the English offer/post slugs, and
it carried a service page the route table later dropped. ~240 MB for both. The directory is
gitignored; regenerate with `node scripts/audit-contrast.mjs http://127.0.0.1:3100 --label=after`.

## What this audit cannot see

- Colour over photography is only as good as the screenshot review above; the runner reports the
  scrim it can measure, never the pixels. The 24 items whose candidate fell under threshold are the
  residual of that limit, and they are listed by name above.
- The booking modal is opened by clicking a button whose label matches `احجزي|Book`, so a card
  that renames that action would silently drop the modal from coverage.
- Screenshots are taken after `load` plus a scroll pass, but a frame captured while Next's blur
  placeholder is still under the real image would read lighter than the finished page; the crops
  used for the 24 items above were re-taken with every image reported painted.
- The audit reads the built site on a local port. With no route to
  `www.shamahclinics.com` the pages render from `data/wp/*.json`, which is what a deploy without
  the origin would serve too — but a field only WordPress can return could in principle carry a
  colour-affecting value this run never saw.
