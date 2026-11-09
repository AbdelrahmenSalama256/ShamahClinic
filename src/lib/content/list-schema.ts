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
  type: 'href' | 'text' | 'image' | 'select';
  stem: string;
  label: Bi;
  required?: boolean;
  /** a text cell that holds a paragraph, not a line — an inline answer, a benefit's body */
  multiline?: boolean;
  options?: readonly { value: string; label: Bi }[];
}

/**
 * One section a long page draws, as the editor orders it.
 *
 * The keys are code, not copy: the public page renders `hero`, `overview`, … and a row that
 * named a key no component draws would be a section the site silently loses. Parsing refuses
 * an unknown key and appends any section the row has never mentioned, so a record written
 * before a section existed still shows the whole page.
 */
export interface SectionOption {
  key: string;
  label: Bi;
}

/** A heading the editor draws above a run of fields. */
export interface FieldGroup {
  key: string;
  label: Bi;
  hint?: Bi;
}

interface FieldBase {
  stem: string;
  label: Bi;
  hint?: Bi;
  /** the editor's group; consecutive fields with the same key share one heading */
  group?: FieldGroup;
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
  /**
   * A voice note or a video, uploaded from the device like a picture is. The stored value is
   * the `/uploads/clips/…` address the clip route answered with; `accept` decides which file
   * picker the editor opens and which formats the server takes.
   */
  | (FieldBase & { type: 'clip'; accept: 'audio' | 'video'; required?: boolean })
  | (FieldBase & { type: 'number' })
  | (FieldBase & { type: 'flag' })
  | (FieldBase & { type: 'select'; options: readonly { value: string; label: Bi }[] })
  | (FieldBase & { type: 'href'; required?: boolean })
  | (FieldBase & { type: 'refs'; source: string })
  /**
   * One article of the journal, named by its slug.
   *
   * A result story *is* an article — the card on `/results` opens it — so the row has to say
   * which one. `refs` cannot stand in: it points at another *list*, is chosen as a set of
   * checkboxes, and a result belongs to exactly one article. The stored value is the slug,
   * because an article's slug is what a person can recognise and its WordPress id is not.
   */
  | (FieldBase & { type: 'story'; required?: boolean })
  | (FieldBase & { type: 'children'; row: readonly ChildField[] })
  | (FieldBase & { type: 'sections'; sections: readonly SectionOption[] });

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

/**
 * The sections a service page draws, in the order a new row starts with.
 *
 * `hero` is deliberately absent: the name, the photograph and the booking button are the
 * page's identity, and a page with no heading is not a layout a checkbox should be able to
 * produce. Everything else may be hidden or moved.
 */
export const SERVICE_SECTIONS = [
  { key: 'overview', label: { ar: 'نظرة عامة', en: 'Overview' } },
  { key: 'how', label: { ar: 'كيف تعمل الجلسة', en: 'How it works' } },
  { key: 'prep', label: { ar: 'التحضير والعناية', en: 'Preparation & aftercare' } },
  { key: 'safety', label: { ar: 'السلامة', en: 'Safety' } },
  { key: 'pricing', label: { ar: 'السعر والعروض', en: 'Pricing & offers' } },
  { key: 'proof', label: { ar: 'النتائج', en: 'Proof & results' } },
  { key: 'gallery', label: { ar: 'الصور', en: 'Gallery' } },
  { key: 'people', label: { ar: 'الفريق والفروع', en: 'Specialists & branches' } },
  { key: 'faq', label: { ar: 'الأسئلة الشائعة', en: 'FAQ' } },
  { key: 'related', label: { ar: 'خدمات ومقالات ذات صلة', en: 'Related services & articles' } },
] as const satisfies readonly SectionOption[];

/** The hideable sections of a service page, in the order a new row starts with. */
export type ServiceSectionKey = (typeof SERVICE_SECTIONS)[number]['key'];

const G = {
  identity: { key: 'identity', label: { ar: 'التعريف', en: 'Identity' } },
  hero: { key: 'hero', label: { ar: 'الواجهة', en: 'Hero' } },
  overview: { key: 'overview', label: { ar: 'نظرة عامة', en: 'Overview' } },
  how: { key: 'how', label: { ar: 'كيف تعمل الجلسة', en: 'How it works' } },
  prep: { key: 'prep', label: { ar: 'التحضير والعناية', en: 'Preparation & aftercare' } },
  safety: { key: 'safety', label: { ar: 'السلامة', en: 'Safety' } },
  pricing: { key: 'pricing', label: { ar: 'السعر والعروض', en: 'Pricing & offers' } },
  proof: { key: 'proof', label: { ar: 'النتائج', en: 'Proof & results' } },
  gallery: { key: 'gallery', label: { ar: 'الصور', en: 'Gallery' } },
  people: { key: 'people', label: { ar: 'الفريق والفروع', en: 'Specialists & branches' } },
  faq: { key: 'faq', label: { ar: 'الأسئلة الشائعة', en: 'FAQ' } },
  related: { key: 'related', label: { ar: 'محتوى ذو صلة', en: 'Related content' } },
  seo: { key: 'seo', label: { ar: 'تحسين محركات البحث', en: 'SEO' } },
  sections: { key: 'sections', label: { ar: 'ترتيب الأقسام وإظهارها', en: 'Section order & visibility' } },
} as const;

const SERVICE_ICONS = optionsOf(['badge-check', 'shield', 'droplet', 'sun', 'heart', 'clock']);

const SERVICES: ListSchema = {
  key: 'services',
  title: 'name',
  fields: [
    // --- identity ---------------------------------------------------------------
    {
      type: 'text',
      stem: 'name',
      group: G.identity,
      label: { ar: 'اسم الخدمة', en: 'Service name' },
      hint: { ar: 'يظهر على بطاقة الخدمة وفي صفحتها.', en: 'Shown on the service card and its page.' },
      required: true,
      max: 200,
    },
    {
      type: 'text',
      stem: 'intro',
      group: G.identity,
      label: { ar: 'جملة قصيرة', en: 'Short description' },
      hint: { ar: 'سطر واحد يشرح الخدمة تحت الاسم، ويُستخدم أيضًا في البطاقات والبحث.', en: 'One line under the name that explains the service; also the card teaser and the search fallback.' },
      multiline: true,
      max: 400,
    },
    {
      type: 'select',
      stem: 'category',
      group: G.identity,
      label: { ar: 'التصنيف', en: 'Category' },
      hint: { ar: 'يُستخدم لتصفية صفحة الخدمات ولاقتراح الخدمات ذات الصلة.', en: 'Filters the services page and seeds related-service suggestions.' },
      options: optionsOf(['laser', 'injectables', 'skincare', 'anti-aging', 'general']),
    },
    {
      type: 'flag',
      stem: 'featured',
      group: G.identity,
      label: { ar: 'خدمة مميزة', en: 'Featured service' },
      hint: { ar: 'تظهر ضمن الخدمات البارزة في الرئيسية.', en: 'Show among the highlighted services on the home page.' },
    },
    // A WordPress service is a section of one page, so a card links to `/services` unless
    // its author writes an address of its own. One field, because the site reads one.
    {
      type: 'href',
      stem: 'href',
      group: G.identity,
      label: { ar: 'رابط الخدمة (اختياري)', en: 'Service link (optional)' },
      hint: { ar: 'مسار داخل الموقع مثل /peeling. اتركه فارغًا ليذهب إلى صفحة الخدمة العادية.', en: 'A path inside the site, such as /peeling. Leave it empty to open this service’s own page.' },
    },

    // --- hero -------------------------------------------------------------------
    {
      type: 'image',
      stem: 'image',
      group: G.hero,
      label: { ar: 'الصورة الرئيسية', en: 'Hero image' },
      hint: { ar: 'ارفعي صورة من جهازك. تُستخدم أيضًا على بطاقة الخدمة.', en: 'Uploaded from your device; also the card picture.' },
    },
    {
      type: 'text',
      stem: 'alt',
      group: G.hero,
      label: { ar: 'وصف الصورة', en: 'Hero image description' },
      hint: { ar: 'جملة تقرأها قارئات الشاشة لمن لا يرى الصورة.', en: 'Read aloud to people who cannot see the picture.' },
      max: 300,
    },
    {
      type: 'text',
      stem: 'heroHeadline',
      group: G.hero,
      label: { ar: 'عنوان الواجهة', en: 'Hero headline' },
      hint: { ar: 'اختياري: إن تركته فارغًا يظهر اسم الخدمة.', en: 'Optional: leave empty to use the service name.' },
      max: 200,
    },
    {
      type: 'text',
      stem: 'heroSubheadline',
      group: G.hero,
      label: { ar: 'سطر تحت العنوان', en: 'Hero subheadline' },
      hint: { ar: 'اختياري: إن تركته فارغًا تظهر الجملة القصيرة.', en: 'Optional: leave empty to use the short description.' },
      multiline: true,
      max: 400,
    },
    {
      type: 'select',
      stem: 'ctaPrimary',
      group: G.hero,
      label: { ar: 'الزر الرئيسي', en: 'Primary action' },
      hint: { ar: 'أرقام الهاتف والواتساب تأتي من الإعدادات، لا تُكتب هنا.', en: 'Phone and WhatsApp numbers come from Settings; they are never typed here.' },
      options: [
        { value: 'booking', label: { ar: 'احجزي موعدًا', en: 'Book an appointment' } },
        { value: 'whatsapp', label: { ar: 'واتساب', en: 'WhatsApp' } },
        { value: 'call', label: { ar: 'اتصال', en: 'Call' } },
        { value: 'none', label: { ar: 'بلا زر', en: 'No button' } },
      ],
    },
    {
      type: 'select',
      stem: 'ctaSecondary',
      group: G.hero,
      label: { ar: 'الزر الثاني', en: 'Secondary action' },
      hint: { ar: 'اختياري: يظهر بجانب الزر الرئيسي.', en: 'Optional: shown beside the primary action.' },
      options: [
        { value: 'none', label: { ar: 'بلا زر', en: 'No button' } },
        { value: 'whatsapp', label: { ar: 'واتساب', en: 'WhatsApp' } },
        { value: 'call', label: { ar: 'اتصال', en: 'Call' } },
        { value: 'booking', label: { ar: 'احجزي موعدًا', en: 'Book an appointment' } },
      ],
    },

    // --- overview ---------------------------------------------------------------
    {
      type: 'text',
      stem: 'description',
      group: G.overview,
      label: { ar: 'الوصف الكامل', en: 'Full description' },
      hint: { ar: 'عدة جمل تظهر في صفحة الخدمة. يمكن تنسيقها بالعناوين والقوائم.', en: 'A few sentences on the service page; headings and lists are allowed.' },
      multiline: true,
      html: true,
      max: 8000,
    },
    {
      type: 'children',
      stem: 'benefits',
      group: G.overview,
      label: { ar: 'الفوائد', en: 'Benefits' },
      hint: { ar: 'فائدة لكل صف: عنوان ونص، وأيقونة اختيارية. الصفوف القديمة التي تحمل سطرًا واحدًا تُقرأ كما هي.', en: 'One benefit per row: a title, a sentence, and an optional icon. Older one-line rows still read as they did.' },
      row: [
        { type: 'text', stem: 'text', label: { ar: 'النص', en: 'Text' }, multiline: true, required: true },
        { type: 'text', stem: 'title', label: { ar: 'العنوان', en: 'Title' } },
        { type: 'select', stem: 'icon', label: { ar: 'الأيقونة', en: 'Icon' }, options: SERVICE_ICONS },
      ],
    },
    {
      type: 'text',
      stem: 'ideal',
      group: G.overview,
      label: { ar: 'مناسب لمن', en: 'Best for' },
      hint: { ar: 'نوع الحالات التي تستفيد من الخدمة.', en: 'The kind of cases this service suits.' },
      multiline: true,
      max: 600,
    },
    {
      type: 'list',
      stem: 'notFor',
      group: G.overview,
      label: { ar: 'غير مناسب لمن', en: 'Who it is not for' },
      hint: { ar: 'نقطة لكل حالة لا تُنصح بالخدمة لها. لا تُكتب وعود طبية هنا.', en: 'One point per case this service is not advised for. No medical promises here.' },
    },

    // --- how it works -----------------------------------------------------------
    {
      type: 'children',
      stem: 'steps',
      group: G.how,
      label: { ar: 'خطوات الجلسة', en: 'Session steps' },
      hint: { ar: 'ما يحدث في الجلسة بالترتيب، مع صورة اختيارية لكل خطوة.', en: 'What happens during the session, in order, with an optional picture per step.' },
      row: [
        { type: 'text', stem: 'text', label: { ar: 'النص', en: 'Text' }, multiline: true, required: true },
        { type: 'text', stem: 'title', label: { ar: 'العنوان', en: 'Title' } },
        { type: 'image', stem: 'image', label: { ar: 'الصورة', en: 'Picture' } },
      ],
    },
    { type: 'text', stem: 'duration', group: G.how, label: { ar: 'مدة الجلسة', en: 'Session time' }, hint: { ar: 'مثال: ٣٠–٤٥ دقيقة.', en: 'For example: 30–45 minutes.' }, max: 120 },
    { type: 'text', stem: 'sessions', group: G.how, label: { ar: 'عدد الجلسات', en: 'Sessions advised' }, hint: { ar: 'مثال: ٤–٦ جلسات.', en: 'For example: 4–6 sessions.' }, max: 120 },
    { type: 'text', stem: 'frequency', group: G.how, label: { ar: 'المسافة بين الجلسات', en: 'Time between sessions' }, hint: { ar: 'مثال: كل ٤ أسابيع.', en: 'For example: every 4 weeks.' }, max: 160 },
    { type: 'text', stem: 'timeline', group: G.how, label: { ar: 'متى تظهر النتيجة', en: 'When results appear' }, hint: { ar: 'مثال: تدريجيًا خلال ٤–٦ أسابيع. اكتب فقط ما تعرفه العيادة.', en: 'For example: gradually over 4–6 weeks. State only what the clinic knows.' }, max: 200 },
    { type: 'text', stem: 'downtime', group: G.how, label: { ar: 'فترة التعافي', en: 'Downtime' }, hint: { ar: 'مثال: بضع ساعات من الاحمرار.', en: 'For example: a few hours of redness.' }, max: 200 },
    { type: 'text', stem: 'anesthesia', group: G.how, label: { ar: 'التخدير', en: 'Anesthesia' }, hint: { ar: 'مثال: كريم مخدر موضعي.', en: 'For example: a topical numbing cream.' }, max: 200 },
    { type: 'text', stem: 'technology', group: G.how, label: { ar: 'الجهاز أو التقنية', en: 'Technology or device' }, hint: { ar: 'اسم الجهاز كما تكتبه العيادة.', en: 'The device name as the clinic writes it.' }, max: 200 },

    // --- preparation and aftercare ----------------------------------------------
    { type: 'list', stem: 'prep', group: G.prep, label: { ar: 'قبل الجلسة', en: 'Before the session' }, hint: { ar: 'نقطة لكل تعليمات ما قبل الجلسة.', en: 'One point per instruction before the session.' } },
    { type: 'list', stem: 'aftercare', group: G.prep, label: { ar: 'العناية بعد الجلسة', en: 'Aftercare' }, hint: { ar: 'التعليمات التي تُعطى للمريضة بعد الجلسة.', en: 'Instructions the patient is given afterwards.' } },

    // --- safety -----------------------------------------------------------------
    { type: 'list', stem: 'contraindications', group: G.safety, label: { ar: 'موانع الاستخدام', en: 'Contraindications' }, hint: { ar: 'حالات طبية تمنع الجلسة. اتركيها فارغة إن لم تكن مكتوبة من العيادة.', en: 'Medical conditions that rule the session out. Leave empty when the clinic has not stated them.' } },
    { type: 'list', stem: 'sideEffects', group: G.safety, label: { ar: 'الآثار الجانبية', en: 'Side effects' }, hint: { ar: 'ما قد يحدث بعد الجلسة، كما تكتبه العيادة. لا تُضاف وعود.', en: 'What may follow the session, as the clinic states it. Nothing is added.' } },
    {
      type: 'flag',
      stem: 'showDisclaimer',
      group: G.safety,
      label: { ar: 'إظهار الإخلاء الطبي', en: 'Show the medical disclaimer' },
      hint: { ar: 'يظهر النص المشترك من الإعدادات أسفل هذا القسم. لن يظهر شيء قبل أن يُكتب النص.', en: 'Shows the shared wording from Settings under this section. Nothing renders until that wording exists.' },
    },

    // --- pricing and offers -----------------------------------------------------
    { type: 'number', stem: 'price', group: G.pricing, label: { ar: 'السعر يبدأ من', en: 'Starting price' }, hint: { ar: 'اتركيه فارغًا إذا لم تريد إظهار سعر.', en: 'Leave empty to show no price.' } },
    { type: 'number', stem: 'priceMax', group: G.pricing, label: { ar: 'السعر حتى', en: 'Price up to' }, hint: { ar: 'اختياري: لإظهار نطاق سعر. اتركيه فارغًا لسعر واحد.', en: 'Optional: makes a price range. Leave empty for a single price.' } },
    { type: 'text', stem: 'currency', group: G.pricing, mono: true, label: { ar: 'العملة', en: 'Currency' }, hint: { ar: 'مثال: EGP. اتركيه فارغًا ليُقرأ من إعدادات الموقع.', en: 'For example: EGP. Leave empty to read the site default.' }, max: 8 },
    { type: 'text', stem: 'priceNote', group: G.pricing, label: { ar: 'ملاحظة السعر', en: 'Pricing note' }, hint: { ar: 'سطر يوضح ما يشمله السعر.', en: 'One line on what the price covers.' }, multiline: true, max: 400 },
    { type: 'flag', stem: 'priceOnRequest', group: G.pricing, label: { ar: 'السعر عند الطلب', en: 'Price on request' }, hint: { ar: 'يخفي الأرقام ويطلب من الزائرة السؤال.', en: 'Hides the numbers and invites the visitor to ask.' } },
    { type: 'refs', stem: 'offers', source: 'offers', group: G.pricing, label: { ar: 'عروض تنطبق على هذه الخدمة', en: 'Offers that apply to this service' }, hint: { ar: 'تُقرأ من العروض المنشورة، ولا تُنسخ هنا.', en: 'Read from published offers; nothing is copied here.' } },

    // --- proof ------------------------------------------------------------------
    { type: 'refs', stem: 'results', source: 'results', group: G.proof, label: { ar: 'حالات قبل/بعد', en: 'Before/after cases' }, hint: { ar: 'لا تظهر إلا الحالات التي لها صورتان ومفعّلة.', en: 'Only enabled cases with both pictures appear.' } },
    { type: 'href', stem: 'videoUrl', group: G.proof, label: { ar: 'رابط فيديو (اختياري)', en: 'Video link (optional)' }, hint: { ar: 'رابط مباشر لملف فيديو تستضيفه العيادة.', en: 'A direct link to a video file the clinic hosts.' } },
    { type: 'image', stem: 'videoPoster', group: G.proof, label: { ar: 'صورة غلاف الفيديو', en: 'Video poster' }, hint: { ar: 'تظهر قبل التشغيل.', en: 'Shown before the video plays.' } },

    // --- gallery ----------------------------------------------------------------
    {
      type: 'children',
      stem: 'gallery',
      group: G.gallery,
      label: { ar: 'معرض الصور', en: 'Gallery' },
      hint: { ar: 'صورة لكل صف، مع وصف لها ونص يظهر تحتها.', en: 'One picture per row, with its description and a caption below.' },
      row: [
        { type: 'image', stem: 'image', label: { ar: 'الصورة', en: 'Picture' }, required: true },
        { type: 'text', stem: 'alt', label: { ar: 'وصف الصورة', en: 'Picture description' } },
        { type: 'text', stem: 'caption', label: { ar: 'نص تحت الصورة', en: 'Caption' } },
      ],
    },

    // --- people and places ------------------------------------------------------
    { type: 'refs', stem: 'specialists', source: 'specialists', group: G.people, label: { ar: 'الأطباء', en: 'Specialists' }, hint: { ar: 'تظهر بطاقاتهم وهم مفعّلون فقط.', en: 'Their cards appear; only enabled specialists do.' } },
    { type: 'refs', stem: 'branches', source: 'branches', group: G.people, label: { ar: 'الفروع', en: 'Branches' }, hint: { ar: 'تظهر الفروع المفعّلة فقط.', en: 'Only enabled branches appear.' } },

    // --- FAQ --------------------------------------------------------------------
    { type: 'refs', stem: 'faq', source: 'faq', group: G.faq, label: { ar: 'أسئلة من قائمة الأسئلة', en: 'Questions from the FAQ list' }, hint: { ar: 'تُقرأ من الأسئلة المنشورة، ولا تُنسخ.', en: 'Read from the published questions; nothing is copied.' } },
    {
      type: 'children',
      stem: 'faqInline',
      group: G.faq,
      label: { ar: 'أسئلة خاصة بهذه الخدمة', en: 'Questions just for this service' },
      hint: { ar: 'سؤال وجواب لكل صف. تُضاف إلى أسئلة القائمة أعلاه.', en: 'One question and answer per row, added after the list questions.' },
      row: [
        { type: 'text', stem: 'question', label: { ar: 'السؤال', en: 'Question' }, required: true },
        { type: 'text', stem: 'answer', label: { ar: 'الجواب', en: 'Answer' }, multiline: true, required: true },
      ],
    },

    // --- related content --------------------------------------------------------
    { type: 'refs', stem: 'relatedServices', source: 'services', group: G.related, label: { ar: 'خدمات ذات صلة', en: 'Related services' }, hint: { ar: 'اختياري: إن تركتِه فارغًا تُقترح خدمات من التصنيف نفسه.', en: 'Optional: when empty, services in the same category are suggested.' } },
    { type: 'refs', stem: 'relatedArticles', source: 'articles', group: G.related, label: { ar: 'مقالات ذات صلة', en: 'Related articles' }, hint: { ar: 'اختياري: مقالات منشورة فقط.', en: 'Optional; published articles only.' } },

    // --- extra body (kept from the old model) ------------------------------------
    { type: 'text', stem: 'body', group: G.related, label: { ar: 'تفاصيل إضافية', en: 'Extra details' }, hint: { ar: 'اختياري: نص طويل يظهر أسفل صفحة الخدمة.', en: 'Optional: longer text below the service page.' }, multiline: true, html: true },

    // --- SEO --------------------------------------------------------------------
    { type: 'text', stem: 'seoTitle', group: G.seo, label: { ar: 'عنوان الصفحة لمحركات البحث', en: 'Search title' }, hint: { ar: 'اختياري: إن تركته فارغًا يُبنى من اسم الخدمة.', en: 'Optional: built from the service name when empty.' }, max: 120 },
    { type: 'text', stem: 'seoDescription', group: G.seo, label: { ar: 'وصف الصفحة لمحركات البحث', en: 'Search description' }, hint: { ar: 'اختياري: جملة تظهر تحت العنوان في نتائج البحث.', en: 'Optional: the sentence under the title in search results.' }, multiline: true, max: 320 },
    { type: 'text', stem: 'focusKeyword', group: G.seo, mono: true, label: { ar: 'الكلمة المفتاحية', en: 'Focus keyword' }, hint: { ar: 'كلمة واحدة تُقاس عليها درجة تحسين الصفحة في مركز SEO.', en: 'One phrase the SEO center scores this page against.' }, max: 80 },
    { type: 'image', stem: 'ogImage', group: G.seo, label: { ar: 'صورة المشاركة', en: 'Social sharing image' }, hint: { ar: 'اختياري: تظهر عند مشاركة الرابط.', en: 'Optional: shown when the link is shared.' } },
    { type: 'href', stem: 'canonical', group: G.seo, label: { ar: 'الرابط الأساسي', en: 'Canonical path' }, hint: { ar: 'اتركيه فارغًا: المسار الصحيح يُبنى تلقائيًا.', en: 'Leave empty: the correct path is built automatically.' } },
    { type: 'flag', stem: 'noindex', group: G.seo, label: { ar: 'منع الفهرسة', en: 'Hide from search engines' }, hint: { ar: 'يجعل الصفحة غير مرئية في نتائج البحث، مع بقائها متاحة لمن يعرف الرابط.', en: 'Keeps the page out of search results while it stays reachable by link.' } },

    // --- section controls -------------------------------------------------------
    {
      type: 'sections',
      stem: 'sections',
      group: G.sections,
      label: { ar: 'أقسام الصفحة', en: 'Page sections' },
      hint: { ar: 'رتّبي الأقسام وأظهريها أو أخفيها. القسم الفارغ لا يظهر على الموقع مهما كان هذا الخيار.', en: 'Order the sections and show or hide them. An empty section never renders, whatever this says.' },
      sections: SERVICE_SECTIONS,
    },
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
      hint: {
        ar: 'العنوان فوق الصورتين. مع مقال يمكن تركه فارغًا ليظهر عنوان المقال، ومن دونه لا تظهر النتيجة بلا عنوان.',
        en: 'The headline above the pictures. Beside a related article you may leave it empty to use the article title; on its own the result needs one.',
      },
      max: 300,
    },
    {
      type: 'text',
      stem: 'area',
      label: { ar: 'المنطقة التي عُولجت', en: 'Area treated' },
      hint: {
        ar: 'مثال: الوجه، الرقبة، الذراعان. تظهر كوسم بجانب الصورتين وفي العرض المكبّر.',
        en: 'For example: face, neck, arms. A chip beside the pictures and in the enlarged view.',
      },
      max: 120,
    },
    {
      type: 'text',
      stem: 'sessions',
      label: { ar: 'عدد الجلسات', en: 'Sessions' },
      hint: {
        ar: 'مثال: ٣ جلسات. وسم بالتقويم بجانب الوسم، ولا وعد فيها — ما تتفاوت النتيجة من بشرة لأخرى.',
        en: 'For example: 3 sessions. A calendar chip beside the area one; it states what was done, not what anyone is promised.',
      },
      max: 120,
    },
    {
      type: 'image',
      stem: 'before',
      label: { ar: 'صورة قبل الجلسة', en: 'Picture before the session' },
      hint: {
        ar: 'تُرفع من جهازك، لا تُكتب كرابط. تظهر على حدة بجانب صورة بعد.',
        en: 'Uploaded from your device, never typed as a link. Shown beside the after picture.',
      },
    },
    {
      type: 'text',
      stem: 'beforeAlt',
      label: { ar: 'وصف صورة قبل', en: 'Before picture description' },
      hint: {
        ar: 'جملة تقرأها قارئات الشاشة لمن لا يرى صورة قبل.',
        en: 'Read aloud to people who cannot see the before picture.',
      },
      max: 300,
    },
    {
      type: 'image',
      stem: 'after',
      label: { ar: 'صورة بعد الجلسة', en: 'Picture after the session' },
      hint: {
        ar: 'الصورتان تظهران معًا: ما لم ترفعي الاثنتين لا تظهر مقارنة، ويظهر في القائمة وسم «تحتاج الصورة الأخرى».',
        en: 'The two show together: unless both are uploaded no comparison shows, and the list marks the row "Needs the other photo".',
      },
    },
    {
      type: 'text',
      stem: 'afterAlt',
      label: { ar: 'وصف صورة بعد', en: 'After picture description' },
      hint: {
        ar: 'جملة تقرأها قارئات الشاشة لمن لا يرى صورة بعد.',
        en: 'Read aloud to people who cannot see the after picture.',
      },
      max: 300,
    },
    {
      type: 'text',
      stem: 'caption',
      label: { ar: 'سطر تحت الصورتين', en: 'Line under the pictures' },
      hint: {
        ar: 'مثال: بعد أربع جلسات. سطر واحد يظهر تحت الصورتين وفي العرض المكبّر.',
        en: 'For example: after four sessions. One line, under the pictures and in the enlarged view.',
      },
      max: 300,
    },
    {
      type: 'flag',
      stem: 'showOnHome',
      label: { ar: 'تظهر في مقارنة الصفحة الرئيسية', en: 'Show in the home comparison' },
      hint: {
        ar: 'تظهر الحالة في شريط قبل/بعد في الرئيسية، مع بقائها في صفحة النتائج. يشترط أن تكون الصورتان مرفوعتين والنتيجة مُفعّلة: بحال صورة واحدة لا تظهر في الرئيسية مهما كان هذا الخيار.',
        en: 'Puts the case in the before/after comparison on the home page, and it stays on the results page too. Needs both pictures uploaded and the result enabled: with one picture it never reaches the home page, whatever this says.',
      },
    },
    {
      type: 'refs',
      stem: 'service',
      source: 'services',
      label: { ar: 'الخدمة التي أدّت إلى هذه النتيجة', en: 'The service behind this result' },
      hint: {
        ar: 'تظهر باسمها مع الصورتين، والنقرة عليها تفتح صفحة الخدمة.',
        en: 'Shown by name with the pictures; it opens that service page.',
      },
    },
    {
      type: 'story',
      stem: 'story',
      label: { ar: 'مقال ذو صلة (اختياري)', en: 'Related article (optional)' },
      hint: {
        ar: 'اختاري مقالًا تفتح منه البطاقة، أو اتركيه فارغًا: النتيجة تكفي وحدها بعنوانها وصورتَيها.',
        en: 'Pick the article the card opens, or leave it empty — the title and the two pictures are a result on their own.',
      },
    },
    {
      type: 'text',
      stem: 'note',
      label: { ar: 'النص الذي يظهر عند تكبير الصورتين', en: 'Text shown when the pictures are enlarged' },
      hint: {
        ar: 'فقرات قصيرة تشرح ما تراه في الصورتين والمدة بينهما. لا تظهر في الصفحة العادية.',
        en: 'A few short paragraphs on what the pictures show and the time between them. Only in the enlarged view.',
      },
      multiline: true,
      max: 2000,
    },
    {
      type: 'strings',
      stem: 'phrases',
      label: { ar: 'العبارات التي جعلته قصة نتيجة', en: 'Phrases that made it a result story' },
      hint: { ar: 'سبب اختيار المقال ضمن النتائج. لا يظهر على الموقع.', en: 'Why the article is listed under results. Not shown on the site.' },
    },
  ],
};

