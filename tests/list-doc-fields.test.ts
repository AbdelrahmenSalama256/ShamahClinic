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
 *   - **a box of one language says which field it belongs to.** The eye has the two halves
 *     side by side under the field's heading and needs only the language word; the voice hears
 *     one control at a time and gets `Field — Language`. A row of five benefits read aloud as
 *     "Arabic, English, Arabic, English" is the same form with the labels gone missing.
 *
 * Slice R adds one field type to that contract, because a result may open with a journal
 * article behind it: `story` names the one it opens, and may name none. The suite checks the
 * two ways that can go wrong — a picker that asks for an id nobody can read, and a before/after
 * pair that is one typed path each.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { catalogFor } from '../src/lib/console/messages';
import { ListDocFields, type ReferenceChoice } from '../src/components/console/ListDocFields';
import {
  UNKNOWN_FORM_KEY,
  emptyListDocForm,
  listDocAlt,
  listDocForm,
  listDocFromForm,
  listDocImage,
  listDocIntro,
  listDocText,
  listSchemaOf,
  listSchemas,
  schemaStems,
  type ListSchema,
} from '../src/lib/content/list-schema';
import type { Form } from '../src/lib/console/editor-form';

const labels = catalogFor('ar');

const read = (...parts: string[]): string => readFileSync(join(process.cwd(), ...parts), 'utf8');
const editorSource = read('src', 'components', 'console', 'ConsoleEditor.tsx');

