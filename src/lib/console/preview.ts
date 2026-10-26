/**
 * The editor's right-hand pane, as pure functions: what the row would look like, and
 * what a search result would say it looks like. Both read the **form**, not the row last
 * saved, because the point of a preview is to be wrong about the saved copy and right
 * about what the person is typing.
 *
 * Two rules keep the pane honest rather than decorative:
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
 */
import type { ContentKind, ContentLocale } from '../content/kinds';
import {
  listDocBody,
  listDocBullets,
  listDocFromForm,
  listDocImage,
  listDocIntro,
  listDocMeta,
  listDocTitle,
  listSchemaOf,
  UNKNOWN_FORM_KEY,
} from '../content/list-schema';
import { localizedPath, publicPathOf } from '../content/paths';

export type FormValue = string | boolean;
export type EditorForm = Record<string, FormValue>;

/** Which field of each kind carries the heading, the teaser and the body. */
const COPY: Record<ContentKind, { title: string; intro: string; body: string; meta: string[] }> = {
  article: { title: 'title', intro: 'excerpt', body: 'content', meta: ['image', 'categoryId', 'imageAlt'] },
  offer: { title: 'name', intro: 'excerpt', body: 'body', meta: ['price', 'regularPrice', 'currency', 'onSale', 'enabled'] },
  page: { title: 'title', intro: '', body: 'content', meta: ['redirectTo', 'enabled'] },
  list_item: { title: '', intro: '', body: '', meta: [] },
};

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
export function previewModel(kind: ContentKind, form: EditorForm, locale: ContentLocale, listKey?: string | null): PreviewModel {
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
    };
  }

  // A list item is previewed as the card its list draws: the document is built from the
  // same form the save builds, so the pane never shows JSON a person did not type.
  const schema = listSchemaOf(listKey);
  if (!schema) return { title: '', intro: '', body: '', bodyAs: 'text', image: null, bullets: [], fields };

  const doc = listDocFromForm(schema, form, extraOf(form)).doc;
  return {
    title: listDocTitle(schema, doc, locale),
    intro: listDocIntro(schema, doc, locale),
    body: listDocBody(schema, doc, locale),
    bodyAs: 'html',
    image: listDocImage(schema, doc),
    bullets: listDocBullets(schema, doc, locale),
    fields: listDocMeta(schema, doc, locale).map((meta) => ({ name: meta.label, value: meta.value })),
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
export function previewDocument(model: PreviewModel, locale: ContentLocale): string {
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
    '</style></head><body>',
    `<h1>${title}</h1>${image}${intro}${body}${bullets}${fields}`,
    '</body></html>',
  ].join('');
}

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
