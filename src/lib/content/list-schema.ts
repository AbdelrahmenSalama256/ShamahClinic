/**
 * The typed form of a list item's document.
 *
 * A list item stores one JSON document (`draft`/`published`) because six very different
 * things share one table. That was the database's choice, not the editor's: the console
 * showed the document as a textarea and asked a business owner to type JSON. This module
 * is the missing contract between the two — one field list per list, with a bilingual
 * label for every field and one plain-language hint, and a canonicaliser that turns a
 * document into the same shape every time.
 *
 * Three properties the rest of the console relies on:
 *
 * **One document in, one document out.** `parseListDoc()` accepts the flat keys the
 * importer writes (`name_ar`, `benefits_en`) and the nested `{ar, en}` shape rows saved
 * by an older editor, and answers with the flat, complete shape. A field the schema knows
 * is always present in the output, even when it is empty, so saving an untouched row
 * cannot make it look different from the row an import wrote.
 *
 * **Unknown keys are refused, never dropped.** A key the schema does not describe is
 * reported as `unknown field` and the write is rejected. The editor lists those keys and
 * offers to remove each one explicitly, because silently deleting somebody's data is
 * worse than refusing to save it.
 *
 * **The field names are the document's contract.** `../content/list-docs.ts` reads the
 * same stems back into the site's own types. A rename here is a rename there, not a
 * display label that quietly stops matching.
 *
 * This module is isomorphic: the editor's browser bundle imports it to draw the form and
 * the server imports it to validate the same form. Nothing here needs Node.
 */
import { plainText } from './format';
import type { ContentLocale } from './kinds';

export interface Bi {
  ar: string;
  en: string;
}

export interface ChildField {
  type: 'href' | 'text';
  stem: string;
  label: Bi;
  required?: boolean;
}

interface FieldBase {
  stem: string;
  label: Bi;
  hint?: Bi;
}

/**
 * `mono` marks a text field that holds one value for the whole site — a phone number, an
 * email — rather than a sentence that gets translated. It is stored under the bare stem,
 * which is the key the site already reads, and the editor draws one box, because asking
 * a person to type the same number twice is how a number ends up typed wrong once.
 */
export type ListField =
  | (FieldBase & { type: 'text'; mono?: boolean; multiline?: boolean; html?: boolean; required?: boolean; max?: number })
  | (FieldBase & { type: 'list'; required?: boolean })
  | (FieldBase & { type: 'strings' })
  | (FieldBase & { type: 'image'; required?: boolean })
  | (FieldBase & { type: 'number' })
  | (FieldBase & { type: 'flag' })
  | (FieldBase & { type: 'select'; options: readonly { value: string; label: Bi }[] })
  | (FieldBase & { type: 'href'; required?: boolean })
  | (FieldBase & { type: 'refs'; source: string })
  | (FieldBase & { type: 'children'; row: readonly ChildField[] });

export interface ListSchema {
  key: string;
  /** The field that names the row in a list, and in its editor heading. */
  title: string;
  fields: readonly ListField[];
}

const CATEGORY_LABELS: Record<string, Bi> = {
  laser: { ar: 'الليزر', en: 'Laser' },
  injectables: { ar: 'الحقن', en: 'Injectables' },
  skincare: { ar: 'العناية بالبشرة', en: 'Skincare' },
  'anti-aging': { ar: 'مكافحة الشيخوخة', en: 'Anti-aging' },
  general: { ar: 'عام', en: 'General' },
};

function optionsOf(values: readonly string[]): { value: string; label: Bi }[] {
  return values.map((value) => ({ value, label: CATEGORY_LABELS[value] ?? { ar: value, en: value } }));
}

