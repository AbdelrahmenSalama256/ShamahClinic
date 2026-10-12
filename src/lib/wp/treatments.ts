import type { ServiceCard } from "./types";
import { getServiceCards } from "./index";
import { treatmentsData, type Treatment } from "@/data/treatments";

/**
 * The service cards WordPress publishes (pages/696) are the naming authority:
 * where a WordPress section matches a treatment on our side, its real title and
 * intro replace ours. Everything WordPress does not publish (session counts,
 * aftercare, prices, photography) stays authored in `src/data/treatments.ts`
 * and is listed as STATIC in docs/inventory.md.
 */

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

/** Match a WordPress section to an authored treatment by slug, then by title. */
function matchCard(treatment: Treatment, cards: ServiceCard[]): ServiceCard | undefined {
  const bySlug = cards.find((c) => c.slug === treatment.id);
  if (bySlug) return bySlug;
  const target = normalize(treatment.name.en);
  return cards.find((c) => {
    const card = normalize(c.title.en);
    return card === target || card.includes(target) || target.includes(card);
  });
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
    return {
      ...treatment,
      name: { ar: card.title.ar || treatment.name.ar, en: card.title.en || treatment.name.en },
      tagline: {
        ar: firstSentence(card.intro.ar) || treatment.tagline.ar,
        en: firstSentence(card.intro.en) || treatment.tagline.en,
      },
    };
  });
}

export async function getMergedTreatment(slug: string): Promise<Treatment | null> {
  const all = await getMergedTreatments();
  return all.find((t) => t.id === slug) || null;
}
