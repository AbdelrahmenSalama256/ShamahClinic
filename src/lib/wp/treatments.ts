import type { ServiceCard } from "./types";
import { getPage, getServiceCards } from "./index";
import { htmlToText } from "./sanitize";
import { toPhotoSlot } from "./ui-helpers";
import { arabicRatio } from "./lang";
import { treatmentsData, type Treatment } from "@/data/treatments";
import { featuredServiceSlugs } from "@/config/home";

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
const TREATMENT_SECTION_SLUG = Object.fromEntries(
  Object.entries(SECTION_SLUG).map(([sectionSlug, treatmentId]) => [
    treatmentId,
    sectionSlug,
  ]),
);

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
  const alias = TREATMENT_SECTION_SLUG[treatment.id];
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

export async function getMergedTreatments(): Promise<Treatment[]> {
  let cards: ServiceCard[] = [];
  try {
    cards = await getServiceCards();
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

export function getTreatmentSlugs(treatments: Treatment[]): string[] {
  return [
    ...new Set(
      treatments.flatMap((treatment) => [
        treatment.id,
        ...(TREATMENT_SECTION_SLUG[treatment.id]
          ? [TREATMENT_SECTION_SLUG[treatment.id]]
          : []),
      ]),
    ),
  ];
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
        (rank.get(TREATMENT_SECTION_SLUG[a.id] || a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(TREATMENT_SECTION_SLUG[b.id] || b.id) ?? Number.MAX_SAFE_INTEGER),
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

export async function getMergedTreatment(slug: string): Promise<Treatment | null> {
  const all = await getMergedTreatments();
  const treatment = all.find(
    (t) => t.id === slug || SECTION_SLUG[slug] === t.id,
  );
  if (!treatment) return null;

  // WordPress gives a section its own page only when the data team creates one:
  // page 885 (`botox-injections`) is the treatment page in `/wp/v2/pages` today,
  // so the botox detail shows the dashboard's long-form body and the others keep
  // the authored description. A card that came from WordPress alone is looked up
  // under its own section slug, so a page the team publishes later is used with
  // no code change.
  const pageSlug = SECTION_SLUG[treatment.id] || treatment.id;
  let html: { ar: string; en: string } | null = null;
  try {
    html = (await getPage(pageSlug))?.item.html ?? null;
  } catch {
    html = null;
  }
  if (!html?.en) return treatment;
  return {
    ...treatment,
    body: {
      // The Arabic subsite stores 885 in English (its REST body has no Arabic
      // characters at all), so Arabic keeps showing the authored description
      // rather than an untranslated block. Recorded in docs/WIRING.md.
      ar: arabicRatio(htmlToText(html.ar)) > 0.3 ? html.ar : "",
      en: html.en,
    },
  };
}
