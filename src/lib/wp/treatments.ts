import { cache } from "react";
import type { ServiceCard } from "./types";
// Both inputs of the merge come from the site's read path, so a treatment page can
// never pair a database page with a snapshot service list.
import { getPage, getServiceCards, getSourceServiceCards } from "../content/site";
import { htmlToText, sanitizeHtmlBody } from "./sanitize";
import { toPhotoSlot } from "./ui-helpers";
import { arabicRatio } from "./lang";
import { treatmentsData, type Treatment } from "@/data/treatments";
import { featuredServiceSlugs } from "@/config/home";
import { hasPublished, publicRows } from "../content/published";
import { serviceDocOf, treatmentOfDoc } from "../content/list-docs";
import { serviceOfDoc, type ServiceContent } from "../content/service-doc";

/**
 * The service cards WordPress publishes (pages/696) are the naming authority:
 * every one of them reaches the site. Where a WordPress section matches a
 * treatment we author, its real title, intro and section photo replace ours.
 * Where it does not (`glow-brightening-injections`, `mens-aesthetic-services`),
 * the section is appended as its own card and detail page carrying exactly what
 * the dashboard gives — title, intro paragraph and photo. Nothing is invented to
 * fill the rest, and the UI renders no block for a field WordPress has no value
 * for. Everything WordPress does not publish (session counts, steps, aftercare,
 * prices) stays authored in `src/data/treatments.ts` and is listed as STATIC in
 * docs/inventory.md.
 */

// The dashboard's section slugs are not our treatment ids, and title similarity
// alone misses them ("Filler Injections" vs "Dermal Fillers"). Identity here is a
// naming decision the data team already made on page 696, so it is stated
// explicitly instead of guessed from text.
const SECTION_SLUG: Record<string, string> = {
  "laser-hair-removal": "laser-hair-removal",
  "skincare-deep-cleansing": "skincare",
  botox: "botox-injections",
  fillers: "filler-injections",
  "chemical-peel": "chemical-peeling",
};

const firstSentence = (text: string, max = 150): string => {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("؛ "), cut.lastIndexOf(". "));
  return (stop > 40 ? cut.slice(0, stop + 1) : cut.replace(/[^ ]*$/, "")).trim();
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[&\/–—-]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Match a WordPress section to an authored treatment: alias, slug, then title. */
function matchCard(treatment: Treatment, cards: ServiceCard[]): ServiceCard | undefined {
  const alias = SECTION_SLUG[treatment.id];
  const byAlias = alias ? cards.find((c) => c.slug === alias) : undefined;
  if (byAlias) return byAlias;
  const bySlug = cards.find((c) => c.slug === treatment.id);
  if (bySlug) return bySlug;
  const target = normalize(treatment.name.en);
  return cards.find((c) => {
    const card = normalize(c.title.en);
    return card === target || card.includes(target) || target.includes(card);
  });
}

/**
 * TranslatePress serves the Arabic subsite's REST body in English until the block
 * is translated (page 696 sections 1 and 3 are untouched). Arabic fields therefore
 * use the WordPress value only when it is actually Arabic; otherwise the authored
 * Arabic stands.
 */
function arValue(value: string, authored: string): string {
  return arabicRatio(value) > 0.3 ? value : authored;
}

/**
 * A WordPress section we have no authored row for: the card is built from the
 * three fields page 696 gives (title, intro, photo) and every other field is
 * left empty, which the detail and list UIs render as no block at all.
 */
function fromServiceCard(card: ServiceCard): Treatment {
  const name = { ar: card.title.ar || card.title.en, en: card.title.en || card.title.ar };
  const intro = {
    ar: card.intro.ar || card.intro.en,
    en: card.intro.en || card.intro.ar,
  };
  return {
    id: card.slug,
    category: null,
    categoryName: { ar: "", en: "" },
    name,
    tagline: {
      ar: firstSentence(intro.ar),
      en: firstSentence(intro.en),
    },
    description: intro,
    benefits: { ar: [], en: [] },
    steps: { ar: [], en: [] },
    aftercare: { ar: [], en: [] },
    idealFor: { ar: "", en: "" },
    duration: { ar: "", en: "" },
    sessionsRecommended: { ar: "", en: "" },
    priceStartingAt: null,
    // The section's own WPBakery image, with the section title as its alt —
    // which is all the dashboard provides.
    image: toPhotoSlot(card.image, name),
  };
}

/**
 * The services the console edits, when that list has been published.
 *
 * This is the same rung rule the rest of the site uses: a list is served wholly from
 * the database or wholly from the snapshot, never half of each. The import that fills
 * it (`npm run db:import-lists`) reads the snapshot's own cards, so the first database
 * answer is the seven services the page already showed.
 *
 * The rows are read once per render and returned as the documents their authors wrote,
 * because two readers need the same rows: `treatmentOfDoc`, which gives the cards, the
 * booking pickers and the home band the fourteen fields they have always drawn, and
 * `serviceOfDoc`, which gives the detail page every field the console added since. One
 * read is what keeps those two from disagreeing about which rows are enabled.
 */