function renderForm(
  schema: ListSchema,
  form: Form,
  extra?: Record<string, unknown>,
  options?: Record<string, ReferenceChoice[]>,
): string {
  const withUnknown: Form = { ...form };
  if (extra && Object.keys(extra).length > 0) withUnknown[UNKNOWN_FORM_KEY] = JSON.stringify(extra);
  return renderToStaticMarkup(
    createElement(ListDocFields, {
      schema,
      form: withUnknown,
      errors: {},
      referenceOptions: options ?? {},
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

/** HTML entities React escapes in a label, back to the characters a voice reads. */
function unscape(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** Every `<label for>` on the page, with what the voice reads and what the eye reads. */
function labelNodes(markup: string): { id: string; spoken: string; visible: string }[] {
  return [...markup.matchAll(/<label for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)].map(([, id, body]) => ({
    id,
    spoken: unscape(body.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim(),
    visible: unscape(body.replace(/<span class="console-sr-only">[\s\S]*?<\/span>/g, '').replace(/<[^>]*>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim(),
  }));
}

/**
 * How many boxes of a list's form hold one language of one field.
 *
 * The count is what turns "every named box reads well" into "no box was left unnamed": a pair
 * drawn without its field in front of the language drops out of the sample below, and the
 * expectation on the total says so.
 */
function bilingualBoxes(schema: ListSchema): number {
  let boxes = 0;
  for (const field of schema.fields) {
    if (field.type === 'text' && !field.mono) boxes += field.html ? 0 : 2;
    if (field.type === 'list') boxes += 2;
    if (field.type === 'children') boxes += 2 * field.row.filter((cell) => cell.type === 'text').length;
  }
  return boxes;
}

/**
 * A document that names every field of a list, so each one has a row on screen.
 *
 * A repeatable field draws nothing until it holds something, and "the form paints every
 * field" is only worth asserting if the row that proves it exists.
 */
function sampleDoc(schema: ListSchema): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.type === 'refs' || field.type === 'story') continue;
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
      // A row of a repeatable field is drawn only when it holds something, and which cells it
      // holds is the schema's answer, not the test's: a benefit is a sentence and a title, a
      // gallery row is a picture and its words.
      const row: Record<string, unknown> = {};
      for (const cell of field.row) {
        if (cell.type === 'text') {
          row[`${cell.stem}_ar`] = 'ب';
          row[`${cell.stem}_en`] = 'b';
        } else if (cell.type === 'image') {
          row[cell.stem] = '/uploads/202610/abc.webp';
        } else if (cell.type === 'select') {
          row[cell.stem] = cell.options?.[0]?.value ?? '';
        } else {
          row[cell.stem] = '/b';
        }
      }
      doc[field.stem] = [row];
      continue;
    }
    if (field.type === 'sections') {
      doc[field.stem] = field.sections.map((section) => ({ key: section.key, visible: true }));
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
    if (field.type === 'text' && field.mono) {
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
        if (field.type === 'story') {
          // With no article to pick the control cannot be drawn; what must exist is the
          // sentence that says what is missing and where to write one.
          expect(markup, `${schema.key}.${field.stem} says there is nothing to pick`).toContain(labels['content.list.story.empty']);
          continue;
        }
        if (field.type === 'children') {
          // A sub-item's cells are named by their row and their column, not by the field.
          expect(markup, `${schema.key}.${field.stem} has a row`).toContain('id="child-');
          expect(markup, `${schema.key}.${field.stem} can be added to`).toContain('console-doc-add');
          continue;
        }
        if (field.type === 'sections') {
          // A section is not a control with the field's id: it is a row of the page's own
          // order. What has to be on screen is every section of the catalogue, named in the
          // words this form's locale draws it in — a section the person cannot see is a
          // section they cannot show or hide.
          expect(markup, `${schema.key}.${field.stem} is a list of sections`).toContain('console-doc-section');
          for (const section of field.sections) {
            expect(markup, `${schema.key}.${field.stem} names ${section.key}`).toContain(section.label.ar);
          }
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
          // A column the site prints as markup is a page you write, not tags you read: one editor
          // per language, opening in that language's direction. The editable surface itself is
          // built by TipTap after mount, so the row's `id` and accessible name reaching it are
          // proved in `tests/block-editor.test.ts`, and what is paintable here is the frame.
          expect(markup, `${schema.key}.${field.stem} arabic`).toContain('console-block-editor" dir="rtl"');
          expect(markup, `${schema.key}.${field.stem} english`).toContain('console-block-editor" dir="ltr"');
          expect(markup, `${schema.key}.${field.stem} gives the surface its tools`).toContain('role="toolbar"');
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

  it('names every bilingual box with the field it belongs to', () => {
    const languages = [labels['content.locale.ar'], labels['content.locale.en']];
    const pattern = / — (العربية|English)$/;

    for (const schema of listSchemas()) {
      const markup = renderForm(schema, listDocForm(schema, sampleDoc(schema)));
      // A box whose only visible word is a language is a box a voice cannot place in the form.
      const pairs = labelNodes(markup).filter((node) => languages.some((word) => node.visible.endsWith(word)));

      expect(pairs.length, `${schema.key} labels every bilingual box`).toBe(bilingualBoxes(schema));
      for (const node of pairs) {
        expect(node.spoken, `${schema.key}.${node.id} says which field it is`).toMatch(pattern);
        expect(node.spoken.replace(pattern, ''), `${schema.key}.${node.id} names the field`).not.toBe('');
        // The words on the screen did not move: the field's name went in front of the language
        // for the voice alone, so a person looking at the row still reads one short word.
        expect(languages.some((word) => node.visible.endsWith(word)), `${schema.key}.${node.id} keeps its language`).toBe(true);
      }

      // The boxes a `<label>` cannot reach: a contenteditable surface takes its name from
      // `aria-label`, which TipTap writes onto its element when the document mounts — proved in
      // `tests/block-editor.test.ts`. What this render can prove is that there is exactly one
      // editor per language for every html field, and that the Arabic one reads right-to-left.
      const frames = [...markup.matchAll(/class="console-block-editor" dir="(rtl|ltr)"/g)].map(([, dir]) => dir);
      const htmlFields = schema.fields.filter((field) => field.type === 'text' && field.html && !field.mono);
      expect(frames.length, `${schema.key} opens one editor per language`).toBe(2 * htmlFields.length);
      expect(frames.filter((dir) => dir === 'rtl').length, `${schema.key} writes Arabic right-to-left`).toBe(htmlFields.length);
    }

    // One list read by name, so the shape of the words is on the page and not only inside a loop.
    const results = listSchemaOf('results')!;
    const drawn = labelNodes(renderForm(results, listDocForm(results, sampleDoc(results))));
    expect(drawn.find((node) => node.id === 'list-field-title-ar')).toMatchObject({
      spoken: 'عنوان النتيجة — العربية',
      visible: 'العربية',
    });
    expect(drawn.find((node) => node.id === 'list-field-afterAlt-en')).toMatchObject({
      spoken: 'وصف صورة بعد — English',
      visible: 'English',
    });
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

  it('paints the result case: an article to open and two pictures to upload', () => {
    const results = listSchemaOf('results')!;
    const doc = {
      story: 'fractional-laser-face',
      title_ar: 'بعد أربع جلسات',
      title_en: 'After four sessions',
      area_ar: 'الوجه',
      area_en: 'The face',
      sessions_ar: '٤ جلسات',
      sessions_en: '4 sessions',
      service: ['peeling'],
      before: '/uploads/202610/before.webp',
      after: '/uploads/202610/after.webp',
      beforeAlt_ar: 'بشرة قبل الليزر',
      beforeAlt_en: 'Skin before the laser',
      afterAlt_ar: 'بشرة بعد أربع جلسات',
      afterAlt_en: 'Skin after four sessions',
      caption_ar: 'الليزر الجزئي للوجه',
      caption_en: 'Fractional laser for the face',
      note_ar: 'ثلاث جلسات على مدى شهرين.',
      note_en: 'Three sessions over two months.',
      phrases: ['result'],
    };
    const choices: Record<string, ReferenceChoice[]> = {
      story: [{ key: 'fractional-laser-face', label: 'الليزر الجزئي للوجه' }],
      service: [{ key: 'peeling', label: 'تقشير البشرة' }],
    };
    const markup = renderForm(results, listDocForm(results, doc), undefined, choices);

    // The article is named by its title, and the value behind that name is the slug the
    // site joins on — never a WordPress number a person would have to remember. It is also
    // the one thing a result can do without, so the picker has to say what empty means.
    expect(tagFor(markup, 'list-field-story')).toContain('<select');
    expect(markup).toContain('<option value="fractional-laser-face"');
    expect(markup).toContain('الليزر الجزئي للوجه');
    expect(markup).toContain(`<option value="">${labels['content.list.story.none']}</option>`);
    // A service is chosen the same way.
    expect(markup).toContain('تقشير البشرة');

    // Two upload slots, and the picture each holds is drawn from the address the server
    // returned — there is no box in which a path can be typed.
    expect(tagFor(markup, 'list-field-before')).toContain('type="file"');
    expect(tagFor(markup, 'list-field-after')).toContain('type="file"');
    expect(markup).toContain('<img src="/uploads/202610/before.webp"');
    expect(markup).toContain('<img src="/uploads/202610/after.webp"');
    expect(markup).not.toMatch(/value="\/uploads\//);

    // The words that go with the pair: a line under it, a longer text for the enlarged view,
    // and a description of its own for each picture. One sentence for both halves is what the
    // older form could type, and it is the wrong thing to keep asking for — a face before a
    // peel and the same face after it are not the same picture.
    expect(tagFor(markup, 'list-field-caption-ar')).toContain('<input');
    expect(tagFor(markup, 'list-field-note-ar')).toContain('<textarea');
    expect(tagFor(markup, 'list-field-beforeAlt-ar')).toContain('value="بشرة قبل الليزر"');
    expect(tagFor(markup, 'list-field-afterAlt-ar')).toContain('value="بشرة بعد أربع جلسات"');
    // and the two chips the card shows beside the pictures.
    expect(tagFor(markup, 'list-field-area-ar')).toContain('value="الوجه"');
    expect(tagFor(markup, 'list-field-sessions-ar')).toContain('value="٤ جلسات"');
    // The field the split replaced is gone: no box left to type the shared sentence into.
    expect(tagFor(markup, 'list-field-alt-ar')).toBe('');
    expect(markup).not.toContain('&quot;');
  });

  it('writes the case back as the document the site reads', () => {
    const results = listSchemaOf('results')!;
    const doc = {
      story: 'fractional-laser-face',
      title_ar: 'بعد أربع جلسات',
      before: '/uploads/202610/before.webp',
      after: '/uploads/202610/after.webp',
      beforeAlt_ar: 'بشرة قبل الليزر',
      afterAlt_en: 'Skin after four sessions',
      area_ar: 'الوجه',
      sessions_ar: '٤ جلسات',
      caption_ar: 'الليزر الجزئي للوجه',
      phrases: ['result'],
    };
    const parsed = listDocFromForm(results, listDocForm(results, doc));
    expect(parsed.issues).toEqual([]);
    expect(parsed.doc.story).toBe('fractional-laser-face');
    expect(parsed.doc.before).toBe('/uploads/202610/before.webp');
    expect(parsed.doc.after).toBe('/uploads/202610/after.webp');
    expect(parsed.doc.phrases).toEqual(['result']);
    // The card shows what the session produced, not whichever picture field the schema
    // happens to list first.
    expect(listDocImage(results, parsed.doc, 'after')).toBe('/uploads/202610/after.webp');
    expect(listDocImage(results, parsed.doc, 'before')).toBe('/uploads/202610/before.webp');
    // The sentence under the two pictures is `caption`, read by its own stem. The generic
    // teaser reader is not what a case is drawn from: it walks its preferred stems in order
    // and answers here with the area, which is a chip beside the pictures rather than the
    // line below them. Asserted, so the two disagreeing readers stay visible.
    expect(listDocText(results, parsed.doc, 'caption', 'ar')).toBe('الليزر الجزئي للوجه');
    expect(listDocIntro(results, parsed.doc, 'ar')).toBe('الوجه');
    // Each half keeps the description written for it, and the two chips keep their words.
    expect(listDocText(results, parsed.doc, 'beforeAlt', 'ar')).toBe('بشرة قبل الليزر');
    expect(listDocText(results, parsed.doc, 'afterAlt', 'en')).toBe('Skin after four sessions');
    expect(listDocText(results, parsed.doc, 'area', 'ar')).toBe('الوجه');
    expect(listDocText(results, parsed.doc, 'sessions', 'ar')).toBe('٤ جلسات');
    // A `results` row has no single shared description to read: the field the split replaced
    // is not in its schema, so the generic reader answers with nothing and the site asks each
    // half by its own stem.
    expect(listDocAlt(results, parsed.doc)).toEqual({ ar: '', en: '' });
    // A row that names no article is a valid document, and stays saveable: the imported rows
    // attach by their WordPress id, and a result the owner titled and photographed needs
    // neither. What the editor does is say out loud which states the page cannot draw.
    expect(listDocFromForm(results, emptyListDocForm(results)).issues).toEqual([]);
  });

  it('leaves no door to the document open in the editor either', () => {
    // A JSON column is never drawn as a field of its own: the typed form owns a document
    // that has a schema — a list, or a page such as /about — and an empty column has
    // nothing to show.
    expect(editorSource).toContain("!(field.kind === 'json' && (listSchema !== null || field.draftJson === null))");
    // And a JSON column the console has no form for answers with a sentence, before the
    // textarea branch that used to be a place to paste a document.
    const refusal = editorSource.indexOf("if (field.kind === 'json')");
    const box = editorSource.indexOf('<Textarea');
    expect(refusal).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(box);
    expect(editorSource).toContain('content.list.no_form');
  });

  it('puts each of a service row\'s fourteen sections behind its own door', () => {
    const services = listSchemaOf('services')!;
    const markup = renderForm(services, emptyListDocForm(services));
    const groupKeys = [...new Set(services.fields.map((field) => field.group?.key).filter((key): key is string => Boolean(key)))];
    expect(groupKeys).toHaveLength(14);

    const doors = markup.match(/<details class="console-doc-group-box"[^>]*>/g) ?? [];
    expect(doors).toHaveLength(14);
    // Every door starts open, so nothing an owner wrote is hidden behind a click they have
    // not made yet, and the row reads as the whole page it is.
    for (const door of doors) expect(door).toContain('open=""');

    // The name of each group is the door's handle, in the language the screen speaks.
    for (const key of groupKeys) {
      const label = services.fields.find((field) => field.group?.key === key)!.group!.label.ar;
      expect(unscape(markup)).toContain(label);
    }
    // A heading is a handle, not a floating line between fields.
    expect(markup).not.toContain('<h3 class="console-doc-group">');

    // A closed door is still a door with the room behind it: the fields are children of the
    // `<details>`, so hiding a section never removes a control somebody has typed into —
    // which is the whole reason this is a disclosure and not a filter.
    const opened = markup.indexOf('<details class="console-doc-group-box"');
    const fields = markup.indexOf('<div class="console-doc-group-fields">');
    const shut = markup.indexOf('</details>');
    expect(opened).toBeGreaterThan(-1);
    expect(fields).toBeGreaterThan(opened);
    expect(shut).toBeGreaterThan(fields);
    for (const field of services.fields) {
      const control = markup.search(new RegExp(`id="${field.stem}`));
      if (control === -1) continue;
      expect(control).toBeGreaterThan(opened);
    }

    // A list whose schema names no group keeps the flat form it has always drawn.
    const branches = listSchemaOf('branches')!;
    expect(renderForm(branches, emptyListDocForm(branches))).not.toContain('console-doc-group-box');
  });
});
