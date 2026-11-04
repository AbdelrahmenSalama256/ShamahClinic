-- ------------------------------------------------------------
-- 014_about_page_seed.sql
-- Seed the About page row with the copy the clinic publishes today.
--
-- The words are the client's own: the lead, «قصتنا» and «عمليتنا» are page 32 of
-- shamahclinics.com (the Arabic body the WordPress import kept, and the English body the
-- snapshot in `D:\\shamah` kept — the imported English column holds placeholder text).
-- The reasons and the values are the four and three lines the site has carried since the
-- redesign (docs/inventory.md), and the one figure under the story is the claim the page
-- already printed. The brand is spelled the way the rest of the site spells it.
--
-- One INSERT, and only one. A migration adds and never rewrites — schema.test.ts reads
-- that rule off the first word of every statement — so the document arrives with the row
-- instead of in a follow-up UPDATE. A route an owner already owns keeps whatever that row
-- holds: the NOT EXISTS guard is what stops a re-run from overwriting an edit.
--
-- `data` and `pub_data` are seeded together because they are one document read twice: the
-- console edits the draft twin and the site reads the published one, so a row holding only
-- a draft is a page the site cannot serve. The literal is named once in a subquery and
-- selected twice, which is what lets one statement write both.
--
-- The document is the canonical shape `parseListDoc(ABOUT, …)` writes — flat
-- `<stem>_ar`/`<stem>_en` keys, one array per `list` field, one record per `numbers` row —
-- so the first save in the console rewrites nothing.
-- ------------------------------------------------------------

