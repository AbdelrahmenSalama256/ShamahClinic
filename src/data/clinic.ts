export interface Branch {
  id: string;
  name: {
    ar: string;
    en: string;
  };
  address: {
    ar: string;
    en: string;
  };
  phone: string;
  mapUrl?: string;
}

export interface ServiceItem {
  id: string;
  name: {
    ar: string;
    en: string;
  };
  category?: string;
  description?: {
    ar: string;
    en: string;
  };
}

export interface ClinicData {
  name: {
    ar: string;
    en: string;
  };
  phone: string;
  whatsapp: string;
  whatsappUrl: string;
  email: string;
  currency: {
    ar: string;
    en: string;
  };
  workingHours: {
    ar: string;
    en: string;
  };
  branches: Branch[];
  services: ServiceItem[];
}

export const clinicData: ClinicData = {
  name: {
    ar: "عيادات شمة",
    en: "Shamah Clinics",
  },
  phone: "+20 112 188 0908",
  whatsapp: "+201121880908",
  whatsappUrl: "https://wa.me/201121880908",
  email: "info@shamahclinics.com",
  currency: {
    ar: "ج.م",
    en: "EGP",
  },
  workingHours: {
    ar: "يومياً من ١٠:٠٠ ص إلى ١٠:٠٠ م",
    en: "Daily 10:00 AM – 10:00 PM",
  },
  branches: [
    {
      id: "nasr-city",
      name: {
        ar: "فرع مدينة نصر، القاهرة",
        en: "Nasr City Branch, Cairo",
      },
      address: {
        ar: "٨ شارع مصطفى حمام، متفرع من عباس العقاد، الدور الثالث، خلف كنتاكي، أعلى محل مستورة",
        en: "8 Mostafa Hemam Street, off Abbas El Akkad, 3rd Floor, behind KFC, above Mastoura Store",
      },
      phone: "01026788285",
    },
    {
      id: "new-cairo",
      name: {
        ar: "فرع التجمع الخامس، القاهرة الجديدة",
        en: "New Cairo Branch, Fifth Settlement",
      },
      address: {
        ar: "ميديكال بارك، خلف المستشفى الجوي، بجوار مستشفى نسائم، عيادة ٣٠٢، الدور الثالث",
        en: "Medical Park, behind Air Force Hospital, next to Nasaem Hospital, Clinic 302, 3rd Floor",
      },
      phone: "01018064881",
    },
    {
      id: "sheikh-zayed",
      name: {
        ar: "فرع الشيخ زايد، الجيزة",
        en: "Sheikh Zayed Branch, Giza",
      },
      address: {
        ar: "تريفيوم مول، خلف كابيتال وبارك ستريت، الحي الثاني، الدور الأول، عيادة ١٣٧A",
        en: "Trivium Mall, behind Capital and Park Street, 2nd District, 1st Floor, Clinic 137A",
      },
      phone: "01121880855",
    },
  ],
  services: [
    {
      id: "laser-hair-removal",
      name: {
        ar: "إزالة الشعر بالليزر",
        en: "Laser Hair Removal",
      },
    },
    {
      id: "skincare",
      name: {
        ar: "العناية المتكاملة بالبشرة",
        en: "Skincare Treatments",
      },
    },
    {
      id: "botox",
      name: {
        ar: "حقن البوتوكس",
        en: "Botox Injections",
      },
    },
    {
      id: "fillers",
      name: {
        ar: "حقن الفيلر",
        en: "Filler Injections",
      },
    },
    {
      id: "chemical-peels",
      name: {
        ar: "التقشير الكيميائي (التقشير الأصفر)",
        en: "Chemical Peels (Yellow Peel)",
      },
    },
    {
      id: "yalopro",
      name: {
        ar: "حقن يالو برو سكين بوستر",
        en: "Yalo Pro Skin-Booster Injections",
      },
    },
    {
      id: "fractional-laser",
      name: {
        ar: "الفراكشنال ليزر",
        en: "Fractional Laser",
      },
    },
    {
      id: "hydrafacial",
      name: {
        ar: "جلسات الهيدرافيشل",
        en: "HydraFacial Sessions",
      },
    },
    {
      id: "prp",
      name: {
        ar: "حقن البلازما الغنية بالصفائح (PRP)",
        en: "PRP Platelet-Rich Plasma",
      },
    },
    {
      id: "skin-tightening",
      name: {
        ar: "شد ونضارة البشرة",
        en: "Skin Tightening",
      },
    },
  ],
};
