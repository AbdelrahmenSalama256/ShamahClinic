import { siteConfig } from "@/config/site";

/**
 * Central image map for Shamah Clinics.
 * Every image slot on the site resolves through this single file so real client
 * photography can replace any placeholder by editing one entry.
 * All entries are raster photographs (WebP/AVIF served by next/image); SVG is
 * reserved for the logo and small icons only.
 */

export interface PhotoSlot {
  src: string;
  alt: { ar: string; en: string };
  width: number;
  height: number;
  /** CSS object-position focal point, e.g. "50% 30%". */
  focal: string;
}

const photo = (
  src: string,
  ar: string,
  en: string,
  width: number,
  height: number,
  focal = "50% 50%"
): PhotoSlot => ({ src, alt: { ar, en }, width, height, focal });

export const images = {
  logo: siteConfig.brand.logo,

  hero: photo(
    "/images/hero-portrait.jpg",
    "عميلة ببشرة مشرقة وصحية داخل عيادات شامه بعد جلسة عناية بالبشرة",
    "Client with radiant healthy skin at Shamah Clinics after a skincare session",
    1024,
    1280,
    "50% 30%"
  ),

  interiors: {
    reception: photo(
      "/images/clinic-reception.jpg",
      "استقبال عيادات شامه بديكور كريمي وذهبي فاخر وأجواء سبا هادئة",
      "Shamah Clinics reception with cream and gold luxury decor and calm spa ambience",
      1536,
      1024
    ),
    treatmentRoom: photo(
      "/images/treatment-room.jpg",
      "غرفة جلسات خاصة مجهزة بسرير علاج وأجهزة ليزر وعناية بالبشرة",
      "Private treatment suite with clinical bed and laser skincare devices",
      1536,
      1024
    ),
    corridor: photo(
      "/images/branch-interior.jpg",
      "ممر وصالة انتظار بأقواس كريمية وإضاءة ذهبية دافئة داخل أحد فروع شامه",
      "Arched cream corridor and waiting lounge with warm gold lighting in a Shamah branch",
      1536,
      1024
    ),
    consultation: photo(
      "/images/consultation.jpg",
      "طبيبة جلدية تشرح تحليل البشرة لعميلة خلال استشارة في عيادات شامه",
      "Dermatologist explaining a skin analysis to a client during a Shamah consultation",
      1536,
      1024
    ),
  },

  treatments: {
    laser: photo(
      "/images/treatment-laser.jpg",
      "جلسة إزالة شعر بالليزر لجهاز طبي حديث مع تبريد على الساعد",
      "Laser hair removal session with a modern cooled medical handpiece on a forearm",
      1536,
      1024
    ),
    hydrafacial: photo(
      "/images/treatment-hydrafacial.jpg",
      "جلسة هيدرافيشل لتنظيف عميق وترطيب البشرة بجهاز الهايدرadermabrasion",
      "HydraFacial session deeply cleansing and hydrating the skin",
      1536,
      1024
    ),
    injectables: photo(
      "/images/treatment-injectables.jpg",
      "حقن تجميلي دقيق للبوتوكس والفيلر بأيدي طبيبة متخصصة",
      "Precise Botox and filler injection performed by a specialist",
      1536,
      1024
    ),
    peel: photo(
      "/images/treatment-peel.jpg",
      "تطبيق التقشير الكيميائي بفرشاة ناعمة على بشرة الوجه",
      "Chemical peel solution applied with a soft fan brush to facial skin",
      1536,
      1024
    ),
    prp: photo(
      "/images/treatment-prp.jpg",
      "أنابيب بلازما غنية بالصفائح ذهبية اللون جاهزة لجلسة PRP",
      "Golden platelet-rich plasma tubes prepared for a PRP session",
      1536,
      1024
    ),
    skincare: photo(
      "/images/skin-glow.jpg",
      "لقطة مقربة لبشرة صحية مشرقة متوحدة اللون بعد جلسات العناية",
      "Close-up of healthy luminous even-toned skin after skincare sessions",
      1536,
      1024
    ),
  },

  skin: {
    before: photo(
      "/images/skin-before.jpg",
      "بشرة الخد قبل الجلسة مع تصبغات شمسية خفيفة وعدم تجانس اللون",
      "Cheek skin before treatment showing mild sun pigmentation and uneven tone",
      1536,
      1024
    ),
    after: photo(
      "/images/skin-glow.jpg",
      "بشرة الخد بعد الجلسات بمظهر صافٍ وموحد ومشرق",
      "Cheek skin after sessions looking clear, even and radiant",
      1536,
      1024
    ),
    acneBefore: photo(
      "/images/skin-acne-before.jpg",
      "لقطة مقربة لخد وشابة قبل الخطة العلاجية مع حبوب نشطة واحمرار",
      "Close-up of a young woman's cheek before the treatment plan with active breakouts and redness",
      1024,
      1024
    ),
    acneAfter: photo(
      "/images/skin-acne-after.jpg",
      "لقطة مقربة للخد نفسه بعد اكتمال الكورس بمظهر صافٍ وهادئ ومتوحد",
      "Close-up of the same cheek after the completed course looking clear, calm and even",
      1024,
      1024
    ),
    armBefore: photo(
      "/images/arm-laser-before.jpg",
      "لقطة مقربة لساعد قبل جلسات ليزر إزالة الشعر بشعر واضح",
      "Close-up of a forearm before laser hair removal sessions with visible hair",
      1024,
      1024
    ),
    armAfter: photo(
      "/images/arm-laser-after.jpg",
      "لقطة مقربة للساعد نفسه بعد كورس الليزر بمظهر ناعم وخالٍ من الشعر",
      "Close-up of the same forearm after the laser course looking smooth and hair-free",
      1024,
      1024
    ),
    toneBefore: photo(
      "/images/face-tone-before.jpg",
      "لقطة أمامية للجبهة والخدين قبل الخطة مع تصبغات وكلف واضح",
      "Frontal close-up of forehead and cheeks before the plan with visible melasma and uneven pigmentation",
      1024,
      1024
    ),
    toneAfter: photo(
      "/images/face-tone-after.jpg",
      "لقطة أمامية للجبهة والخدين نفسها بعد الكورس بلون متوحد وتصبغات باهتة",
      "Frontal close-up of the same forehead and cheeks after the course with even tone and faded spots",
      1024,
      1024
    ),
  },

  doctors: {
    doctor1: photo(
      "/images/doctor-1.jpg",
      "الدكتورة نورهان المصري استشارية الأمراض الجلدية وتجميل الوجه",
      "Dr. Nourhan El-Masry, consultant dermatologist and facial aesthetic specialist",
      1024,
      1280,
      "50% 25%"
    ),
    doctor2: photo(
      "/images/doctor-2.jpg",
      "الدكتورة سلمى عبد الله أخصائية طب التجميل والليزر المتقدم",
      "Dr. Salma Abdallah, aesthetic medicine and advanced laser specialist",
      1024,
      1280,
      "50% 25%"
    ),
    doctor3: photo(
      "/images/doctor-3.jpg",
      "الدكتورة ريم الوكيل أخصائية العناية المركزة بالبشرة ومكافحة الشيخوخة",
      "Dr. Reem El-Wakeel, clinical skincare and anti-aging specialist",
      1024,
      1280,
      "50% 25%"
    ),
  },

  journal: {
    routine: photo(
      "/images/blog-flatlay.jpg",
      "ترتيب مسطح لمستحضرات عناية بالبشرة وسيروم على قماش كريمي",
      "Flat-lay of skincare serums and creams on warm cream linen",
      1536,
      1024
    ),
  },
} as const;

export type ImageMap = typeof images;
