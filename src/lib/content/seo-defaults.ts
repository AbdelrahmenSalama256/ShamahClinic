/**
 * The title and description each site route emits when it has no override.
 *
 * These were literals inside eleven `generateMetadata` functions. They are here so the
 * SEO center can show the exact sentence Google would receive instead of a second
 * guess — and so changing one changes both the site and the screen. The page files
 * still own their image and their own pagination logic; this catalog owns only the two
 * words the SEO center edits.
 */
import type { Bi } from '../wp/types';

export interface SeoDefault {
  title: Bi;
  description: Bi;
}

/** Keyed by the site path `buildPageMetadata()` receives; `''` is the home page. */
export const SITE_SEO: Record<string, SeoDefault> = {
  '': {
    title: {
      ar: 'التجميل والليزر والعناية بالبشرة في القاهرة والجيزة',
      en: 'Home — Shamah Clinics',
    },
    description: {
      ar: 'عيادات شامه لطب التجميل والليزر والعناية بالبشرة في القاهرة والجيزة. ثلاثة فروع بمدينة نصر والتجمع الخامس والشيخ زايد، بإشراف طبي نسائي كامل وأجهزة حديثة. احجزي استشارتكِ الآن.',
      en: 'Shamah Clinics for aesthetic medicine, laser and skincare in Cairo and Giza. Three branches with an all-female medical team and modern devices.',
    },
  },
  '/about': {
    title: { ar: 'من نحن — قصة عيادات شامه وقيمها', en: 'About Shamah Clinics' },
    description: {
      ar: 'تعرّفي على قصة عيادات شامه لطب التجميل والليزر: فلسفتنا القائمة على الصدق والطب والخصوصية، وطاقم نسائي متخصص، وثلاثة فروع في القاهرة والجيزة.',
      en: 'The story of Shamah Clinics: a philosophy built on honesty, medicine and privacy, an all-female specialist team, and three branches across Cairo and Giza.',
    },
  },
  '/services': {
    title: { ar: 'الخدمات التجميلية والليزر', en: 'Aesthetic & Laser Services' },
    description: {
      ar: 'تعرفي على خدمات عيادات شامه: إزالة الشعر بالليزر، الفيلر والبوتوكس، الهيدرافيشل، التقشير الكيميائي، البلازما PRP، والعناية بالبشرة. تفاصيل كل جلسة وأسعارها وعدد الجلسات.',
      en: 'Explore Shamah Clinics services: laser hair removal, fillers and Botox, HydraFacial, chemical peels, PRP and skincare. Details, prices and session counts.',
    },
  },
  '/offers': {
    title: { ar: 'العروض والباقات الموسمية', en: 'Offers & Packages' },
    description: {
      ar: 'عروض وباقات عيادات شامه الحالية بأسعارها الفعلية، سارية في فروع مدينة نصر والتجمع الخامس والشيخ زايد.',
      en: 'Current Shamah Clinics offers and packages at their real prices, valid across the Nasr City, Fifth Settlement and Zayed branches.',
    },
  },
  '/branches': {
    title: { ar: 'الفروع — مدينة نصر والتجمع والشيخ زايد', en: 'Our Branches' },
    description: {
      ar: 'فروع عيادات شامه الثلاثة في القاهرة والجيزة: مدينة نصر (عباس العقاد)، التجمع الخامس (ميديكال بارك)، والشيخ زايد (تريفيوم مول). عناوين وأرقام هاتف كل فرع.',
      en: "Shamah Clinics' three branches in Cairo and Giza: Nasr City, Fifth Settlement (Medical Park) and Sheikh Zayed (Trivium Mall). Addresses and phone numbers.",
    },
  },
  '/blogs': {
    title: { ar: 'مدونة شامه — مقالات العناية بالبشرة والتجميل', en: 'Shamah Blogs — Skincare & Aesthetics' },
    description: {
      ar: 'مقالات طبية مبسطة من طبيبات عيادات شامه عن ليزر إزالة الشعر والعناية بالبشرة والبوتوكس والفيلر.',
      en: "Clear medical articles from Shamah's doctors on laser hair removal, skincare, Botox and fillers.",
    },
  },
  '/doctors': {
    title: { ar: 'الأطباء والطبيبات', en: 'Our Doctors' },
    description: {
      ar: 'تعرّفي على طبيبات عيادات شامه: استشارية الجلدية والتجميل د. نورهان المصري، أخصائية الليزر د. سلمى عبد الله، وأخصائية العناية بالبشرة د. ريم الوكيل. طاقم نسائي بالكامل.',
      en: "Meet Shamah Clinics' all-female medical team: dermatology and aesthetics consultant Dr. Nourhan El-Masry, laser specialist Dr. Salma Abdallah, and skincare specialist Dr. Reem El-Wakeel.",
    },
  },
  '/results': {
    title: { ar: 'النتائج — ما ترويه العيادة عن جلساتها', en: 'Results — What the Clinic Reports' },
    description: {
      ar: 'مقالات عيادات شامه عن نتائج الجلسات، بعنوانها ومقتطفها وصورتها كما نشرتها العيادة.',
      en: "Shamah Clinics' own articles on treatment outcomes, with the title, excerpt and photo the clinic published.",
    },
  },
  '/faq': {
    title: { ar: 'الأسئلة الشائعة عن الليزر والتجميل', en: 'Frequently Asked Questions' },
    description: {
      ar: 'إجابات على أسئلتك عن ليزر إزالة الشعر، الفيلر والبوتوكس، الهيدرافيشل والتقشير، والحجز في عيادات شامه: عدد الجلسات، الألم، الأمان، الأسعار وطريقة تحديدها.',
      en: 'Answers to your questions about laser hair removal, fillers and Botox, HydraFacial and peels, and booking at Shamah: sessions, pain, safety and how prices are set.',
    },
  },
  '/contact': {
    title: { ar: 'تواصلي معنا — حجز موعد واستفسار', en: 'Contact & Booking' },
    description: {
      ar: 'تواصلي مع عيادات شامه عبر واتساب أو الهاتف، أو احجزي موعدكِ مباشرة. أرقام الفروع الثلاثة في مدينة نصر والتجمع الخامس والشيخ زايد.',
      en: 'Contact Shamah Clinics on WhatsApp or by phone, or book your visit directly. Phone numbers for all three branches.',
    },
  },
  '/privacy': {
    title: { ar: 'سياسة الخصوصية', en: 'Privacy Policy' },
    description: {
      ar: 'كيف يتعامل موقع عيادات شامه مع معلومات الزائرات: نماذج الحجز والاستفسار، تفضيل اللغة المحفوظ محلياً، وقنوات التواصل الخارجية. سياسة واضحة ومختصرة بدون تعقيد قانوني.',
      en: 'How the Shamah Clinics website handles visitor information: booking and enquiry forms, the locally stored language preference, and external contact channels. Clear and concise.',
    },
  },
};
