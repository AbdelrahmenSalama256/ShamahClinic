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
| Q-9 | AB-2 | Which spelling is the brand? The seeded About row says «شامه», because that is what the rest of the site says; the WordPress import writes «شامة» in page 32's own body. | (a) keep the site's spelling and correct the import when its row is retired; (b) re-seed every row to the other form — a brand-wide text change, and the owner's call | Open — the seed followed the site, not the import |
| Q-10 | AB-2 | The numbers block ships empty (`numbers: []`, both headings empty). The page already counts branches and services and takes the 100% staff figure from the row; what real fourth number may be printed, and who signs off on a patient or session count? | (a) leave the block empty until the owner types a number into `/console/pages/about`; (b) invent a figure — refused | Open — copy/claims needed. The field is not dead: `+ Add row` writes rows the page renders |
| Q-11 | AB-2 | Two rows answer one URL. `/about` on the site is the seeded row; `GET /api/v1/pages/about` still returns the imported WordPress row (id 32 — lorem-ipsum English title, WPBakery body hotlinking `/wp/*.webp`), and the list endpoint now shows both. | (a) overwrite id 32 with the document and retire `/about`; (b) delete id 32; (c) leave the compat API alone until its consumers move | Open — deleting or rewriting an imported row is the owner's call, so nothing here touched id 32 |
| Q-12 | AB-2 (gates) | `tests/delivery.test.ts` cannot be used as a gate while two processes share `shamah_cms_test`: it failed 4 of 13 and then 3 of 13 on repeat isolated runs while another suite ran elsewhere, and passes 13/13 when the database is quiet. The single `integrations` row per kind is written by more than one suite and `drainOutbox()` drains the whole table. | (a) a cross-process lock in `tests/setup-env.ts` (`GET_LOCK`); (b) a per-run connector row; (c) leave it and read the suite only on a quiet database | Open — (a) touches every suite, so it is not a change to bundle into a content row |
| Q-13 | housekeeping | Dev `pages` holds `/about-test` and `/about-test2` residue from earlier probes, and the repo root holds a `nul` file (a Windows `> nul` accident, untracked). Both look like content to the next audit. | Delete the two rows and the file — both are dev-side, and `nul` is a reserved device name, so it takes a path form a plain `rm` cannot use | Open — not deleted here, because deleting what another session created is not this row's business |

## ANSWERED (moved to PROGRESS.md evidence)
- None yet in this session.
