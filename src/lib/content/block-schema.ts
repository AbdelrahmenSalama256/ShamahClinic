/**
 * The document model the console edits, written once so three readers cannot disagree.
 *
 * The article body is stored as HTML (`content_ar` / `pub_content_ar` and the offer, page and
 * service twins). A person must be able to open 94 WordPress articles in a block editor, change
 * one sentence, and save without the other thousand losing anything — so the schema below is not
 * "the editor's business". It is the contract between
 *
 *   * the TipTap surface in the console (this module's extensions, given to `useEditor`),
 *   * the round trip in `tests/block-roundtrip.test.ts`, which opens the real stored bodies and
 *     re-emits them through exactly these extensions, and
 *   * the allowlist in `./rich-policy`, which the server applies on the way in (`sanitizeRichHtml`)
 *     and the page applies on the way out (`sanitizeHtmlBody`).
 *
 * **The vocabulary is measured, not chosen.** Census over every draft and published body of the
 * 94 live articles, both languages — 376 fields:
 *
 *   10 294 `strong` · 8 956 `p` · 7 764 `li` · 3 816 `h2` · 2 104 `h3` · 2 000 `ul` · 1 418 `br`
 *   · 644 `td` · 400 `ol` · 188 `tr` · 72 `h4` · 52 `em` · 48 `h1` · 40 `a` · 32 `figure`
 *   · 32 `table` · 32 `tbody` · 4 `hr`
 *   attributes: `class` 18 444 · `start` 190 (values 2…7, never 1) · `href` 40 (all `https:`)
 *   · `target` 4 · `rel` 4 · `data-type`/`data-id` 4 (dropped by the allowlist before and after)
 *   classes: `wp-block-paragraph` · `wp-block-heading` · `wp-block-list` · `translation-block`
 *   (960 `li`, 492 `p`, 2 `h3`) · `wp-block-table` · `has-fixed-layout` · `wp-block-separator`
 *   · `wp-block-latest-posts*` — and **no stylesheet in this project mentions any of them**
 *
 * Shapes the schema therefore has to answer for: `<li>` always holds inline content directly and
 * never a paragraph (7 712 items, zero `li > p`), except that 52 of them nest a `<ul>` inside;
 * `<p>` holds text, `strong`, `em` or `br` and nothing else; every table is
 * `figure.wp-block-table > table.has-fixed-layout > tbody > tr > td` — no `thead`, no `th`, no
 * `figcaption`; and there is not one `div`, `span`, `img` or `blockquote` in a body at all (the
 * featured picture lives in its own column, so a body image is something a person adds from here
 * on, not something they have).
 *
 * Three normalizations are documented losses, and they are the only ones:
 *
 *   1. `figure.wp-block-table` — the WordPress wrapper around a table is not re-emitted. The
 *      table, its class, every row and every cell survive. No CSS reads `wp-block-*`, and
 *      `prepareArticleBody()` puts its own `.article-table-wrap` scroll box around each table
 *      after sanitizing, so the wrapper carries nothing a visitor can lose.
 *   2. A `<li>`'s paragraph is unwrapped on the way out, because ProseMirror needs a block inside
 *      a list item to be able to nest a list there, while WordPress writes `<li>text</li>`. Both
 *      shapes mean the same thing and the second is what the database and the stylesheet expect.
 *   3. `<h1>` in a body becomes `<h2>` (`openBody()` in `./block-html`). 48 of them exist, in four
 *      articles: three are the imported title repeated, and in `best-laser-hair-removal-center-for-
 *      men-in-egypt` nine per language are ordinary section headings that `sanitizeHtmlBody()`
 *      deletes today, because `h1` is not in the allowlist and `disallowedTagsMode: 'discard'`
 *      takes the text with it. Those headings are real content; an editor that could not name them
 *      would hide the bug rather than fix it.
 *
 * Deliberately *not* offered, although the allowlist permits them: `code`, `pre`, `s`, `u`,
 * `span`. The surface being narrower than the allowlist keeps one direction of surprise only —
 * a mark a person can type is a mark that survives every later save.
 */
import Image from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Table, TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { Extension, Node, mergeAttributes, type Attribute } from '@tiptap/core';

import { CTA_VARIANTS } from './block-contract';

/** `h1` is the page's own hero, and `h6` is in nobody's stylesheet. */
export const BLOCK_HEADING_LEVELS = [2, 3, 4, 5] as const;

/**
 * `class` and `id`, kept on every block the schema can name.
 *
 * One global list rather than fifteen per-node copies: a class that survives on a paragraph but
 * not on a heading is the kind of half-rule that only shows up in a document nobody tested. 18 444
 * class attributes exist in the corpus and a save that silently rewrote them would make the
 * database stop matching the owner's own backups and audit SQL for no visible gain. `id` is kept
 * because `article-body.ts` honours an author's own anchor — and re-writes it on every render, so
 * the value stored here is a preference, never trusted output.
 */
const PRESERVED_ON = [
  'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule',
  'image', 'link',
  'table', 'tableRow', 'tableCell', 'tableHeader',
  'faqItem', 'faqQuestion', 'faqAnswer', 'ctaBlock',
];

const preserved = (name: string): Attribute => ({
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute(name) || null,
  renderHTML: (value: Record<string, unknown>) => (value[name] ? { [name]: value[name] } : {}),
});

export const PreservedAttributes = Extension.create({
  name: 'preservedAttributes',
  addGlobalAttributes: () => [
    { types: PRESERVED_ON, attributes: { class: preserved('class'), id: preserved('id') } },
  ],
});

