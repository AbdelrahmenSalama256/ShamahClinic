# OPEN-QUESTIONS — Shamah CMS

Log here anything that blocks a row and needs a decision (real copy, prices, photos, credentials, legal wording, schema calls). A question is removed only when answered or when the row it blocks is explicitly deferred.

## How to use
- One entry per question, with the row id it blocks.
- State the options and which one is the owner's call.
- Do not guess; do not invent copy, prices, or legal wording.
- When answered, move the answer into `docs/PROGRESS.md` as evidence on the row and strike the entry here.

════════════════════════════════
OPEN QUESTIONS
════════════════════════════════

| id | row blocked | question | options / owner's call | status |
|----|-------------|----------|------------------------|--------|
| Q-1 | BK-6.3c-c | `categories` table has no `taxonomy` column; the snapshot already holds a post category `laser` (WP term 63) and a product category `laser` (WooCommerce term 15). Importing both into one table is a duplicate key. | (a) Add `taxonomy` column and move the index to `(slug, taxonomy)`; (b) how an offer references a term (column vs join table); (c) whether a category's count is stored or computed | Open — schema decision is the owner's; do not invent |
| Q-2 | BK-15.1 | Per-entity SEO fields (title, description, canonical, robots, OG, Twitter, focus keyword, breadcrumb label, noindex default for drafts). | Table `seo_meta` per entity per locale; columns to be decided before 15.1 | Open — schema decision |
| Q-3 | BK-17.4 | Apps Script deliverable: no Google credentials or shared secret were provided. | Console holds only URL + secret; no token supplied yet | Open — credentials needed |
| Q-4 | BK-14.3 / 14.4 | Real copy for home sections and per-page prose (hero text, "View all" labels, reasons carousel, CTA band, about/contact/faq text). | Owner-supplied copy needed; placeholders are not acceptable on a live brand | Open — copy needed |
| Q-5 | BK-15.3 / 15.4 | Structured data: which schema.org types the clinic actually needs (MedicalClinic, Physician, MedicalService, Article, Product/Offer, FAQPage, BreadcrumbList, AggregateRating). | Owner to confirm the set | Open — owner's call |
| Q-6 | BK-17 | Google Sheets column contract: exact header row, allowed values per column, per-locale handling. | To be written in `docs/GOOGLE-SHEETS.md` and on the Connectors screen | Open |
| Q-7 | S3 (offers→services) | Does the clinic want single-service as the simple default while keeping multi-service support? | Single-service default + multi-service retained in model | Tentative — confirm with owner |
| Q-8 | S2 (before/after results) | Are there real before/after photos to import, or does every result start empty? | Snapshot holds zero before/after pairs (PROGRESS R1); importing rows lands both slots empty | Open — do not dress stock photography as patient results |

## ANSWERED (moved to PROGRESS.md evidence)
- None yet in this session.