/**
 * What patients said, in their own voice: a WhatsApp conversation (typed messages and voice
 * notes) or a short video. The site draws a chat as a real phone with WhatsApp's own layout and
 * a video as a vertical reel; a row with nothing to read or play is never drawn, and when no row
 * qualifies the whole band disappears instead of showing an empty phone.
 */
const TESTIMONIAL_G = {
  who: { key: 'who', label: { ar: 'صاحبة الرأي', en: 'Who said it' } },
  chat: {
    key: 'chat',
    label: { ar: 'محادثة واتساب', en: 'WhatsApp conversation' },
    hint: { ar: 'لنوع «محادثة واتساب» فقط: رسائل مكتوبة أو تسجيل صوتي أو الاثنان.', en: 'For the "WhatsApp conversation" format only: typed messages, a voice note, or both.' },
  },
  video: {
    key: 'video',
    label: { ar: 'فيديو', en: 'Video' },
    hint: { ar: 'لنوع «فيديو» فقط: ارفعي الفيديو من جهازك أو ضعي رابط يوتيوب.', en: 'For the "Video" format only: upload the video from your device or paste a YouTube link.' },
  },
} as const;

const TESTIMONIALS: ListSchema = {
  key: 'testimonials',
  title: 'name',
  fields: [
    {
      type: 'select',
      stem: 'format',
      group: TESTIMONIAL_G.who,
      label: { ar: 'نوع الرأي', en: 'Format' },
      hint: { ar: 'محادثة تظهر داخل هاتف بشكل واتساب، أو فيديو يظهر كريل طولي.', en: 'A chat drawn inside a phone in WhatsApp style, or a video drawn as a portrait reel.' },
      options: [
        { value: 'chat', label: { ar: 'محادثة واتساب', en: 'WhatsApp conversation' } },
        { value: 'video', label: { ar: 'فيديو', en: 'Video' } },
      ],
    },
    {
      type: 'text',
      stem: 'name',
      group: TESTIMONIAL_G.who,
      label: { ar: 'الاسم الظاهر', en: 'Displayed name' },
      hint: { ar: 'كما وافقت المريضة أن يظهر، مثل «سارة م.».', en: 'As the patient agreed to be named, e.g. "Sara M.".' },
      required: true,
      max: 80,
    },
    { type: 'image', stem: 'avatar', group: TESTIMONIAL_G.who, label: { ar: 'الصورة الشخصية (اختياري)', en: 'Profile picture (optional)' }, hint: { ar: 'بدونها يظهر أول حرف من الاسم.', en: 'Without one, the first letter of the name shows.' } },
    { type: 'refs', stem: 'service', source: 'services', group: TESTIMONIAL_G.who, label: { ar: 'الخدمة', en: 'Service' }, hint: { ar: 'تظهر كوسم صغير بجانب الرأي.', en: 'Shown as a small tag beside the testimonial.' } },
    { type: 'text', stem: 'quote', group: TESTIMONIAL_G.who, label: { ar: 'جملة مختصرة', en: 'Short quote' }, hint: { ar: 'سطر أو سطران يلخصان الرأي، تظهر تحت الفيديو أو المحادثة.', en: 'One or two lines summing it up, shown under the video or chat.' }, multiline: true, max: 280 },
    { type: 'number', stem: 'rating', group: TESTIMONIAL_G.who, label: { ar: 'التقييم من ٥ (اختياري)', en: 'Rating out of 5 (optional)' }, hint: { ar: 'اتركيه فارغًا لإخفاء النجوم.', en: 'Leave empty to hide the stars.' } },
    {
      type: 'children',
      stem: 'messages',
      group: TESTIMONIAL_G.chat,
      label: { ar: 'الرسائل', en: 'Messages' },
      hint: { ar: 'بالترتيب كما في المحادثة. رسائل «المريضة» بيضاء ورسائل «العيادة» خضراء، كما في واتساب.', en: 'In conversation order. "Patient" bubbles are white and "Clinic" bubbles are green, as in WhatsApp.' },
      row: [
        {
          type: 'select',
          stem: 'from',
          label: { ar: 'المرسل', en: 'Sender' },
          options: [
            { value: 'patient', label: { ar: 'المريضة', en: 'Patient' } },
            { value: 'clinic', label: { ar: 'العيادة', en: 'Clinic' } },
          ],
        },
        { type: 'text', stem: 'text', label: { ar: 'نص الرسالة', en: 'Message' }, multiline: true, required: true },
        { type: 'text', stem: 'time', label: { ar: 'الوقت', en: 'Time' } },
      ],
    },
    { type: 'clip', accept: 'audio', stem: 'voice', group: TESTIMONIAL_G.chat, label: { ar: 'التسجيل الصوتي', en: 'Voice note' }, hint: { ar: 'ملف صوتي من واتساب (opus أو mp3 أو m4a) حتى ١٦ ميجا. يظهر كرسالة صوتية بعد الرسائل.', en: 'An audio file from WhatsApp (opus, mp3 or m4a), up to 16 MB. Shown as a voice message after the texts.' } },
    { type: 'text', stem: 'day', group: TESTIMONIAL_G.chat, label: { ar: 'تاريخ المحادثة', en: 'Conversation day' }, hint: { ar: 'يظهر أعلى المحادثة مثل «اليوم» أو «١٢ مارس».', en: 'Shown above the chat, like "Today" or "12 March".' }, max: 40 },
    { type: 'clip', accept: 'video', stem: 'video', group: TESTIMONIAL_G.video, label: { ar: 'ملف الفيديو', en: 'Video file' }, hint: { ar: 'mp4 أو webm حتى ٨٠ ميجا. التصوير الطولي أفضل.', en: 'mp4 or webm, up to 80 MB. Portrait works best.' } },
    { type: 'text', stem: 'videoLink', mono: true, group: TESTIMONIAL_G.video, label: { ar: 'أو رابط يوتيوب', en: 'Or a YouTube link' }, hint: { ar: 'يُستخدم فقط إن لم يُرفع ملف.', en: 'Used only when no file is uploaded.' }, max: 300 },
    { type: 'image', stem: 'poster', group: TESTIMONIAL_G.video, label: { ar: 'صورة الغلاف', en: 'Cover picture' }, hint: { ar: 'تظهر قبل التشغيل. بدونها يظهر أول إطار من الفيديو.', en: 'Shown before playing. Without one, the first frame shows.' } },
  ],
};

