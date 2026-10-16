import type { CollectionConfig } from "payload";
import { draftedContent } from "../collectionBase";
import { biList, biText, biTextarea, mediaRef, seoFields, slugField } from "../fields";

export const Pages: CollectionConfig = draftedContent("pages", {
  labels: { singular: "page", plural: "pages" },
  admin: {
    description: "Single pages such as About and Privacy. The slug is the URL segment.",
    defaultColumns: ["title", "slug"],
  },
  fields: [
    slugField(),
    biText({ name: "title", label: "Title", required: true }),
    biTextarea({ name: "lead", label: "Lead paragraph" }),
    {
      name: "sections",
      type: "array",
      label: "Sections",
      admin: { description: "Heading + copy + optional image, in display order." },
      fields: [
        biText({ name: "heading", label: "Heading" }),
        biList("paragraphs", "Paragraphs"),
        mediaRef("image", { label: "Section image" }),
      ],
    },
    {
      name: "lastUpdated",
      type: "date",
      admin: { position: "sidebar", description: "Shown on the privacy page as the revision date." },
    },
    seoFields,
  ],
});
