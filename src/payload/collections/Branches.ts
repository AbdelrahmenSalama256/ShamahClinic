import type { CollectionConfig } from "payload";
import { draftedContent } from "../collectionBase";
import { biList, biText, biTextarea, mediaRef, slugField } from "../fields";

export const Branches: CollectionConfig = draftedContent("branches", {
  labels: { singular: "branch", plural: "branches" },
  admin: {
    useAsTitle: "name",
    description: "Clinic locations feeding /branches, the home branches band and contact.",
    defaultColumns: ["name", "area"],
  },
  fields: [
    slugField(),
    biText({ name: "name", label: "Name", required: true }),
    biText({ name: "area", label: "Area / district" }),
    biTextarea({ name: "address", label: "Address" }),
    {
      name: "phone",
      type: "text",
      admin: { position: "sidebar", description: "Digits with country code, no spaces." },
    },
    biText({ name: "landmark", label: "Nearest landmark" }),
    biTextarea({ name: "intro", label: "Intro" }),
    biList("features", "Branch features"),
    mediaRef("image", { label: "Photo" }),
    { name: "order", type: "number", defaultValue: 0, admin: { position: "sidebar" } },
  ],
});
