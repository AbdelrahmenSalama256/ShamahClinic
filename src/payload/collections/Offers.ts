import type { CollectionConfig } from "payload";
import { draftedContent } from "../collectionBase";
import {
  biRichtext,
  biText,
  biTextarea,
  featuredField,
  mediaRef,
  orderField,
  seoFields,
  slugField,
} from "../fields";

export const Offers: CollectionConfig = draftedContent("offers", {
  labels: { singular: "seasonal offer", plural: "seasonal offers" },
  admin: {
    useAsTitle: "name",
    description: "Packages shown on /offers and, when pinned, on the home offers band.",
    defaultColumns: ["name", "price", "onSale", "featured"],
  },
  fields: [
    slugField(),
    biText({ name: "name", label: "Name", required: true }),
    biTextarea({ name: "excerpt", label: "Short description" }),
    biRichtext({ name: "description", label: "Full description" }),
    mediaRef("images", { many: true, label: "Gallery" }),
    {
      name: "offerCategories",
      type: "relationship",
      relationTo: "offer-categories",
      hasMany: true,
      admin: { position: "sidebar" },
    },
    { name: "regularPrice", type: "number", admin: { position: "sidebar" } },
    { name: "salePrice", type: "number", admin: { position: "sidebar" } },
    {
      name: "price",
      type: "number",
      index: true,
      admin: {
        position: "sidebar",
        description: "The price actually displayed. Enter in whole currency units.",
      },
    },
    {
      name: "currency",
      type: "text",
      localized: true,
      admin: { position: "sidebar", description: "Leave blank to inherit the site currency label." },
    },
    { name: "discountPercent", type: "number", min: 0, max: 100, admin: { position: "sidebar" } },
    { name: "onSale", type: "checkbox", defaultValue: false, admin: { position: "sidebar" } },
    biText({ name: "badge", label: "Badge text" }),
    { name: "popular", type: "checkbox", defaultValue: false, admin: { position: "sidebar" } },
    {
      name: "href",
      type: "text",
      admin: { position: "sidebar", description: "Optional external link; otherwise links to the offer page." },
    },
    featuredField("Pin to home offers band"),
    orderField,
    seoFields,
  ],
});
