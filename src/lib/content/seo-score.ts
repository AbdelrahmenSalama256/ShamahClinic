/**
 * A page's SEO score out of 100, the way an SEO plugin grades a post: one focus keyword,
 * checked against the places a search engine weighs it, plus the lengths and the share
 * card. Pure, so the editor can re-grade on every keystroke and the SEO center can grade
 * a hundred rows on the server with the same rule.
 *
 * A check that cannot be judged — no body text on a screen that does not load it, no
 * keyword yet — is left out of the total instead of counted as a failure, so a row's
 * score only ever measures what the screen could actually see.
 */
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, seoLength } from './seo-limits';

export interface SeoScoreInput {
  focusKeyword: string;
  title: string;
  description: string;
  /** The public path, e.g. `/blogs/laser-hair-removal`. */
  path: string;
  /** The page's body as HTML or plain text; `null` when the caller does not have it. */
  body: string | null;
  ogImage: string;
}

export type SeoCheckId =
  | 'keyword_set'
  | 'keyword_title'
  | 'keyword_title_start'
  | 'keyword_description'
  | 'keyword_url'
  | 'keyword_intro'
  | 'keyword_heading'
  | 'keyword_density'
  | 'title_length'
  | 'description_length'
  | 'content_length'
  | 'image_alt'
  | 'og_image'
  | 'short_url';

export interface SeoCheck {
  id: SeoCheckId;
  pass: boolean;
  weight: number;
}

export interface SeoScore {
  score: number;
  checks: SeoCheck[];
}

/** Arabic letter forms a person types interchangeably, folded so «إزالة» finds «ازالة». */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

function textOf(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return text.split(/[\s\p{P}]+/u).filter(Boolean);
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function seoScore(input: SeoScoreInput): SeoScore {
  const keyword = fold(input.focusKeyword);
  const title = fold(input.title);
  const description = fold(input.description);
  const slug = fold(decodePath(input.path.split('/').pop() ?? '').replace(/[-_]+/g, ' '));
  const checks: SeoCheck[] = [];
  const add = (id: SeoCheckId, pass: boolean, weight: number) => checks.push({ id, pass, weight });

  add('keyword_set', keyword !== '', 10);
  add('title_length', seoLength(input.title) >= 30 && seoLength(input.title) <= SEO_TITLE_MAX, 8);
  add('description_length', seoLength(input.description) >= 80 && seoLength(input.description) <= SEO_DESCRIPTION_MAX, 8);
  add('og_image', input.ogImage.trim() !== '', 5);
  add('short_url', input.path.length > 0 && decodePath(input.path).length <= 75, 4);

  const html = input.body;
  const plain = html === null ? null : fold(textOf(html));
  const wordCount = plain === null ? 0 : words(plain).length;
  if (plain !== null) {
    add('content_length', wordCount >= 300, 8);
    const images = html?.match(/<img\b[^>]*>/gi) ?? [];
    if (images.length > 0) add('image_alt', images.every((tag) => /\balt\s*=\s*["'][^"']+["']/i.test(tag)), 5);
  }

  if (keyword) {
    add('keyword_title', title.includes(keyword), 10);
    add('keyword_title_start', title.startsWith(keyword) || title.indexOf(keyword) <= Math.max(10, title.length / 3), 4);
    add('keyword_description', description.includes(keyword), 8);
    if (input.path) add('keyword_url', slug.includes(keyword) || keyword.split(' ').every((part) => slug.includes(part)), 6);
    if (plain !== null && wordCount > 0) {
      const intro = plain.slice(0, Math.max(200, Math.round(plain.length / 10)));
      add('keyword_intro', intro.includes(keyword), 7);
      const headings = (html?.match(/<h[2-3]\b[^>]*>[\s\S]*?<\/h[2-3]>/gi) ?? []).map((tag) => fold(textOf(tag)));
      add('keyword_heading', headings.some((heading) => heading.includes(keyword)), 6);
      const density = (occurrences(plain, keyword) * words(keyword).length * 100) / wordCount;
      add('keyword_density', density >= 0.5 && density <= 2.5, 7);
    }
  }

  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  const earned = checks.reduce((sum, check) => sum + (check.pass ? check.weight : 0), 0);
  return { score: total === 0 ? 0 : Math.round((earned / total) * 100), checks };
}

export type SeoGrade = 'good' | 'fair' | 'poor';

export function seoGrade(score: number): SeoGrade {
  if (score >= 80) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}
