export interface Offer {
  id: string;
  badge: {
    ar: string;
    en: string;
  };
  title: {
    ar: string;
    en: string;
  };
  subtitle: {
    ar: string;
    en: string;
  };
  includes: {
    ar: string[];
    en: string[];
  };
  originalPrice: number; // EGP
  discountedPrice: number; // EGP
  savingsPercentage: number;
  validUntil: {
    ar: string;
    en: string;
  };
  popular?: boolean;
}

export const offersData: Offer[] = [
  {
    id: "royal-glow-package",
    badge: {
      ar: "العرض الأكثر طلباً",
      en: "Most Popular",
    },
    title: {
      ar: "باقة الإشراقة الملكية المتكاملة",
      en: "Royal Luminous Glow Ritual",
    },
    subtitle: {
      ar: "تجديد فوري للبشرة وتنقية عميقة تناسب المناسبات والمواسم",
      en: "Deep vortex purification combined with targeted peel for luminous skin",
    },
    includes: {
      ar: [
        "جلسة هيدرافيشل عميق مع سيروم الكولاجين",
        "جلسة تقشير أصفر لتفتيح التصبغات",
        "ماسك ترطيب ذهبي فاخر مجاناً",
        "استشارة طبية مجانية لتقييم صحة البشرة",
      ],
      en: [
        "Deep Royal HydraFacial with collagen serum infusion",
        "Targeted Yellow Chemical Peel session",
        "Complimentary 24k Gold Hydration Mask",
        "Free comprehensive diagnostic consultation",
      ],
    },
    originalPrice: 3200,
    discountedPrice: 2190,
    savingsPercentage: 32,
    validUntil: {
      ar: "لفترة محدودة هذا الشهر",
      en: "Limited Time This Month",
    },
    popular: true,
  },
  {
    id: "full-body-laser-bundle",
    badge: {
      ar: "توفير استثنائي",
      en: "Best Value",
    },
    title: {
      ar: "باقة الليزر الذهبية للجسم بالكامل",
      en: "Full Body Elite Laser 4-Session Pass",
    },
    subtitle: {
      ar: "٤ جلسات ليزر كامل للجسم مع الرتوش باستخدام أحدث كانديلا جنتل برو",
      en: "4 full-body sessions including touch-ups with Candela GentlePro Max",
    },
    includes: {
      ar: [
        "٤ جلسات جسم كامل بدون استثناء أي منطقة",
        "جلسات رتوش مجانية بعد كل جلسة رئيسية",
        "نظام التبريد الديناميكي بدون أي شعور بالألم",
        "غرفة خاصة ومعقمة بإشراف طبي نسائي ١٠٠٪",
      ],
      en: [
        "4 full-body sessions covering all areas",
        "Complimentary touch-up session after every visit",
        "Dynamic cryo-cooling system for absolute comfort",
        "Completely private sterilized suites with female staff",
      ],
    },
    originalPrice: 9500,
    discountedPrice: 6850,
    savingsPercentage: 28,
    validUntil: {
      ar: "ساري في جميع الفروع الثلاثة",
      en: "Valid across all 3 branches",
    },
    popular: false,
  },
  {
    id: "contour-youth-duo",
    badge: {
      ar: "لمسة فنية راقية",
      en: "Artistic Elegance",
    },
    title: {
      ar: "باقة التحديد والشباب الطبيعي",
      en: "Youth Sculpting Botox & Filler Duo",
    },
    subtitle: {
      ar: "تناغم مثالي بين تنعيم التجاعيد التعبيرية وتحديد طبيعي للشفايف أو الخدود",
      en: "Harmonious upper face wrinkle softening paired with lip contouring",
    },
    includes: {
      ar: [
        "حقن بوتوكس كامل للجبهة ومحيط العينين (FDA Approved)",
        "١ مل فيلر سويسري أصلي لتحديد الشفاه أو الوجنتين",
        "جلسة متابعة وتعديل مجانية خلال أسبوعين",
        "تطبيق مخدر موضعي طبي عالي الفعالية",
      ],
      en: [
        "Full upper face Botox (Forehead + Crow's feet)",
        "1ml Premium Swiss Hyaluronic Acid Filler",
        "Complimentary two-week touchup consultation",
        "Clinical-grade painless topical anesthesia",
      ],
    },
    originalPrice: 6200,
    discountedPrice: 4650,
    savingsPercentage: 25,
    validUntil: {
      ar: "متاح للحجز المسبق فقط",
      en: "Available for advance reservation",
    },
    popular: false,
  },
];
