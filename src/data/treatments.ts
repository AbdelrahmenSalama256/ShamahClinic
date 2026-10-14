import type { PhotoSlot } from "@/lib/images";

export type TreatmentCategory = "laser" | "injectables" | "skincare" | "anti-aging";

/**
 * A service card. The fields WordPress does not publish are empty rather than
 * invented: `category`/`categoryName` are absent because page 696 has no service
 * taxonomy, `priceStartingAt` is null because the dashboard gives no price, and
 * `benefits`/`steps`/`aftercare` are empty lists. Every consumer renders nothing
 * for an empty value instead of a placeholder or a zero.
 */
export interface Treatment {
  id: string;
  category: TreatmentCategory | null;
  categoryName: { ar: string; en: string };
  name: { ar: string; en: string };
  tagline: { ar: string; en: string };
  description: { ar: string; en: string };
  benefits: { ar: string[]; en: string[] };
  steps: { ar: string[]; en: string[] };
  aftercare: { ar: string[]; en: string[] };
  idealFor: { ar: string; en: string };
  duration: { ar: string; en: string };
  sessionsRecommended: { ar: string; en: string };
  priceStartingAt: number | null;
  image: PhotoSlot;
  featured?: boolean;
  /**
   * Long-form HTML WordPress publishes for this treatment as its own page
   * (today only 885 `botox-injections`). Empty when the dashboard has no page,
   * or when the Arabic subsite answers that page in English.
   */
  body?: BilingualHtml;
}

type BilingualHtml = { ar: string; en: string };

/** The booking and contact pickers only ever show these three fields. */
export type TreatmentOption = Pick<Treatment, "id" | "name" | "priceStartingAt">;

export const treatmentCategories: { id: TreatmentCategory | "all"; name: { ar: string; en: string } }[] = [
  { id: "all", name: { ar: "جميع الخدمات", en: "All Treatments" } },
  { id: "laser", name: { ar: "الليزر", en: "Laser" } },
  { id: "injectables", name: { ar: "حقن التجميل", en: "Injectables" } },
  { id: "skincare", name: { ar: "العناية بالبشرة", en: "Skincare" } },
  { id: "anti-aging", name: { ar: "النضارة ومكافحة الشيخوخة", en: "Anti-Aging" } },
];

/**
 * Empty by decision. The rows below were the five authored services with their
 * durations, session counts and "from X EGP" prices; WordPress page 696 publishes
 * none of that, and its own posts say the price is set after examination, so the
 * figures were numbers the clinic never gave us. They stay here, commented, as the
 * shape `lib/wp/treatments.ts` maps every service post into.
 */