const SERVICES: ListSchema = {
  key: 'services',
  title: 'name',
  fields: [
    {
      type: 'text',
      stem: 'name',
      label: { ar: 'اسم الخدمة', en: 'Service name' },
      hint: { ar: 'يظهر على بطاقة الخدمة وفي صفحتها.', en: 'Shown on the service card and its page.' },
      required: true,
      max: 200,
    },
    {
      type: 'text',
      stem: 'intro',
      label: { ar: 'جملة قصيرة', en: 'Short description' },
      hint: { ar: 'سطر واحد يشرح الخدمة تحت الاسم.', en: 'One line under the name that explains the service.' },
      multiline: true,
      max: 400,
    },
    {
      type: 'text',
      stem: 'description',
      label: { ar: 'الوصف الكامل', en: 'Full description' },
      hint: { ar: 'عدة جمل تظهر في صفحة الخدمة.', en: 'A few sentences shown on the service page.' },
      multiline: true,
      max: 4000,
    },
    { type: 'list', stem: 'benefits', label: { ar: 'الفوائد', en: 'Benefits' }, hint: { ar: 'نقطة لكل فائدة، بالعربية والإنجليزية.', en: 'One bullet per benefit, in Arabic and English.' } },
    { type: 'list', stem: 'steps', label: { ar: 'خطوات الجلسة', en: 'Session steps' }, hint: { ar: 'ما يحدث في الجلسة بالترتيب.', en: 'What happens during the session, in order.' } },
    { type: 'list', stem: 'aftercare', label: { ar: 'العناية بعد الجلسة', en: 'Aftercare' }, hint: { ar: 'التعليمات التي تُعطى للمريضة بعد الجلسة.', en: 'Instructions the patient is given afterwards.' } },
    { type: 'text', stem: 'ideal', label: { ar: 'مناسب لمن', en: 'Best for' }, hint: { ar: 'نوع الحالات التي تستفيد من الخدمة.', en: 'The kind of cases this service suits.' }, multiline: true, max: 600 },
    { type: 'text', stem: 'duration', label: { ar: 'مدة الجلسة', en: 'Session time' }, hint: { ar: 'مثال: ٣٠–٤٥ دقيقة.', en: 'For example: 30–45 minutes.' }, max: 120 },
    { type: 'text', stem: 'sessions', label: { ar: 'عدد الجلسات', en: 'Sessions advised' }, hint: { ar: 'مثال: ٤–٦ جلسات.', en: 'For example: 4–6 sessions.' }, max: 120 },
    { type: 'number', stem: 'price', label: { ar: 'السعر يبدأ من', en: 'Starting price' }, hint: { ar: 'اتركيه فارغًا إذا لم تريد إظهار سعر.', en: 'Leave empty to show no price.' } },
    { type: 'image', stem: 'image', label: { ar: 'الصورة', en: 'Image' }, hint: { ar: 'ارفعي صورة من جهازك.', en: 'Upload a picture from your device.' } },
    { type: 'text', stem: 'alt', label: { ar: 'وصف الصورة', en: 'Image description' }, hint: { ar: 'جملة تقرأها قارئات الشاشة لمن لا يرى الصورة.', en: 'Read aloud to people who cannot see the picture.' }, max: 300 },
    { type: 'text', stem: 'body', label: { ar: 'تفاصيل إضافية', en: 'Extra details' }, hint: { ar: 'اختياري: نص طويل يظهر أسفل صفحة الخدمة.', en: 'Optional: longer text below the service page.' }, multiline: true, html: true },
    { type: 'flag', stem: 'featured', label: { ar: 'خدمة مميزة', en: 'Featured service' }, hint: { ar: 'تظهر ضمن الخدمات البارزة في الرئيسية.', en: 'Show among the highlighted services on the home page.' } },
    { type: 'select', stem: 'category', label: { ar: 'التصنيف', en: 'Category' }, options: optionsOf(['laser', 'injectables', 'skincare', 'anti-aging']) },
    // A WordPress service is a section of one page, so a card links to `/services` unless
    // its author writes an address of its own. One field, because the site reads one.
    { type: 'href', stem: 'href', label: { ar: 'رابط الخدمة (اختياري)', en: 'Service link (optional)' }, hint: { ar: 'مسار داخل الموقع مثل /peeling. اتركه فارغًا ليذهب إلى صفحة الخدمات.', en: 'A path inside the site, such as /peeling. Leave it empty to point at the services page.' } },
  ],
};

const BRANCHES: ListSchema = {
  key: 'branches',
  title: 'name',
  fields: [
    { type: 'text', stem: 'name', label: { ar: 'اسم الفرع', en: 'Branch name' }, hint: { ar: 'مثال: فرع مدينة نصر.', en: 'For example: Nasr City.' }, required: true, max: 200 },
    { type: 'text', stem: 'area', label: { ar: 'المنطقة', en: 'Area' }, hint: { ar: 'الحي أو المدينة.', en: 'The district or city.' }, max: 200 },
    { type: 'text', stem: 'address', label: { ar: 'العنوان', en: 'Address' }, hint: { ar: 'العنوان الكامل كما يظهر على الموقع.', en: 'The full address shown on the site.' }, multiline: true, max: 600 },
    { type: 'text', stem: 'phone', mono: true, label: { ar: 'الهاتف', en: 'Phone' }, hint: { ar: 'رقم الفرع للاتصال والواتساب.', en: 'The branch number for calls and WhatsApp.' }, max: 40 },
    { type: 'image', stem: 'image', label: { ar: 'الصورة', en: 'Image' }, hint: { ar: 'ارفعي صورة من جهازك.', en: 'Upload a picture from your device.' } },
    { type: 'text', stem: 'intro', label: { ar: 'نبذة', en: 'Short introduction' }, hint: { ar: 'سطران يعرّفان بالفرع.', en: 'A couple of lines about the branch.' }, multiline: true, max: 800 },
    { type: 'list', stem: 'features', label: { ar: 'ما يميز الفرع', en: 'Branch highlights' }, hint: { ar: 'نقطة لكل ميزة.', en: 'One bullet per highlight.' } },
    { type: 'text', stem: 'landmark', label: { ar: 'علامة مميزة قريبة', en: 'Nearby landmark' }, hint: { ar: 'يساعد المريضة على الوصول.', en: 'Helps a patient find the door.' }, max: 300 },
  ],
};

