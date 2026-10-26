/**
 * #255 / slice F: a list item opens as a form, and never as a document.
 *
 * The owner's second point was about a screen: *"the 'Data' textarea that accepts JSON is a
 * security and usability defect; remove it everywhere … no generic 'edit the data' screen
 * should remain, not even for owners."* A list item has no columns of its own — its whole
 * content is one JSON document — so the fix is a contract (`list-schema.ts`) plus the form
 * this file paints from it. What the contract cannot prove is what a person sees, so this
 * suite renders `ListDocFields` for real through React's own string renderer:
 *
 *   - **every field a list names gets a control**, in all six lists, so a schema cannot grow
 *     a field that only exists on the server. A field that is not drawn is a field an owner
 *     cannot edit, which is the same defect with a green test suite.
 *   - **the form has no key that is not a field.** `data` was the name of the textarea. If it
 *     comes back, the whole document is one box again.
 *   - **a value the site keeps once is typed once.** The branch phone is one number for the
 *     whole site; two boxes for it is one more way to get it wrong.
 *   - **a picture is chosen, not pasted**, in a list item exactly as in an article.
 *   - **a key the form does not describe is shown, and its value is nowhere editable.** The
 *     server refuses unknown fields; the screen has to say so without handing over a box to
 *     type them into.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { catalogFor } from '../src/lib/console/messages';
import { ListDocFields } from '../src/components/console/ListDocFields';
import {
  UNKNOWN_FORM_KEY,
  listDocForm,
  listSchemaOf,
  listSchemas,
  schemaStems,
  type ListSchema,
} from '../src/lib/content/list-schema';
import type { Form } from '../src/lib/console/editor-form';

const labels = catalogFor('ar');

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), 'utf8');
const editorSource = read('src', 'components', 'console', 'ConsoleEditor.tsx');

function renderForm(schema: ListSchema, form: Form, extra?: Record<string, unknown>): string {
  const withUnknown: Form = { ...form };
  if (extra && Object.keys(extra).length > 0) withUnknown[UNKNOWN_FORM_KEY] = JSON.stringify(extra);
  return renderToStaticMarkup(
    createElement(ListDocFields, {
      schema,
      form: withUnknown,
      errors: {},
      referenceOptions: {},
      locale: 'ar',
      disabled: false,
      labels,
      onChange: () => undefined,
    }),
  );
}

/** The one opening tag that names this control, whether it is an input, a box or a select. */
function tagFor(markup: string, id: string): string {
  const tags = markup.match(/<(?:input|textarea|select)\b[^>]*>/g) ?? [];
  return tags.find((tag) => tag.includes(`id="${id}"`)) ?? '';
}

const countOf = (markup: string, id: string): number => (markup.match(new RegExp(`id="${id}"`, 'g')) ?? []).length;

/**
 * A document that names every field of a list, so each one has a row on screen.
 *
 * A repeatable field draws nothing until it holds something, and "the form paints every
 * field" is only worth asserting if the row that proves it exists.
 */
function sampleDoc(schema: ListSchema): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.type === 'refs') continue;
    if (field.type === 'list') {
      doc[`${field.stem}_ar`] = ['ب'];
      doc[`${field.stem}_en`] = ['b'];
      continue;
    }
    if (field.type === 'strings') {
      doc[field.stem] = ['b'];
      continue;
    }
    if (field.type === 'children') {
      doc[field.stem] = [{ label_ar: 'ب', label_en: 'b', href: '/b' }];
      continue;
    }
    if (field.type === 'number') {
      doc[field.stem] = 1;
      continue;
    }
    if (field.type === 'flag') {
      doc[field.stem] = true;
      continue;
    }
    if (field.type === 'select') {
      doc[field.stem] = field.options[0]?.value ?? '';
      continue;
    }
    if (field.type === 'image') {
      doc[field.stem] = '/uploads/202610/abc.webp';
      continue;
    }
    if (field.type === 'href') {
      doc[field.stem] = '/b';
      continue;
    }
    if (field.mono) {
      doc[field.stem] = '+20 100';
      continue;
    }
    doc[`${field.stem}_ar`] = 'ب';
    doc[`${field.stem}_en`] = 'b';
  }
  return doc;
}

