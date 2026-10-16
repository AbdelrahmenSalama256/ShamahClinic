import type { CollectionConfig } from "payload";
import { draftedContent } from "../collectionBase";
import { biList, biText, biTextarea, mediaRef } from "../fields";

export const Specialists: CollectionConfig = draftedContent("specialists", {
  labels: { singular: "specialist", plural: "specialists" },
  admin: {
    useAsTitle: "name",
    description: "The /doctors page. Keep unpublished until each profile is verified.",
    defaultColumns: ["name", "title"],
  },
  fields: [
    biText({ name: "name", label: "Full name", required: true }),
    biText({ name: "title", label: "Title / specialty" }),
    biText({ name: "credentials", label: "Credentials" }),
    biTextarea({ name: "bio", label: "Bio" }),
    biList("specialties", "Focus areas"),
    { name: "experienceYears", type: "number", min: 0, admin: { position: "sidebar" } },
    {
      name: "branches",
      type: "relationship",
      relationTo: "branches",
      hasMany: true,
      admin: { position: "sidebar", description: "Branch pills shown on the card." },
    },
    mediaRef("image", { label: "Portrait" }),
    { name: "order", type: "number", admin: { position: "sidebar" } },
  ],
});