const SPECIALISTS: ListSchema = {
  key: 'specialists',
  title: 'name',
  fields: [
    { type: 'text', stem: 'name', label: { ar: 'الاسم', en: 'Name' }, hint: { ar: 'كما يظهر على الموقع.', en: 'As shown on the site.' }, required: true, max: 200 },
    { type: 'text', stem: 'title', label: { ar: 'المسمى الوظيفي', en: 'Job title' }, hint: { ar: 'مثال: استشارية الأمراض الجلدية.', en: 'For example: Consultant dermatologist.' }, max: 200 },
    { type: 'text', stem: 'credentials', label: { ar: 'المؤهلات', en: 'Credentials' }, hint: { ar: 'الشهادات والعضويات.', en: 'Degrees and memberships.' }, multiline: true, max: 600 },
    { type: 'text', stem: 'bio', label: { ar: 'نبذة', en: 'Biography' }, hint: { ar: 'فقرات قصيرة عن الخبرة والأسلوب.', en: 'A short paragraph about experience and approach.' }, multiline: true, max: 2000 },
    { type: 'list', stem: 'specialties', label: { ar: 'التخصصات', en: 'Specialties' }, hint: { ar: 'نقطة لكل تخصص.', en: 'One bullet per specialty.' } },
    { type: 'number', stem: 'experience', label: { ar: 'سنوات الخبرة', en: 'Years of experience' }, hint: { ar: 'رقم فقط.', en: 'A number only.' } },
    { type: 'refs', stem: 'branches', source: 'branches', label: { ar: 'الفروع', en: 'Branches' }, hint: { ar: 'اختاري الفروع التي تعمل بها.', en: 'Pick the branches this person works in.' } },
    { type: 'image', stem: 'image', label: { ar: 'الصورة', en: 'Image' }, hint: { ar: 'ارفعي صورة من جهازك.', en: 'Upload a picture from your device.' } },
    { type: 'text', stem: 'alt', label: { ar: 'وصف الصورة', en: 'Image description' }, hint: { ar: 'جملة تقرأها قارئات الشاشة.', en: 'Read aloud to people who cannot see the picture.' }, max: 300 },
  ],
};

const FAQ: ListSchema = {
  key: 'faq',
  title: 'question',
  fields: [
    { type: 'text', stem: 'question', label: { ar: 'السؤال', en: 'Question' }, hint: { ar: 'اكتبي السؤال كما تسأله المريضة.', en: 'Write the question the way a patient asks it.' }, required: true, max: 400 },
    { type: 'text', stem: 'answer', label: { ar: 'الإجابة', en: 'Answer' }, hint: { ar: 'إجابة واضحة بدون وعود طبية.', en: 'A clear answer with no medical promises.' }, multiline: true, max: 4000 },
    { type: 'select', stem: 'category', label: { ar: 'التصنيف', en: 'Category' }, options: optionsOf(['laser', 'injectables', 'skincare', 'general']) },
  ],
};

const NAV: ListSchema = {
  key: 'nav',
  title: 'label',
  fields: [
    { type: 'text', stem: 'label', label: { ar: 'النص في القائمة', en: 'Menu label' }, hint: { ar: 'الكلمة التي تظهر في أعلى الموقع.', en: 'The word shown in the site header.' }, required: true, max: 120 },
    { type: 'href', stem: 'href', label: { ar: 'الرابط', en: 'Link' }, hint: { ar: 'مسار داخل الموقع مثل /services.', en: 'A path inside the site, such as /services.' }, required: true },
    {
      type: 'children',
      stem: 'children',
      label: { ar: 'عناصر فرعية', en: 'Sub-items' },
      hint: { ar: 'روابط تظهر تحت هذا العنصر.', en: 'Links shown under this entry.' },
      row: [
        { type: 'text', stem: 'label', label: { ar: 'النص', en: 'Label' }, required: true },
        { type: 'href', stem: 'href', label: { ar: 'الرابط', en: 'Link' }, required: true },
      ],
    },
  ],
};

