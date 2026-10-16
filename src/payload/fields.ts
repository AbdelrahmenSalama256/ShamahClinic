import type { Field } from "payload";

/**
 * The public site renders a bilingual `Bi { ar, en }` for most copy today.
 * Payload expresses that as a single `localized: true` field, which stores an
 * independent value per locale — the `lib/cms` getters in Phase 3 map a locale
 * read back onto the existing `Bi` shape, so nothing here needs to be an AR/EN
 * object.
 *
 * Each helper casts to `Field`: Payload's `Field` is a wide discriminated union,
 * and an inline literal carrying `admin`/`localized` gets over-narrowed by the
 * compiler when the discriminating `type` comes from a spread. The cast is the
 * documented, version-stable way to keep a bilingual factory typed.
 */
export const biText = (overrides: Record<string, unknown> & { name: string }): Field =>
  ({ type: "text", localized: true, ...overrides }) as Field;

export const biTextarea = (overrides: Record<string, unknown> & { name: string }): Field =>
  ({ type: "textarea", localized: true, ...overrides }) as Field;

export const biRichtext = (overrides: Record<string, unknown> & { name: string }): Field =>
  ({ type: "richText", localized: true, ...overrides }) as Field;

/** A bilingual bullet list. Localizing the whole array (not just the item text)
 *  lets the Arabic and English versions hold a different number of items. */
export const biList = (name: string, label: string): Field =>
  ({
    name,
    label,
    type: "array",
    localized: true,
    admin: { description: "Leave empty to hide this list in the UI." },
    fields: [{ name: "text", type: "textarea", required: true }],
  }) as Field;

/** Shared media reference — the file itself is locale-neutral, its alt is not. */
export const mediaRef = (
  name: string,
  opts: { required?: boolean; many?: boolean; label?: string } = {},
): Field =>
  ({
    name,
    type: "upload",
    relationTo: "media",
    required: opts.required ?? false,
    ...(opts.many ? { hasMany: true } : {}),
    ...(opts.label ? { label: opts.label } : {}),
  }) as Field;

/** URL slugs are identical across `ar` and `en` (the lang lives in the path),
 *  so these are deliberately NOT localized. */
export const slugField = (overrides: Record<string, unknown> = {}): Field =>
  ({
    name: "slug",
    type: "text",
    required: true,
    unique: true,
    index: true,
    admin: { description: "Used verbatim in the URL for both languages. Lowercase, hyphenated." },
    ...overrides,
  }) as Field;

export const orderField: Field = {
  name: "order",
  type: "number",
  admin: {
    position: "right",
    description: "Lower numbers sort first. Only used where the item is pinned.",
  },
} as Field;

export const featuredField = (label = "Pin to homepage"): Field =>
  ({
    name: "featured",
    type: "checkbox",
    label,
    defaultValue: false,
    admin: {
      description: "Home shows at most three pinned items; extra pins are ignored by the renderer.",
    },
  }) as Field;

/** Collapsed per-locale SEO overrides. Falls back to the `seoDefaults` global
 *  when empty, so a page never emits an empty canonical/og field. */
export const seoFields: Field = {
  name: "seo",
  label: "SEO",
  type: "group",
  admin: { description: "Leave blank to inherit the site defaults." },
  fields: [
    biText({ name: "title", label: "Meta title override" }),
    biTextarea({ name: "description", label: "Meta description override" }),
    mediaRef("image", { label: "Social share image" }),
    { name: "noIndex", type: "checkbox", localized: false, defaultValue: false },
  ],
} as Field;
