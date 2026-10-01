import { images, type PhotoSlot } from "@/lib/images";

export interface BranchDetail {
  id: string;
  name: { ar: string; en: string };
  area: { ar: string; en: string };
  address: { ar: string; en: string };
  phone: string;
  image: PhotoSlot;
  intro: { ar: string; en: string };
  features: { ar: string[]; en: string[] };
  landmark: { ar: string; en: string };
}

export const branchesData: BranchDetail[] = [
  {
    id: "nasr-city",
    name: { ar: "فرع مدينة نصر", en: "Nasr City Branch" },
    area: { ar: "مدينة نصر، القاهرة", en: "Nasr City, Cairo" },
    address: {
      ar: "٨ شارع مصطفى حمام، متفرع من عباس العقاد، الدور الثالث، خلف كنتاكي، أعلى محل مستورة",
      en: "8 Mostafa Hemam St., off Abbas El Akkad, 3rd Floor, behind KFC, above Mastoura Store",
    },
    phone: "01026788285",
    image: images.interiors.reception,
    intro: {
      ar: "أول فروع شامه وأكثرها ازدحاماً، في قلب مدينة نصر على بعد دقائق من عباس العقاد. يضم غرفتين ليزر وجناح حقن وصالة انتظار هادئة، ويعمل بطاقم نسائي كامل طوال اليوم.",
      en: "Shamah's first and busiest branch, in the heart of Nasr City minutes from Abbas El Akkad. It houses two laser rooms, an injectables suite and a quiet waiting lounge, staffed entirely by women all day.",
    },
    features: {
      ar: ["غرفتا ليزر بجهازين مستقلين", "جناح حقن خاص", "صالة انتظار منفصلة للخصوصية", "سهولة وصول من عباس العقاد"],
      en: ["Two laser rooms with independent devices", "Private injectables suite", "Separate waiting lounge for privacy", "Easy access from Abbas El Akkad"],
    },
    landmark: { ar: "خلف كنتاكي عباس العقاد، أعلى محل مستورة", en: "Behind KFC Abbas El Akkad, above Mastoura Store" },
  },
  {
    id: "new-cairo",
    name: { ar: "فرع التجمع الخامس", en: "New Cairo (Fifth Settlement) Branch" },
    area: { ar: "التجمع الخامس، القاهرة الجديدة", en: "Fifth Settlement, New Cairo" },
    address: {
      ar: "ميديكال بارك، خلف المستشفى الجوي، بجوار مستشفى نسائم، عيادة ٣٠٢، الدور الثالث",
      en: "Medical Park, behind Air Force Hospital, next to Nasaem Hospital, Clinic 302, 3rd Floor",
    },
    phone: "01018064881",
    image: images.interiors.corridor,
    intro: {
      ar: "فرعنا داخل مجمع ميديكال بارك الطبي بالتجمع، ما يوفر مواقف واسعة وأماناً وخصوصية عالية. مجهز بأحدث أجهزة الليزر وغرفة تعقيم مركزية، ويناسب قاطني القاهرة الجديدة والشروق.",
      en: "Our branch inside the Medical Park complex in the Fifth Settlement offers ample parking, security and high privacy. Equipped with the latest lasers and a central sterilisation room, serving New Cairo and El Shorouk residents.",
    },
    features: {
      ar: ["داخل مجمع طبي بمواقف واسعة", "غرفة تعقيم مركزية", "أحدث أجهزة الليزر", "خصوصية عالية ومداخل منفصلة"],
      en: ["Inside a medical complex with ample parking", "Central sterilisation room", "Latest laser devices", "High privacy with separate entrances"],
    },
    landmark: { ar: "خلف المستشفى الجوي بجوار مستشفى نسائم", en: "Behind Air Force Hospital, next to Nasaem Hospital" },
  },
  {
    id: "sheikh-zayed",
    name: { ar: "فرع الشيخ زايد", en: "Sheikh Zayed Branch" },
    area: { ar: "الشيخ زايد، الجيزة", en: "Sheikh Zayed, Giza" },
    address: {
      ar: "تريفيوم مول، خلف كابيتال وبارك ستريت، الحي الثاني، الدور الأول، عيادة ١٣٧A",
      en: "Trivium Mall, behind Capital & Park Street, 2nd District, 1st Floor, Clinic 137A",
    },
    phone: "01121880855",
    image: images.interiors.treatmentRoom,
    intro: {
      ar: "فرع الجيزة داخل تريفيوم مول بالحي الثاني، بتصميم داخلي دافئ وغرف جلسات مريحة. يخدم قاطني الشيخ زايد وأكتوبر والقرية الذكية، مع مواعيد مسائية مرنة للعاملة.",
      en: "Our Giza branch inside Trivium Mall in the 2nd District, with a warm interior and comfortable treatment rooms. Serving Sheikh Zayed, October and Smart Village, with flexible evening hours for working clients.",
    },
    features: {
      ar: ["داخل مول بمواقف وأمن", "غرف جلسات مريحة", "مواعيد مسائية مرنة", "يخدم زايد وأكتوبر والقرية الذكية"],
      en: ["Inside a mall with parking and security", "Comfortable treatment rooms", "Flexible evening hours", "Serves Zayed, October and Smart Village"],
    },
    landmark: { ar: "خلف كابيتال وبارك ستريت، الحي الثاني", en: "Behind Capital & Park Street, 2nd District" },
  },
];

export const getBranch = (id: string) => branchesData.find((b) => b.id === id);
