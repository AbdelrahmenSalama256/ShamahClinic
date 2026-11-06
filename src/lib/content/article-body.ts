/**
 * The article body as the public page receives it: segments, anchors, questions.
 *
 * One pass over the stored HTML answers three questions the page used to ask three
 * different ways. (1) What blocks does the page render, in order — prose, a FAQ pair,
 * a call-to-action box? (2) What is the table of contents, and what address does each
 * H2/H3 carry? (3) Which questions does the FAQPage JSON-LD speak?
 *
 * Everything here happens on the server, before a byte of HTML reaches a browser: the
 * ids are in the markup the first paint shows, so scrolling to a `#hash` works with
 * JavaScript off, and the TOC cannot shift layout or disagree with hydration. The ids
 * are stable — the same heading text keeps the same address across builds — and they
 * keep Arabic letters, because an address that transliterates `ليزر` to `lyzr` is
 * read by nobody and typed by nobody.
 *
 * Two corpus artifacts this pipeline owns:
 *   - `h1` inside a body is the WordPress title repeated, and the page already prints
 *     the title in its hero. It is dropped here, and the editor drops it on load, so
 *     what a person saves and what a visitor sees agree.
 *   - A top-level bare text node is a paragraph the importer never wrapped. It is
 *     wrapped, not dropped — it is the author's sentence.
 */
import * as cheerio from 'cheerio';

import { slugify } from '../slug';
import { sanitizeHtmlBody } from '../wp/sanitize';

/** The three call-to-action boxes the body editor can insert. */
export const CTA_VARIANTS = ['consult', 'book', 'whatsapp'] as const;
export type CtaVariant = (typeof CTA_VARIANTS)[number];

export interface TocEntry {
  id: string;
  text: string;
  /** the heading level, so the page can nest the list honestly */
  level: 2 | 3;
}

export interface FaqEntry {
  id: string;
  question: string;
  /** the answer's own HTML, already sanitized by the same door as everything else */
  answerHtml: string;
}

export type BodySegment =
  | { kind: 'html'; html: string }
  | { kind: 'faq'; id: string; question: string; answerHtml: string }
  | { kind: 'cta'; variant: CtaVariant };

export interface PreparedBody {
  segments: BodySegment[];
  /** H2/H3 in document order. Empty means the page shows no TOC at all. */
  toc: TocEntry[];
  /** The FAQ blocks, for the FAQPage JSON-LD as well as the render. */
  faqs: FaqEntry[];
  /** The body as one plain-text sentence: word counts and teasers read it. */
  plain: string;
}

/** An id a person set by hand survives if it is address-shaped and free. */
const AUTHOR_ID = /^[A-Za-z0-9\p{Script=Arabic}_-]{1,80}$/u;

/**
 * A document-wide id maker: the slug of a heading's text, then `-2`, `-3`, … on a
 * repeat. An author-set id is kept when it is usable and unclaimed.
 */
function idMaker(): (text: string, authorId?: string) => string {
  const used = new Set<string>();
  return (text, authorId) => {
    const given = (authorId || '').trim();
    if (given && AUTHOR_ID.test(given) && !used.has(given)) {
      used.add(given);
      return given;
    }
    const base = slugify(text) || 'section';
    let candidate = base;
    for (let n = 2; used.has(candidate); n += 1) candidate = `${base}-${n}`;
    used.add(candidate);
    return candidate;
  };
}

/**
 * Prepare one language's stored body for the public page.
 *
 * `sanitizeHtmlBody` runs first, so the walk — and every string the page will inject —
 * only ever sees the allowlist. The segments are what the page renders; the TOC and
 * the FAQ list are what the page announces.
 */
export function prepareArticleBody(raw: string): PreparedBody {
  const html = sanitizeHtmlBody(raw);
  const $ = cheerio.load(`<div id="__body">${html}</div>`);
  const root = $('#__body');
  root.find('h1').remove();

  // Wrap bare top-level text so it renders as the paragraph it is.
  root.contents().each((_, node) => {
    if ((node as { type?: string }).type !== 'text') return;
    const text = (node as { data?: string }).data ?? '';
    if (!text.trim()) return;
    const p = $('<p>');
    p.text(text);
    $(node).replaceWith(p);
  });

  const makeId = idMaker();
  const toc: TocEntry[] = [];
  const faqs: FaqEntry[] = [];
  const segments: BodySegment[] = [];

  // A wide table inside a 360px column is unreadable in either script, so each one gets
  // its own scroll box. The wrapper is added here — after sanitizing, and never stored —
  // so the console's document and the database row stay the author's markup.
  root.find('table').each((_, el) => {
    const $table = $(el);
    if ($table.parent().hasClass('article-table-wrap')) return;
    $table.wrap('<div class="article-table-wrap"></div>');
  });

  let buffer: string[] = [];
  const flush = (): void => {
    if (!buffer.length) return;
    segments.push({ kind: 'html', html: buffer.join('') });
    buffer = [];
  };

  root.contents().each((_, node) => {
    const type = (node as { type?: string }).type;
    if (type !== 'tag') return; // text was wrapped above; comments and directives are noise
    const $el = $(node);

    const tag = (node as { name?: string }).name?.toLowerCase() ?? '';
    const block = $el.attr('data-block');

    if (tag === 'section' && block === 'cta') {
      flush();
      const wanted = $el.attr('data-cta') ?? '';
      const variant = (CTA_VARIANTS as readonly string[]).includes(wanted) ? (wanted as CtaVariant) : 'consult';
      segments.push({ kind: 'cta', variant });
      return;
    }

    if (tag === 'section' && block === 'faq') {
      flush();
      const question = $el.find('h2, h3, h4, p').first();
      const questionText = question.length ? question.text().replace(/\s+/g, ' ').trim() : '';
      const answer = $el.find('[data-faq-answer]').first();
      const answerHtml = answer.length ? answer.html() || '' : '';
      const id = makeId(questionText || 'faq');
      const entry: FaqEntry = { id, question: questionText, answerHtml };
      faqs.push(entry);
      segments.push({ kind: 'faq', ...entry });
      return;
    }

    if (tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5') {
      const text = $el.text().replace(/\s+/g, ' ').trim();
      const id = makeId(text, $el.attr('id'));
      $el.attr('id', id);
      if ((tag === 'h2' || tag === 'h3') && text) toc.push({ id, text, level: tag === 'h2' ? 2 : 3 });
      buffer.push($.html($el) ?? '');
      return;
    }

    buffer.push($.html($el) ?? '');
  });
  flush();

  const plain = root.text().replace(/\s+/g, ' ').trim();
  return { segments, toc, faqs, plain };
}
