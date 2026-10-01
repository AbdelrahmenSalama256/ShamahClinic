import { images, type PhotoSlot } from "@/lib/images";

export interface Specialist {
  id: string;
  name: { ar: string; en: string };
  title: { ar: string; en: string };
  credentials: { ar: string; en: string };
  bio: { ar: string; en: string };
  specialties: { ar: string[]; en: string[] };
  experienceYears: number;
  branches: string[];
  image: PhotoSlot;
}

export const specialistsData: Specialist[] = [
  {
    id: "dr-nourhan-elmasry",
    name: { ar: "د. نورهان المصري", en: "Dr. Nourhan El-Masry" },
    title: { ar: "استشارية الأمراض الجلدية وتجميل الوجه", en: "Consultant Dermatologist & Facial Aesthetics" },
    credentials: {
      ar: "دكتوراه الجلدية والتجميل، عضو الجمعية الأوروبية لطب التجميل",
      en: "Ph.D. Dermatology & Aesthetics, member of the European Society for Cosmetic Dermatology",
    },
    bio: {
      ar: "تقود د. نورهان قسم الحقن التجميلي في شامه، وتعرف بفلسفتها المحافظة: أقل كمية ممكنة لأفضل نتيجة، مع الحفاظ الكامل على تعابير الوجه. تشرف بنفسها على خطة كل حالة من الاستشارة حتى المتابعة.",
      en: "Dr. Nourhan leads the injectables department at Shamah and is known for a conservative philosophy: the smallest effective dose for the best result, fully preserving facial expression. She personally oversees each case from consultation to follow-up.",
    },
    specialties: {
      ar: ["حقن الفيلر والبوتوكس", "شد الوجه بالخيوط", "علاج التصبغات المعقدة"],
      en: ["Fillers & Botox", "Thread lifting", "Complex pigmentation"],
    },
    experienceYears: 14,
    branches: ["nasr-city", "new-cairo"],
    image: images.doctors.doctor1,
  },
  {
    id: "dr-salma-abdallah",
    name: { ar: "د. سلمى عبد الله", en: "Dr. Salma Abdallah" },
    title: { ar: "أخصائية طب التجميل والليزر المتقدم", en: "Aesthetic Medicine & Advanced Laser Specialist" },
    credentials: {
      ar: "ماجستير الأمراض الجلدية والليزر، دبلومة طب التجميل",
      en: "M.Sc. Dermatology & Laser, diploma in aesthetic medicine",
    },
    bio: {
      ar: "مسؤولة عن برامج الليزر في فرعي التجمع والشيخ زايد، وتضبط بروتوكولات الطاقة والتبريد لكل نوع بشرة. تهتم تحديداً بحالات الندبات والمسام وتضع خططاً متدرجة بدل الحلول السريعة.",
      en: "Responsible for laser programmes at the New Cairo and Sheikh Zayed branches, calibrating energy and cooling protocols per skin type. She focuses on scarring and pore cases, building graduated plans rather than quick fixes.",
    },
    specialties: {
      ar: ["إزالة الشعر بالليزر", "الفراكشنال ليزر والندبات", "محفزات الكولاجين"],
      en: ["Laser hair removal", "Fractional laser & scars", "Collagen stimulators"],
    },
    experienceYears: 11,
    branches: ["new-cairo", "sheikh-zayed"],
    image: images.doctors.doctor2,
  },
  {
    id: "dr-reem-el-wakeel",
    name: { ar: "د. ريم الوكيل", en: "Dr. Reem El-Wakeel" },
    title: { ar: "أخصائية العناية المركزة بالبشرة ومكافحة الشيخوخة", en: "Clinical Skincare & Anti-Aging Specialist" },
    credentials: {
      ar: "دبلوم التجميل الطبي غير الجراحي، زمالة تدريبية في العناية السريرية بالبشرة",
      en: "Diploma in non-surgical aesthetic medicine, clinical skincare fellowship",
    },
    bio: {
      ar: "تصمم بروتوكولات العناية والهيدرافيشل والتقشير في شامه، وتبدأ كل حالة بتحليل بشرة مكتوب لتوضيح المتوقع واقعياً. تفضل النتائج التدريجية الطبيعية على التغييرات المفاجئة.",
      en: "Designs Shamah's skincare, HydraFacial and peel protocols, and begins every case with a written skin analysis to set realistic expectations. She favours gradual natural results over sudden change.",
    },
    specialties: {
      ar: ["بروتوكولات الهيدرافيشل", "التقشير الكيميائي", "البلازما والسكين بوستر"],
      en: ["HydraFacial protocols", "Chemical peels", "PRP & skin boosters"],
    },
    experienceYears: 9,
    branches: ["nasr-city", "sheikh-zayed"],
    image: images.doctors.doctor3,
  },
];

export const getSpecialist = (id: string) => specialistsData.find((s) => s.id === id);