/**
 * The About page's own headings, in the order `/about` draws its blocks.
 *
 * A `pages` row keeps its title in its own columns; this document holds every other word
 * the page prints, so an owner can change a sentence, a number or a photograph without
 * asking a developer to open a file. The three counters under the first split are not
 * all here on purpose: two of them count the branches and services the site publishes,
 * and a figure typed twice is a figure that goes stale.
 */
const ABOUT_G = {
  hero: { key: 'hero', label: { ar: 'واجهة الصفحة', en: 'Page hero' } },
  story: { key: 'story', label: { ar: 'القصة وطريقة العمل', en: 'Story & process' } },
  stats: { key: 'stats', label: { ar: 'أرقام أسفل القصة', en: 'Figures under the story' } },
  reasons: { key: 'reasons', label: { ar: 'لماذا تختارنا', en: 'Why clients choose us' } },
  values: { key: 'values', label: { ar: 'ما نلتزم به', en: 'What we stand by' } },
  numbers: { key: 'numbers', label: { ar: 'أرقام العيادة', en: 'Clinic numbers' } },
} as const;

export const ABOUT: ListSchema = {
  key: 'about',
  title: 'lead',
  fields: [
    {
      type: 'image',
      stem: 'heroImage',
      group: ABOUT_G.hero,
      label: { ar: 'صورة الصفحة', en: 'Page picture' },
      hint: { ar: 'تظهر بجانب عنوان الصفحة في أعلى كل زيارة.', en: 'Shown beside the page title at the top of every visit.' },
    },
    {
      type: 'text',
      stem: 'heroAlt',
      group: ABOUT_G.hero,
      label: { ar: 'وصف صورة الصفحة', en: 'Page picture description' },
      hint: { ar: 'جملة تقرأها قارئات الشاشة.', en: 'Read aloud to people who cannot see the picture.' },
      max: 300,
    },
    {
      type: 'text',
      stem: 'lead',
      group: ABOUT_G.hero,
      label: { ar: 'مقدمة الصفحة', en: 'Page lead' },
      hint: { ar: 'سطران يعرّفان العيادة باختصار، يظهران أسفل عنوان الصفحة.', en: 'Two short lines introducing the clinic, shown below the page title.' },
      multiline: true,
      max: 800,
    },

    {
      type: 'text',
      stem: 'storyTitle',
      group: ABOUT_G.story,
      label: { ar: 'عنوان القصة', en: 'Story heading' },
      max: 300,
    },
    {
      type: 'list',
      stem: 'storyParagraphs',
      group: ABOUT_G.story,
      label: { ar: 'فقرات القصة', en: 'Story paragraphs' },
      hint: { ar: 'فقرة لكل سطر، بالترتيب الذي تظهر به.', en: 'One paragraph per line, in the order they appear.' },
    },
    {
      type: 'image',
      stem: 'storyImage',
      group: ABOUT_G.story,
      label: { ar: 'صورة القصة', en: 'Story picture' },
    },
    {
      type: 'text',
      stem: 'storyAlt',
      group: ABOUT_G.story,
      label: { ar: 'وصف صورة القصة', en: 'Story picture description' },
      max: 300,
    },
    {
      type: 'text',
      stem: 'processTitle',
      group: ABOUT_G.story,
      label: { ar: 'عنوان طريقة العمل', en: 'Process heading' },
      max: 300,
    },
    {
      type: 'list',
      stem: 'processParagraphs',
      group: ABOUT_G.story,
      label: { ar: 'فقرات طريقة العمل', en: 'Process paragraphs' },
      hint: { ar: 'فقرة لكل سطر. القسم بلا فقرة لا يظهر على الموقع.', en: 'One paragraph per line. A split with no paragraph never reaches the site.' },
    },
    {
      type: 'image',
      stem: 'processImage',
      group: ABOUT_G.story,
      label: { ar: 'صورة طريقة العمل', en: 'Process picture' },
    },
    {
      type: 'text',
      stem: 'processAlt',
      group: ABOUT_G.story,
      label: { ar: 'وصف صورة طريقة العمل', en: 'Process picture description' },
      max: 300,
    },

    {
      type: 'text',
      stem: 'staffValue',
      group: ABOUT_G.stats,
      label: { ar: 'رقم الطاقم النسائي', en: 'Female-staff figure' },
      hint: {
        ar: 'الرقم الثالث تحت القصة، مع علامته كما تريدينه في كل لغة. العددان الآخران يُحسبان من الفروع والخدمات المنشورة.',
        en: 'The third figure under the story, with its sign as you want it in each language. The other two are counted from the published branches and services.',
      },
      max: 40,
    },

    {
      type: 'text',
      stem: 'reasonsTitle',
      group: ABOUT_G.reasons,
      label: { ar: 'عنوان القسم', en: 'Section heading' },
      max: 300,
    },
    {
      type: 'text',
      stem: 'reasonsLead',
      group: ABOUT_G.reasons,
      label: { ar: 'سطر تحت العنوان', en: 'Line under the heading' },
      multiline: true,
      max: 800,
    },
    {
      type: 'list',
      stem: 'reasons',
      group: ABOUT_G.reasons,
      label: { ar: 'الأسباب', en: 'The reasons' },
      hint: { ar: 'سبب لكل سطر، ويُرَقَّم على الموقع بالترتيب.', en: 'One reason per line; the site numbers them in this order.' },
    },

    {
      type: 'text',
      stem: 'valuesTitle',
      group: ABOUT_G.values,
      label: { ar: 'عنوان القسم', en: 'Section heading' },
      max: 300,
    },
    {
      type: 'text',
      stem: 'valuesLead',
      group: ABOUT_G.values,
      label: { ar: 'سطر تحت العنوان', en: 'Line under the heading' },
      multiline: true,
      max: 800,
    },
    {
      type: 'list',
      stem: 'values',
      group: ABOUT_G.values,
      label: { ar: 'قيم العيادة', en: 'The clinic’s values' },
      hint: { ar: 'قاعدة لكل سطر، وتُرَقَّم على الموقع بالترتيب.', en: 'One rule per line; the site numbers them in this order.' },
    },

    {
      type: 'text',
      stem: 'numbersTitle',
      group: ABOUT_G.numbers,
      label: { ar: 'عنوان القسم', en: 'Section heading' },
      max: 300,
    },
    {
      type: 'text',
      stem: 'numbersLead',
      group: ABOUT_G.numbers,
      label: { ar: 'سطر تحت العنوان', en: 'Line under the heading' },
      multiline: true,
      max: 800,
    },
    {
      type: 'children',
      stem: 'numbers',
      group: ABOUT_G.numbers,
      label: { ar: 'الأرقام', en: 'The numbers' },
      hint: {
        ar: 'رقم مع وصفه وملاحظة اختيارية لكل لغة. لا تكتبي رقمًا لا تستطيع العيادة إثباته: الموقع يعرض ما تكتبينه كما هو.',
        en: 'A figure with its label and an optional note, in each language. Write only a number the clinic can stand behind: the site prints what you type.',
      },
      row: [
        { type: 'text', stem: 'value', label: { ar: 'الرقم', en: 'Number' }, required: true },
        { type: 'text', stem: 'label', label: { ar: 'الوصف', en: 'Label' }, required: true },
        { type: 'text', stem: 'note', label: { ar: 'الملاحظة', en: 'Note' } },
      ],
    },
  ],
};

