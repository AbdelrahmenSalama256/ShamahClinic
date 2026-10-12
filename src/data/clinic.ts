import { siteConfig } from "@/config/site";

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
}

/**
 * Contact details the clinic does not publish through WordPress: the dashboard
 * has no options page for them, so they live in `config/site.ts`. Branch names,
 * addresses, phones and photos are NOT here — those come from the homepage
 * office blocks of page 622 (`lib/wp/branches.ts`).
 */
export const clinicData: ClinicData = {
  name: siteConfig.brand.name,
  phone: siteConfig.contact.phone,
  whatsapp: siteConfig.contact.whatsapp,
  whatsappUrl: `https://wa.me/${siteConfig.contact.whatsapp.replace("+", "")}`,
  email: siteConfig.contact.email,
  currency: {
    ar: "ج.م",
    en: "EGP",
  },
  workingHours: siteConfig.contact.workingHours,
};