const RESULTS: ListSchema = {
  key: 'results',
  title: 'title',
  fields: [
    {
      type: 'text',
      stem: 'title',
      label: { ar: 'عنوان النتيجة', en: 'Result title' },
      hint: { ar: 'الاسم الذي يظهر بهذا العنصر في اللوحة. اتركيه فارغًا ليُستخدم عنوان المقال المرتبط.', en: 'The name this item has in the console. Leave it empty to use the linked article title.' },
      max: 300,
    },
    {
      type: 'strings',
      stem: 'phrases',
      label: { ar: 'العبارات التي جعلته قصة نتيجة', en: 'Phrases that made it a result story' },
      hint: { ar: 'سبب اختيار المقال ضمن النتائج. لا يظهر على الموقع.', en: 'Why the article is listed under results. Not shown on the site.' },
    },
  ],
};

const SCHEMAS: readonly ListSchema[] = [SERVICES, BRANCHES, SPECIALISTS, FAQ, NAV, RESULTS];

const BY_KEY = new Map<string, ListSchema>(SCHEMAS.map((schema) => [schema.key, schema]));

export function listSchemaOf(listKey: string | null | undefined): ListSchema | null {
  return listKey ? BY_KEY.get(listKey) ?? null : null;
}

export function listSchemas(): readonly ListSchema[] {
  return SCHEMAS;
}

/** The root names the editor draws an error under. */
export function fieldRoots(schema: ListSchema): string[] {
  return schema.fields.flatMap((field) =>
    field.type === 'text' || field.type === 'list' ? [`${field.stem}_ar`, `${field.stem}_en`] : [field.stem],
  );
}

/** The field names a list document is validated and reported against. */
export function schemaStems(schema: ListSchema): string[] {
  return schema.fields.map((field) => field.stem);
}

/**
 * The form key that carries the document entries this list's form does not describe.
 *
 * It is never drawn as a text box. The editor lists the keys it holds with one Remove
 * button each, and the value rides along with the save untouched until somebody removes
 * it — which is what lets the server refuse an unknown field without the console ever
 * silently deleting one.
 */
export const UNKNOWN_FORM_KEY = '__unknown';

/** The keys whose value is HTML a rich-text surface may write. */
export function htmlStems(schema: ListSchema): string[] {
  return schema.fields.flatMap((field) => (field.type === 'text' && field.html ? [field.stem] : []));
}

export interface ListDocIssue {
  path: string;
  message: string;
}

export interface ParsedListDoc {
  doc: Record<string, unknown>;
  issues: ListDocIssue[];
  /** Keys the schema does not describe, as the document holds them. */
  unknown: Record<string, unknown>;
}

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const text = item.trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * A bilingual value from either shape: `name_ar`/`name_en`, one string, or `{ar, en}`.
 *
 * `present` says whether the document named the field at all, which is what separates
 * "cleared on purpose" from "never written". `bad` says the value was the wrong type and
 * is the difference between an empty box and a rejection.
 */
function readBi(
  doc: Record<string, unknown>,
  stem: string,
  format: 'plain' | 'source',
): { value: Bi; present: boolean; bad: boolean } {
  const flatAr = doc[`${stem}_ar`];
  const flatEn = doc[`${stem}_en`];
  const clean = (value: unknown): string => (typeof value === 'string' ? (format === 'plain' ? plainText(value) : value.trim()) : '');
  if (flatAr !== undefined || flatEn !== undefined) {
    if ((flatAr !== undefined && typeof flatAr !== 'string') || (flatEn !== undefined && typeof flatEn !== 'string')) {
      return { value: { ar: '', en: '' }, present: true, bad: true };
    }
    const ar = clean(flatAr);
    const en = clean(flatEn);
    return { value: { ar: ar || en, en: en || ar }, present: true, bad: false };
  }

  const nested = doc[stem];
  if (nested === undefined) return { value: { ar: '', en: '' }, present: false, bad: false };
  if (typeof nested === 'string') {
    const text = format === 'plain' ? plainText(nested) : nested.trim();
    return { value: { ar: text, en: text }, present: true, bad: false };
  }
  if (nested === null || typeof nested !== 'object' || Array.isArray(nested)) return { value: { ar: '', en: '' }, present: true, bad: true };
  const pair = nested as Record<string, unknown>;
  if ((pair.ar !== undefined && typeof pair.ar !== 'string') || (pair.en !== undefined && typeof pair.en !== 'string')) {
    return { value: { ar: '', en: '' }, present: true, bad: true };
  }
  const ar = clean(pair.ar);
  const en = clean(pair.en);
  return { value: { ar: ar || en, en: en || ar }, present: true, bad: false };
}

