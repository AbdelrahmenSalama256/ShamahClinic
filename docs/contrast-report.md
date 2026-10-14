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
| Surfaces | every page, and the booking modal opened on `/services/laser-hair-removal` (the densest form surface on the site) |
| Themes × languages | light + dark × ar + en |
| States | default, `:hover`, `:focus-visible`, `:disabled` |
| Thresholds | 4.5:1 body text · 3:1 large text, icons, control borders, focus rings |
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

**Root cause of the white-on-white WhatsApp button.** All 40 landed on one surface: the dark
booking card opened from `/services/laser-hair-removal`, measured as ink `rgb(255 255 255)` on
background `rgb(255 255 255)` — ratio 1.00. The card is dark in both themes, and the button's
solid variant asked for `text-white` on a fill that came from `bg-gold-gradient`'s light stop, so
nothing inverted it: white ink, white paper. The same literal ink was behind the sibling
findings on that card (`احجزي موعدك`, `واتساب`, the branch rows). It was not a token holding the
wrong value — the component never asked the theme anything. Fixed by giving every button family
its own `<bg, fg, border>` triple per theme (`--btn-wa-solid-*`, `--btn-wa-outline-*`,
`--btn-wa-on-dark-*`, `--btn-gold-fg`) in `27afab6`, and by making each control state the surface
it sits on (`80be744`, `684f7bb`) instead of borrowing white or black from Tailwind.

The baseline also carried `يبدأ من ٣٢٠٠ ج.م` / `From 3200 EGP` as two of its invisible findings
(`rgb(133 100 15)` on `rgb(139 105 20)`); that text no longer exists on the site — see
`docs/UNVERIFIED-FACTS.md`, Task G — so those rows left with the content, not with a colour change.

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

All 594 remaining items are `REVIEW`, not `FAIL`: each one is text whose background is a
photograph, which arithmetic cannot resolve. They split three ways.

| Count | What it is | How it was settled |
|---:|---|---|
| 416 | a photo sits somewhere in the ancestry, but every composited background candidate still clears its threshold (most read 12:1–17:1) | no action: the number is already passing, the flag only says the runner will not certify pixels |
| 154 | the photo is the only background the runner can see, so no ratio is computed (`n/a`); these are the hero and CTA bands, where the design puts a themed scrim in front | read in `docs/screenshots/after-home-*-390.png`, `after-services-*-1440.png`, `after-contact-*` — the ink lands on the dark, low-detail side of each frame |
| 24 | text over a photo whose measured candidate fell under its threshold: the Home branch cards' `فرع ١` pill and title (ar + en, light) and the four `/about` photo panels' subtitle and outline link | read at 2× crops of the shipped build |

The 24 resolve into three honest statements, each checked against a 2× / 3× crop of the shipped
build rather than against the tool's guess:

- The `/about` panel links (`تعرّفي عليهن`, `اختاري الفرع`, `Meet them`, `Choose a branch`) are
  dark-gold ink on a light pill or over a light photo. The runner's 2.42:1 candidate composites the
  panel's translucent fill against the brightest stop of the gradient; what a reader sees is closer
  to 5:1. No action.
- The Home branch band (`فرع ١` … `فرع ٣` and the branch name under it, ar + en) is white ink on a
  photo whose own pixels are pale — `shamaclinics3/4/5.webp` are bright, overexposed interiors — and
  the band's bottom gradient is only `from-black/70 via-black/20`, so at the title's baseline the
  scrim is thin. The `drop-shadow-md` carries it: legible at 1440, marginal at 390. The measurement
  is recorded here as the design's weakest text; the scrim strength itself is the visual design's,
  which this brief does not restyle.
- The `/about` panel subtitles (`استشاريات وأخصائيات يُقدن كل قسم بأنفسهن.`,
  `مدينة نصر، التجمع الخامس، والشيخ زايد`) are the same family: light ink, bright photo, bottom
  gradient not yet at its darkest where the line sits.

No item in the after run is a wrapper anchor hiding an unread colour: where an inherited colour
really was near-black on near-black, the component was fixed (`04fc224`) instead of the rule being
relaxed, so the same strictness still applies to everything else. Disabled controls — which WCAG
1.4.3 excludes from contrast — measured none on this build, so the exempt column is honestly zero.

## Screenshots

`docs/screenshots/` holds both runs, named `<label>-<route>-<lang>-<theme>-<width>.png`
(`after-does-not-exist-ar-light-390.png`, `baseline----en-dark-1440.png` for the home page).
390×844 and 1440×900, both themes, both languages, every route in the table above, plus the
booking modal. The directory is gitignored: 112 PNGs per run, ~120 MB, regenerated by
`node scripts/audit-contrast.mjs http://127.0.0.1:3100 --label=after`.

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
