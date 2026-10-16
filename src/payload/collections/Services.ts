import type { CollectionConfig } from "payload";
import { draftedContent } from "../collectionBase";
import {
  biList,
  biRichtext,
  biText,
  biTextarea,
  featuredField,
  mediaRef,
  orderField,
  seoFields,
  slugField,
} from "../fields";

export const Services: CollectionConfig = draftedContent("services", {
  labels: { singular: "service / treatment", plural: "services" },
  admin: {
    useAsTitle: "name",
    description:
      "Treatments on /services (aka /treatments) and, when pinned, the home services band.",
    defaultColumns: ["name", "categoryName", "priceStartingAt", "featured"],
  },
  fields: [
    slugField(),
    biText({ name: "name", label: "Name", required: true }),
    biTextarea({ name: "tagline", label: "Tagline (2 lines on cards)" }),
    biTextarea({ name: "description", label: "Short description" }),
    mediaRef("image", { label: "Photo" }),
    {
      name: "category",
      type: "text",
      index: true,
      admin: { position: "sidebar", description: "Slug of the treatment category, if any." },
    },
    biText({ name: "categoryName", label: "Category badge" }),
    {
      name: "priceStartingAt",
      type: "number",
      admin: {
        position: "sidebar",
        description: "Leave empty when no verified price exists — the card hides the price line.",
      },
    },
    biText({ name: "duration", label: "Session duration" }),
    biText({ name: "sessionsRecommended", label: "Sessions recommended" }),
    biTextarea({ name: "idealFor", label: "Ideal for" }),
    biList("benefits", "Benefits"),
    biList("steps", "How it works (steps)"),
    biList("aftercare", "Aftercare"),
    biRichtext({ name: "body", label: "Long-form detail" }),
    featuredField("Pin to home services band"),
    orderField,
    seoFields,
  ],
});
