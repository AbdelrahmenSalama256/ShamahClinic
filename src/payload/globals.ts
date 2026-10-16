import type { Field, GlobalConfig } from "payload";
import { staffOnly } from "./access";
import { biText, biTextarea, mediaRef, seoFields } from "./fields";
import { revalidateGlobal } from "./hooks";

const staffOnlyGlobal = {
  access: { read: () => true, update: staffOnly },
  hooks: { afterChange: [revalidateGlobal] },
} satisfies Pick<GlobalConfig, "access" | "hooks">;

export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  label: "Site settings",
  ...staffOnlyGlobal,
  fields: [
    biText({ name: "brandName", label: "Brand name", required: true }),
    { name: "themeColor", type: "text", admin: { position: "sidebar", description: "e.g. #C9A227" } },
    {
      name: "phone",
      type: "text",
      admin: { position: "sidebar", description: "Display/JSON-LD telephone. Digits + country code." },
    },
    {
      name: "whatsapp",
      type: "text",
      admin: { position: "sidebar", description: "WhatsApp number used by every wa.me link." },
    },
    biText({ name: "currency", label: "Currency label", admin: { description: "e.g. ج.م / EGP" } }),
    mediaRef("logo", { label: "Logo" }),
    {
      name: "socialLinks",
      type: "array",
      label: "Social links",
      admin: { description: "Footer row is hidden entirely when empty." },
      fields: [
        {
          name: "platform",
          type: "select",
          required: true,
          options: ["facebook", "instagram", "tiktok", "snapchat", "youtube", "x"],
        },
        { name: "url", type: "text", required: true },
      ],
    },
    {
      name: "ctaBand",
      type: "group",
      label: "Pre-footer CTA band",
      fields: [
        biText({ name: "title", label: "Title" }),
        biTextarea({ name: "text", label: "Body" }),
        biText({ name: "primaryLabel", label: "Primary button label" }),
        biText({ name: "secondaryLabel", label: "Secondary button label" }),
      ],
    },
  ],
};

export const HomeContent: GlobalConfig = {
  slug: "home-content",
  label: "Home copy",
  ...staffOnlyGlobal,
  fields: [
    {
      name: "heroSlides",
      type: "array",
      label: "Hero backdrop carousel",
      admin: { description: "Cross-faded photos. Falls back to bundled imagery when empty." },
      fields: [
        {
          name: "image",
          type: "upload",
          relationTo: "media",
          required: true,
          admin: { position: "sidebar" },
        } as Field,
      ],
    },
    biText({ name: "heroEyebrow", label: "Hero eyebrow" }),
    {
      name: "heroTitle",
      type: "group",
      label: "Hero heading",
      fields: [
        biText({ name: "before", label: "Text before highlight" }),
        biText({ name: "highlight", label: "Gold highlighted text" }),
        biText({ name: "after", label: "Text after highlight" }),
      ],
    },
    biTextarea({ name: "heroLead", label: "Hero lead" }),
    biText({ name: "heroBookLabel", label: "“Book now” label" }),
    biText({ name: "heroWhatsappLabel", label: "“WhatsApp” label" }),
    biText({ name: "heroStatFemaleStaff", label: "Female-staff claim label" }),
    biText({ name: "introTitle", label: "Intro heading" }),
    biTextarea({ name: "introLead", label: "Intro lead" }),
    biText({ name: "introCtaLabel", label: "“Why Shamah” link label" }),
    biText({ name: "servicesTitle", label: "Services heading" }),
    biTextarea({ name: "servicesLead", label: "Services lead" }),
    biText({ name: "offersTitle", label: "Offers heading" }),
    biTextarea({ name: "offersLead", label: "Offers lead" }),
    biText({ name: "branchesTitle", label: "Branches heading" }),
    biTextarea({ name: "branchesLead", label: "Branches lead" }),
    biText({ name: "journalTitle", label: "Journal heading" }),
    biTextarea({ name: "journalLead", label: "Journal lead" }),
    {
      name: "viewAllLabels",
      type: "group",
      label: "“View all” link labels",
      fields: [
        biText({ name: "services", label: "All services" }),
        biText({ name: "offers", label: "All offers" }),
        biText({ name: "branches", label: "Branch details" }),
        biText({ name: "journal", label: "All articles" }),
      ],
    },
  ],
};

/**
 * Which home bands render and in what order, with the per-band card cap. A band
 * with no published items still collapses at render time; this only drives the
 * deliberate order + the "at most N cards" rule the components already enforce.
 */
export const HomeLayout: GlobalConfig = {
  slug: "home-layout",
  label: "Home layout",
  ...staffOnlyGlobal,
  fields: [
    {
      name: "bands",
      type: "array",
      label: "Bands (top to bottom)",
      admin: { description: "Drag to reorder. Unchecking hides a band without deleting its content." },
      fields: [
        {
          name: "band",
          type: "select",
          required: true,
          options: ["intro", "services", "offers", "branches", "journal", "results", "doctors"],
        },
        { name: "enabled", type: "checkbox", defaultValue: true },
        {
          name: "cardCap",
          type: "number",
          defaultValue: 3,
          min: 1,
          max: 8,
          admin: { description: "Home shows at most this many cards before “view all”." },
        },
      ],
    },
  ],
};

export const SeoDefaults: GlobalConfig = {
  slug: "seo-defaults",
  label: "SEO defaults",
  ...staffOnlyGlobal,
  fields: [
    biText({ name: "titleSuffix", label: "Title suffix (after the page name)" }),
    biTextarea({ name: "description", label: "Default meta description" }),
    mediaRef("defaultImage", { label: "Default social share image" }),
    { name: "twitterHandle", type: "text", admin: { position: "sidebar" } },
    biText({ name: "orgLegalName", label: "Organization legal name (JSON-LD)" }),
    seoFields,
  ],
};

export const globals = [SiteSettings, HomeContent, HomeLayout, SeoDefaults];