describe('what the typed list form really paints (BK-20 F)', () => {
  it('draws a control for every field of all six lists', () => {
    for (const schema of listSchemas()) {
      const markup = renderForm(schema, listDocForm(schema, sampleDoc(schema)));
      for (const field of schema.fields) {
        const id = `list-field-${field.stem}`;
        if (field.type === 'refs') {
          expect(markup, `${schema.key}.${field.stem} offers choices`).toContain(labels['content.list.refs.empty']);
          continue;
        }
        if (field.type === 'children') {
          // A sub-item's cells are named by their row and their column, not by the field.
          expect(markup, `${schema.key}.${field.stem} has a row`).toContain('id="child-');
          expect(markup, `${schema.key}.${field.stem} can be added to`).toContain('console-doc-add');
          continue;
        }
        if (field.type === 'list') {
          expect(tagFor(markup, `${id}-ar-0`), `${schema.key}.${field.stem} arabic row`).toContain('dir="rtl"');
          expect(tagFor(markup, `${id}-en-0`), `${schema.key}.${field.stem} english row`).toContain('dir="ltr"');
          continue;
        }
        if (field.type === 'strings') {
          expect(tagFor(markup, `${id}-0`), `${schema.key}.${field.stem} row`).not.toBe('');
          continue;
        }
        if (field.type === 'text' && field.html) {
          // A column the site prints as markup is a page you write, not tags you read: one
          // editable surface per language, and no box that shows the source.
          expect(markup, `${schema.key}.${field.stem} arabic`).toContain(`id="${id}-ar" role="textbox"`);
          expect(markup, `${schema.key}.${field.stem} english`).toContain(`id="${id}-en" role="textbox"`);
          continue;
        }
        if (field.type === 'text' && !field.mono) {
          // The document's keys are `name_ar`/`name_en`; the controls they become are named
          // with hyphens, so the assertion follows the DOM, not the JSON.
          expect(tagFor(markup, `${id}-ar`), `${schema.key}.${field.stem} arabic`).toContain('dir="rtl"');
          expect(tagFor(markup, `${id}-en`), `${schema.key}.${field.stem} english`).toContain('dir="ltr"');
          continue;
        }
        expect(tagFor(markup, id), `${schema.key}.${field.stem} is a control`).not.toBe('');
      }
    }
  });

  it('holds the fields a list names, and no document', () => {
    for (const schema of listSchemas()) {
      const form = listDocForm(schema, {});
      const roots = new Set(Object.keys(form).map((key) => key.split('.')[0]));
      for (const root of roots) {
        expect(schemaStems(schema), `${schema.key}: ${root} is a field, not a document`).toContain(
          root.replace(/_(ar|en)$/, ''),
        );
      }
      expect(form).not.toHaveProperty('data');
      expect(renderForm(schema, form)).not.toMatch(/name="data"|id="list-field-data"/);
    }
  });

  it('types the branch phone once, because the site reads it once', () => {
    const branches = listSchemaOf('branches')!;
    const markup = renderForm(branches, listDocForm(branches, { name_ar: 'فرع مدينة نصر', name_en: 'Nasr City', phone: '+20 100 999 8887' }));
    expect(countOf(markup, 'list-field-phone')).toBe(1);
    const phone = tagFor(markup, 'list-field-phone');
    expect(phone).toContain('dir="ltr"');
    expect(phone).toContain('value="+20 100 999 8887"');
    expect(phone).toContain('maxLength="40"');
    // A pair for this key would be two boxes whose second one the form ignores.
    expect(markup).not.toMatch(/id="list-field-phone[-_](ar|en)"/);
  });

  it('chooses a list picture from the disk and never as a path', () => {
    const branches = listSchemaOf('branches')!;
    const markup = renderForm(branches, listDocForm(branches, { name_ar: 'فرع', image: '/uploads/202610/abc.webp' }));
    expect(tagFor(markup, 'list-field-image')).toContain('type="file"');
    expect(markup).toContain('<img src="/uploads/202610/abc.webp"');
    // The address the server returned is the picture, not a value a person can rewrite.
    expect(markup).not.toMatch(/value="\/uploads\/202610\/abc\.webp"/);
  });

  it('gives a service the one link its card is built from', () => {
    const services = listSchemaOf('services')!;
    const markup = renderForm(services, listDocForm(services, { name_ar: 'تقشير', href: '/peeling' }));
    const href = tagFor(markup, 'list-field-href');
    expect(href).toContain('dir="ltr"');
    expect(href).toContain('value="/peeling"');
    expect(countOf(markup, 'list-field-href')).toBe(1);
    // The long description is a page you write, not tags you read.
    expect(markup).not.toContain('name="data"');
  });

  it('makes an answer a box of words and a heading a box of words', () => {
    const faq = listSchemaOf('faq')!;
    const markup = renderForm(faq, listDocForm(faq, { question_ar: 'كم جلسة؟', question_en: 'How many sessions?', answer_ar: 'أربع.', answer_en: 'Four.' }));
    const answer = tagFor(markup, 'list-field-answer-ar');
    expect(answer).toContain('<textarea');
    expect(answer).toContain('rows="4"');
    // A JSON document always quotes its keys; nothing here does.
    expect(markup).not.toContain('&quot;');
  });

  it('shows a key the form cannot describe, with no box to edit it in', () => {
    const nav = listSchemaOf('nav')!;
    const form = listDocForm(nav, { label_ar: 'الرئيسية', label_en: 'Home', href: '/home' });
    const markup = renderForm(nav, form, { legacy_marker: 'a value typed by hand' });
    expect(markup).toContain('<code class="console-doc-unknown-key">legacy_marker</code>');
    expect(markup).toContain(labels['content.list.unknown.remove']);
    // The key is named so it can be removed; the value it holds is not put on screen at all.
    expect(markup).not.toContain('a value typed by hand');
    expect(markup).not.toContain('&quot;');
    expect(markup).not.toMatch(/<textarea/);
  });

  it('leaves no door to the document open in the editor either', () => {
    // A list item's `data` column is not drawn as a field at all: the typed form owns it.
    expect(editorSource).toContain('!(row.kind === \'list_item\' && field.kind === \'json\')');
    // And a JSON column the console has no form for answers with a sentence, before the
    // textarea branch that used to be a place to paste a document.
    const refusal = editorSource.indexOf("if (field.kind === 'json')");
    const box = editorSource.indexOf('<Textarea');
    expect(refusal).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(box);
    expect(editorSource).toContain('content.list.no_form');
  });
});