export const treatmentsData: Treatment[] = [
  // {
  //   id: "laser-hair-removal",
  //   category: "laser",
  //   categoryName: { ar: "إزالة الشعر بالليزر", en: "Laser Hair Removal" },
  //   name: { ar: "إزالة الشعر بالليزر", en: "Laser Hair Removal" },
  //   tagline: { ar: "نعومة تدوم بتبريد يريح البشرة", en: "Lasting smoothness with comfort cooling" },
  //   description: {
  //     ar: "جلسات إزالة الشعر بأجهزة ليزر طبية حديثة مزودة بنظام تبريد يبرّد سطح الجلد قبل كل نبضة وبعدها، فتشعرين بلسعة خفيفة فقط بدلاً من الألم. نضبط الطاقة حسب لون بشرتكِ وكثافة الشعر في كل منطقة، لذلك تصلح الجلسات للوجه والجسم والمناطق الحساسة.",
  //     en: "Laser hair removal using modern medical lasers with contact cooling that chills the skin before and after each pulse, so you feel a light snap instead of pain. Energy is tuned to your skin tone and hair density, making it suitable for face, body and delicate areas.",
  //   },
  //   benefits: {
  //     ar: [
  //       "تبريد مدمج يقلل الإحساس بالألم",
  //       "سرعة عالية تتيح جلسة جسم كامل في وقت قصير",
  //       "مناسب لمعظم درجات البشرة والمناطق الحساسة",
  //       "طاقم نسائي وغرف خاصة للخصوصية",
  //     ],
  //     en: [
  //       "Integrated cooling reduces discomfort",
  //       "Fast pass times allow full-body sessions",
  //       "Suitable for most skin tones and delicate areas",
  //       "Female staff and private rooms for full privacy",
  //     ],
  //   },
  //   steps: {
  //     ar: [
  //       "تقييم سريع للمنطقة ولون البشرة لضبط الطاقة",
  //       "حلاقة السطح وتطبيق جل التبريد",
  //       "تمرير يد الليزر مع التبريد المتزامن",
  //       "تهدئة البشرة بكريم مرطب وتعليمات ما بعد الجلسة",
  //     ],
  //     en: [
  //       "Quick assessment of area and skin tone to set energy",
  //       "Shaving the surface and applying cooling gel",
  //       "Passing the laser handpiece with simultaneous cooling",
  //       "Soothing moisturiser and aftercare instructions",
  //     ],
  //   },
  //   aftercare: {
  //     ar: [
  //       "تجنبي الشمس والواقي الشمسي يومياً لأسبوع",
  //       "لا تقشري أو تشمعي المنطقة بين الجلسات، الحلاقة فقط",
  //       "ترطيب المنطقة مرتين يومياً",
  //     ],
  //     en: [
  //       "Avoid sun and use daily SPF for a week",
  //       "No waxing or plucking between sessions, shaving only",
  //       "Moisturise the area twice daily",
  //     ],
  //   },
  //   idealFor: { ar: "من ترغب عن حل طويل الأمد للشعر الزائد بدل الحلاقة والشمع المتكرر.", en: "Anyone wanting a long-term alternative to shaving and waxing." },
  //   duration: { ar: "٣٠ – ٦٠ دقيقة", en: "30 – 60 mins" },
  //   sessionsRecommended: { ar: "٦ – ٨ جلسات بفارق ٤ – ٦ أسابيع", en: "6 – 8 sessions, 4 – 6 weeks apart" },
  //   priceStartingAt: 850,
  //   image: images.treatments.laser,
  //   featured: true,
  // },
  // {
  //   id: "skincare-deep-cleansing",
  //   category: "skincare",
  //   categoryName: { ar: "العناية بالبشرة", en: "Skincare" },
  //   name: { ar: "العناية المتكاملة بالبشرة", en: "Complete Skincare Facial" },
  //   tagline: { ar: "تنظيف عميق وترتيب روتين يناسب بشرتكِ", en: "Deep cleansing and a routine built for your skin" },
  //   description: {
  //     ar: "جلسة عناية تبدأ بتحليل للبشرة لتحديد نوعها ومشاكلها، ثم تنظيف عميق للمسام واستخراج الرؤوس السوداء، وتقشير لطيف للخلايا الميتة، وتنتهي بقناع ومرطب يناسبان حالتكِ مع خطة منزلية واضحة.",
  //     en: "A care session that begins with skin analysis, then deep pore cleansing and blackhead extraction, gentle exfoliation of dead cells, and finishes with a mask and moisturiser matched to your skin plus a clear home routine.",
  //   },
  //   benefits: {
  //     ar: [
  //       "تحليل بشرة يحدد النوع والمشاكل قبل أي خطوة",
  //       "تنظيف مسام واستخراج رؤوس سوداء بأدوات معقمة",
  //       "ترطيب وتهدئة فورية تناسب البشرة الحساسة",
  //       "خطة منزلية مكتوبة لاستمرار النتيجة",
  //     ],
  //     en: [
  //       "Skin analysis defines type and concerns first",
  //       "Pore cleansing and extraction with sterile tools",
  //       "Immediate hydration suited to sensitive skin",
  //       "Written home plan to maintain results",
  //     ],
  //   },
  //   steps: {
  //     ar: [
  //       "تحليل البشرة وتحديد الأهداف",
  //       "تنظيف عميق وتقشير لطيف",
  //       "استخراج الشوائب وتطبيق القناع",
  //       "ترطيب وحماية وخطة منزلية",
  //     ],
  //     en: [
  //       "Skin analysis and goal setting",
  //       "Deep cleanse and gentle exfoliation",
  //       "Extraction and mask application",
  //       "Moisturise, protect and home plan",
  //     ],
  //   },
  //   aftercare: {
  //     ar: [
  //       "واقي شمس يومياً",
  //       "تجنبي المقشرات القوية ٤٨ ساعة",
  //       "التزمي بالخطة المنزلية الموصوفة",
  //     ],
  //     en: [
  //       "Daily sunscreen",
  //       "Avoid strong exfoliants for 48 hours",
  //       "Follow the prescribed home routine",
  //     ],
  //   },
  //   idealFor: { ar: "من ترغب في بدء روتين علمي لبشرتها أو معالجة بهتان واحتقان المسام.", en: "Anyone starting a proper routine or tackling dullness and congested pores." },
  //   duration: { ar: "٥٠ دقيقة", en: "50 mins" },
  //   sessionsRecommended: { ar: "جلسة شهرية", en: "Monthly" },
  //   priceStartingAt: 900,
  //   image: images.treatments.skincare,
  //   featured: true,
  // },
  // {
  //   id: "botox",
  //   category: "injectables",
  //   categoryName: { ar: "حقن التجميل", en: "Injectables" },
  //   name: { ar: "حقن البوتوكس", en: "Botox Injections" },
  //   tagline: { ar: "تنعيم الخطوط مع بقاء تعابيرك طبيعية", en: "Softening lines while keeping your expressions" },
  //   description: {
  //     ar: "حقن البوتوكس بجرعات محسوبة لتنعيم خطوط الجبهة وما بين الحاجبين وحول العينين. الهدف ليس تجميد الوجه بل إراحته؛ لذلك نبدأ بجرعة محافظة ونزيد عند المتابعة إن لزم، لتبقي ملامحك معبرة وطبيعية.",
  //     en: "Botox injected in measured doses to soften forehead lines, frown lines and crow's feet. The goal is rest, not freeze; we start conservative and top up at follow-up if needed, keeping your face expressive and natural.",
  //   },
  //   benefits: {
  //     ar: [
  //       "جرعات محافظة تحافظ على الحركة الطبيعية",
  //       "منتجات أصلية معتمدة تُفتح أمامك",
  //       "بداية مفعول خلال ٣ – ٥ أيام واكتمال خلال أسبوعين",
  //       "متابعة مجانية لضبط النتيجة",
  //     ],
  //     en: [
  //       "Conservative dosing preserves natural movement",
  //       "Authentic approved product opened in front of you",
  //       "Onset in 3 – 5 days, full effect at two weeks",
  //       "Free follow-up to refine the result",
  //     ],
  //   },
  //   steps: {
  //     ar: [
  //       "تقييم حركة العضلات وتحديد مواضع الحقن",
  //       "تعقيم المنطقة وتطبيق مخدر موضعي عند الحاجة",
  //       "حقن دقيق بإبر رفيعة",
  //       "تعليمات ما بعد الحقن وموعد المتابعة",
  //     ],
  //     en: [
  //       "Assess muscle movement and mark injection points",
  //       "Cleanse and apply topical anaesthetic if needed",
  //       "Precise injection with fine needles",
  //       "Aftercare instructions and follow-up date",
  //     ],
  //   },
  //   aftercare: {
  //     ar: [
  //       "لا تستلقي أو تنحني بقوة أول ٤ ساعات",
  //       "تجنبي المساج والساونا ٢٤ ساعة",
  //       "حركة خفيفة لعضلات الوجه أول يوم لتوزيع المادة",
  //     ],
  //     en: [
  //       "Do not lie down or bend heavily for 4 hours",
  //       "Avoid massage and sauna for 24 hours",
  //       "Light facial movement on day one to settle product",
  //     ],
  //   },
  //   idealFor: { ar: "من تزعجها خطوط التعبير وتريد مظهراً مرتاحاً دون تجميد.", en: "Those bothered by expression lines who want a rested look without freezing." },
  //   duration: { ar: "٢٠ دقيقة", en: "20 mins" },
  //   sessionsRecommended: { ar: "كل ٤ – ٦ أشهر", en: "Every 4 – 6 months" },
  //   priceStartingAt: 2400,
  //   image: images.treatments.injectables,
  //   featured: true,
  // },
  // {
  //   id: "fillers",
  //   category: "injectables",
  //   categoryName: { ar: "حقن التجميل", en: "Injectables" },
  //   name: { ar: "حقن الفيلر", en: "Dermal Fillers" },
  //   tagline: { ar: "امتلاء وتحديد متناسق بحمض الهيالورونيك", en: "Balanced volume and definition with hyaluronic acid" },
  //   description: {
  //     ar: "فيلر حمض الهيالورونيك لإعادة الامتلاء وتحديد الشفاه والوجنتين وخط الدمع والفك. نحقن بكميات مدروسة وعلى مراحل عند الحاجة، باستخدام كانيولا في المناطق عالية الخطورة لتقليل الكدمات والمضاعفات.",
  //     en: "Hyaluronic acid filler to restore volume and define lips, cheeks, tear troughs and jawline. We inject measured amounts, staged when needed, using cannulas in higher-risk zones to reduce bruising and complications.",
  //   },
  //   benefits: {
  //     ar: [
  //       "نتيجة فورية تتحسن خلال أسبوعين",
  //       "كانيولا لتقليل الكدمات في المناطق الحساسة",
  //       "مادة قابلة للذوبان إن رغبتِ بالتراجع",
  //       "تصميم يناسب نسب وجهك لا قالباً جاهزاً",
  //     ],
  //     en: [
  //       "Immediate result that settles over two weeks",
  //       "Cannula technique reduces bruising in delicate zones",
  //       "Reversible material if you ever wish to dissolve",
  //       "Designed to your facial proportions, not a template",
  //     ],
  //   },
  //   steps: {
  //     ar: [
  //       "تحليل نسب الوجه والاتفاق على الخطة",
  //       "تعقيم ومخدر موضعي",
  //       "حقن تدريجي وتقييم متزامن",
  //       "تشكيل نهائي وتعليمات المتابعة",
  //     ],
  //     en: [
  //       "Facial proportion analysis and agreed plan",
  //       "Cleanse and topical anaesthetic",
  //       "Gradual injection with simultaneous assessment",
  //       "Final shaping and aftercare",
  //     ],
  //   },
  //   aftercare: {
  //     ar: [
  //       "كمادات باردة أول يوم لتقليل التورم",
  //       "تجنبي الضغط والنوم على الوجه ٤٨ ساعة",
  //       "لا ساونا أو مجهود عنيف أسبوعاً",
  //     ],
  //     en: [
  //       "Cool compresses on day one to limit swelling",
  //       "Avoid pressure and sleeping on the face for 48 hours",
  //       "No sauna or strenuous exercise for a week",
  //     ],
  //   },
  //   idealFor: { ar: "من ترغب في استعادة امتلاء فقدته أو تحديد ملامح بلمسة طبيعية.", en: "Those restoring lost volume or seeking subtle definition." },
  //   duration: { ar: "٣٠ دقيقة", en: "30 mins" },
  //   sessionsRecommended: { ar: "يدوم ٩ – ١٢ شهراً", en: "Lasts 9 – 12 months" },
  //   priceStartingAt: 3200,
  //   image: images.treatments.injectables,
  //   featured: true,
  // },
  // {
  //   id: "chemical-peel",
  //   category: "skincare",
  //   categoryName: { ar: "العناية بالبشرة", en: "Skincare" },
  //   name: { ar: "التقشير الكيميائي (التقشير الأصفر)", en: "Chemical Peel (Yellow Peel)" },
  //   tagline: { ar: "علاج التصبغات والكلف وتجديد السطح", en: "Treating pigmentation, melasma and renewing texture" },
  //   description: {
  //     ar: "التقشير الأصفر علاج موجه للتصبغات والكلف وآثار الحبوب. يعتمد على حمض الريتينويك ومكونات مفتحّة تُترك على البشرة مدة محددة ثم يُحدث تقشيراً خفيفاً على مدى أيام يجدد السطح ويوحد اللون.",
  //     en: "The yellow peel is a corrective treatment for pigmentation, melasma and post-acne marks. It uses retinoic acid and brightening agents left on for a set time, then triggers mild peeling over several days to renew the surface and even tone.",
  //   },
  //   benefits: {
  //     ar: [
  //       "توحيد اللون وتفتيح التصبغات العنيدة",
  //       "تقليل آثار الحبوب والبقع",
  //       "تحفيز تجديد الخلايا",
  //       "برنامج منزلي مرفق لدعم النتيجة",
  //     ],
  //     en: [
  //       "Evens tone and lightens stubborn pigmentation",
  //       "Reduces post-acne marks and spots",
  //       "Stimulates cell renewal",
  //       "Home programme included to support results",
  //     ],
  //   },
  //   steps: {
  //     ar: [
  //       "تحضير البشرة وتنظيفها",
  //       "تطبيق محلول التقشير لمدة محسوبة",
  //       "معادلة وإيقاف التقشير",
  //       "تعليمات التقشير المنزلي والترطيب",
  //     ],
  //     en: [
  //       "Prepare and cleanse the skin",
  //       "Apply peel solution for a timed interval",
  //       "Neutralise and stop the peel",
  //       "Home peeling and moisturising instructions",
  //     ],
  //   },
  //   aftercare: {
  //     ar: [
  //       "لا تقشري الجلد يدوياً أبداً",
  //       "ترطيب مكثف وواقي شمس صارم",
  //       "تجنبي المكياج أول ٤٨ ساعة",
  //     ],
  //     en: [
  //       "Never peel the skin manually",
  //       "Intensive moisturiser and strict sunscreen",
  //       "Avoid makeup for the first 48 hours",
  //     ],
  //   },
  //   idealFor: { ar: "من تعاني من كلف أو تصبغات شمسية أو آثار حبوب قديمة.", en: "Those dealing with melasma, sun spots or old acne marks." },
  //   duration: { ar: "٢٥ دقيقة", en: "25 mins" },
  //   sessionsRecommended: { ar: "٢ – ٤ جلسات حسب الحالة", en: "2 – 4 sessions depending on case" },
  //   priceStartingAt: 1500,
  //   image: images.treatments.peel,
  // },
];

export const getTreatment = (slug: string) => treatmentsData.find((t) => t.id === slug);
