import { images, type PhotoSlot } from "@/lib/images";

export interface ResultCase {
  id: string;
  treatment: { ar: string; en: string };
  area: { ar: string; en: string };
  sessions: { ar: string; en: string };
  note: { ar: string; en: string };
  before: PhotoSlot;
  after: PhotoSlot;
}

/**
 * Representative before/after pairs. Photography is illustrative stock until
 * verified client consent photos are available; the results page states this
 * explicitly instead of presenting the pairs as documented cases.
 */
export const resultsData: ResultCase[] = [
  {
    id: "pigmentation-peel",
    treatment: { ar: "التقشير الأصفر للتصبغات", en: "Yellow Peel for pigmentation" },
    area: { ar: "الخدين", en: "Cheeks" },
    sessions: { ar: "٣ جلسات", en: "3 sessions" },
    note: {
      ar: "تحسن تدريجي في تجانس اللون بعد كورس تقشير أصفر مع برنامج منزلي مرفق. النتيجة تختلف حسب عمق التصبغ والالتزام بالواقي الشمسي.",
      en: "Gradual improvement in tone evenness after a yellow-peel course with a home programme. Results vary with pigmentation depth and sunscreen adherence.",
    },
    before: images.skin.before,
    after: images.skin.after,
  },
  {
    id: "acne-course",
    treatment: { ar: "كورس العناية بالبشرة الحبية", en: "Acne skincare course" },
    area: { ar: "الخد والفك", en: "Cheek and jaw" },
    sessions: { ar: "٤ جلسات", en: "4 sessions" },
    note: {
      ar: "هدوء تدريجي للالتهاب وتحسن ملمس البشرة بعد كورس تنظيف وتقشير خفيف مع روتين منزلي. الحالات النشطة الشديدة تُحوَّل لخطة دوائية أولاً.",
      en: "Gradual calming of inflammation and smoother texture after a deep-cleansing and mild-peel course with a home routine. Severe active cases start with a medical plan first.",
    },
    before: images.skin.acneBefore,
    after: images.skin.acneAfter,
  },
  {
    id: "laser-hair-removal-course",
    treatment: { ar: "ليزر إزالة الشعر", en: "Laser hair removal" },
    area: { ar: "الساعدين", en: "Forearms" },
    sessions: { ar: "٦ جلسات", en: "6 sessions" },
    note: {
      ar: "تناقص كثافة الشعر جلسة بعد جلسة حتى المظهر الناعم، مع جلسات تنشيطية سنوية حسب طبيعة الشعر والهرمونات.",
      en: "Hair density reduces session after session until smooth skin, with yearly touch-ups depending on hair type and hormones.",
    },
    before: images.skin.armBefore,
    after: images.skin.armAfter,
  },
  {
    id: "melasma-course",
    treatment: { ar: "خطة الكلف والتصبغات", en: "Melasma and pigmentation plan" },
    area: { ar: "الجبهة والخدين", en: "Forehead and cheeks" },
    sessions: { ar: "٣ جلسات", en: "3 sessions" },
    note: {
      ar: "توحيد تدريجي للون البشرة وبهتان بقع الكلف بعد خطة تجمع التقشير والجلسات الموضعية مع واقي شمسي صارم. الكلف حالة مزمنة تُتابَع ولا يُوعَد باختفائه تماماً.",
      en: "Gradual evening of skin tone and fading of melasma spots after a plan combining peels and topical sessions with strict sunscreen. Melasma is chronic: it is managed, never promised to vanish completely.",
    },
    before: images.skin.toneBefore,
    after: images.skin.toneAfter,
  },
];
