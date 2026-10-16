import type { CollectionConfig, Field } from "payload";
import { draftedContent } from "../collectionBase";
import { biRichtext, biText, biTextarea, mediaRef, seoFields, slugField } from "../fields";

export const Posts: CollectionConfig = draftedContent("posts", {
  labels: { singular: "journal article", plural: "journal" },
  admin: {
    description: "Blog/journal articles. The /results page reads those flagged as a result story.",
    defaultColumns: ["title", "date", "categories", "resultStory"],
    listSearchableFields: ["title", "excerpt"],
  },
  fields: [
    slugField(),
    biText({ name: "title", label: "Title", required: true }),
    biTextarea({ name: "excerpt", label: "Excerpt" }),
    biRichtext({ name: "content", label: "Body", required: true }),
    mediaRef("image", { label: "Cover image" }),
    {
      name: "date",
      type: "date",
      required: true,
      index: true,
      admin: { date: { pickerAppearance: "dayAndTime" }, position: "right" },
    } as Field,
    {
      name: "categories",
      type: "relationship",
      relationTo: "categories",
      hasMany: true,
      index: true,
      admin: { position: "sidebar" },
    },
    {
      name: "resultStory",
      type: "checkbox",
      label: "Result story",
      admin: {
        position: "sidebar",
        description: "Also surface this article on the /results page.",
      },
      defaultValue: false,
    },
    seoFields,
  ],
});
