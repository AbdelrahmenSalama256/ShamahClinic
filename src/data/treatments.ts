import { images, type PhotoSlot } from "@/lib/images";

export type TreatmentCategory = "laser" | "injectables" | "skincare" | "anti-aging";

export interface Treatment {
  id: string;
  category: TreatmentCategory;
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
  priceStartingAt: number;
  image: PhotoSlot;
  featured?: boolean;
}

export const treatmentCategories: { id: TreatmentCategory | "all"; name: { ar: string; en: string } }[] = [
  { id: "all", name: { ar: "جميع الخدمات", en: "All Treatments" } },
  { id: "laser", name: { ar: "الليزر", en: "Laser" } },
  { id: "injectables", name: { ar: "حقن التجميل", en: "Injectables" } },
  { id: "skincare", name: { ar: "العناية بالبشرة", en: "Skincare" } },
  { id: "anti-aging", name: { ar: "النضارة ومكافحة الشيخوخة", en: "Anti-Aging" } },
];

export const treatmentsData: Treatment[] = [
  {
    id: "laser-hair-removal",
    category: "laser",
    categoryName: { ar: "إزالة الشعر بالليزر", en: "Laser Hair Removal" },
    name: { ar: "إزالة الشعر بالليزر", en: "Laser Hair Removal" },
    tagline: { ar: "نعومة تدوم بتبريد يريح البشرة", en: "Lasting smoothness with comfort cooling" },
    description: {
      ar: "جلسات إزالة الشعر بأجهزة ليزر طبية حديثة مزودة بنظام تبريد يبرّد سطح الجلد قبل كل نبضة وبعدها، فتشعرين بلسعة خفيفة فقط بدلاً من الألم. نضبط الطاقة حسب لون بشرتكِ وكثافة الشعر في كل منطقة، لذلك تصلح الجلسات للوجه والجسم والمناطق الحساسة.",
      en: "Laser hair removal using modern medical lasers with contact cooling that chills the skin before and after each pulse, so you feel a light snap instead of pain. Energy is tuned to your skin tone and hair density, making it suitable for face, body and delicate areas.",
    },
    benefits: {
      ar: [
        "تبريد مدمج يقلل الإحساس بالألم",
        "سرعة عالية تتيح جلسة جسم كامل في وقت قصير",
        "مناسب لمعظم درجات البشرة والمناطق الحساسة",
        "طاقم نسائي وغرف خاصة للخصوصية",
      ],
      en: [
        "Integrated cooling reduces discomfort",
        "Fast pass times allow full-body sessions",
        "Suitable for most skin tones and delicate areas",
        "Female staff and private rooms for full privacy",
      ],
    },
    steps: {
      ar: [
        "تقييم سريع للمنطقة ولون البشرة لضبط الطاقة",
        "حلاقة السطح وتطبيق جل التبريد",
        "تمرير يد الليزر مع التبريد المتزامن",
        "تهدئة البشرة بكريم مرطب وتعليمات ما بعد الجلسة",
      ],
      en: [
        "Quick assessment of area and skin tone to set energy",
        "Shaving the surface and applying cooling gel",
        "Passing the laser handpiece with simultaneous cooling",
        "Soothing moisturiser and aftercare instructions",
      ],
    },
    aftercare: {
      ar: [
        "تجنبي الشمس والواقي الشمسي يومياً لأسبوع",
        "لا تقشري أو تشمعي المنطقة بين الجلسات، الحلاقة فقط",
        "ترطيب المنطقة مرتين يومياً",
      ],
      en: [
        "Avoid sun and use daily SPF for a week",
        "No waxing or plucking between sessions, shaving only",
        "Moisturise the area twice daily",
      ],
    },
    idealFor: { ar: "من ترغب عن حل طويل الأمد للشعر الزائد بدل الحلاقة والشمع المتكرر.", en: "Anyone wanting a long-term alternative to shaving and waxing." },
    duration: { ar: "٣٠ – ٦٠ دقيقة", en: "30 – 60 mins" },
    sessionsRecommended: { ar: "٦ – ٨ جلسات بفارق ٤ – ٦ أسابيع", en: "6 – 8 sessions, 4 – 6 weeks apart" },
    priceStartingAt: 850,
    image: images.treatments.laser,
    featured: true,
  },
  {
    id: "skincare-deep-cleansing",
    category: "skincare",
    categoryName: { ar: "العناية بالبشرة", en: "Skincare" },
    name: { ar: "العناية المتكاملة بالبشرة", en: "Complete Skincare Facial" },
    tagline: { ar: "تنظيف عميق وترتيب روتين يناسب بشرتكِ", en: "Deep cleansing and a routine built for your skin" },
    description: {
      ar: "جلسة عناية تبدأ بتحليل للبشرة لتحديد نوعها ومشاكلها، ثم تنظيف عميق للمسام واستخراج الرؤوس السوداء، وتقشير لطيف للخلايا الميتة، وتنتهي بقناع ومرطب يناسبان حالتكِ مع خطة منزلية واضحة.",
      en: "A care session that begins with skin analysis, then deep pore cleansing and blackhead extraction, gentle exfoliation of dead cells, and finishes with a mask and moisturiser matched to your skin plus a clear home routine.",
    },
    benefits: {
      ar: [
        "تحليل بشرة يحدد النوع والمشاكل قبل أي خطوة",
        "تنظيف مسام واستخراج رؤوس سوداء بأدوات معقمة",
        "ترطيب وتهدئة فورية تناسب البشرة الحساسة",
        "خطة منزلية مكتوبة لاستمرار النتيجة",
      ],
      en: [
        "Skin analysis defines type and concerns first",
        "Pore cleansing and extraction with sterile tools",
        "Immediate hydration suited to sensitive skin",
        "Written home plan to maintain results",
      ],
    },
    steps: {
      ar: [
        "تحليل البشرة وتحديد الأهداف",
        "تنظيف عميق وتقشير لطيف",
        "استخراج الشوائب وتطبيق القناع",
        "ترطيب وحماية وخطة منزلية",
      ],
      en: [
        "Skin analysis and goal setting",
        "Deep cleanse and gentle exfoliation",
        "Extraction and mask application",
        "Moisturise, protect and home plan",
      ],
    },
    aftercare: {
      ar: [
        "واقي شمس يومياً",
        "تجنبي المقشرات القوية ٤٨ ساعة",
        "التزمي بالخطة المنزلية الموصوفة",
      ],
      en: [
        "Daily sunscreen",
        "Avoid strong exfoliants for 48 hours",
        "Follow the prescribed home routine",
      ],
    },
    idealFor: { ar: "من ترغب في بدء روتين علمي لبشرتها أو معالجة بهتان واحتقان المسام.", en: "Anyone starting a proper routine or tackling dullness and congested pores." },
    duration: { ar: "٥٠ دقيقة", en: "50 mins" },
    sessionsRecommended: { ar: "جلسة شهرية", en: "Monthly" },
    priceStartingAt: 900,
    image: images.treatments.skincare,
    featured: true,
  },
  {
    id: "botox",
    category: "injectables",
    categoryName: { ar: "حقن التجميل", en: "Injectables" },
    name: { ar: "حقن البوتوكس", en: "Botox Injections" },
    tagline: { ar: "تنعيم الخطوط مع بقاء تعابيرك طبيعية", en: "Softening lines while keeping your expressions" },
    description: {
      ar: "حقن البوتوكس بجرعات محسوبة لتنعيم خطوط الجبهة وما بين الحاجبين وحول العينين. الهدف ليس تجميد الوجه بل إراحته؛ لذلك نبدأ بجرعة محافظة ونزيد عند المتابعة إن لزم، لتبقي ملامحك معبرة وطبيعية.",
      en: "Botox injected in measured doses to soften forehead lines, frown lines and crow's feet. The goal is rest, not freeze; we start conservative and top up at follow-up if needed, keeping your face expressive and natural.",
    },
    benefits: {
      ar: [
        "جرعات محافظة تحافظ على الحركة الطبيعية",
        "منتجات أصلية معتمدة تُفتح أمامك",
        "بداية مفعول خلال ٣ – ٥ أيام واكتمال خلال أسبوعين",
        "متابعة مجانية لضبط النتيجة",
      ],
      en: [
        "Conservative dosing preserves natural movement",
        "Authentic approved product opened in front of you",
        "Onset in 3 – 5 days, full effect at two weeks",
        "Free follow-up to refine the result",
      ],
    },
    steps: {
      ar: [
        "تقييم حركة العضلات وتحديد مواضع الحقن",
        "تعقيم المنطقة وتطبيق مخدر موضعي عند الحاجة",
        "حقن دقيق بإبر رفيعة",
        "تعليمات ما بعد الحقن وموعد المتابعة",
      ],
      en: [
        "Assess muscle movement and mark injection points",
        "Cleanse and apply topical anaesthetic if needed",
        "Precise injection with fine needles",
        "Aftercare instructions and follow-up date",
      ],
    },
    aftercare: {
      ar: [
        "لا تستلقي أو تنحني بقوة أول ٤ ساعات",
        "تجنبي المساج والساونا ٢٤ ساعة",
        "حركة خفيفة لعضلات الوجه أول يوم لتوزيع المادة",
      ],
      en: [
        "Do not lie down or bend heavily for 4 hours",
        "Avoid massage and sauna for 24 hours",
        "Light facial movement on day one to settle product",
      ],
    },
    idealFor: { ar: "من تزعجها خطوط التعبير وتريد مظهراً مرتاحاً دون تجميد.", en: "Those bothered by expression lines who want a rested look without freezing." },
    duration: { ar: "٢٠ دقيقة", en: "20 mins" },
    sessionsRecommended: { ar: "كل ٤ – ٦ أشهر", en: "Every 4 – 6 months" },
    priceStartingAt: 2400,
    image: images.treatments.injectables,
    featured: true,
  },
  {
    id: "fillers",
    category: "injectables",
    categoryName: { ar: "حقن التجميل", en: "Injectables" },
    name: { ar: "حقن الفيلر", en: "Dermal Fillers" },
    tagline: { ar: "امتلاء وتحديد متناسق بحمض الهيالورونيك", en: "Balanced volume and definition with hyaluronic acid" },
    description: {
      ar: "فيلر حمض الهيالورونيك لإعادة الامتلاء وتحديد الشفاه والوجنتين وخط الدمع والفك. نحقن بكميات مدروسة وعلى مراحل عند الحاجة، باستخدام كانيولا في المناطق عالية الخطورة لتقليل الكدمات والمضاعفات.",
      en: "Hyaluronic acid filler to restore volume and define lips, cheeks, tear troughs and jawline. We inject measured amounts, staged when needed, using cannulas in higher-risk zones to reduce bruising and complications.",
    },
    benefits: {
      ar: [
        "نتيجة فورية تتحسن خلال أسبوعين",
        "كانيولا لتقليل الكدمات في المناطق الحساسة",
        "مادة قابلة للذوبان إن رغبتِ بالتراجع",
        "تصميم يناسب نسب وجهك لا قالباً جاهزاً",
      ],
      en: [
        "Immediate result that settles over two weeks",
        "Cannula technique reduces bruising in delicate zones",
        "Reversible material if you ever wish to dissolve",
        "Designed to your facial proportions, not a template",
      ],
    },
    steps: {
      ar: [
        "تحليل نسب الوجه والاتفاق على الخطة",
        "تعقيم ومخدر موضعي",
        "حقن تدريجي وتقييم متزامن",
        "تشكيل نهائي وتعليمات المتابعة",
      ],
      en: [
        "Facial proportion analysis and agreed plan",
        "Cleanse and topical anaesthetic",
        "Gradual injection with simultaneous assessment",
        "Final shaping and aftercare",
      ],
    },
    aftercare: {
      ar: [
        "كمادات باردة أول يوم لتقليل التورم",
        "تجنبي الضغط والنوم على الوجه ٤٨ ساعة",
        "لا ساونا أو مجهود عنيف أسبوعاً",
      ],
      en: [
        "Cool compresses on day one to limit swelling",
        "Avoid pressure and sleeping on the face for 48 hours",
        "No sauna or strenuous exercise for a week",
      ],
    },
    idealFor: { ar: "من ترغب في استعادة امتلاء فقدته أو تحديد ملامح بلمسة طبيعية.", en: "Those restoring lost volume or seeking subtle definition." },
    duration: { ar: "٣٠ دقيقة", en: "30 mins" },
    sessionsRecommended: { ar: "يدوم ٩ – ١٢ شهراً", en: "Lasts 9 – 12 months" },
    priceStartingAt: 3200,
    image: images.treatments.injectables,
    featured: true,
  },
  {
    id: "hydrafacial",
    category: "skincare",
    categoryName: { ar: "نضارة وتجديد", en: "Rejuvenation" },
    name: { ar: "الهيدرافيشل (نضارة البشرة)", en: "HydraFacial (Skin Rejuvenation)" },
    tagline: { ar: "تنظيف وترطيب ومضادات أكسدة في جلسة واحدة", en: "Cleanse, hydrate and antioxidant infusion in one visit" },
    description: {
      ar: "جهاز الهيدرافيشل يمر بثلاث مراحل: تقشير لطيف وتنظيف دوّامي للمسام، ثم استخراج الشوائب بدون ضغط، وأخيراً ضخ سيروم مرطب ومضادات أكسدة داخل البشرة. النتيجة نضارة فورية بدون تقشير ظاهر، لذلك تصلح قبل المناسبات.",
      en: "The HydraFacial device runs three stages: gentle exfoliation and vortex pore cleansing, painless extraction of impurities, then infusion of hydrating serums and antioxidants. The result is instant glow with no visible peeling, ideal before events.",
    },
    benefits: {
      ar: [
        "نضارة فورية بدون فترة نقاهة",
        "تنظيف مسام واستخراج رؤوس سوداء",
        "ترطيب عميق بمضادات أكسدة",
        "مناسب قبل المناسبات مباشرة",
      ],
      en: [
        "Instant glow with no downtime",
        "Pore cleansing and blackhead extraction",
        "Deep antioxidant hydration",
        "Suitable right before events",
      ],
    },
    steps: {
      ar: [
        "تنظيف وتقشير سطحي لطيف",
        "تنظيف دوّامي واستخراج الشوائب",
        "ضخ سيروم مرطب ومضادات أكسدة",
        "حماية نهائية ببشرة مرتاحة",
      ],
      en: [
        "Cleanse and gentle surface exfoliation",
        "Vortex cleansing and extraction",
        "Infusion of hydrating antioxidant serum",
        "Final protection on calm skin",
      ],
    },
    aftercare: {
      ar: [
        "واقي شمس من اليوم نفسه",
        "يمكن وضع مكياج بعد ٢٤ ساعة",
        "ترطيب يومي للحفاظ على النضارة",
      ],
      en: [
        "Sunscreen the same day",
        "Makeup allowed after 24 hours",
        "Daily moisturiser to maintain glow",
      ],
    },
    idealFor: { ar: "من تريد إشراقة سريعة وآمنة قبل مناسبة أو كطقس شهري.", en: "Anyone wanting fast, safe radiance before an event or as a monthly ritual." },
    duration: { ar: "٤٥ دقيقة", en: "45 mins" },
    sessionsRecommended: { ar: "جلسة شهرية", en: "Monthly" },
    priceStartingAt: 1200,
    image: images.treatments.hydrafacial,
    featured: true,
  },
  {
    id: "chemical-peel",
    category: "skincare",
    categoryName: { ar: "العناية بالبشرة", en: "Skincare" },
    name: { ar: "التقشير الكيميائي (التقشير الأصفر)", en: "Chemical Peel (Yellow Peel)" },
    tagline: { ar: "علاج التصبغات والكلف وتجديد السطح", en: "Treating pigmentation, melasma and renewing texture" },
    description: {
      ar: "التقشير الأصفر علاج موجه للتصبغات والكلف وآثار الحبوب. يعتمد على حمض الريتينويك ومكونات مفتحّة تُترك على البشرة مدة محددة ثم يُحدث تقشيراً خفيفاً على مدى أيام يجدد السطح ويوحد اللون.",
      en: "The yellow peel is a corrective treatment for pigmentation, melasma and post-acne marks. It uses retinoic acid and brightening agents left on for a set time, then triggers mild peeling over several days to renew the surface and even tone.",
    },
    benefits: {
      ar: [
        "توحيد اللون وتفتيح التصبغات العنيدة",
        "تقليل آثار الحبوب والبقع",
        "تحفيز تجديد الخلايا",
        "برنامج منزلي مرفق لدعم النتيجة",
      ],
      en: [
        "Evens tone and lightens stubborn pigmentation",
        "Reduces post-acne marks and spots",
        "Stimulates cell renewal",
        "Home programme included to support results",
      ],
    },
    steps: {
      ar: [
        "تحضير البشرة وتنظيفها",
        "تطبيق محلول التقشير لمدة محسوبة",
        "معادلة وإيقاف التقشير",
        "تعليمات التقشير المنزلي والترطيب",
      ],
      en: [
        "Prepare and cleanse the skin",
        "Apply peel solution for a timed interval",
        "Neutralise and stop the peel",
        "Home peeling and moisturising instructions",
      ],
    },
    aftercare: {
      ar: [
        "لا تقشري الجلد يدوياً أبداً",
        "ترطيب مكثف وواقي شمس صارم",
        "تجنبي المكياج أول ٤٨ ساعة",
      ],
      en: [
        "Never peel the skin manually",
        "Intensive moisturiser and strict sunscreen",
        "Avoid makeup for the first 48 hours",
      ],
    },
    idealFor: { ar: "من تعاني من كلف أو تصبغات شمسية أو آثار حبوب قديمة.", en: "Those dealing with melasma, sun spots or old acne marks." },
    duration: { ar: "٢٥ دقيقة", en: "25 mins" },
    sessionsRecommended: { ar: "٢ – ٤ جلسات حسب الحالة", en: "2 – 4 sessions depending on case" },
    priceStartingAt: 1500,
    image: images.treatments.peel,
  },
  {
    id: "prp",
    category: "anti-aging",
    categoryName: { ar: "النضارة ومكافحة الشيخوخة", en: "Anti-Aging" },
    name: { ar: "حقن البلازما الغنية بالصفائح (PRP)", en: "Platelet-Rich Plasma (PRP)" },
    tagline: { ar: "عوامل نمو من دمك لتجديد البشرة والشعر", en: "Growth factors from your own blood for skin and hair" },
    description: {
      ar: "نسحب عينة دم صغيرة ونفصل منها البلازما الغنية بالصفائح وعوامل النمو، ثم نحقنها في الوجه أو فروة الرأس. لأنها من جسمك فلا خطر تحسس، وتعمل على تحفيز التجديد وتحسين جودة البشرة وكثافة الشعر.",
      en: "We draw a small blood sample, separate the platelet-rich plasma and growth factors, then inject it into the face or scalp. Because it comes from your own body there is no allergy risk, and it stimulates renewal, skin quality and hair density.",
    },
    benefits: {
      ar: [
        "مادة ذاتية ١٠٠٪ بدون أي إضافات",
        "تحفيز نمو الشعر وإبطاء التساقط",
        "تحسين جودة البشرة والهالات",
        "يمكن دمجه مع الميكرونيدلينج",
      ],
      en: [
        "100% autologous with no additives",
        "Stimulates hair growth and slows shedding",
        "Improves skin quality and under-eye circles",
        "Can be combined with microneedling",
      ],
    },
    steps: {
      ar: [
        "سحب عينة دم صغيرة",
        "فصل البلازما بالطرد المركزي",
        "تحضير المنطقة وتطبيق مخدر",
        "حقن البلازما في المواضع المستهدفة",
      ],
      en: [
        "Draw a small blood sample",
        "Separate plasma by centrifugation",
        "Prepare the area and apply anaesthetic",
        "Inject plasma into target sites",
      ],
    },
    aftercare: {
      ar: [
        "تجنبي غسل المنطقة ١٢ ساعة",
        "لا مجهود عنيف ٢٤ ساعة",
        "ترطيب وحماية من الشمس",
      ],
      en: [
        "Do not wash the area for 12 hours",
        "No strenuous exercise for 24 hours",
        "Moisturise and protect from sun",
      ],
    },
    idealFor: { ar: "من تفضل حلاً طبيعياً لتجديد البشرة أو دعم كثافة الشعر.", en: "Those preferring a natural approach to skin renewal or hair density." },
    duration: { ar: "٤٥ دقيقة", en: "45 mins" },
    sessionsRecommended: { ar: "٣ – ٤ جلسات بفارق شهر", en: "3 – 4 sessions a month apart" },
    priceStartingAt: 1600,
    image: images.treatments.prp,
  },
  {
    id: "fractional-laser",
    category: "laser",
    categoryName: { ar: "الليزر", en: "Laser" },
    name: { ar: "الفراكشنال ليزر", en: "Fractional Laser" },
    tagline: { ar: "تحسين الندبات والمسام وتحفيز الكولاجين", en: "Improving scars and pores while stimulating collagen" },
    description: {
      ar: "ليزر مجزأ يخلق آلاف النقاط الحرارية الدقيقة في طبقات الجلد ليحفز بناء كولاجين جديد، فيتحسن ملمس البشرة وندبات الحبوب والمسام الواسعة تدريجياً على مدى أسابيع.",
      en: "A fractional laser creates thousands of microscopic thermal columns in the skin to trigger new collagen, gradually improving texture, acne scarring and enlarged pores over weeks.",
    },
    benefits: {
      ar: [
        "تحسين ندبات الحبوب والملمس",
        "تضييق مظهر المسام",
        "شد خفيف وتحفيز كولاجين",
        "بروتوكول تهدئة يقلل فترة التعافي",
      ],
      en: [
        "Improves acne scarring and texture",
        "Refines the appearance of pores",
        "Mild tightening and collagen stimulation",
        "Soothing protocol shortens recovery",
      ],
    },
    steps: {
      ar: [
        "تقييم العمق المناسب للندبات",
        "مخدر موضعي لمدة ٣٠ دقيقة",
        "تمرير الليزر المجزأ",
        "تبريد وتهدئة وتعليمات التعافي",
      ],
      en: [
        "Assess appropriate depth for scarring",
        "Topical anaesthetic for 30 minutes",
        "Pass the fractional laser",
        "Cooling, soothing and recovery instructions",
      ],
    },
    aftercare: {
      ar: [
        "احمرار وتقشير خفيف متوقع لعدة أيام",
        "ترطيب مستمر وواقي شمس صارم",
        "تجنبي المكياج حتى يلتئم السطح",
      ],
      en: [
        "Mild redness and flaking expected for a few days",
        "Constant moisturiser and strict sunscreen",
        "Avoid makeup until the surface heals",
      ],
    },
    idealFor: { ar: "من لديها ندبات حبوب أو مسام واسعة أو ملمس غير متساوٍ.", en: "Those with acne scarring, enlarged pores or uneven texture." },
    duration: { ar: "٤٠ دقيقة", en: "40 mins" },
    sessionsRecommended: { ar: "٣ – ٥ جلسات", en: "3 – 5 sessions" },
    priceStartingAt: 2200,
    image: images.treatments.laser,
  },
  {
    id: "skin-booster",
    category: "anti-aging",
    categoryName: { ar: "النضارة ومكافحة الشيخوخة", en: "Anti-Aging" },
    name: { ar: "حقن السكين بوستر (يـالو برو)", en: "Skin-Booster Injections (Yalo Pro)" },
    tagline: { ar: "ترطيب عميق ومرونة من داخل الجلد", en: "Deep hydration and elasticity from within the skin" },
    description: {
      ar: "حقن سطحية متعددة بحمض الهيالورونيك غير المتشابك مع أحماض أمينية لتغذية الجلد نفسه وليس ملء حجم. النتيجة ترطيب عميق ومرونة ونضارة تتحسن على مدى الجلسات.",
      en: "Multiple superficial injections of non-crosslinked hyaluronic acid with amino acids to nourish the skin itself rather than add volume. The result is deep hydration, elasticity and glow that improve across sessions.",
    },
    benefits: {
      ar: [
        "ترتيب خلوي عميق للبشرة الجافة",
        "تحسين المرونة والخطوط الدقيقة",
        "نضارة تدريجية طبيعية",
        "مناسب للوجه والرقبة واليدين",
      ],
      en: [
        "Deep cellular hydration for dry skin",
        "Improves elasticity and fine lines",
        "Gradual, natural glow",
        "Suitable for face, neck and hands",
      ],
    },
    steps: {
      ar: [
        "تحديد مناطق الجفاف",
        "مخدر موضعي",
        "حقن سطحي متعدد النقاط",
        "تهدئة وتعليمات ترطيب",
      ],
      en: [
        "Map areas of dryness",
        "Topical anaesthetic",
        "Multi-point superficial injection",
        "Soothing and hydration instructions",
      ],
    },
    aftercare: {
      ar: [
        "نتوءات صغيرة تختفي خلال ساعات",
        "ترطيب وواقي شمس",
        "تجنبي الساونا ٤٨ ساعة",
      ],
      en: [
        "Tiny bumps resolve within hours",
        "Moisturise and use sunscreen",
        "Avoid sauna for 48 hours",
      ],
    },
    idealFor: { ar: "من تعاني بشرة جافة باهتة وتريد ترطيباً عميقاً دون تغيير الملامح.", en: "Those with dry, dull skin wanting deep hydration without changing contours." },
    duration: { ar: "٣٠ دقيقة", en: "30 mins" },
    sessionsRecommended: { ar: "٣ جلسات بفارق أسبوعين", en: "3 sessions two weeks apart" },
    priceStartingAt: 2800,
    image: images.treatments.injectables,
  },
  {
    id: "skin-tightening",
    category: "anti-aging",
    categoryName: { ar: "النضارة ومكافحة الشيخوخة", en: "Anti-Aging" },
    name: { ar: "شد ونضارة البشرة", en: "Skin Tightening" },
    tagline: { ar: "شد غير جراحي بخط الفك والرقبة", en: "Non-surgical firming of jawline and neck" },
    description: {
      ar: "جلسات شد تعتمد على طاقة حرارية تصل للطبقات العميقة فانكماش ألياف الكولاجين وتحفيز بناء كولاجين جديد، فيتحسن ارتخاء خط الفك والرقبة تدريجياً بدون جراحة.",
      en: "Tightening sessions use thermal energy reaching deep layers to contract collagen fibres and stimulate new collagen, gradually improving jawline and neck laxity without surgery.",
    },
    benefits: {
      ar: [
        "شد تدريجي بدون جراحة أو تخدير",
        "تحسن مستمر لعدة أشهر",
        "بدون فترة نقاهة",
        "مناسب كإجراء وقائي",
      ],
      en: [
        "Gradual tightening without surgery or anaesthesia",
        "Continued improvement for months",
        "No downtime",
        "Suitable as a preventive measure",
      ],
    },
    steps: {
      ar: [
        "تحديد مناطق الارتخاء",
        "تطبيق جل وتسخين تدريجي",
        "تمرير يد الجهاز على المنطقة",
        "تهدئة وتقييم خطة الجلسات",
      ],
      en: [
        "Map areas of laxity",
        "Apply gel and gradual heating",
        "Pass the handpiece over the area",
        "Soothing and session plan review",
      ],
    },
    aftercare: {
      ar: [
        "لا تعليمات مقيدة؛ عودة فورية للنشاط",
        "ترطيب وواقي شمس",
        "النتيجة تتحسن على مدى أشهر",
      ],
      en: [
        "No restrictions; return to activity immediately",
        "Moisturise and use sunscreen",
        "Results improve over months",
      ],
    },
    idealFor: { ar: "من تلاحظ بداية ارتخاء في خط الفك أو الرقبة وتفضل حلاً غير جراحي.", en: "Those noticing early jawline or neck laxity who prefer non-surgical options." },
    duration: { ar: "٥٠ دقيقة", en: "50 mins" },
    sessionsRecommended: { ar: "جلسة إلى جلستان سنوياً", en: "1 – 2 sessions yearly" },
    priceStartingAt: 3500,
    image: images.treatments.hydrafacial,
  },
];

export const getTreatment = (slug: string) => treatmentsData.find((t) => t.id === slug);
