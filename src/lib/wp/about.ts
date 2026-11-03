import * as cheerio from "cheerio";
// The page and the homepage rows it borrows both come from the site's read path, so
// /about never pairs a database page with a snapshot body (or the other way round).
import { getHomeProseSections, getPage } from "../content/site";
import { arabicRatio } from "./lang";
import { toPhotoSlot } from "./ui-helpers";
import { aboutFallback, type AboutContent, type AboutSection } from "@/data/about";
import type { Bi } from "./types";
import type { AboutStructuredData } from "@/data/about";
import type { PublicRow } from "../content/published";

/** A CMS page row with the structured `data` JSON column read off the values map. */
type AboutPageRow = PublicRow & {
  values: Record<string, unknown> & { data?: unknown; pub_data?: unknown };
};

/**
 * About = WordPress page 32. The dashboard publishes a real bilingual page there
 * (intro paragraph, "The Story" + paragraph, "The Process" + five `<br>`-separated
 * lines + photo), and the Arabic subsite serves genuine Arabic for this page, so
 * both languages come from WordPress. The authored copy in `src/data/about.ts`
 * only stands in when neither the live site nor the snapshot answers.
 */

interface ParsedBlock {
  intro: string[];
  sections: Array<{ heading: string; paragraphs: string[]; image: string | null }>;
}

const clean = (value: string): string => value.replace(/\s+/g, " ").trim();
const stripTags = (value: string): string => value.replace(/<[^>]*>/g, " ");

/** Parse a stored JSON scalar; `null` on any failure so a bad row never breaks the page. */
function tryParseJson(raw: unknown): unknown | null {
  if (typeof raw === "object" && raw !== null) {
    try {
      return JSON.parse(JSON.stringify(raw));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Walk a rendered WPBakery body in document order. Paragraphs before the first
 * heading are the page intro; each heading opens a section whose copy is the
 * text in the same row — `<p>` elements when the editor used them, otherwise the
 * loose lines the client typed between `<br>` tags.
 */
export function parseAboutBody(html: string): ParsedBlock {
  const $ = cheerio.load(html || "<div></div>");
  const intro: string[] = [];
  const sections: ParsedBlock["sections"] = [];

  $("h2, h3, p").each((_, node) => {
    const el = $(node);
    if (node.tagName === "p") {
      // Only the pre-heading copy is collected here; section bodies come from the
      // heading walk below, so a paragraph is never counted twice.
      if (sections.length) return;
      const text = clean(el.text());
      if (text) intro.push(text);
      return;
    }

    const heading = clean(el.text());
    if (!heading) return;
    const row = el.closest(".row").length ? el.closest(".row") : el.parent().parent();
    const clone = row.clone();
    clone.find("h1, h2, h3, h4, .ws-separator, .ws-footer-separator").remove();
    const paragraphs = clone
      .find("p")
      .toArray()
      .map((p) => clean($(p).text()))
      .filter(Boolean);
    const loose = paragraphs.length
      ? []
      : (clone.html() || "")
          .split(/<br\s*\/?>/i)
          .map((chunk) => clean(stripTags(chunk)))
          .filter(Boolean);
    const image = clone.find("img").first().attr("src") || null;
    sections.push({ heading, paragraphs: [...paragraphs, ...loose], image });
  });

  return { intro, sections };
}

/** Arabic only when WordPress actually wrote Arabic, else the fallback copy. */
const arOr = (ar: string, en: string, authored: string | undefined): string => {
  if (arabicRatio(ar) > 0.3) return ar;
  return authored && arabicRatio(authored) > 0.3 ? authored : en;
};

function merge(en: ParsedBlock, ar: ParsedBlock): Pick<AboutContent, "lead" | "sections"> {
  const fallback = aboutFallback;
  const sectionCount = Math.max(en.sections.length, fallback.sections.length);
  const sections: AboutSection[] = [];
  for (let i = 0; i < sectionCount; i += 1) {
    const source = en.sections[i];
    if (!source) {
      const authored = fallback.sections[i];
      if (authored) sections.push(authored);
      continue;
    }
    const partner = ar.sections[i];
    const authored = fallback.sections[i];
    const heading = {
      ar: arOr(partner?.heading || "", source.heading, authored?.heading.ar),
      en: source.heading,
    };
    const paragraphCount = Math.max(source.paragraphs.length, authored?.paragraphs.length || 0);
    const paragraphs: Bi[] = [];
    for (let p = 0; p < paragraphCount; p += 1) {
      const text = source.paragraphs[p];
      if (!text) continue;
      paragraphs.push({
        ar: arOr(partner?.paragraphs[p] || "", text, authored?.paragraphs[p]?.ar),
        en: text,
      });
    }
    const image = source.image ? toPhotoSlot(source.image, heading) : (authored?.image ?? null);
    sections.push({ heading, paragraphs, image });
  }

  const introEn = en.intro[0] || fallback.lead.en;
  const introAr = arOr(ar.intro[0] || "", introEn, fallback.lead.ar);
  return {
    lead: { ar: introAr, en: introEn },
    sections,
  };
}

export async function getAbout(): Promise<AboutContent> {
  let page: Awaited<ReturnType<typeof getPage>> = null;
  let prose: Awaited<ReturnType<typeof getHomeProseSections>> = [];
  try {
    [page, prose] = await Promise.all([getPage("about"), getHomeProseSections()]);
  } catch {
    page = null;
  }
  const extra = homeProseSections(prose);
  if (page) {
    const en = parseAboutBody(page.item.html.en);
    const ar = parseAboutBody(page.item.html.ar);
    if (en.sections.length || en.intro.length) {
      const aboutRow = page as unknown as AboutPageRow;
      const raw = aboutRow.values.data ?? aboutRow.values.pub_data ?? null;
      const structured = raw ? (tryParseJson(raw) as AboutStructuredData | null) : null;

      const { lead, sections } = merge(en, ar);
      return {
        title: {
          ar: page.item.title.ar || aboutFallback.title.ar,
          en: page.item.title.en || aboutFallback.title.en,
        },
        lead,
        sections: [...sections, ...extra],
        structured,
      };
    }
  }
  return { ...aboutFallback, sections: [...aboutFallback.sections, ...extra], structured: null };
}

/**
 * The homepage rows the About page carries (see `getHomeProseSections`). A row's
 * Arabic heading is empty while the subsite leaves that row in English, so the
 * English one stands in rather than rendering a headingless section.
 */
function homeProseSections(
  prose: Awaited<ReturnType<typeof getHomeProseSections>>,
): AboutSection[] {
  return prose.map((block) => {
    const heading: Bi = {
      ar: block.heading.ar || block.heading.en,
      en: block.heading.en || block.heading.ar,
    };
    return {
      heading,
      paragraphs: block.paragraphs
        .filter((paragraph) => paragraph.en || paragraph.ar)
        .map((paragraph) => ({
          ar: paragraph.ar || paragraph.en,
          en: paragraph.en || paragraph.ar,
        })),
      image: block.image ? toPhotoSlot(block.image, heading) : null,
    };
  });
}