function readBiList(doc: Record<string, unknown>, stem: string): { value: { ar: string[]; en: string[] }; present: boolean; bad: boolean } {
  const flatAr = doc[`${stem}_ar`];
  const flatEn = doc[`${stem}_en`];
  if (flatAr !== undefined || flatEn !== undefined) {
    const ar = flatAr === undefined ? [] : stringList(flatAr);
    const en = flatEn === undefined ? [] : stringList(flatEn);
    if (ar === null || en === null) return { value: { ar: [], en: [] }, present: true, bad: true };
    const size = Math.max(ar.length, en.length);
    const paddedAr = Array.from({ length: size }, (_, index) => ar[index] ?? '');
    const paddedEn = Array.from({ length: size }, (_, index) => en[index] ?? '');
    return {
      value: { ar: paddedAr.length ? paddedAr : paddedEn, en: paddedEn.length ? paddedEn : paddedAr },
      present: true,
      bad: false,
    };
  }

  const nested = doc[stem];
  if (nested === undefined) return { value: { ar: [], en: [] }, present: false, bad: false };
  if (Array.isArray(nested)) {
    const all = stringList(nested);
    if (all === null) return { value: { ar: [], en: [] }, present: true, bad: true };
    return { value: { ar: all, en: all }, present: true, bad: false };
  }
  if (nested === null || typeof nested !== 'object') return { value: { ar: [], en: [] }, present: true, bad: true };
  const pair = nested as Record<string, unknown>;
  const ar = pair.ar === undefined ? [] : stringList(pair.ar);
  const en = pair.en === undefined ? [] : stringList(pair.en);
  if (ar === null || en === null) return { value: { ar: [], en: [] }, present: true, bad: true };
  const size = Math.max(ar.length, en.length);
  const paddedAr = Array.from({ length: size }, (_, index) => ar[index] ?? '');
  const paddedEn = Array.from({ length: size }, (_, index) => en[index] ?? '');
  return {
    value: { ar: paddedAr.length ? paddedAr : paddedEn, en: paddedEn.length ? paddedEn : paddedAr },
    present: true,
    bad: false,
  };
}

function readChildren(doc: Record<string, unknown>, stem: string, row: readonly ChildField[]): { value: Record<string, unknown>[]; present: boolean; bad: boolean; issues: ListDocIssue[] } {
  const raw = doc[stem];
  if (raw === undefined) return { value: [], present: false, bad: false, issues: [] };
  if (!Array.isArray(raw)) return { value: [], present: true, bad: true, issues: [] };
  const issues: ListDocIssue[] = [];
  const value: Record<string, unknown>[] = [];
  const known = new Set(row.flatMap((field) => (field.type === 'text' ? [field.stem, `${field.stem}_ar`, `${field.stem}_en`] : [field.stem])));
  raw.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({ path: `${stem}.${index}`, message: 'expected an object or an array' });
      return;
    }
    const record = entry as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!known.has(key)) issues.push({ path: `${stem}.${index}.${key}`, message: 'unknown field' });
    }
    const written: Record<string, unknown> = {};
    for (const field of row) {
      if (field.type === 'href') {
        const href = textOf(record[field.stem]);
        if (field.required && !href) issues.push({ path: `${stem}.${index}.${field.stem}`, message: 'required' });
        written[field.stem] = href;
        continue;
      }
      const pair = readBi(record, field.stem, 'plain');
      if (pair.bad) issues.push({ path: `${stem}.${index}.${field.stem}`, message: 'expected text' });
      if (field.required && !pair.value.ar && !pair.value.en) issues.push({ path: `${stem}.${index}.${field.stem}`, message: 'required' });
      written[`${field.stem}_ar`] = pair.value.ar;
      written[`${field.stem}_en`] = pair.value.en;
    }
    if (Object.values(written).some((item) => (Array.isArray(item) ? item.length > 0 : typeof item === 'string' && item !== ''))) value.push(written);
  });
  return { value, present: true, bad: false, issues };
}

/**
 * The document as the form and the site read it: flat, complete, in schema order.
 *
 * Every field the schema names appears in the result, empty or not. That is what makes a
 * re-save of an untouched row a no-op, and what lets the list importer's "does this row
 * already say that?" comparison stay true.
 */
