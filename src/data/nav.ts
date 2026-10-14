export interface NavLink {
  href: string;
  label: { ar: string; en: string };
}

export interface NavItem extends NavLink {
  children?: NavLink[];
}

/**
 * Header menu and footer link group, in display order ("الرئيسية" first). The
 * footer renders these same top-level lines. One entry per menu page: removing
 * a page from the menu means deleting its line here.
 */
export const navItems: NavItem[] = [
  { href: "/", label: { ar: "الرئيسية", en: "Home" } },
  { href: "/about", label: { ar: "من نحن", en: "About" } },
  {
    href: "/services",
    label: { ar: "الخدمات", en: "Services" },
    children: [
      {
        href: "/services/laser-hair-removal",
        label: { ar: "إزالة الشعر بالليزر", en: "Laser Hair Removal" },
      },
      {
        href: "/services/skincare-deep-cleansing",
        label: { ar: "العناية المتكاملة بالبشرة", en: "Complete Skincare Facial" },
      },
      {
        href: "/services/botox",
        label: { ar: "حقن البوتوكس", en: "Botox Injections" },
      },
      {
        href: "/services/fillers",
        label: { ar: "حقن الفيلر", en: "Dermal Fillers" },
      },
    ],
  },
  { href: "/results", label: { ar: "النتائج", en: "Results" } },
  { href: "/doctors", label: { ar: "الأطباء", en: "Doctors" } },
  { href: "/offers", label: { ar: "العروض", en: "Offers" } },
  { href: "/branches", label: { ar: "الفروع", en: "Branches" } },
  { href: "/blogs", label: { ar: "المدونة", en: "Blogs" } },
  { href: "/contact", label: { ar: "تواصلي", en: "Contact" } },
];

/** The header/footer booking button label. */
export const bookCta: NavLink["label"] = { ar: "احجزي موعدك", en: "Book" };
