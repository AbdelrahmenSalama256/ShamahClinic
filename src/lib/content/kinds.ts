/**
 * What the console edits, as data.
 *
 * One entry per kind names the table it lives in, the column that carries its
 * public identity (slug, route, item uid) and which columns hold the **draft** an
 * editor writes versus the **published** copy the site reads. The store, the
 * publish step and the site read path all work from this map, so adding a kind is
 * an entry here rather than a fourth copy of the same column list.
 *
 * Two rules the columns chosen in `002_content.sql` force:
 *   - a bilingual row is written **one locale at a time**, so the permission scope
 *     (`locales`) can name the locale being changed and a single-language editor
 *     cannot smuggle the other language in through the same request;
 *   - only the pairs that have a `pub_*` twin are gated by publishing. Fields
 *     without one (`image`, `price`, `enabled`, `position`) take effect on save,
 *     and the console labels them as such.
 */
import { z } from 'zod';
import type { Resource } from '../auth/permissions';
import { plainText, type FieldFormat } from './format';

export const CONTENT_KINDS = ['article', 'offer', 'page', 'list_item'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type ContentLocale = 'ar' | 'en';
export const CONTENT_LOCALES: readonly ContentLocale[] = ['ar', 'en'];

const LONGTEXT = 1_000_000;

/** A bilingual text pair; `pub` is null when the field has no published twin. */
export interface BiField {
  name: string;
  draft: Record<ContentLocale, string>;
  pub: Record<ContentLocale, string> | null;
  /** the longest value the columns accept, enforced before the INSERT */
  max: number;
  multiline: boolean;
  /**
   * What the column holds, and so what the store does with the value on the way in.
   *
   * `plain` is printed as text by the site — a card teaser, a `<title>`, an `alt` — so
   * tags and entities are stripped rather than stored: the WordPress import left `<p>`
   * and `&#8217;` inside 92 of the 94 excerpts, and an operator reading that box sees
   * markup where their sentence should be. `html` is a prose body: it keeps its tags and
   * is filtered by `sanitizeRichHtml()` before it is written. `source` is an imported
   * builder document — see the page kind — which is stored as typed and filtered only
   * on the way out.
   */
  format: FieldFormat;
}

/** A field whose value is one JSON document, optionally with a published twin. */
export interface JsonField {
  name: string;
  draft: string;
  pub: string | null;
  required: boolean;
}

export interface TextField {
  name: string;
  column: string;
  max: number;
  /** a NOT NULL column needs something to fall back to when the editor clears it */
  fallback: string | null;
  /** always `plain` today: a path, a route or a currency code, never a document */
  format: FieldFormat;
}

export interface KindSpec {
  kind: ContentKind;
  resource: Resource;
  table: 'articles' | 'offers' | 'pages' | 'list_items';
  /** the column the console shows in the URL and the permission target names */
  keyColumn: string;
  /** writes name a locale; a list item is one JSON document, so it does not */
  perLocale: boolean;
  /** list items are scoped by `lists`, everything else by `locales` */
  scope: 'locales' | 'lists';
  bi: readonly BiField[];
  json: readonly JsonField[];
  text: readonly TextField[];
  number: readonly { name: string; column: string }[];
  flag: readonly { name: string; column: string }[];
}

export const KIND_SPECS: readonly KindSpec[] = [
  {
    kind: 'article',
    resource: 'article',
    table: 'articles',
    keyColumn: 'slug',
    perLocale: true,
    scope: 'locales',
    bi: [
      { name: 'title', draft: { ar: 'title_ar', en: 'title_en' }, pub: { ar: 'pub_title_ar', en: 'pub_title_en' }, max: 500, multiline: false, format: 'plain' },
      { name: 'excerpt', draft: { ar: 'excerpt_ar', en: 'excerpt_en' }, pub: { ar: 'pub_excerpt_ar', en: 'pub_excerpt_en' }, max: 1000, multiline: true, format: 'plain' },
      { name: 'content', draft: { ar: 'content_ar', en: 'content_en' }, pub: { ar: 'pub_content_ar', en: 'pub_content_en' }, max: LONGTEXT, multiline: true, format: 'html' },
      { name: 'imageAlt', draft: { ar: 'image_alt_ar', en: 'image_alt_en' }, pub: null, max: 500, multiline: false, format: 'plain' },
    ],
    json: [],
    text: [
      { name: 'image', column: 'image', max: 512, fallback: null, format: 'plain' },
      { name: 'categoryId', column: 'category_id', max: 36, fallback: null, format: 'plain' },
    ],
    number: [],
    flag: [],
  },
  {
    kind: 'offer',
    resource: 'offer',
    table: 'offers',
    keyColumn: 'slug',
    perLocale: true,
    scope: 'locales',
    bi: [
      { name: 'name', draft: { ar: 'name_ar', en: 'name_en' }, pub: { ar: 'pub_name_ar', en: 'pub_name_en' }, max: 500, multiline: false, format: 'plain' },
      { name: 'excerpt', draft: { ar: 'excerpt_ar', en: 'excerpt_en' }, pub: { ar: 'pub_excerpt_ar', en: 'pub_excerpt_en' }, max: 1000, multiline: true, format: 'plain' },
      { name: 'body', draft: { ar: 'body_ar', en: 'body_en' }, pub: { ar: 'pub_body_ar', en: 'pub_body_en' }, max: LONGTEXT, multiline: true, format: 'html' },
    ],
    json: [{ name: 'images', draft: 'images', pub: null, required: false }],
    text: [{ name: 'currency', column: 'currency', max: 8, fallback: 'EGP', format: 'plain' }],
    number: [
      { name: 'price', column: 'price' },
      { name: 'regularPrice', column: 'regular_price' },
      { name: 'position', column: 'position' },
    ],
    flag: [
      { name: 'onSale', column: 'on_sale' },
      { name: 'enabled', column: 'enabled' },
    ],
  },
  {
    kind: 'page',
    resource: 'page',
    table: 'pages',
    keyColumn: 'route',
    perLocale: true,
    scope: 'locales',
    bi: [
      { name: 'title', draft: { ar: 'title_ar', en: 'title_en' }, pub: { ar: 'pub_title_ar', en: 'pub_title_en' }, max: 500, multiline: false, format: 'plain' },
      // `source`, not `html`: the homepage row's body is the WordPress page builder's own
      // document, and `hero.ts` and `home-prose.ts` still read the slider and the prose
      // rows out of it (`rs-slide`, `data-thumb`, `class="vc_row"`). Filtering on the way
      // in would delete the home hero the first time anyone saved the page, so a page
      // body is stored as typed and `sanitizeHtmlBody()` filters it on every render.
      { name: 'content', draft: { ar: 'content_ar', en: 'content_en' }, pub: { ar: 'pub_content_ar', en: 'pub_content_en' }, max: LONGTEXT, multiline: true, format: 'source' },
    ],
    json: [],
    text: [{ name: 'redirectTo', column: 'redirect_to', max: 512, fallback: null, format: 'plain' }],
    number: [],
    flag: [{ name: 'enabled', column: 'enabled' }],
  },
  {
    kind: 'list_item',
    resource: 'list',
    table: 'list_items',
    keyColumn: 'uid',
    perLocale: false,
    scope: 'lists',
    bi: [],
    json: [{ name: 'data', draft: 'draft', pub: 'published', required: true }],
    text: [],
    number: [{ name: 'position', column: 'position' }],
    flag: [{ name: 'enabled', column: 'enabled' }],
  },
];

const BY_KIND = new Map<ContentKind, KindSpec>(
  CONTENT_KINDS.map((kind) => {
    const spec = KIND_SPECS.find((candidate) => candidate.kind === kind);
    if (!spec) throw new Error(`no kind spec for ${kind}`);
    return [kind, spec];
  }),
);

export function kindSpec(kind: ContentKind): KindSpec {
  return BY_KIND.get(kind)!;
}

/**
 * The column an authored order lives in, when this kind has one.
 *
 * `./order.ts` is the only writer. The editor used to draw a number box over it, which made a
 * person guess a free number and let two rows claim the same one.
 */
export function positionColumn(spec: KindSpec): string | null {
  return spec.number.find((field) => field.name === 'position')?.column ?? null;
}

/**
 * Whether a kind's rows are shown in an order a person authored.
 *
 * Only two kinds are: an offer carries its own `position`, and every list item does. An
 * article is ordered by its date and a page by its route, so neither gets a move button —
 * and the screen that drew a control for them would be promising an order the site ignores.
 */
export function isOrderedKind(kind: ContentKind): boolean {
  return positionColumn(kindSpec(kind)) !== null;
}

export function isContentKind(value: string): value is ContentKind {
  return (CONTENT_KINDS as readonly string[]).includes(value);
}

export function isContentLocale(value: string): value is ContentLocale {
  return (CONTENT_LOCALES as readonly string[]).includes(value);
}

/** The columns a kind owns, so the store can select exactly them and no more. */
export function columnsOf(spec: KindSpec): string[] {
  const columns = ['id', spec.keyColumn, 'status', 'version', 'published_at', 'updated_at'];
  for (const field of spec.bi) {
    columns.push(field.draft.ar, field.draft.en);
    if (field.pub) columns.push(field.pub.ar, field.pub.en);
  }
  for (const field of spec.json) columns.push(field.draft, ...(field.pub ? [field.pub] : []));
  for (const field of spec.text) columns.push(field.column);
  for (const field of spec.number) columns.push(field.column);
  for (const field of spec.flag) columns.push(field.column);
  return columns;
}

const fieldValue = z.union([
  z.string().max(LONGTEXT),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

/** The body the console posts: the row's identity plus this locale's field values. */
export const writeSchema = z.object({
  key: z.string().min(1).max(191),
  fields: z.record(z.string(), fieldValue),
});
export type WriteInput = { key: string; fields: Record<string, unknown> };
export type FieldValue = z.output<typeof fieldValue>;

export type ColumnWrites = Record<string, string | number | null>;

export interface ParseResult {
  columns: ColumnWrites;
  issues: { path: string; message: string }[];
  /**
   * The columns that hold a body, so the caller can run them through
   * `sanitizeRichHtml()` before the INSERT.
   *
   * The filtering is not done here because this module is imported by the console's
   * client bundle (through `./kinds` types) and `sanitize-html` is Node-only. Plain
   * fields *are* cleaned here, because `./format.ts` has no dependencies and the
   * operator's browser and the database must reach the same string.
   */
  htmlColumns: string[];
}

/**
 * Turn the console's flat `{ field: value }` object into column writes.
 *
 * A bilingual field writes only the column for the locale the request named; that
 * is what makes the `locales` scope honest. A JSON field is stringified here,
 * because MariaDB stores it as LONGTEXT with a `json_valid()` check and a raw
 * object arrives as SQL text. A plain field is cleaned by `plainText()` first, so
 * a pasted headline never carries its `<strong>` into a `<title>` tag.
 */
export function parseWrites(spec: KindSpec, input: WriteInput, locale: ContentLocale): ParseResult {
  const columns: ColumnWrites = {};
  const issues: { path: string; message: string }[] = [];
  const htmlColumns: string[] = [];

  for (const [name, value] of Object.entries(input.fields)) {
    const bi = spec.bi.find((field) => field.name === name);
    if (bi) {
      if (typeof value !== 'string') issues.push({ path: name, message: 'expected text' });
      else {
        const written = bi.format === 'plain' ? plainText(value) : value;
        if (written.length > bi.max) issues.push({ path: name, message: `longer than ${bi.max} characters` });
        else {
          columns[bi.draft[locale]] = written;
          if (bi.format === 'html') htmlColumns.push(bi.draft[locale]);
        }
      }
      continue;
    }

    const text = spec.text.find((field) => field.name === name);
    if (text) {
      if (value !== null && typeof value !== 'string') issues.push({ path: name, message: 'expected text' });
      else {
        const written = value === null || value === undefined ? null : plainText(String(value));
        if (written !== null && written.length > text.max) issues.push({ path: name, message: `longer than ${text.max} characters` });
        else columns[text.column] = written === '' || written === null ? text.fallback : written;
      }
      continue;
    }

    const number = spec.number.find((field) => field.name === name);
    if (number) {
      if (value === null || (typeof value === 'number' && Number.isFinite(value))) columns[number.column] = value;
      else issues.push({ path: name, message: 'expected a number' });
      continue;
    }

    const flag = spec.flag.find((field) => field.name === name);
    if (flag) {
      if (typeof value === 'boolean') columns[flag.column] = value ? 1 : 0;
      else issues.push({ path: name, message: 'expected true or false' });
      continue;
    }

    const json = spec.json.find((field) => field.name === name);
    if (json) {
      if (value === null || typeof value !== 'object') issues.push({ path: name, message: 'expected an object or an array' });
      // The published twin is left alone: saving a draft must not unpublish the
      // copy a visitor is currently reading.
      else columns[json.draft] = JSON.stringify(value);
      continue;
    }

    issues.push({ path: name, message: 'unknown field' });
  }

  for (const field of spec.json) {
    // A field that already reported a problem was present but unusable; saying
    // "required" on top of that tells the editor nothing and contradicts the form.
    const alreadyReported = issues.some((issue) => issue.path === field.name);
    if (field.required && columns[field.draft] === undefined && !alreadyReported) {
      issues.push({ path: field.name, message: 'required' });
    }
  }

  return { columns, issues, htmlColumns };
}

/** The fields whose values reach the public site only after a publish. */
export function publishableColumns(spec: KindSpec, locale: ContentLocale): { draft: string; pub: string }[] {
  return spec.bi
    .filter((field) => field.pub !== null)
    .map((field) => ({ draft: field.draft[locale], pub: field.pub![locale] }));
}