const serviceRecords = cache(
  async (): Promise<{ key: string; doc: Record<string, unknown> }[] | null> => {
    try {
      if (!(await hasPublished('list_item', { listKey: 'services' }))) return null;
      const rows = await publicRows('list_item', { listKey: 'services' });
      const records = rows
        .filter((row) => {
          const enabled = row.values.enabled;
          return enabled?.kind === 'flag' && enabled.value;
        })
        .map((row) => {
          const data = row.values.data;
          if (!data || data.kind !== 'json' || data.value === null || typeof data.value !== 'object') return null;
          return { key: row.key, doc: data.value as Record<string, unknown> };
        })
        .filter((record): record is { key: string; doc: Record<string, unknown> } => record !== null);
      return records.length ? records : null;
    } catch {
      return null;
    }
  },
);

async function treatmentsFromDb(): Promise<Treatment[] | null> {
  const records = await serviceRecords();
  if (!records) return null;
  const list = records
    .map(({ key, doc }) => treatmentOfDoc(doc, key))
    .filter((treatment): treatment is Treatment => treatment !== null);
  return list.length ? list : null;
}

/**
 * The same rows as the typed service document, or null when the list is not in the database.
 *
 * A row with no name is skipped here for the same reason the list itself refuses to publish it,
 * and nothing else is dropped: every field the row does not hold simply comes back empty, which
 * is what the page draws no heading for.
 */
async function contentsFromDb(): Promise<ServiceContent[] | null> {
  const records = await serviceRecords();
  if (!records) return null;
  const list = records
    .map(({ key, doc }) => serviceOfDoc(doc, key))
    .filter((content): content is ServiceContent => content !== null);
  return list.length ? list : null;
}

export const getMergedTreatments = cache(async function getMergedTreatments(): Promise<Treatment[]> {
  return (await treatmentsFromDb()) ?? [];
});

/**
 * Every service page's typed content, from whichever rung answers the list.
 *
 * The snapshot rung converts the authored card through the document the import writes it from,
 * so one service answers the same way whichever rung serves it — and the relations a snapshot
 * card cannot carry (offers, questions, the team) stay empty rather than gaining a guess.
 */
export const getMergedServices = cache(async function getMergedServices(): Promise<ServiceContent[]> {
  return (await contentsFromDb()) ?? [];
});

/**
 * The snapshot's service cards merged with the authored rows, without asking the
 * database. The list import reads this: a services list holding one saved row would
 * otherwise answer with that row alone and the import would copy itself instead of
 * filling the list from the site.
 */
export async function treatmentsFromSite(): Promise<Treatment[]> {
  let cards: ServiceCard[] = [];
  try {
    cards = await getSourceServiceCards();
  } catch {
    cards = [];
  }
  if (!cards.length) return treatmentsData;
  const matched = new Set<string>();
  const merged = treatmentsData.map((treatment) => {
    const card = matchCard(treatment, cards);
    if (!card) return treatment;
    matched.add(card.slug);
    const name = {
      ar: arValue(card.title.ar, treatment.name.ar),
      en: card.title.en || treatment.name.en,
    };
    return {
      ...treatment,
      name,
      tagline: {
        ar: firstSentence(arValue(card.intro.ar, treatment.tagline.ar)) || treatment.tagline.ar,
        en: firstSentence(card.intro.en) || treatment.tagline.en,
      },
      // The section's own WPBakery image replaces the stock photo when the
      // dashboard has one; the alt is the section title, which is all WP gives.
      image: card.image ? toPhotoSlot(card.image, name) : treatment.image,
    };
  });
  return [...merged, ...cards.filter((card) => !matched.has(card.slug)).map(fromServiceCard)];
}

/**
 * The three services Home shows. The order is WordPress's own: the position of
 * each service among page 696's sections, so the clinic's dashboard decides what
 * leads. A service only qualifies when its card has both a photo and an intro to
 * render, near-duplicate names are not repeated, and services we author but the
 * dashboard does not list come last. `featuredServiceSlugs` pins the list instead.
 * The rule is written up in docs/HOME-PRIORITY.md.
 */
