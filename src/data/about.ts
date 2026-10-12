import { images, type PhotoSlot } from "@/lib/images";

export interface Bilingual {
  ar: string;
  en: string;
}

/** One WPBakery section of the About page: heading, paragraphs, photo. */
export interface AboutSection {
  heading: Bilingual;
  paragraphs: Bilingual[];
  image: PhotoSlot | null;
}

export interface AboutContent {
  title: Bilingual;
  lead: Bilingual;
  sections: AboutSection[];
}

/**
 * Used only when WordPress answers with nothing (no snapshot, no live origin):
 * the page still has to render. Everything here is replaced by page 32 as soon
 * as the dashboard copy is available — see docs/WIRING.md.
 */
export const aboutFallback: AboutContent = {
  title: { ar: "من نحن", en: "About Shamah" },
  lead: {
    ar: "عيادات شامه وجهة لطب التجميل والليزر والعناية بالبشرة في القاهرة والجيزة، تقوم على فكرة بسيطة: بشرة صحية بنتيجة طبيعية، وقرار طبي واضح بلا مبالغة.",
    en: "Shamah Clinics is a destination for aesthetic medicine, laser and skincare in Cairo and Giza, built on a simple idea: healthy skin with natural results, and a clear medical decision without exaggeration.",
  },
  sections: [
    {
      heading: { ar: "بدأنا من سؤال بسيط", en: "We started from a simple question" },
      paragraphs: [
        {
          ar: "لماذا تخرج كثيرات من عيادات التجميل بنتيجة لا تشبههن؟ كان هذا سؤالنا الأول. الإجابة عندنا أن التجميل الناجح لا يغيّر الملامح بل يرتاح بها الوجه، وأن كل بشرة حالة مستقلة تحتاج تقييماً لا قالباً جاهزاً.",
          en: "Why do many women leave aesthetic clinics with a result that does not look like them? That was our first question. Our answer is that successful aesthetics does not change features but lets the face rest, and that every skin is a unique case needing assessment, not a ready-made template.",
        },
        {
          ar: "من هذه الفكرة وُلدت عيادات شامه: طاقم طبي نسائي متخصص، أجهزة حديثة بمنتجات أصلية، وبروتوكول يبدأ دائماً باستشارة وتحليل مكتوب. اليوم نخدم عميلاتنا من ثلاثة فروع في القاهرة والجيزة.",
          en: "From this idea Shamah Clinics was born: a specialised all-female medical team, modern devices with authentic products, and a protocol that always begins with a consultation and a written analysis. Today we serve our clients from three branches across Cairo and Giza.",
        },
      ],
      image: images.interiors.consultation,
    },
  ],
};