/**
 * The FAQ answer, which the public page folds open.
 *
 * `article-body.ts` cuts `section[data-block="faq"]` out of the prose stream, takes the first
 * `h2|h3|h4|p` inside it as the question and the contents of `[data-faq-answer]` as the answer,
 * and feeds both to the `<details>` render and the FAQPage JSON-LD. Those three selectors are the
 * contract, and this node is the only writer of it — which is what makes the extraction testable
 * against real editor output instead of against a hand-written fixture.
 */
export const FaqAnswer = Node.create({
  name: 'faqAnswer',
  group: 'block',
  content: 'block+',
  parseHTML: () => [{ tag: 'div[data-faq-answer]', priority: 200 }],
  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-faq-answer': '' }, HTMLAttributes),
    0,
  ],
});

/**
 * The question line.
 *
 * A heading, because a question is a heading to a screen reader and to Google's FAQ rich result.
 * Which heading it was is remembered in `level` so a re-save does not silently promote or demote
 * it, and the tag itself is not an attribute the server sees — `article-body.ts` reads the text,
 * not the tag.
 */
export const FaqQuestion = Node.create({
  name: 'faqQuestion',
  group: 'block',
  content: 'text*',
  parseHTML: () => [
    {
      tag: 'h2, h3, h4, p',
      priority: 250,
      // Only inside a FAQ pair: a bare `<h3>` in the prose must stay a heading.
      getAttrs: (element: HTMLElement) =>
        element.parentElement?.getAttribute('data-block') === 'faq' ? {} : false,
    },
  ],
  renderHTML: ({ node, HTMLAttributes }) => [
    String(node.attrs.level ?? 'h3'),
    mergeAttributes(HTMLAttributes),
    0,
  ],
  addAttributes: () => ({
    level: {
      default: 'h3',
      parseHTML: (element: HTMLElement) => element.tagName.toLowerCase(),
      renderHTML: () => ({}),
    },
  }),
});

export const FaqItem = Node.create({
  name: 'faqItem',
  group: 'block',
  content: 'faqQuestion faqAnswer',
  defining: true,
  parseHTML: () => [{ tag: 'section[data-block="faq"]', priority: 200 }],
  renderHTML: ({ HTMLAttributes }) => [
    'section',
    mergeAttributes({ 'data-block': 'faq' }, HTMLAttributes),
    0,
  ],
});

/**
 * The consultation box: a variant, and nothing else.
 *
 * The words, the number and the link belong to `ArticleCtaBox`, which reads them from the clinic
 * settings the console owns. Storing a phone number here would recreate the bug the brief names,
 * and would go stale the day the owner edits Settings.
 */
export const CtaBlock = Node.create({
  name: 'ctaBlock',
  group: 'block',
  atom: true,
  code: false,
  parseHTML: () => [{ tag: 'section[data-block="cta"]', priority: 200 }],
  renderHTML: ({ node, HTMLAttributes }) => [
    'section',
    mergeAttributes(
      { 'data-block': 'cta', 'data-cta': String(node.attrs.variant) },
      HTMLAttributes,
    ),
  ],
  addAttributes: () => ({
    variant: {
      default: CTA_VARIANTS[0] as string,
      parseHTML: (element: HTMLElement) => {
        const wanted = element.getAttribute('data-cta') ?? '';
        return (CTA_VARIANTS as readonly string[]).includes(wanted) ? wanted : (CTA_VARIANTS[0] as string);
      },
      // Rendered as `data-cta` by `renderHTML` above, never from here.
      rendered: false,
    },
  }),
});

/**
 * A body image is a lazy one. `loading` is in the allowlist and is not part of TipTap's own
 * image attributes, so without this the attribute a person sees would be the one the save drops.
 */
export const LazyImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      loading: { default: 'lazy', renderHTML: (value) => ({ loading: value.loading ?? 'lazy' }) },
    };
  },
});

/**
 * The extensions, in the order the schema needs.
 *
 * `trailingNode` is off on purpose: a body that ends with a table or a call-to-action box gains an
 * empty paragraph when a document model insists on ending with one, and "I opened the article and
 * it grew a blank block" is a change nobody asked for. Inserting a block from the toolbar puts the
 * paragraph there instead, where a person can see it happen.
 *
 * `underline` and `strike` are off although the allowlist permits `u` and `s`, for the same
 * reason as the paste filter: what the surface cannot write is what no later save can remove.
 *
 * The table node is re-rendered because TipTap's own `renderHTML` adds a `style="min-width: …"` on
 * the `<table>` and a `<colgroup><col style="…">` in front of the rows — sizing chrome for the
 * drag-to-resize feature this editor does not have. `style` is not in the allowlist on purpose, so
 * that markup would be stripped at the save door and the person would watch a table lose its
 * attributes on save. What is emitted here is what the database holds and what WordPress wrote:
 * `table > tbody > tr > td`.
 */
export const blockExtensions = [
  StarterKit.configure({
    heading: { levels: [...BLOCK_HEADING_LEVELS] },
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    trailingNode: false,
    dropcursor: { color: 'var(--c-line-strong)', width: 2 },
    // Disabled here so that the copy configured below is the only Link in the schema.
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: false,
    linkOnPaste: false,
    // Nothing added that was not stored: with TipTap's defaults every link in the corpus would
    // gain `target="_blank" rel="noopener noreferrer nofollow"` on its first re-save.
    HTMLAttributes: { target: null, rel: null, class: null },
  }),
  TableKit.configure({ table: false }),
  Table.extend({
    renderHTML: ({ HTMLAttributes }) => [
      'table',
      mergeAttributes(HTMLAttributes),
      ['tbody', 0],
    ],
  }),
  LazyImage,
  FaqItem,
  FaqQuestion,
  FaqAnswer,
  CtaBlock,
  PreservedAttributes,
];