/**
 * The page rows the console draws as a typed document instead of a JSON box.
 *
 * A `pages` row keeps its own title and body columns; this names the rows whose extra
 * `data` column has a form. A page is addressed by the route the site renders, so the
 * console's document and the public reader are keyed by the same string.
 */
const PAGE_DOCS: Readonly<Record<string, ListSchema>> = {
  '/about': ABOUT,
};

export function pageDocSchema(route: string | null | undefined): ListSchema | null {
  return route ? PAGE_DOCS[route] ?? null : null;
}

const SCHEMAS: readonly ListSchema[] = [SERVICES, BRANCHES, SPECIALISTS, FAQ, NAV, RESULTS, TESTIMONIALS, ABOUT];

const BY_KEY = new Map<string, ListSchema>(SCHEMAS.map((schema) => [schema.key, schema]));

export function listSchemaOf(listKey: string | null | undefined): ListSchema | null {
  return listKey ? BY_KEY.get(listKey) ?? null : null;
}

export function listSchemas(): readonly ListSchema[] {
  return SCHEMAS;
}

/**
 * The words the console writes beside one field, asked for by its stem.
 *
 * A public page prints some of these labels too — «قبل الجلسة» over the preparation list, the
 * fact names on a service page — and reading them from here is what keeps the two sets of words
 * from drifting apart when an author's label is reworded. Null when the list has no such field:
 * the caller then prints its own heading rather than a raw stem.
 */
