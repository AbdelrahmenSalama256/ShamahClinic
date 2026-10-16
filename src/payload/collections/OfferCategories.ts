import type { CollectionConfig } from "payload";
import { staffOnly } from "../access";
import { biText, slugField } from "../fields";
import { revalidateAfterChange, revalidateAfterDelete } from "../hooks";

export const OfferCategories: CollectionConfig = {
  slug: "offer-categories",
  labels: { singular: "offer category", plural: "offer categories" },
  access: { read: () => true, create: staffOnly, update: staffOnly, delete: staffOnly },
  hooks: {
    afterChange: [revalidateAfterChange("offer-categories")],
    afterDelete: [revalidateAfterDelete("offer-categories")],
  },
  admin: { useAsTitle: "name" },
  fields: [slugField(), biText({ name: "name", label: "Name", required: true })],
};
