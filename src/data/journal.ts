import type { PhotoSlot } from "@/lib/images";

export interface JournalSection {
  heading?: { ar: string; en: string };
  paragraphs: { ar: string[]; en: string[] };
  bullets?: { ar: string[]; en: string[] };
}

export interface Article {
  slug: string;
  title: { ar: string; en: string };
  excerpt: { ar: string; en: string };
  authorId: string;
  date: { ar: string; en: string };
  isoDate: string;
  /** WordPress modified date, when the article came from the dashboard. */
  modifiedIso?: string;
  readMinutes?: number;
  image: PhotoSlot;
  tags: { ar: string[]; en: string[] };
  sections: JournalSection[];
}

