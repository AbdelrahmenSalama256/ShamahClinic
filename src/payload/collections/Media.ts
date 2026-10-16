import type { CollectionConfig } from "payload";
import { staffOrPublished, staffOnly } from "../access";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const MB = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Payload exposes no per-collection `maxFileSize`, so the cap is enforced here
 * after the upload field has populated `data.size` but before anything is
 * persisted. `beforeValidate` runs first for create and update alike.
 */
const enforceSizeLimit = async ({ data }: { data?: { size?: number } }): Promise<void> => {
  if (typeof data?.size === "number" && data.size > MAX_BYTES) {
    throw new Error(`File is ${MB(data.size)} — the limit is ${MB(MAX_BYTES)}.`);
  }
};

export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "media item", plural: "media library" },
  access: {
    read: staffOrPublished,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  hooks: {
    beforeValidate: [enforceSizeLimit],
  },
  upload: {
    staticDir: "media",
    mimeTypes: ["image/*"],
    // Cap the stored original to a sane max width; smaller uploads are kept as-is.
    resizeOptions: { width: 1600, withoutEnlargement: true },
    adminThumbnail: "card",
    // Derivatives are emitted as WebP by sharp; the site then serves them
    // directly (or re-optimises via next/image, which adds AVIF on request).
    imageSizes: [
      { name: "hero", width: 1600, formatOptions: { format: "webp" } },
      { name: "banner", width: 1400, formatOptions: { format: "webp" } },
      { name: "card", width: 800, formatOptions: { format: "webp" } },
      { name: "thumb", width: 400, formatOptions: { format: "webp" } },
    ],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      label: "Alt text",
      required: true,
      localized: true,
      admin: {
        description: "Describe the image for screen readers and SEO. Arabic and English separately.",
      },
    },
    { name: "caption", type: "textarea", localized: true },
    // Focal point (focalX / focalY) fields are added automatically by Payload.
  ],
};
