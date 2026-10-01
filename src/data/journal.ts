import { images, type PhotoSlot } from "@/lib/images";

export interface JournalSection {
  heading?: { ar: string; en: string };
  paragraphs: { ar: string[]; en: string[] };
  bullets?: { ar: string[]; en: string[] };
}

export interface Article {
  slug: string;
  title: { ar: string; en: string };
  excerpt: { ar: string; en: string };
  authorId: string;
  date: { ar: string; en: string };
  isoDate: string;
  readMinutes: number;
  image: PhotoSlot;
  tags: { ar: string[]; en: string[] };
  sections: JournalSection[];
}

export const journalData: Article[] = [
  {
    slug: "laser-hair-removal-myths",
    title: {
      ar: "خمسة مفاهيم خاطئة عن ليزر إزالة الشعر نصححها",
      en: "Five laser hair removal myths, corrected",
    },
    excerpt: {
      ar: "من «الليزر يسبب السرطان» إلى «جلسة واحدة تكفي»: نوضح ما يقوله الطب فعلاً عن أمان الليزر وعدد جلساته ولون البشرة.",
      en: "From 'laser causes cancer' to 'one session is enough': what the medicine actually says about safety, session count and skin tone.",
    },
    authorId: "dr-salma-abdallah",
    date: { ar: "١٢ أغسطس ٢٠٢٦", en: "12 August 2026" },
    isoDate: "2026-08-12",
    readMinutes: 4,
    image: images.treatments.laser,
    tags: { ar: ["ليزر", "إزالة شعر"], en: ["Laser", "Hair removal"] },
    sections: [
      {
        paragraphs: {
          ar: [
            "ينتشر حول ليزر إزالة الشعر قدر كبير من المعلومات غير الدقيقة، وكثير منها يمنع سيدات من تجربة حل كان سيناسبهن تماماً. في هذا المقال نصحح خمسة مفاهيم شائعة بناءً على الممارسة السريرية اليومية.",
          ],
          en: [
            "A great deal of inaccurate information circulates about laser hair removal, and much of it deters women from a solution that would suit them well. Here we correct five common misconceptions based on daily clinical practice.",
          ],
        },
      },
      {
        heading: { ar: "١. الليزر لا يسبب السرطان", en: "1. Laser does not cause cancer" },
        paragraphs: {
          ar: [
            "ضوء الليزر المستخدم في إزالة الشعر ضوء غير مؤين، أي أنه لا يملك طاقة كافية لتغيير الحمض النووي للخلايا. عمق اختراقه محدود ببصيلة الشعر ولا يصل لأي عضو داخلي، لذا لا توجد آلية بيولوجية معقولة للتسبب بالأورام.",
          ],
          en: [
            "The light used in laser hair removal is non-ionising, meaning it lacks the energy to alter cell DNA. Its penetration is limited to the hair follicle and reaches no internal organ, so there is no plausible biological mechanism for causing tumours.",
          ],
        },
      },
      {
        heading: { ar: "٢. جلسة واحدة لا تكفي", en: "2. One session is not enough" },
        paragraphs: {
          ar: [
            "الليزر يؤثر فقط على الشعر في طور النمو النشط، وفي أي لحظة جزء من شعركِ في طور الراحة. لذلك نحتاج سلسلة جلسات تلتقط كل بصيلة عند دخولها طور النمو، وستة إلى ثمانية جلسات هو المدى المعتاد.",
          ],
          en: [
            "Laser only affects hair in the active growth phase, and at any moment part of your hair is resting. That is why a series of sessions is needed to catch each follicle as it enters growth; six to eight sessions is the usual range.",
          ],
        },
      },
      {
        heading: { ar: "٣. البشرة السمراء ليست مانعاً", en: "3. Darker skin is not a barrier" },
        paragraphs: {
          ar: [
            "الأجهزة الحديثة بطول موجي مناسب (مثل الـ Nd:YAG) تفصل بين صبغة الشعر وصبغة الجلد بدرجة تسمح بمعالجة البشرة السمراء بأمان، بشرط ضبط الإعدادات على يد مختصة. ما يسبب الحروق هو الإعداد الخاطئ لا لون البشرة نفسه.",
          ],
          en: [
            "Modern devices with suitable wavelengths (such as Nd:YAG) separate hair pigment from skin pigment well enough to treat darker skin safely, provided settings are calibrated by a specialist. It is wrong settings, not skin colour, that cause burns.",
          ],
        },
      },
      {
        heading: { ar: "٤. الشمع بين الجلسات يفسد النتيجة", en: "4. Waxing between sessions ruins results" },
        paragraphs: {
          ar: [
            "الليزر يستهدف البصيلة نفسها، والشمع أو النتف يزيل البصيلة مؤقتاً فيحرم الليزر من هدفه. الحلاقة وحدها آمنة بين الجلسات لأنها تترك البصيلة في مكانها.",
          ],
          en: [
            "Laser targets the follicle itself, and waxing or plucking temporarily removes it, robbing the laser of its target. Shaving alone is safe between sessions because it leaves the follicle in place.",
          ],
        },
      },
      {
        heading: { ar: "٥. الألم ليس معيار الجودة", en: "5. Pain is not a measure of quality" },
        paragraphs: {
          ar: [
            "يعتقد البعض أن الجلسة المؤلمة أقوى وأكثر فاعلية، وهذا غير صحيح. أجهزة التبريد الحديثة تجعل الجلسة مريحة مع الحفاظ على الفاعلية، والألم الشديد قد يكون مؤشراً على إعدادات غير مناسبة لبشرتكِ.",
          ],
          en: [
            "Some believe a painful session is stronger and more effective; this is false. Modern cooling makes sessions comfortable while preserving efficacy, and severe pain may signal settings unsuited to your skin.",
          ],
        },
      },
    ],
  },
  {
    slug: "winter-skincare-routine",
    title: {
      ar: "روتين شتوي واقعي للبشرة الجافة في مناخ مصر",
      en: "A realistic winter routine for dry skin in Egypt's climate",
    },
    excerpt: {
      ar: "البرود والرياح والتدفئة المركزية تسحب الماء من بشرتكِ. إليك ترتيب طبقات بسيط وعملي يمكنكِ الالتزام به فعلاً.",
      en: "Cold, wind and central heating pull water from your skin. Here is a simple, practical layering order you can actually stick to.",
    },
    authorId: "dr-reem-el-wakeel",
    date: { ar: "٣ يناير ٢٠٢٦", en: "3 January 2026" },
    isoDate: "2026-01-03",
    readMinutes: 5,
    image: images.journal.routine,
    tags: { ar: ["عناية بالبشرة", "ترطيب"], en: ["Skincare", "Hydration"] },
    sections: [
      {
        paragraphs: {
          ar: [
            "في الشتاء المصري تجتمع ثلاثة عوامل على بشرتكِ: هواء بارد جاف خارجاً، وتدفئة تسحب الرطوبة داخلاً، وماء ساخن مغرٍ في الاستحمام. النتيجة حاجز جلدي مرهق يظهر كشدّ وتقشر وحكة. الحل ليس منتجات أكثر بل ترتيب أصح.",
          ],
          en: [
            "In an Egyptian winter three factors converge on your skin: cold dry air outside, heating that strips humidity inside, and tempting hot showers. The result is a stressed skin barrier showing as tightness, flaking and itch. The fix is not more products but a better order.",
          ],
        },
      },
      {
        heading: { ar: "الترتيب الصحيح للطبقات", en: "The correct layering order" },
        paragraphs: {
          ar: [
            "ابدئي بغسول لطيف لا يُشعركِ بالشد بعد الشطف. ثم طبقة مرطبة خفيفة على بشرة ما زالت ندّية، لأن حبس الماء الموجود أسهل من تعويض المفقود. وأخيراً طبقة سدّ أثقل ليلاً تمنع التبخر أثناء النوم.",
          ],
          en: [
            "Start with a gentle cleanser that leaves no tight feeling after rinsing. Then a light moisturising layer on still-damp skin, because trapping existing water is easier than replacing lost water. Finally a heavier occlusive layer at night to prevent evaporation while you sleep.",
          ],
        },
        bullets: {
          ar: [
            "غسول لطيف صباحاً ومساءً",
            "مرطب خفيف على بشرة ندّية",
            "طبقة سدّ أثقل ليلاً",
            "واقي شمس صباحاً حتى في الغيوم",
          ],
          en: [
            "Gentle cleanser morning and night",
            "Light moisturiser on damp skin",
            "Heavier occlusive layer at night",
            "Sunscreen in the morning even when cloudy",
          ],
        },
      },
      {
        heading: { ar: "أخطاء شائعة تزيد الجفاف", en: "Common mistakes that worsen dryness" },
        paragraphs: {
          ar: [
            "الاستحمام بماء شديد السخونة لفترات طويلة يذيب طبقة الدهون الواقية. كذلك الإفراط في المقشرات الشتوية بحجة «التقشير» يهيج حاجزاً متعباً أصلاً. قللي التقشير شتاءً إلى مرة أسبوعياً كحد أقصى وراقبي استجابة بشرتكِ.",
          ],
          en: [
            "Long very hot showers dissolve the protective lipid layer. Likewise over-exfoliating in winter 'to remove flakes' irritates an already tired barrier. Reduce exfoliation in winter to at most once weekly and watch how your skin responds.",
          ],
        },
      },
      {
        heading: { ar: "متى تلجئين لجلسة عناية؟", en: "When to book a care session?" },
        paragraphs: {
          ar: [
            "إذا التزمتِ بالروتين شهراً وما زال الشدّ والتقشر قائمين، فقد يكون حاجز بشرتكِ بحاجة لدعم أعمق عبر جلسة عناية ترطيب عميق أو سكين بوستر. الاستشارة تحدد أيهما أنسب لحالتكِ قبل أي إنفاق.",
          ],
          en: [
            "If you follow the routine for a month and tightness and flaking persist, your barrier may need deeper support through a deep-hydration care session or skin booster. A consultation determines which suits your case before any spending.",
          ],
        },
      },
    ],
  },
  {
    slug: "botox-vs-filler-difference",
    title: {
      ar: "البوتوكس أم الفيلر؟ كيف تعرفين ما تحتاجينه فعلاً",
      en: "Botox or filler? How to know what you actually need",
    },
    excerpt: {
      ar: "كثير من الطلبات تصلنا باسم خاطئ: من تريد علاج خط حركة تطلب فيلر، ومن تريد امتلاءً تطلب بوتوكس. الفرق بسيط إذا فهمتِ السببين.",
      en: "Many requests reach us under the wrong name: someone wanting to treat a movement line asks for filler, someone wanting volume asks for Botox. The difference is simple once you understand the two causes.",
    },
    authorId: "dr-nourhan-elmasry",
    date: { ar: "٢٠ مايو ٢٠٢٦", en: "20 May 2026" },
    isoDate: "2026-05-20",
    readMinutes: 4,
    image: images.treatments.injectables,
    tags: { ar: ["حقن", "بوتوكس", "فيلر"], en: ["Injectables", "Botox", "Filler"] },
    sections: [
      {
        paragraphs: {
          ar: [
            "أول سؤال نطرحه في الاستشارة ليس «ماذا تريدين؟» بل «ما سبب هذا الخط؟». لأن الإجابة تحدد المادة: هل الخط ناتج عن حركة عضلة متكررة، أم عن فقد حجم ودعم تحت الجلد؟",
          ],
          en: [
            "The first question in consultation is not 'what do you want?' but 'what causes this line?'. Because the answer determines the material: is the line from repeated muscle movement, or from lost volume and support under the skin?",
          ],
        },
      },
      {
        heading: { ar: "البوتوكس يعالج الحركة", en: "Botox treats movement" },
        paragraphs: {
          ar: [
            "خطوط الجبهة وما بين الحاجبين وحواف العينين تظهر لأن عضلات تنقبض آلاف المرات يومياً فتطوي الجلد فوقها. البوتوكس يريح تلك العضلة فيرتاح الجلد معها. لذلك هو خيار الخطوط الديناميكية التي تظهر مع التعبير.",
          ],
          en: [
            "Forehead lines, frown lines and crow's feet appear because muscles contract thousands of times daily, creasing the skin above. Botox relaxes that muscle and the skin relaxes with it. Hence it is the choice for dynamic lines that appear with expression.",
          ],
        },
      },
      {
        heading: { ar: "الفيلر يعالج الفقد", en: "Filler treats loss" },
        paragraphs: {
          ar: [
            "مع الوقت يفقد الوجه حجماً ودعماً فتظهر أخاديد ثابتة حتى بدون تعبير: خط الدمع، طية الأنف والفم، شفاه أرفع. هنا نضيف حجماً داعماً بحمض الهيالورونيك ليعيد ما فقد، لا ليشل شيئاً.",
          ],
          en: [
            "Over time the face loses volume and support, so static grooves appear even without expression: tear trough, nasolabial fold, thinner lips. Here we add supportive hyaluronic volume to restore what was lost, not to paralyse anything.",
          ],
        },
      },
      {
        heading: { ar: "وحالات تجمع الاثنين", en: "And cases combining both" },
        paragraphs: {
          ar: [
            "بعض المناطق مثل الجبهة قد تحتاج بوتوكس أولاً ثم تقييماً لاحقاً: إن بقي خط ثابت بعد ارتخاء العضلة فقد يحتاج دعماً خفيفاً. لذلك نفضل دائماً البدء بالمحافظة وتقييم النتيجة قبل إضافة أي مادة ثانية.",
          ],
          en: [
            "Some areas such as the forehead may need Botox first and later assessment: if a static line remains after the muscle relaxes, it may need light support. That is why we always prefer starting conservative and evaluating before adding a second material.",
          ],
        },
      },
    ],
  },
];

export const getArticle = (slug: string) => journalData.find((a) => a.slug === slug);
