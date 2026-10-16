import type { CollectionConfig } from "payload";
import { draftedContent } from "../collectionBase";
import { biText, mediaRef } from "../fields";

export const Results: CollectionConfig = draftedContent("results", {
  labels: { singular: "before / after case", plural: "results gallery" },
  admin: {
    useAsTitle: "treatment",
    description:
      "Illustrative cases. Keep unpublished until real, consented photography exists (the live page discloses no before/after imagery).",
    defaultColumns: ["treatment", "area"],
  },
  fields: [
    biText({ name: "treatment", label: "Treatment", required: true }),
    biText({ name: "area", label: "Area" }),
    biText({ name: "sessions", label: "Sessions" }),
    biText({ name: "note", label: "Note" }),
    mediaRef("before", { label: "Before" }),
    mediaRef("after", { label: "After" }),
    { name: "order", type: "number", admin: { position: "sidebar" } },
  ],
});
