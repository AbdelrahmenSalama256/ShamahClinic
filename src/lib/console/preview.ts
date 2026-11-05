/**
 * The editor's right-hand pane, as pure functions: what the row would look like, and
 * what a search result would say it looks like. Both read the **form**, not the row last
 * saved, because the point of a preview is to be wrong about the saved copy and right
 * about what the person is typing.
 *
 * Three rules keep the pane honest rather than decorative:
 *
 * The body goes into the frame **as authored HTML**, and the frame is
 * `sandbox=""` — no origin, no scripts, no top-level navigation. So the markup a copy
 * editor pastes is inert there, and the same string can never be inserted into the
 * console's own document, where it *would* carry the session cookie. `site.ts` runs the
 * body through `sanitizeHtmlBody()` before the public site renders it, and that module
 * pulls in `sanitize-html` and `cheerio`; neither belongs in a client bundle, which is
 * why the preview shows the draft raw-in-a-sandbox instead of pretending to be the
 * site's exact pixels. It is a copy check, not a screenshot.
 *
 * The search snippet follows `publicSeo()`'s fallbacks — a missing language borrows the
 * other one, a missing description falls back to the heading — so the console never
 * shows a Google preview the site would not produce. The SEO *center* is BK-15; this is
 * the read-out that makes the save/publish decision.
 *
 * A before/after case is drawn twice — the card, then the enlarged view — and both drawings
 * obey the rule the results page obeys: two pictures are a comparison and one is nothing, so
 * a half case shows two empty slots and a line naming what is still owed, never a pair. The
 * same `needsOtherPhoto()` answers for the list's badge, which is the only way the two can
 * agree about a row nobody has saved yet.
 */
import type { ContentKind, ContentLocale } from '../content/kinds';
import {
  listDocBody,
  listDocBullets,
  listDocFromForm,
  listDocImage,
  listDocIntro,
  listDocMeta,
  listDocText,
  listDocTitle,
  listSchemaOf,
  needsOtherPhoto,
  UNKNOWN_FORM_KEY,
  type ListSchema,
} from '../content/list-schema';
import { localizedPath, publicPathOf } from '../content/paths';
import type { MessageKey } from './messages';

export type FormValue = string | boolean;
export type EditorForm = Record<string, FormValue>;

/** Which field of each kind carries the heading, the teaser and the body. */
const COPY: Record<ContentKind, { title: string; intro: string; body: string; meta: string[] }> = {
  article: { title: 'title', intro: 'excerpt', body: 'content', meta: ['image', 'categoryId', 'imageAlt'] },
  offer: { title: 'name', intro: 'excerpt', body: 'body', meta: ['price', 'regularPrice', 'currency', 'onSale', 'enabled'] },
  page: { title: 'title', intro: '', body: 'content', meta: ['redirectTo', 'enabled'] },
  list_item: { title: '', intro: '', body: '', meta: [] },
};

/** A row a `refs` or `story` field may point at, as the editor's own picker names it. */
export interface PreviewReference {
  key: string;
  label: string;
}

/**
 * One before/after case, as the results page draws it.
 *
 * The pane shows two views of the same six fields because the site does: the card in the
 * grid, and the enlarged view a press opens. `half` is why both are here rather than one —
 * a case with one picture shows no comparison on the site, and a preview that drew a pair
 * anyway would be the one thing a person must not be told twice about.
 */
export interface ResultCasePreview {
  /** the typed headline, already fallen back to the related article's title as the site does */
  headline: string;
  before: string;
  after: string;
  half: boolean;
  /** the two upload fields' own labels, so an empty half names what is owed */
  beforeLabel: string;
  afterLabel: string;
  beforeAlt: string;
  afterAlt: string;
  beforeAltLabel: string;
  afterAltLabel: string;
  area: string;
  sessions: string;
  caption: string;
  /** the long text, which the site reads only in the enlarged view */
  note: string;
  /** the service the row names, by the name the picker showed */
  service: string;
}

export interface PreviewModel {
  title: string;
  intro: string;
  /** the body, whose trust level `bodyAs` decides */
  body: string;
  bodyAs: 'html' | 'text';
  /** the first picture the item would show, if it has one */
  image: string | null;
  /** repeatable points a card prints under the teaser */
  bullets: string[];
  /** this kind has no body field at all, only the fields listed in `meta` */
  fields: { name: string; value: string | boolean }[];
  /** a before/after case, which the pane draws as its card and its enlarged view instead of the generic card */
  resultCase: ResultCasePreview | null;
}

