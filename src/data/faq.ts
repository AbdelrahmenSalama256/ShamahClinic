export interface FaqItem {
  id: string;
  question: {
    ar: string;
    en: string;
  };
  answer: {
    ar: string;
    en: string;
  };
  category: "laser" | "injectables" | "general" | "skincare";
}

export const faqData: FaqItem[] = [
  {
    id: "faq-1",
    category: "laser",
    question: {
      ar: "هل جلسات إزالة الشعر بالليزر مؤلمة في عيادات شامه؟",
      en: "Are laser hair removal sessions painful at Shamah Clinics?",
    },
    answer: {
      ar: "إطلاقاً، نستخدم أحدث أجهزة الليزر المزودة بأنظمة تبريد ديناميكية متطورة تعمل على تبريد سطح الجلد قبل وبعد النبضة بأجزاء من الثانية، مما يجعل الجلسة مريحة وخالية من الألم لمعظم الحالات.",
      en: "Not at all. We utilize cutting-edge medical lasers equipped with dynamic cryogen cooling bursts before and after each pulse, keeping the skin surface comfortable and virtually pain-free.",
    },
  },
  {
    id: "faq-2",
    category: "injectables",
    question: {
      ar: "متى تظهر نتائج حقن الفيلر والبوتوكس وكم تدوم؟",
      en: "When do Botox and filler results appear and how long do they last?",
    },
    answer: {
      ar: "نتائج الفيلر تظهر فور انتهاء الجلسة وتستقر بشكل نهائي خلال أسبوع إلى أسبوعين، وتدوم من ٩ إلى ١٤ شهراً. أما البوتوكس فيبدأ مفعوله بالظهور تدريجياً بين اليوم الثالث والخامس، وتكتمل النتيجة في أسبوعين وتدوم بين ٤ إلى ٦ أشهر.",
      en: "Dermal filler results are visible immediately and settle naturally within 1–2 weeks, lasting 9–14 months. Botox begins taking effect within 3–5 days, reaches full effect at 2 weeks, and lasts 4–6 months.",
    },
  },
  {
    id: "faq-3",
    category: "skincare",
    question: {
      ar: "ما الفرق بين الهيدرافيشل والتقشير الكيميائي الأصفر؟",
      en: "What is the difference between HydraFacial and Yellow Chemical Peel?",
    },
    answer: {
      ar: "الهيدرافيشل هو جلسة تنظيف عميق وترطيب فوري لا تتطلب أي فترة نقاهة ومناسبة لأي وقت. أما التقشير الأصفر فهو علاج مخصص للتصبغات العميقة والكلف وآثار الحبوب ويحدث تقشيراً خفيفاً للبشرة على مدار ٤ إلى ٧ أيام لتجديد الخلايا.",
      en: "HydraFacial is a non-invasive vortex cleansing and hydration facial with zero downtime. The Yellow Peel is a corrective therapy targeting deep melasma, dark spots, and post-acne marks with mild superficial peeling over 4–7 days.",
    },
  },
  {
    id: "faq-4",
    category: "general",
    question: {
      ar: "هل يمكنني حجز موعد لنفس اليوم وكيف يتم تأكيد الحجز؟",
      en: "Can I book a same-day appointment and how is it confirmed?",
    },
    answer: {
      ar: "نعم، يمكنكِ اختيار الفرع والوقت المناسب من خلال نموذج الحجز الإلكتروني أو عبر مراسلتنا مباشرة على الواتساب. يقوم فريق الاستقبال بالتأكيد معكِ هاتفياً أو عبر رسالة واتساب خلال دقائق معدودة.",
      en: "Yes, you can request same-day availability online or message us directly via WhatsApp. Our concierge desk will confirm your appointment details within minutes.",
    },
  },
  {
    id: "faq-5",
    category: "general",
    question: {
      ar: "هل الطاقم الطبي المتخصص في جلسات الليزر والعناية بالبشرة نسائي بالكامل؟",
      en: "Is the medical staff for laser and skincare exclusively female?",
    },
    answer: {
      ar: "نعم، نحرص في عيادات شامه على توفير أقصى درجات الخصوصية والراحة لعملائنا الكرام من خلال طاقم طبي وتمريضي نسائي متخصص بالكامل في جميع فروعنا.",
      en: "Yes, Shamah Clinics guarantees utmost privacy, comfort, and discretion with 100% certified female doctors, specialists, and clinical nurses across all branches.",
    },
  },
  {
    id: "faq-6",
    category: "laser",
    question: {
      ar: "كم عدد جلسات الليزر التي أحتاجها وما الفاصل بينها؟",
      en: "How many laser sessions do I need and how far apart?",
    },
    answer: {
      ar: "يعتمد العدد على المنطقة ولون الشعر والبشرة، لكن المدى المعتاد هو من ٦ إلى ٨ جلسات بفاصل ٤ إلى ٦ أسابيع، لأن الليزر يؤثر فقط على الشعر في طور النمو النشط. نضع لكِ خطة واضحة من أول استشارة ونقيم التقدم في كل جلسة.",
      en: "The number depends on the area, hair and skin colour, but the usual range is 6–8 sessions spaced 4–6 weeks apart, since laser only affects hair in the active growth phase. We set a clear plan at your first consultation and review progress each visit.",
    },
  },
  {
    id: "faq-7",
    category: "laser",
    question: {
      ar: "ما الذي يجب تجنبه قبل وبعد جلسة الليزر؟",
      en: "What should I avoid before and after a laser session?",
    },
    answer: {
      ar: "قبل الجلسة: توقفي عن الشمع أو النتف أو التشقير لمدة أسبوعين واكتفي بالحلاقة، وتجنبي الشمس والتسمير. بعد الجلسة: ضعي واقياً شمسياً يومياً، وتجنبي الحرارة العالية والساونا لمدة ٢٤ إلى ٤٨ ساعة، ولا تقشري المنطقة بين الجلسات.",
      en: "Before: stop waxing, plucking or bleaching for two weeks (shaving only) and avoid sun and tanning. After: use daily sunscreen, avoid high heat and sauna for 24–48 hours, and never pluck the area between sessions.",
    },
  },
  {
    id: "faq-8",
    category: "injectables",
    question: {
      ar: "هل الفيلر آمن وهل يمكن إذابته إن لم تعجبني النتيجة؟",
      en: "Is filler safe and can it be dissolved if I dislike the result?",
    },
    answer: {
      ar: "نستخدم فيلر حمض الهيالورونيك الأصلي المعتمد، وهو مادة موجودة طبيعياً في الجسم وتُفتح أمامكِ. ومن أهم مزاياه أنه قابل للإذابة بإنزيم الهيالورونيداز إن رغبتِ في تعديل أو تراجع النتيجة، ويتم الحقن بإشراف طبيبة متخصصة.",
      en: "We use authentic approved hyaluronic-acid filler, a substance naturally present in the body and opened in front of you. A key advantage is that it is reversible with hyaluronidase if you wish to adjust or undo the result, and it is injected under a specialist's supervision.",
    },
  },
  {
    id: "faq-9",
    category: "skincare",
    question: {
      ar: "لديّ بشرة حساسة، هل تناسبني جلسات العناية والتقشير؟",
      en: "I have sensitive skin — are facials and peels suitable for me?",
    },
    answer: {
      ar: "نعم، نبدأ دائماً بتحليل للبشرة لتحديد درجة حساسيتها، ثم نختار البروتوكول الأنسب. الهيدرافيشل والعناية اللطيفة مناسبان للبشرة الحساسة، أما التقشير فنضبط قوته ومدة تركه أو نؤجله إن كانت البشرة في حالة تهيج، ولا نجري أي إجراء قبل التأكد من ملاءمته.",
      en: "Yes, we always begin with a skin analysis to gauge sensitivity, then choose the right protocol. HydraFacial and gentle care suit sensitive skin, while for peels we adjust strength and contact time or postpone if the skin is irritated — no procedure is done before confirming it is suitable.",
    },
  },
  {
    id: "faq-10",
    category: "general",
    question: {
      ar: "ما هي أسعار الجلسات وهل توجد عروض أو باقات؟",
      en: "What are the session prices and are there packages or offers?",
    },
    answer: {
      ar: "تختلف الأسعار حسب نوع الجلسة والمنطقة وعدد الجلسات، وتجدين على الموقع سعراً استرشادياً «يبدأ من» لكل خدمة. نطرح أيضاً باقات موسمية توفر أكثر عند الجمع بين الجلسات، ويمكنك متابعة صفحة العروض أو سؤالنا على واتساب عن أحدث الباقات.",
      en: "Prices vary by treatment type, area and number of sessions; the site lists a 'starting from' guide price for each service. We also run seasonal packages that save more when combining treatments — see the Offers page or ask us on WhatsApp for the latest bundles.",
    },
  },
  {
    id: "faq-11",
    category: "general",
    question: {
      ar: "كم تستغرق الجلسة الأولى وهل تشمل استشارة؟",
      en: "How long is the first visit and does it include a consultation?",
    },
    answer: {
      ar: "الزيارة الأولى تبدأ باستشارة قصيرة مع الطبيبة لتحليل الحالة وتحديد الخطة والأهداف الواقعية، ثم تُجرى الجلسة. مدة الجلسة نفسها بين ٢٠ و٦٠ دقيقة حسب نوعها، والاستشارة جزء أساسي منها وليست خطوة منفصلة مدفوعة.",
      en: "The first visit begins with a short consultation to analyse your case and set a realistic plan, then the session is performed. The session itself takes 20–60 minutes depending on type, and the consultation is an integral part of it, not a separate paid step.",
    },
  },
  {
    id: "faq-12",
    category: "skincare",
    question: {
      ar: "هل نتائج الهيدرافيشل فورية وهل تناسب ما قبل المناسبات؟",
      en: "Are HydraFacial results immediate and is it good before events?",
    },
    answer: {
      ar: "نعم، تمنح جلسة الهيدرافيشل نضارة وترطيباً فورياً بدون تقشير ظاهر أو فترة نقاهة، لذلك كثير من العميلات يحجزنها قبل مناسبة بيوم أو يومين. ننصح بالحجز قبل المناسبة بمدة قصيرة والحضور ببشرة بدون مكياج ثقيل.",
      en: "Yes, HydraFacial gives immediate radiance and hydration with no visible peeling or downtime, which is why many clients book it a day or two before an event. We recommend booking shortly before the occasion and arriving without heavy makeup.",
    },
  },
];