export function fieldLabelOf(listKey: string, stem: string): Bi | null {
  return listSchemaOf(listKey)?.fields.find((field) => field.stem === stem)?.label ?? null;
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
  const bare = doc[stem];
  const legacyAr = doc[`${stem}_ar`];
  const legacyEn = doc[`${stem}_en`];
  // The import stored a repeatable bilingual value as two parallel string arrays under
  // `stem_ar`/`stem_en` — a benefit, a step. Those rows predate the multi-cell editor, so
  // each pair is folded into the row's first text cell here: the list keeps every line it
  // had, and gains the newer cells the next time somebody saves it.
  let raw: unknown = bare;
  if (bare === undefined && (legacyAr !== undefined || legacyEn !== undefined)) {
    const firstText = row.find((field) => field.type === 'text');
    if (!firstText) return { value: [], present: true, bad: true, issues: [] };
    const ar = legacyAr === undefined ? [] : stringList(legacyAr);
    const en = legacyEn === undefined ? [] : stringList(legacyEn);
    if (ar === null || en === null) return { value: [], present: true, bad: true, issues: [] };
    const size = Math.max(ar.length, en.length);
    raw = Array.from({ length: size }, (_, index) => ({ [firstText.stem]: { ar: ar[index] ?? '', en: en[index] ?? '' } }));
  }
  if (raw === undefined) return { value: [], present: false, bad: false, issues: [] };
  if (!Array.isArray(raw)) return { value: [], present: true, bad: true, issues: [] };
  const issues: ListDocIssue[] = [];
  const value: Record<string, unknown>[] = [];
  const firstText = row.find((field) => field.type === 'text');
  const known = new Set(row.flatMap((field) => (field.type === 'text' ? [field.stem, `${field.stem}_ar`, `${field.stem}_en`] : [field.stem])));
  raw.forEach((entry, index) => {
    // A one-line row written before this row had more than one cell: the string *is* its text.
    if (typeof entry === 'string') {
      if (!firstText) {
        issues.push({ path: `${stem}.${index}`, message: 'expected an object or an array' });
        return;
      }
      entry = { [firstText.stem]: entry };
    }
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
      if (field.type !== 'text') {
        const cell = record[field.stem];
        if (cell !== undefined && typeof cell !== 'string') issues.push({ path: `${stem}.${index}.${field.stem}`, message: 'expected text' });
        const value = textOf(cell);
        if (field.type === 'select' && value && !(field.options ?? []).some((option) => option.value === value)) {
          issues.push({ path: `${stem}.${index}.${field.stem}`, message: 'unknown option' });
        }
        if (field.required && !value) issues.push({ path: `${stem}.${index}.${field.stem}`, message: 'required' });
        written[field.stem] = value;
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
    // A repeatable bilingual value imported before the multi-cell editor kept its items in
    // `stem_ar`/`stem_en`; those keys stay known so an untouched imported row saves as-is.
    if (field.type === 'text' || field.type === 'list' || field.type === 'children') {
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

    if (field.type === 'image' || field.type === 'clip' || field.type === 'href' || field.type === 'select' || field.type === 'story') {
      const raw = source[field.stem];
      if (raw !== undefined && typeof raw !== 'string') issues.push({ path: field.stem, message: 'expected text' });
      const value = typeof raw === 'string' ? raw.trim() : '';
      if ((field.type === 'image' || field.type === 'clip' || field.type === 'href' || field.type === 'story') && field.required && !value) {
        issues.push({ path: field.stem, message: 'required' });
      }
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

    if (field.type === 'sections') {
      const raw = source[field.stem];
      const catalogue = new Set(field.sections.map((section) => section.key));
      const order: { key: string; visible: boolean }[] = [];
      const seen = new Set<string>();
      if (raw !== undefined) {
        if (!Array.isArray(raw)) {
          issues.push({ path: field.stem, message: 'expected a list' });
        } else {
          raw.forEach((entry, index) => {
            if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
              issues.push({ path: `${field.stem}.${index}`, message: 'expected an object' });
              return;
            }
            const record = entry as Record<string, unknown>;
            for (const key of Object.keys(record)) {
              if (key !== 'key' && key !== 'visible') issues.push({ path: `${field.stem}.${index}.${key}`, message: 'unknown field' });
            }
            const key = textOf(record.key);
            if (!catalogue.has(key)) {
              // A section no component draws cannot be stored: the site would silently lose it.
              issues.push({ path: `${field.stem}.${index}.key`, message: 'unknown section' });
              return;
            }
            if (seen.has(key)) {
              issues.push({ path: `${field.stem}.${index}.key`, message: 'duplicate section' });
              return;
            }
            const visible = record.visible;
            if (visible !== undefined && typeof visible !== 'boolean') {
              issues.push({ path: `${field.stem}.${index}.visible`, message: 'expected true or false' });
            }
            seen.add(key);
            order.push({ key, visible: visible === undefined ? true : Boolean(visible) });
          });
        }
      }
      // A section the row has never mentioned is a section that did not exist when it was
      // saved; it appears in its catalogue place rather than disappearing from the page.
      for (const section of field.sections) {
        if (!seen.has(section.key)) order.push({ key: section.key, visible: true });
      }
      doc[field.stem] = order;
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
  const preferred = ['intro', 'description', 'answer', 'area', 'landmark', 'credentials', 'caption'];
  for (const stem of preferred) {
    const field = schema.fields.find((candidate) => candidate.stem === stem && candidate.type === 'text');
    if (!field || field.type !== 'text') continue;
    const read = readBi(doc, field.stem, 'plain');
    const value = read.value[locale] || read.value[locale === 'ar' ? 'en' : 'ar'];
    if (value) return value;
  }
  return '';
}

/**
 * One text field, named by its stem, for a preview that knows which fields it draws.
 *
 * `listDocIntro` picks a teaser by trying stems in order, which is right for a card that
 * has one line under its title and wrong for a before/after case: there the area and the
 * session count are two chips of their own, and neither is a teaser. Same cross-language
 * borrow as the title, so an Arabic row previewed in English still says something.
 */
export function listDocText(schema: ListSchema, doc: Record<string, unknown>, stem: string, locale: ContentLocale): string {
  const field = schema.fields.find((candidate) => candidate.stem === stem && (candidate.type === 'text' || candidate.type === 'href'));
  if (!field) return '';
  return readBi(doc, stem, 'plain').value[locale];
}

/**
 * The picture a document carries, wherever the schema keeps it.
 *
 * `stem` names one field when the caller knows which picture it wants: a result story has a
 * before *and* an after, and the card that invites the click shows what the session produced.
 * Without it the first picture field with a value answers, which is what every other list wants.
 */
export function listDocImage(schema: ListSchema, doc: Record<string, unknown>, stem?: string): string | null {
  for (const field of schema.fields) {
    if (field.type !== 'image') continue;
    if (stem !== undefined && field.stem !== stem) continue;
    const source = doc[field.stem];
    if (typeof source === 'string' && source.trim()) return source.trim();
  }
  return null;
}

/**
 * Whether a case has one picture and not the other.
 *
 * The rule the whole feature rests on: two pictures are a comparison and one is not, so the
 * site drops the pair in data, and the list says which half is still owed. It takes the two
 * values rather than a document because the list reads a saved row and the editor's preview
 * reads a form nobody has saved yet — and both must reach the same answer about the same case.
 */
export function needsOtherPhoto(before: string, after: string): boolean {
  return (before.trim() === '') !== (after.trim() === '');
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
    if (field.type === 'sections') {
      const rows = (normal[field.stem] as { key: string; visible: boolean }[]) ?? [];
      rows.forEach((entry, index) => {
        form[`${field.stem}.${index}.key`] = entry.key;
        form[`${field.stem}.${index}.visible`] = Boolean(entry.visible);
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
    if (field.type === 'sections') {
      raw[field.stem] = indicesOf(form, field.stem).map((index) => ({
        key: String(form[`${field.stem}.${index}.key`] ?? ''),
        visible: Boolean(form[`${field.stem}.${index}.visible`]),
      }));
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
      // A field the card already shows as its teaser, its picture description or its long
      // text must not also print as a strip of labels — the preview is one card, not a dump.
      if (value && !['intro', 'description', 'body', 'answer', 'area', 'landmark', 'credentials', 'caption', 'note'].includes(field.stem)) {
        out.push({ label: labelOf(field), value });
      }
    }
  }
  return out;
}

/** The first repeatable field's points, for the preview's bullets. */
export function listDocBullets(schema: ListSchema, doc: Record<string, unknown>, locale: ContentLocale): string[] {
  const other = locale === 'ar' ? 'en' : 'ar';
  for (const field of schema.fields) {
    if (field.type === 'list') {
      const read = readBiList(doc, field.stem);
      const items = read.value[locale].length ? read.value[locale] : read.value[other];
      if (items.length) return items.slice(0, 6);
      continue;
    }
    if (field.type !== 'children') continue;
    // A benefit or a step is one point per row, and the row's cells are tried in schema
    // order so the sentence the clinic wrote first is the one the card prints. A row that
    // only has the other language still says something, and a bullet list of two-word titles
    // would be worse than the sentence it replaced.
    const rows = Array.isArray(doc[field.stem]) ? (doc[field.stem] as Record<string, unknown>[]) : [];
    const items = rows
      .map((row) => {
        for (const language of [locale, other]) {
          for (const cell of field.row) {
            if (cell.type !== 'text') continue;
            const value = textOf(row[`${cell.stem}_${language}`]);
            if (value) return value;
          }
        }
        return '';
      })
      .filter(Boolean);
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