export function parseListDoc(schema: ListSchema, input: unknown): ParsedListDoc {
  const issues: ListDocIssue[] = [];
  const unknown: Record<string, unknown> = {};
  const doc: Record<string, unknown> = {};

  if (input === null || input === undefined) {
    input = {};
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { doc, issues: [{ path: schema.title, message: 'expected an object or an array' }], unknown };
  }
  const source = input as Record<string, unknown>;

  const known = new Set<string>();
  for (const field of schema.fields) {
    if (field.type === 'text' || field.type === 'list') {
      known.add(field.stem);
      known.add(`${field.stem}_ar`);
      known.add(`${field.stem}_en`);
    } else {
      known.add(field.stem);
    }
  }
  for (const key of Object.keys(source)) {
    if (!known.has(key)) {
      unknown[key] = source[key];
      issues.push({ path: key, message: 'unknown field' });
    }
  }

  for (const field of schema.fields) {
    if (field.type === 'text') {
      const read = readBi(source, field.stem, field.html ? 'source' : 'plain');
      if (read.bad) issues.push({ path: field.stem, message: 'expected text' });
      if (field.mono) {
        // One value, from whichever shape the row keeps it in — the bare key the site
        // reads, or a pair an older save wrote. The pair is folded into the one key the
        // schema says this field has, so nothing a person typed is dropped on the way.
        const value = read.value.ar || read.value.en;
        if (field.max && [...value].length > field.max) issues.push({ path: field.stem, message: `longer than ${field.max} characters` });
        if (field.required && !value) issues.push({ path: field.stem, message: 'required' });
        doc[field.stem] = value;
        continue;
      }
      if (read.present) {
        if (field.max) {
          for (const locale of ['ar', 'en'] as const) {
            if ([...read.value[locale]].length > field.max) issues.push({ path: field.stem, message: `longer than ${field.max} characters` });
          }
        }
        if (field.required && !read.value.ar && !read.value.en) issues.push({ path: field.stem, message: 'required' });
      } else if (field.required) {
        issues.push({ path: field.stem, message: 'required' });
      }
      doc[`${field.stem}_ar`] = read.value.ar;
      doc[`${field.stem}_en`] = read.value.en;
      continue;
    }

    if (field.type === 'list') {
      const read = readBiList(source, field.stem);
      if (read.bad) issues.push({ path: field.stem, message: 'expected a list' });
      if (field.required && read.value.ar.length === 0) issues.push({ path: field.stem, message: 'required' });
      doc[`${field.stem}_ar`] = read.value.ar;
      doc[`${field.stem}_en`] = read.value.en;
      continue;
    }

    if (field.type === 'strings') {
      const raw = source[field.stem];
      if (raw !== undefined && !Array.isArray(raw)) issues.push({ path: field.stem, message: 'expected a list' });
      const list = stringList(raw) ?? [];
      doc[field.stem] = list;
      continue;
    }

    if (field.type === 'number') {
      const raw = source[field.stem];
      let value: number | null = null;
      if (raw !== undefined && raw !== null && raw !== '') {
        const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
        if (!Number.isFinite(parsed)) issues.push({ path: field.stem, message: 'expected a number' });
        else value = parsed;
      }
      doc[field.stem] = value;
      continue;
    }

    if (field.type === 'flag') {
      const raw = source[field.stem];
      if (raw !== undefined && typeof raw !== 'boolean') issues.push({ path: field.stem, message: 'expected true or false' });
      doc[field.stem] = raw === undefined ? false : Boolean(raw);
      continue;
    }

    if (field.type === 'image' || field.type === 'href' || field.type === 'select') {
      const raw = source[field.stem];
      if (raw !== undefined && typeof raw !== 'string') issues.push({ path: field.stem, message: 'expected text' });
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (field.type === 'image' && field.required && !value) issues.push({ path: field.stem, message: 'required' });
      if (field.type === 'href' && field.required && !value) issues.push({ path: field.stem, message: 'required' });
      if (field.type === 'select' && value && !field.options.some((option) => option.value === value)) {
        issues.push({ path: field.stem, message: 'unknown option' });
      }
      doc[field.stem] = value;
      continue;
    }

    if (field.type === 'refs') {
      const raw = source[field.stem];
      if (raw !== undefined && !Array.isArray(raw)) issues.push({ path: field.stem, message: 'expected a list' });
      doc[field.stem] = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()) : [];
      continue;
    }

    const read = readChildren(source, field.stem, field.row);
    if (read.bad) issues.push({ path: field.stem, message: 'expected a list' });
    issues.push(...read.issues);
    doc[field.stem] = read.value;
  }

  return { doc, issues, unknown };
}

/** The row's title in one language, borrowing the other language only when this one is empty. */
export function listDocTitle(schema: ListSchema, doc: Record<string, unknown>, locale: ContentLocale): string {
  const field = schema.fields.find((candidate) => candidate.stem === schema.title && candidate.type === 'text');
  if (!field || field.type !== 'text') return '';
  const read = readBi(doc, field.stem, field.html ? 'source' : 'plain');
  return read.value[locale] || read.value[locale === 'ar' ? 'en' : 'ar'];
}

/** The one-line teaser a card shows under the title, in document order. */
export function listDocIntro(schema: ListSchema, doc: Record<string, unknown>, locale: ContentLocale): string {
  const preferred = ['intro', 'description', 'answer', 'area', 'landmark', 'credentials'];
  for (const stem of preferred) {
    const field = schema.fields.find((candidate) => candidate.stem === stem && candidate.type === 'text');
    if (!field || field.type !== 'text') continue;
    const read = readBi(doc, field.stem, 'plain');
    const value = read.value[locale] || read.value[locale === 'ar' ? 'en' : 'ar'];
    if (value) return value;
  }
  return '';
}

