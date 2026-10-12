import type { ServiceCard } from "./types";
import { getServiceCards } from "./index";
import { toPhotoSlot } from "./ui-helpers";
import { arabicRatio } from "./lang";
import { treatmentsData, type Treatment } from "@/data/treatments";

/**
 * The service cards WordPress publishes (pages/696) are the naming authority:
 * where a WordPress section matches a treatment on our side, its real title,
 * intro and section photo replace ours. Everything WordPress does not publish
 * (session counts, steps, aftercare, prices) stays authored in
 * `src/data/treatments.ts` and is listed as STATIC in docs/inventory.md.
 *
 * Seven sections are published; five name a treatment we author. The remaining
 * two (`glow-brightening-injections`, `mens-aesthetic-services`) have no row to
 * override — WordPress publishes only their title, intro and photo, and page 696
 * is the only services page in `/wp/v2/pages` besides 885 (botox), so there is no
 * body to render as a detail page. They stay available through `/api/v1/services`.
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

export async function getMergedTreatments(): Promise<Treatment[]> {
  let cards: ServiceCard[] = [];
  try {
    cards = await getServiceCards();
  } catch {
    cards = [];
  }
  if (!cards.length) return treatmentsData;
  return treatmentsData.map((treatment) => {
    const card = matchCard(treatment, cards);
    if (!card) return treatment;
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
}

export async function getMergedTreatment(slug: string): Promise<Treatment | null> {
  const all = await getMergedTreatments();
  return all.find((t) => t.id === slug) || null;
}