export async function getFeaturedServices(limit = 3): Promise<Treatment[]> {
  let cards: ServiceCard[] = [];
  try {
    cards = await getServiceCards();
  } catch {
    cards = [];
  }
  const all = await getMergedTreatments();
  const byId = new Map(all.map((treatment) => [treatment.id, treatment]));

  const pinned = featuredServiceSlugs
    .map((id) => byId.get(id))
    .filter((treatment): treatment is Treatment => !!treatment);
  if (pinned.length >= limit) return pinned.slice(0, limit);

  const rank = new Map<string, number>();
  cards.forEach((card, i) => rank.set(card.slug, i));
  const renders = (treatment: Treatment): boolean =>
    !!treatment.image.src && !!(treatment.tagline.en || treatment.tagline.ar);
  const ordered = all
    .filter(renders)
    .sort(
      (a, b) =>
        (rank.get(SECTION_SLUG[a.id] || a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(SECTION_SLUG[b.id] || b.id) ?? Number.MAX_SAFE_INTEGER),
    );

  const picked = pinned.length ? [...pinned] : [];
  const taken = new Set(picked.map((treatment) => treatment.id));
  for (const treatment of ordered) {
    if (picked.length >= limit) break;
    if (taken.has(treatment.id)) continue;
    // The dashboard lists "Skincare" and a facial under another name; a card whose
    // English name is contained in one already picked is the same service twice.
    const name = normalize(treatment.name.en);
    if (picked.some((other) => normalize(other.name.en).includes(name) || name.includes(normalize(other.name.en))))
      continue;
    picked.push(treatment);
    taken.add(treatment.id);
  }
  return picked;
}

/**
 * The long-form page the dashboard publishes for this section, when it made one.
 *
 * WordPress gives a section its own page only when the data team creates one: page 885
 * (`botox-injections`) is the treatment page in `/wp/v2/pages` today, so the botox detail
 * shows the dashboard's long-form body and the others keep the authored description. A
 * card that came from WordPress alone is looked up under its own section slug, so a page
 * the team publishes later is used with no code change.
 */
async function snapshotBody(pageSlug: string): Promise<{ ar: string; en: string } | null> {
  let html: { ar: string; en: string } | null = null;
  try {
    html = (await getPage(pageSlug))?.item.html ?? null;
  } catch {
    html = null;
  }
  if (!html?.en) return null;
  // The Arabic subsite stores 885 in English (its REST body has no Arabic characters at
  // all), so Arabic keeps showing the authored description rather than an untranslated
  // block. Recorded in docs/WIRING.md.
  return { ar: arabicRatio(htmlToText(html.ar)) > 0.3 ? html.ar : "", en: html.en };
}

/** The dashboard page a service's long-form body would live under. */
const bodyPageOf = (key: string): string => SECTION_SLUG[key] || key;

export const getMergedTreatment = cache(async function getMergedTreatment(slug: string): Promise<Treatment | null> {
  const all = await getMergedTreatments();
  const treatment = all.find((t) => t.id === slug);
  if (!treatment) return null;
  // A database service carries its long-form body itself, so an edit is not overwritten
  // by the snapshot the import first copied it from.
  if (treatment.body?.en || treatment.body?.ar) return treatment;

  const body = await snapshotBody(bodyPageOf(treatment.id));
  return body ? { ...treatment, body } : treatment;
});

/**
 * The last two doors every service page passes through, whichever rung wrote it.
 *
 * The two fields printed as markup — the full description and the extra body — are filtered
 * here on the way out, which is the second door `../content/rich.ts` describes: a save is
 * filtered going in, and a render is filtered going out, so a row restored from a dump
 * cannot print what the console would have refused. A row that carries no long-form body of
 * its own is offered the dashboard's, which is the one thing the snapshot still adds to a
 * page. The preview reads a draft through the same pair, so what an owner sees is what
 * publishing that row would serve.
 */
async function withPublishedBody(content: ServiceContent): Promise<ServiceContent> {
  const body = content.body.ar || content.body.en ? content.body : ((await snapshotBody(bodyPageOf(content.key))) ?? content.body);
  return {
    ...content,
    description: { ar: sanitizeHtmlBody(content.description.ar), en: sanitizeHtmlBody(content.description.en) },
    body: { ar: sanitizeHtmlBody(body.ar), en: sanitizeHtmlBody(body.en) },
  };
}

/**
 * One service page as its author wrote it, with the dashboard's long-form body filled in
 * when the row holds none of its own.
 *
 * This is what the public detail reads: every field the console edits, plus the relations
 * `./service-page.ts` resolves onto it. `getMergedTreatment` stays the card-shaped reader
 * the listing, the home band and the booking pickers use.
 */
export const getMergedService = cache(async function getMergedService(slug: string): Promise<ServiceContent | null> {
  const content = (await getMergedServices()).find((c) => c.key === slug);
  if (!content) return null;
  return withPublishedBody(content);
});

/**
 * One unsaved document, read as the page that document would publish.
 *
 * `key` is the row's own key, not a slug the caller guessed: the page links its related
 * services by key and leaves the row out of its own strip by the same key, so a preview
 * handed a different key would draw a different page.
 */
export async function serviceDraftOfDoc(doc: Record<string, unknown>, key: string): Promise<ServiceContent | null> {
  const content = serviceOfDoc(doc, key);
  return content ? withPublishedBody(content) : null;
}