/** The first picture a document carries, wherever the schema keeps it. */
export function listDocImage(schema: ListSchema, doc: Record<string, unknown>): string | null {
  for (const field of schema.fields) {
    if (field.type !== 'image') continue;
    const source = doc[field.stem];
    if (typeof source === 'string' && source.trim()) return source.trim();
  }
  return null;
}

function recordOf(value: unknown): Record<string, string | boolean> {
  return value as Record<string, string | boolean>;
}

/**
 * The document as the flat form the editor holds.
 *
 * A row of a bilingual list becomes `${stem}_ar.0` and `${stem}_en.0`, so the two
 * languages stay beside each other while they are typed. A repeatable single-language
 * list (results' `phrases`) is `${stem}.0`.
 */
export function listDocForm(schema: ListSchema, doc: Record<string, unknown>): Record<string, string | boolean> {
  const normal = parseListDoc(schema, doc).doc;
  const form: Record<string, string | boolean> = {};
  for (const field of schema.fields) {
    if (field.type === 'text') {
      if (field.mono) {
        form[field.stem] = textOf(normal[field.stem]);
        continue;
      }
      form[`${field.stem}_ar`] = textOf(normal[`${field.stem}_ar`]);
      form[`${field.stem}_en`] = textOf(normal[`${field.stem}_en`]);
      continue;
    }
    if (field.type === 'list') {
      const ar = (normal[`${field.stem}_ar`] as string[]) ?? [];
      const en = (normal[`${field.stem}_en`] as string[]) ?? [];
      const size = Math.max(ar.length, en.length);
      for (let index = 0; index < size; index += 1) {
        form[`${field.stem}_ar.${index}`] = ar[index] ?? '';
        form[`${field.stem}_en.${index}`] = en[index] ?? '';
      }
      continue;
    }
    if (field.type === 'strings') {
      const list = (normal[field.stem] as string[]) ?? [];
      list.forEach((item, index) => {
        form[`${field.stem}.${index}`] = item;
      });
      continue;
    }
    if (field.type === 'number') {
      const value = normal[field.stem];
      form[field.stem] = value === null || value === undefined ? '' : String(value);
      continue;
    }
    if (field.type === 'flag') {
      form[field.stem] = Boolean(normal[field.stem]);
      continue;
    }
    if (field.type === 'refs') {
      form[field.stem] = ((normal[field.stem] as string[]) ?? []).join(',');
      continue;
    }
    if (field.type === 'children') {
      const rows = (normal[field.stem] as Record<string, unknown>[]) ?? [];
      rows.forEach((entry, index) => {
        for (const cell of field.row) {
          const key = cell.type === 'text' ? [`${cell.stem}_ar`, `${cell.stem}_en`] : [cell.stem];
          for (const name of key) form[`${field.stem}.${index}.${name}`] = textOf(entry[name]);
        }
      });
      continue;
    }
    form[field.stem] = textOf(normal[field.stem]);
  }
  return form;
}

const INDEXED = /^(.+?)\.(\d+)(?:\.(.+))?$/;