function text(value: FormValue | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The hidden entries the console keeps until somebody removes them. */
function extraOf(form: EditorForm): Record<string, unknown> {
  const raw = String(form[UNKNOWN_FORM_KEY] ?? '');
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The row's copy as the form holds it right now. */
export function previewModel(
  kind: ContentKind,
  form: EditorForm,
  locale: ContentLocale,
  listKey?: string | null,
  references?: Record<string, PreviewReference[]>,
): PreviewModel {
  const spec = COPY[kind];
  // A flag says something even when it is off — `enabled: false` is the fact a person
  // is reviewing — while an empty text field says nothing.
  const fields = spec.meta
    .map((name) => ({ name, value: form[name] }))
    .filter((field): field is { name: string; value: FormValue } => typeof field.value === 'boolean' || (typeof field.value === 'string' && field.value.trim() !== ''));

  if (kind !== 'list_item') {
    return {
      title: text(form[spec.title]),
      intro: spec.intro ? text(form[spec.intro]) : '',
      body: text(form[spec.body]),
      bodyAs: 'html',
      image: null,
      bullets: [],
      fields,
      resultCase: null,
    };
  }

  // A list item is previewed as the card its list draws: the document is built from the
  // same form the save builds, so the pane never shows JSON a person did not type.
  const schema = listSchemaOf(listKey);
  if (!schema) return { title: '', intro: '', body: '', bodyAs: 'text', image: null, bullets: [], fields, resultCase: null };

  const doc = listDocFromForm(schema, form, extraOf(form)).doc;
  return {
    title: listDocTitle(schema, doc, locale),
    intro: listDocIntro(schema, doc, locale),
    body: listDocBody(schema, doc, locale),
    bodyAs: 'html',
    image: listDocImage(schema, doc),
    bullets: listDocBullets(schema, doc, locale),
    fields: listDocMeta(schema, doc, locale).map((meta) => ({ name: meta.label, value: meta.value })),
    resultCase: schema.key === 'results' ? resultCaseOf(schema, doc, locale, references ?? {}) : null,
  };
}

/**
 * The before/after case as the form holds it, in the shape the two drawings need.
 *
 * The service and the related article reach the pane by *name*, not by key: the same
 * resolved choices the picker beside the field was built from, which is the only way a
 * person can check that the row points where they meant. An empty headline with a related
 * article previews that article's title, because that is what the results page prints.
 */
function resultCaseOf(
  schema: ListSchema,
  doc: Record<string, unknown>,
  locale: ContentLocale,
  references: Record<string, PreviewReference[]>,
): ResultCasePreview {
  const labelOf = (stem: string): string => {
    const field = schema.fields.find((candidate) => candidate.stem === stem);
    return field ? field.label[locale] || field.label.en || field.label.ar : stem;
  };
  const named = (stem: string, list: PreviewReference[]): string => {
    const value = doc[stem];
    const key = Array.isArray(value) ? value[0] : value;
    if (typeof key !== 'string') return '';
    return list.find((choice) => choice.key === key.trim())?.label ?? '';
  };
  const before = listDocImage(schema, doc, 'before') ?? '';
  const after = listDocImage(schema, doc, 'after') ?? '';
  return {
    headline: listDocTitle(schema, doc, locale) || named('story', references.story ?? []),
    before,
    after,
    half: needsOtherPhoto(before, after),
    beforeLabel: labelOf('before'),
    afterLabel: labelOf('after'),
    beforeAlt: listDocText(schema, doc, 'beforeAlt', locale),
    afterAlt: listDocText(schema, doc, 'afterAlt', locale),
    beforeAltLabel: labelOf('beforeAlt'),
    afterAltLabel: labelOf('afterAlt'),
    area: listDocText(schema, doc, 'area', locale),
    sessions: listDocText(schema, doc, 'sessions', locale),
    caption: listDocText(schema, doc, 'caption', locale),
    note: listDocText(schema, doc, 'note', locale),
    service: named('service', references.service ?? []),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
}

/**
 * The document handed to the sandboxed frame's `srcdoc`.
 *
 * `title`, `intro` and the field list are escaped — they are plain text the pane prints
 * into its own markup. `body` is not, because it is the authored HTML the person is
 * reviewing, and it is only ever read here, inside the frame the sandbox disarms.
 */
export function previewDocument(model: PreviewModel, locale: ContentLocale, labels: Record<MessageKey, string>): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const title = escapeHtml(model.title || model.intro || '—');
  const image = model.image ? `<img class="card" src="${escapeHtml(model.image)}" alt="">` : '';
  const intro = model.intro && model.intro !== model.title ? `<p class="lede">${escapeHtml(model.intro)}</p>` : '';
  const bullets = model.bullets.length
    ? `<ul class="points">${model.bullets.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
    : '';
  const body = model.bodyAs === 'html' ? model.body : `<pre>${escapeHtml(model.body)}</pre>`;
  const fields = model.fields.length
    ? `<dl class="meta">${model.fields
        .map((field) => `<div><dt>${escapeHtml(field.name)}</dt><dd>${escapeHtml(String(field.value))}</dd></div>`)
        .join('')}</dl>`
    : '';
  // A before/after case has a drawing of its own, and it replaces the generic one: every
  // field of that list has a place in the card or in the enlarged view, and the strip of
  // labels underneath would repeat what the two pictures above it already say.
  const generic = model.resultCase ? '' : `<h1>${title}</h1>${image}${intro}${body}${bullets}${fields}`;
  return [
    '<!doctype html>',
    `<html lang="${locale}" dir="${dir}"><head><meta charset="utf-8">`,
    '<style>',
    'body{margin:0;padding:1.1rem;font:15px/1.65 system-ui,sans-serif;color:#1c1c1c;background:#fff;word-wrap:break-word}',
    'h1{margin:0 0 .6rem;font-size:1.25rem;line-height:1.35}',
    '.lede{margin:0 0 1rem;color:#555;font-size:1.05rem}',
    'img{max-width:100%;height:auto}',
    'img.card{display:block;width:100%;max-height:14rem;object-fit:cover;border-radius:.6rem;margin:0 0 1rem}',
    '.points{margin:0 0 1rem;padding-inline-start:1.2rem;color:#333}',
    'pre{white-space:pre-wrap;word-break:break-word;background:#f5f5f5;padding:.7rem;border-radius:.5rem;font-size:.8rem}',
    '.meta{margin:1.2rem 0 0;padding:0;display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;font-size:.8rem;color:#555}',
    '.meta div{display:flex;gap:.35rem}',
    '.meta dt{margin:0;font-weight:600}.meta dd{margin:0}',
    CASE_CSS,
    '</style></head><body>',
    `${generic}${model.resultCase ? caseHtml(model.resultCase, labels) : ''}`,
    '</body></html>',
  ].join('');
}

/**
 * The card and the enlarged view, one under the other.
 *
 * The shapes are the site's: a headline above two squares with a word in each corner, the
 * three chips and one line under them; then the same pair wider, with the long text only
 * the enlarged view reads. The palette is the frame's own muted grey, because this pane is
 * a copy check — the site's real colors are on the other side of the "Open the page" link.
 */
function caseHtml(model: ResultCasePreview, labels: Record<MessageKey, string>): string {
  const head = `<h3 class="head">${escapeHtml(model.headline || '—')}</h3>`;
  const chips = [model.service, model.area, model.sessions]
    .filter((chip) => chip !== '')
    .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
    .join('');
  const caption = model.caption ? `<p class="cap">${escapeHtml(model.caption)}</p>` : '';
  const note = model.note ? `<p class="note">${escapeHtml(model.note)}</p>` : '';
  const alts = [model.beforeAlt, model.afterAlt]
    .map((alt, index) => {
      if (alt === '') return '';
      const label = index === 0 ? model.beforeAltLabel : model.afterAltLabel;
      return `<p class="alt"><b>${escapeHtml(label)}</b> ${escapeHtml(alt)}</p>`;
    })
    .join('');
  const half = (src: string, corner: string, alt: string, fieldLabel: string): string =>
    src === ''
      ? `<figure class="miss"><span>${escapeHtml(fieldLabel)}</span><b>${escapeHtml(labels['content.preview.missing'])}</b></figure>`
      : `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"><figcaption>${escapeHtml(corner)}</figcaption></figure>`;
  const pair = (big: boolean) =>
    `<div class="pair${big ? ' big' : ''}">${half(model.before, labels['content.result.before'], model.beforeAlt, model.beforeLabel)}${half(
      model.after,
      labels['content.result.after'],
      model.afterAlt,
      model.afterLabel,
    )}</div>`;
  // The same words the notice above the form already prints — one rule, said once in the
  // catalogue, wherever the editor shows it. With neither picture uploaded the two empty
  // slots below name themselves, and `resultNotices()` has its own line for that.
  const warn = model.half ? `<p class="warn">${escapeHtml(labels['content.result.pair'])}</p>` : '';
  return [
    `<section class="case"><h2 class="tag">${escapeHtml(labels['content.preview.card'])}</h2>${head}${pair(false)}${warn}${
      chips ? `<div class="chips">${chips}</div>` : ''
    }${caption}${alts}</section>`,
    `<section class="case"><h2 class="tag">${escapeHtml(labels['content.preview.zoom'])}</h2>${head}${pair(true)}${
      chips ? `<div class="chips">${chips}</div>` : ''
    }${caption}${note}</section>`,
  ].join('');
}

/** The pane's own drawing of a case — inline, because the frame carries no stylesheet. */
const CASE_CSS = [
  '.case{margin:0 0 1.2rem;padding:.8rem;border:1px solid #e4e4e4;border-radius:.7rem;background:#fafafa}',
  '.tag{margin:0 0 .5rem;font-size:.7rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:#8a8a8a}',
  '.head{margin:0;font-size:1.05rem;line-height:1.35}',
  '.pair{display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-top:.6rem}',
  '.pair figure{margin:0;position:relative}',
  '.pair img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:.5rem}',
  '.pair.big img{aspect-ratio:3/2;object-fit:contain;background:#111}',
  '.pair figcaption{position:absolute;bottom:.4rem;inset-inline-start:.4rem;background:rgba(0,0,0,.72);color:#fff;font-size:.7rem;font-weight:700;padding:.1rem .5rem;border-radius:99px}',
  '.pair.big figcaption{top:.4rem;bottom:auto}',
  '.miss{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.2rem;aspect-ratio:1/1;border:1px dashed #bdbdbd;border-radius:.5rem;background:#f1f1f1;color:#6b6b6b;font-size:.75rem;text-align:center;padding:.3rem}',
  '.pair.big .miss{aspect-ratio:3/2}',
  '.warn{margin:.6rem 0 0;padding:.4rem .6rem;border:1px solid #edd3a1;border-radius:.5rem;background:#fff8ea;color:#7a5200;font-size:.8rem}',
  '.chips{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.6rem}',
  '.chip{border:1px solid #e0e0e0;border-radius:99px;background:#fff;padding:.1rem .55rem;font-size:.75rem;color:#444}',
  '.cap{margin:.5rem 0 0;font-size:.85rem;font-weight:600;color:#333}',
  '.note{margin:.5rem 0 0;white-space:pre-line;border-inline-start:2px solid #d9b45b;padding-inline-start:.6rem;font-size:.8rem;color:#444}',
  '.alt{margin:.3rem 0 0;font-size:.72rem;color:#777}',
].join('');

/**
 * The search-result read-out for the language being edited, following `publicSeo()`:
 * a heading this locale lacks borrows the other one, and a description both languages
 * lack shows the heading — which is what the site would actually emit.
 */
export function seoReadout(input: {
  kind: ContentKind;
  key: string;
  listKey?: string;
  locale: ContentLocale;
  title: string;
  otherTitle: string;
  description: string;
  otherDescription: string;
}): { title: string; description: string; path: string | null; titleLength: number; descriptionLength: number } {
  const heading = input.title.trim() || input.otherTitle.trim();
  const description = input.description.trim() || input.otherDescription.trim() || heading;
  const path = publicPathOf(input.kind, input.key, input.listKey);
  return {
    title: heading,
    description,
    path: path ? localizedPath(path, input.locale) : null,
    titleLength: [...heading].length,
    descriptionLength: [...description].length,
  };
}
