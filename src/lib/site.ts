import { treatmentsData } from "@/data/treatments";

export const SITE_URL = "https://shamahclinics.com";

export interface NavChild {
  href: string;
  label: { ar: string; en: string };
  description?: { ar: string; en: string };
}

export interface NavItem {
  href: string;
  label: { ar: string; en: string };
  children?: NavChild[];
}

const featuredServices: NavChild[] = treatmentsData
  .filter((t) => t.featured)
  .slice(0, 4)
  .map((t) => ({
    href: `/services/${t.id}`,
    label: t.name,
    description: t.tagline,
  }));

/** Primary navigation, in display order. "الرئيسية" is first. */
export const primaryNav: NavItem[] = [
  { href: "/", label: { ar: "الرئيسية", en: "Home" } },
  { href: "/about", label: { ar: "من نحن", en: "About" } },
  {
    href: "/services",
    label: { ar: "الخدمات", en: "Services" },
    children: featuredServices,
  },
  { href: "/results", label: { ar: "النتائج", en: "Results" } },
  { href: "/doctors", label: { ar: "الأطباء", en: "Doctors" } },
  { href: "/offers", label: { ar: "العروض", en: "Offers" } },
  { href: "/branches", label: { ar: "الفروع", en: "Branches" } },
  { href: "/blogs", label: { ar: "المقالات", en: "Blogs" } },
  { href: "/contact", label: { ar: "تواصلي", en: "Contact" } },
];

/** Secondary links surfaced in the footer. */
export const footerNav: NavItem[] = [
  // { href: "/faq", label: { ar: "الأسئلة الشائعة", en: "FAQ" } },
  // { href: "/privacy", label: { ar: "سياسة الخصوصية", en: "Privacy Policy" } },
  // { href: "/contact", label: { ar: "حجز موعد", en: "Book Appointment" } },
];

export const socialLinks = [
  { id: "facebook", href: "https://facebook.com/shamahclinics", label: "Facebook" },
  { id: "instagram", href: "https://instagram.com/shamahclinics", label: "Instagram" },
  { id: "youtube", href: "https://youtube.com/@shamahclinics", label: "YouTube" },
] as const;