/** Indices a form names for one stem, in ascending order. */
function indicesOf(form: Record<string, string | boolean>, stem: string): number[] {
  const seen = new Set<number>();
  for (const key of Object.keys(form)) {
    const match = INDEXED.exec(key);
    if (!match) continue;
    if (match[1] === stem || (match[1] === `${stem}_ar` || match[1] === `${stem}_en`)) seen.add(Number(match[2]));
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Rebuild the document from the form.
 *
 * The result goes through the same `parseListDoc()` the server runs, so a required field
 * left empty or a number half typed is the same message in the browser and under the API.
 * Only rows the person filled survive: a blank "benefit" row is removed instead of being
 * stored as two empty strings.
 */
export function listDocFromForm(
  schema: ListSchema,
  form: Record<string, string | boolean>,
  /** Entries the form does not describe, kept until the person removes them. */
  extra?: Record<string, unknown>,
): ParsedListDoc {
  const raw: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (field.type === 'text') {
      if (field.mono) {
        raw[field.stem] = String(form[field.stem] ?? '');
        continue;
      }
      raw[`${field.stem}_ar`] = String(form[`${field.stem}_ar`] ?? '');
      raw[`${field.stem}_en`] = String(form[`${field.stem}_en`] ?? '');
      continue;
    }
    if (field.type === 'list') {
      const rows: { ar: string[]; en: string[] } = { ar: [], en: [] };
      for (const index of indicesOf(form, field.stem)) {
        const ar = String(form[`${field.stem}_ar.${index}`] ?? '').trim();
        const en = String(form[`${field.stem}_en.${index}`] ?? '').trim();
        if (!ar && !en) continue;
        rows.ar.push(ar);
        rows.en.push(en);
      }
      raw[`${field.stem}_ar`] = rows.ar;
      raw[`${field.stem}_en`] = rows.en;
      continue;
    }
    if (field.type === 'strings') {
      raw[field.stem] = indicesOf(form, field.stem)
        .map((index) => String(form[`${field.stem}.${index}`] ?? '').trim())
        .filter(Boolean);
      continue;
    }
    if (field.type === 'refs') {
      raw[field.stem] = String(form[field.stem] ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
    if (field.type === 'children') {
      const rows: Record<string, unknown>[] = [];
      for (const index of indicesOf(form, field.stem)) {
        const entry: Record<string, unknown> = {};
        let empty = true;
        for (const cell of field.row) {
          if (cell.type === 'text') {
            const ar = String(form[`${field.stem}.${index}.${cell.stem}_ar`] ?? '').trim();
            const en = String(form[`${field.stem}.${index}.${cell.stem}_en`] ?? '').trim();
            entry[`${cell.stem}_ar`] = ar;
            entry[`${cell.stem}_en`] = en;
            if (ar || en) empty = false;
          } else {
            const value = String(form[`${field.stem}.${index}.${cell.stem}`] ?? '').trim();
            entry[cell.stem] = value;
            if (value) empty = false;
          }
        }
        if (!empty) rows.push(entry);
      }
      raw[field.stem] = rows;
      continue;
    }
    raw[field.stem] = form[field.stem] ?? (field.type === 'flag' ? false : '');
  }
  return parseListDoc(schema, { ...raw, ...(extra ?? {}) });
}

/** The entries a document carries that its list's form does not describe. */
export function listDocUnknown(schema: ListSchema, doc: unknown): Record<string, unknown> {
  return parseListDoc(schema, doc).unknown;
}

/** A title written by the create form, in the one language the person typed it. */
export function listDocFromTitle(schema: ListSchema, title: string, locale: ContentLocale): Record<string, unknown> {
  const field = schema.fields.find((candidate) => candidate.stem === schema.title && candidate.type === 'text');
  if (!field) return {};
  return { [`${field.stem}_${locale}`]: title.trim() };
}

/** The colour-coded display of one field's value, for the preview's meta strip. */
export function listDocMeta(schema: ListSchema, doc: Record<string, unknown>, locale: ContentLocale): { label: string; value: string | boolean }[] {
  const out: { label: string; value: string | boolean }[] = [];
  const labelOf = (field: ListField): string => field.label[locale] || field.label.en || field.label.ar;
  for (const field of schema.fields) {
    if (field.type === 'number') {
      const value = doc[field.stem];
      if (typeof value === 'number') out.push({ label: labelOf(field), value: String(value) });
      continue;
    }
    if (field.type === 'flag') {
      out.push({ label: labelOf(field), value: Boolean(doc[field.stem]) });
      continue;
    }
    if (field.type === 'select' || field.type === 'href') {
      const value = textOf(doc[field.stem]);
      if (value) out.push({ label: labelOf(field), value });
      continue;
    }
    if (field.type === 'text' && field.stem !== schema.title) {
      const read = readBi(doc, field.stem, field.html ? 'source' : 'plain');
      const value = read.value[locale] || read.value[locale === 'ar' ? 'en' : 'ar'];
      if (value && !['intro', 'description', 'body', 'answer', 'area', 'landmark', 'credentials'].includes(field.stem)) {
        out.push({ label: labelOf(field), value });
      }
    }
  }
  return out;
}

/** The first repeatable list's items, for the preview's bullets. */
export function listDocBullets(schema: ListSchema, doc: Record<string, unknown>, locale: ContentLocale): string[] {
  for (const field of schema.fields) {
    if (field.type !== 'list') continue;
    const read = readBiList(doc, field.stem);
    const items = read.value[locale].length ? read.value[locale] : read.value[locale === 'ar' ? 'en' : 'ar'];
    if (items.length) return items.slice(0, 6);
  }
  return [];
}

/** The body a document shows as markup, if it has one. */
export function listDocBody(schema: ListSchema, doc: Record<string, unknown>, locale: ContentLocale): string {
  for (const field of schema.fields) {
    if (field.type !== 'text' || !field.html) continue;
    const read = readBi(doc, field.stem, 'source');
    const value = read.value[locale] || read.value[locale === 'ar' ? 'en' : 'ar'];
    if (value) return value;
  }
  return '';
}

/** A leaf field's value in both languages, for the image picker's alt record. */
export function listDocAlt(schema: ListSchema, doc: Record<string, unknown>): Bi {
  for (const field of schema.fields) {
    if (field.type !== 'text' || field.stem !== 'alt') continue;
    return readBi(doc, field.stem, 'plain').value;
  }
  return { ar: '', en: '' };
}

/** The flat form a new row starts from: every field present and empty. */
export function emptyListDocForm(schema: ListSchema): Record<string, string | boolean> {
  return listDocForm(schema, {});
}

export { recordOf };
