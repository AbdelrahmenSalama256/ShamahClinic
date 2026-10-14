# Unverified facts: what was swept, what was removed

Date: 2026-10-14. Task G of the WordPress integration brief: an email address,
daily opening hours and "from X EGP" service prices were authored into the site
before the CMS was wired. Every one of them is now checked against the live site
and removed where the live site says nothing.

## What was searched

| Source | Volume | Email | Opening hours | Service price |
| --- | --- | --- | --- | --- |
| Live homepage HTML (saved copy, `.tmp/live-home.html`, 119,043 bytes) | 1 JSON-LD `<script>`, 6 nodes | 0 `mailto:` in the whole document | no hours pattern, no `مواعيد` / `أوقات العمل` / `opening hours` | — |
| Rank Math `Organization` node | keys are `@type, @id, name, url, sameAs` | no `email`, no `contactPoint` | no `openingHours`, no `openingHoursSpecification` | no `priceRange` |
| `data/wp/posts.ar.json` + `posts.en.json` | 92 posts × 2 languages, full `content.rendered` | 0 | 0 | prices only discussed as "set after examination" (below) |
| `data/wp/pages.ar.json` + `pages.en.json` | 27 pages × 2 languages | 1 hit: `mailto:info@artday.com` on WooCommerce boilerplate — the Artday theme's own demo text, never wired | 0 | shipping-price boilerplate only |
| `data/wp/seo.json` | 4 rows | 0 | 0 | 0 |
| `data/wp/products.*.json` | WooCommerce Store API offers | 0 | 0 | real offer prices — these stay |

## Email — absent everywhere, removed

`info@shamahclinics.com` appeared nowhere in the sources above. It is gone from the
footer, the navbar, the contact page, the privacy page, both branch views and the
`EmailContactPoint`/`email` field of the JSON-LD. The contact page metadata no
longer offers email as a channel; phone and WhatsApp remain, both published by the
site itself (`tel:+201121880908` and a `whatsapp.com/send/?phone=201121880908` link are
in the served homepage HTML, and the three branch numbers `01026788285`,
`01018064881`, `01121880855` appear in it too).

One residue is deliberate: `siteConfig.contact.email` still exists because
`src/lib/wp/index.ts` `getSettings()` returns it on `/api/v1/settings`, and the brief
freezes the `lib/wp` contracts. The address therefore still leaves the server through
that endpoint while no page displays it. Deleting it means changing that contract,
which is a decision for the next round, not something to slip into a UI pass.

## Opening hours — absent everywhere, removed

Nothing on the site states when the clinics open. The two
`openingHoursSpecification` blocks are out of the JSON-LD, and so is every sentence
that claimed "daily 10 am – 10 pm":

| Where it was claimed | What it says now |
| --- | --- |
| `Footer`, `Navbar`, `BranchesClient`, `BranchDetailClient` hours rows | removed from the markup |
| Booking modal, date step | the time is agreed on WhatsApp or by phone after the request |
| FAQ closing card | questions about booking are answered on WhatsApp / phone |
| About, "three branches near you" + values card | branch list and female staffing only |
| Branch data, Sheikh Zayed intro and feature bullet | the mall/service-area facts stay, the "flexible evening hours" line goes |
| Contact / branches / FAQ page descriptions | phone numbers and addresses, no hours |
| Contact form success message | "we will get in touch to confirm the appointment" (the previous text promised a reply "within minutes during working hours") |

## Service prices — the site says the opposite of a posted price

No service post publishes a figure, and two explicitly say the price is decided
after seeing the client:

- post #1125 `italian-exosomes-facial-injections`: "سعر حقن الإكسوزوم يختلف حسب جودة
  المنتج المستخدم وعدد الجلسات التي تحتاجها كل حالة ... ويتم تحديد السعر بدقة بعد
  الفحص المباشر"
- post #1086 `facial-botox-injections`: "أسعار حقن بوتوكس الوجه تختلف حسب كمية
  البوتوكس المطلوبة وعدد المناطق المستهدفة، في شامة كلينك، نقدم تقييمًا شخصيًا لكل
  مريض لتحديد السعر بدقة"

Removed accordingly: the five authored `priceStartingAt` figures (the whole authored
rows in `src/data/treatments.ts` are commented out, so nothing can render them), the
`schema.org/Offers` node built from them, and `priceRange` in the JSON-LD. Two
consequences were cleaned up with them: the `/results` "when do results appear" table
had price and duration columns, so the table is gone from the page along with the
`treatments` prop it consumed, and `/services` plus `faq-10` no longer promise a
"starting from" guide price — they state that the price is set at consultation after
examination, and point at the Offers page for the packages that do carry store prices.

A service card with no price is not a broken card: `TreatmentCard` already renders an
empty slot where the figure would sit and keeps the Details action, which lands on the
service page with its booking button. `scripts/test-missing-fields.mjs` asserts that a
null-price card shows no "يبدأ من" and no zero.

WooCommerce offer prices are real data and stay, including their `Offer` nodes.

## Social links — three published, two wired

The clinic's own `sameAs` array is the only social evidence, and it names exactly
three profiles: `facebook.com/p/Shamah-Clinic-61572435507530`, `tiktok.com/@shamahclinic`,
`instagram.com/shamahclinic` (the same three hrefs appear in the served HTML).
`src/config/site.ts` had invented handles (`facebook.com/shamahclinics`,
`instagram.com/shamahclinics`) and a YouTube channel nothing names; both were replaced
with the published URLs and the YouTube row deleted. TikTok is not in the footer
because `Footer.tsx` draws only a facebook and an instagram glyph, and adding a third
icon is a design change rather than a data fix — it is available to wire if the design
gets the room.

## Limits of this sweep

- The three social profile pages were not fetched: what is verified is that the
  clinic's own structured data and footer publish those addresses, not what is on them.
- A live re-fetch during this pass timed out (Cloudflare), so the JSON-LD evidence above
  is read from the saved homepage copy taken by `scripts/wp-sweep.mjs`, not from a fresh
  request.
- The authored branch intros, landmarks and feature lists in `src/data/branches.ts` are
  still marketing copy that WordPress does not carry; only their hours claims were
  removed here.
