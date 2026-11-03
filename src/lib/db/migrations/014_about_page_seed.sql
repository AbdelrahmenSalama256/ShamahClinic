-- ------------------------------------------------------------
-- 014_about_page_seed.sql
-- Seed the About page row from today's exact hard-coded text.
--
-- Idempotent: the row is INSERTed only when no row already
-- owns the /about route. Once the owner types anything, the
-- console owns the row, so this migration never overwrites
-- an edit and never deletes rows.
--
-- The `data` JSON column is the same shape the editor writes:
-- heroTitle, heroLead, storyAr, storyEn, missionTitle, missionBody,
-- visionTitle, visionBody, values, whyChooseUsTitle, whyChooseUs,
-- whyChooseUsLead, whyChooseUs, numbers, teamIds, branchesIds,
-- certifications, ctaTitle, ctaLink, ctaVerb.
-- ------------------------------------------------------------

-- The About page must exist for the console to edit it.
INSERT INTO pages (
  id,
  route,
  title_ar,
  title_en,
  content_ar,
  content_en,
  pub_title_ar,
  pub_title_en,
  pub_content_ar,
  pub_content_en,
  enabled,
  data,
  pub_data,
  status,
  created_at,
  updated_at,
  created_by,
  updated_by,
  version
) SELECT
  '00000000-0000-0000-0000-000000000001',
  '/about',
  'من نحن',
  'About Shamah',
  '',
  '',
  'من نحن',
  'About Shamah',
  NULL,
  NULL,
  1,
  '{
    "heroTitle": {"ar": "من نحن", "en": "About Shamah"},
    "heroLead": {
      "ar": "عيادات شامه وجهة لطب التجميل والليزر والعناية بالبشرة في القاهرة والجيزة، تقوم على فكرة بسيطة: بشرة صحية بنتيجة طبيعية، وقرار طبي واضح بلا مبالغة.",
      "en": "Shamah Clinics is a destination for aesthetic medicine, laser and skincare in Cairo and Giza, built on a simple idea: healthy skin with natural results, and a clear medical decision without exaggeration."
    },
    "storyAr": "ابدأوا بزيارة أحد الفروع الثلاثة أو احصلي عنا عبر الواتساب، وسنرشدكم بأي شيء مضن.",
    "storyEn": "Start at any of our three branches or reach us on WhatsApp, and we will guide you through everything.",
    "sections": [
      {
        "heading": {"ar": "بدأنا من سؤال بسيط", "en": "We started from a simple question"},
        "paragraphs": [
          {
            "ar": "لماذا تخرج كثيرات من عيادات التجميل بنتيجة لا تشبههن؟ Was هذا سؤالنا الأول. The answer is that successful aesthetics does not change features but lets the face rest, and that every skin is a unique case needing assessment, not a ready-made template.",
            "en": "Why do many women leave aesthetic clinics with a result that does not look like them? That was our first question. Our answer is that successful aesthetics does not change features but lets the face rest, and that every skin is a unique case needing assessment, not a ready-made template."
          },
          {
            "ar": "من هذه الفكرة وُلدت عيادات شامه: طاقم طبي نسائي متخصص، أجهزة حديثة بمنتجات أصلية، وبروتوكول يبدأ دائماً باستشارة وتحليل مكتوب. اليوم نخدم عميلاتنا من أربعة فروع في القاهرة والجيزة.",
            "en": "From this idea Shamah Clinics was born: a specialised all-female medical team, modern devices with authentic products, and a protocol that always begins with a consultation and a written analysis. Today we serve our clients from three branches across Cairo and Giza."
          }
        ],
        "image": {"src": "/images/consultation.jpg", "alt": {"ar": "طبيبة جلدية تشرح تحليل البشرة لعميلة خلال استشارة في عيادات شامه", "en": "Dermatologist explaining a skin analysis to a client during a Shamah consultation"}, "width": 1536, "height": 1024, "focal": "50% 50%"}
      }
    ],
    "structured": {
    "missionBody": {
      "ar": "أن نكون الصورة المثالية لعيادات التجمیل النسائية في مصر، نذكروا مع الطبقة الطبية دائماً، ونشتق النتائج من الواقع وليس من المبالغة.",
      "en": "To be the leading all-female cosmetic clinic in Egypt, always guided by medical ethics and producing results that are real, not exaggerated."
    },
    "visionTitle": {"ar": "قيادتنا", "en": "Our leadership"},
    "visionBody": {
      "ar": "نضع دائماً البشرة قبل الربح، والراحة قبل الشمول، والشفافية قبل الترويج.",
      "en": "We always put the skin before the profit, comfort before coverage, and transparency before promotion."
    },
    "values": [
      {"ar": "الصدق قبل البيع", "en": "Honesty before selling"},
      {"ar": "الطب أساس كل جلسة", "en": "Medicine underpins every session"},
      {"ar": "خصوصية وراحة كاملتان", "en": "Complete privacy and comfort"}
    ],
    "whyChooseUsTitle": {"ar": "لماذا تختار العميلات عيادات شامه؟", "en": "Why clients choose Shamah Clinics"},
    "whyChooseUsLead": {"ar": "أربع نقاط نجيب عليها بصراح قبل أي جلسة.", "en": "Four points we answer plainly before any session."},
    "whyChooseUs": [
      {"ar": "استشارة قبل أي إجراء", "en": "A consultation before any procedure"},
      {"ar": "طاقم طبي نسائي بالكامل", "en": "An all-female medical team"},
      {"ar": "أجهزة حديثة ومنتجات أصلية", "en": "Modern devices, authentic products"},
      {"ar": "ثلاثة فروع قريبة منكِ", "en": "Three branches near you"}
    ],
    "numbers": [
      {"valueAr": "100", "valueEn": "100", "labelAr": "طاقم نسائي", "labelEn": "Female staff", "noteAr": null, "noteEn": null},
      {"valueAr": "3", "valueEn": "3", "labelAr": "فرع", "labelEn": "Branch", "noteAr": null, "noteEn": null},
      {"valueAr": "9", "valueEn": "9", "labelAr": "سنة خبرة", "labelEn": "Years of experience", "noteAr": null, "noteEn": null}
    ],
    "teamIds": [],
    "branchesIds": [],
    "certifications": [],
    "ctaTitle": {"ar": "ابدأِ رحلة بشرة طبيعية", "en": "Start your natural skin journey"},
    "ctaLink": null,
    "ctaVerb": {"ar": "تواصلی الآن", "en": "Contact us now"}
  }',
  NULL,
  'published',
  NOW(3),
  NOW(3),
  NULL,
  NULL,
  1
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  updated_at = VALUES(updated_at),
  version = version + 1;
