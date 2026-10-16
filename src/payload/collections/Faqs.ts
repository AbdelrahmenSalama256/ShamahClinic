import type { CollectionConfig } from "payload";
import { draftedContent } from "../collectionBase";
import { biText, biTextarea } from "../fields";

export const Faqs: CollectionConfig = draftedContent("faqs", {
  labels: { singular: "FAQ", plural: "FAQs" },
  admin: {
    useAsTitle: "question",
    description: "Grouped on /faq by category. Only published items feed the FAQPage JSON-LD.",
    defaultColumns: ["question", "category"],
    listSearchableFields: ["question", "answer"],
  },
  fields: [
    biText({ name: "question", label: "Question", required: true }),
    biTextarea({ name: "answer", label: "Answer", required: true }),
    biText({ name: "category", label: "Category group" }),
    { name: "order", type: "number", defaultValue: 0, admin: { position: "sidebar" } },
  ],
});