INSERT INTO pages (
  id,
  route,
  title_ar,
  title_en,
  content_ar,
  content_en,
  pub_title_ar,
  pub_title_en,
  data,
  pub_data,
  enabled,
  status,
  published_at,
  created_at,
  updated_at,
  version
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  '/about',
  'من نحن',
  'About Shamah',
  '',
  '',
  'من نحن',
  'About Shamah',
  seed.doc,
  seed.doc,
  1,
  'published',
  NOW(3),
  NOW(3),
  NOW(3),
  1
FROM (
  SELECT '{
    "heroImage": "/images/clinic-reception.jpg",
    "heroAlt_ar": "استقبال عيادات شامه بديكور كريمي وذهبي فاخر وأجواء سبا هادئة",
    "heroAlt_en": "Shamah Clinics reception with cream and gold luxury decor and calm spa ambience",
    "lead_ar": "عيادات شامه — مركز الليزر والتجميل الذي يقدم الجمال والثقة والرعاية الشاملة. بصفتنا وجهة رائدة للجمال الطبيعي والعلاجات المتقدمة، نجمع بين أحدث التقنيات وخبراء أطباء في الليزر، والأمراض الجلدية، والعناية بالبشرة، وجراحة التجميل. نهجنا يضع السلامة والدقة في المقام الأول، ويقدم نتائج شخصية مصممة خصيصًا لكل عميلة. من الاستشارة الأولية إلى النتائج النهائية، نلتزم بأعلى معايير الجودة والرعاية والخصوصية.",
    "lead_en": "Shamah Clinics — the laser and aesthetic center offering beauty, trust, and comprehensive care. As a leading destination for natural beauty and advanced treatments, we combine cutting-edge technologies with expert doctors across laser, dermatology, skincare, and cosmetic surgery. Our approach prioritizes safety, precision, and personalized results tailored to each client. From the initial consultation to final outcomes, we are committed to the highest standards of quality, care, and privacy.",
    "storyTitle_ar": "قصتنا",
    "storyTitle_en": "The Story",
    "storyParagraphs_ar": [
      "بدأت عيادات شامه كحلم صغير مدفوع بشغف عميق بالجمال والرعاية الطبية الاحترافية. منذ البداية، كانت رسالتنا إعادة تعريف التجربة الجمالية من خلال الجمع بين السلامة والجودة والتكنولوجيا المتطورة في بيئة تُقدّر الفردية والثقة. بالتفاني والمرونة، تجاوزنا التحديات ونمونا بثبات بفضل دعم عميلاتنا المستمر.",
      "واليوم، تفخر عيادات شامه بتشغيل ثلاثة فروع رئيسية في مدينة نصر، والقاهرة الجديدة (التجمع الخامس)، والشيخ زايد، لتكون وجهةً موثوقةً لمن يبحث عن علاجات تجميلية وعلاجات ليزر متطورة. عيادات شامه أكثر من مجرد عيادة، إنها قصة نجاح مبنية على الشغف والخبرة والالتزام الراسخ بالتميز."
    ],
    "storyParagraphs_en": [
      "Shamah Clinics began as a small dream fueled by a deep passion for beauty and professional medical care. From the very beginning, our mission was to redefine the aesthetic experience by combining safety, quality, and cutting-edge technology in an environment that values individuality and trust. Through dedication and resilience, we overcame challenges and steadily grew with the continued support of our clients.",
      "Today, Shamah Clinics proudly operates three prime branches in Nasr City, New Cairo (Fifth Settlement), and Sheikh Zayed, serving as a trusted destination for those seeking advanced beauty and laser treatments. More than just a clinic, Shamah Clinics is a success story built on passion, experience, and an unwavering commitment to excellence."
    ],
    "storyImage": "/images/consultation.jpg",
    "storyAlt_ar": "طبيبة جلدية تشرح تحليل البشرة لعميلة خلال استشارة في عيادات شامه",
    "storyAlt_en": "Dermatologist explaining a skin analysis to a client during a Shamah consultation",
    "processTitle_ar": "عمليتنا",
    "processTitle_en": "The Process",
    "processParagraphs_ar": [
      "في عيادات شامه يتم توجيه رحلتك بعناية ووضوح وثقة في كل خطوة على الطريق.",
      "نبدأ باستشارة شخصية لفهم احتياجاتك ووضع خطة علاج تناسبك تمامًا.",
      "تُجرى جلساتنا في بيئة نظيفة وآمنة ومريحة باستخدام التكنولوجيا المتقدمة.",
      "بعد كل جلسة، نقدم تعليمات مفصلة للعناية اللاحقة لضمان الحصول على نتائج مثالية وطويلة الأمد.",
      "فريقنا موجود دائمًا لدعمك — من زيارتك الأولى حتى توهجك النهائي."
    ],
    "processParagraphs_en": [
      "At Shamah Clinics, your journey is guided with care, clarity, and confidence every step of the way.",
      "We begin with a personal consultation to understand your needs and craft a treatment plan that suits you perfectly.",
      "Our procedures are performed in a clean, safe, and comfortable setting using advanced technology.",
      "After each session, we provide detailed aftercare instructions to ensure optimal and long-lasting results.",
      "Our team is always here to support you — from your first visit to your final glow."
    ],
    "processImage": "/images/treatment-room.jpg",
    "processAlt_ar": "غرفة جلسات خاصة مجهزة بسرير علاج وأجهزة ليزر وعناية بالبشرة",
    "processAlt_en": "Private treatment suite with clinical bed and laser skincare devices",
    "staffValue_ar": "100٪",
    "staffValue_en": "100%",
    "reasonsTitle_ar": "لماذا تختار العميلات عيادات شامه؟",
    "reasonsTitle_en": "Why clients choose Shamah Clinics",
    "reasonsLead_ar": "نقاط نجيب عليها بصراحة قبل أي جلسة.",
    "reasonsLead_en": "Answered plainly before any session.",
    "reasons_ar": [
      "استشارة قبل أي إجراء",
      "طاقم طبي نسائي بالكامل",
      "أجهزة حديثة ومنتجات أصلية",
      "ثلاثة فروع قريبة منكِ"
    ],
    "reasons_en": [
      "A consultation before any procedure",
      "An all-female medical team",
      "Modern devices, authentic products",
      "Three branches near you"
    ],
    "valuesTitle_ar": "ما نلتزم به",
    "valuesTitle_en": "What we stand by",
    "valuesLead_ar": "قواعد تحكم كل قرار في عيادات شامه.",
    "valuesLead_en": "The rules behind every decision at Shamah Clinics.",
    "values_ar": [
      "الصدق قبل البيع",
      "الطب أساس كل جلسة",
      "خصوصية وراحة كاملتان"
    ],
    "values_en": [
      "Honesty before selling",
      "Medicine underpins every session",
      "Complete privacy and comfort"
    ],
    "numbersTitle_ar": "",
    "numbersTitle_en": "",
    "numbersLead_ar": "",
    "numbersLead_en": "",
    "numbers": []
  }' AS doc
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM pages WHERE route = '/about');
