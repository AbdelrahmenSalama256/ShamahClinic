import type { CollectionConfig } from "payload";
import { staffOnly } from "../access";
import { biText, slugField } from "../fields";
import { revalidateAfterChange, revalidateAfterDelete } from "../hooks";

export const Categories: CollectionConfig = {
  slug: "categories",
  labels: { singular: "journal category", plural: "journal categories" },
  access: {
    // Taxonomies are not gated by draft status; everyone reads them.
    read: () => true,
    create: staffOnly,
    update: staffOnly,
    delete: staffOnly,
  },
  hooks: {
    afterChange: [revalidateAfterChange("categories")],
    afterDelete: [revalidateAfterDelete("categories")],
  },
  admin: { useAsTitle: "name", description: "Category chips on the journal list." },
  fields: [slugField(), biText({ name: "name", label: "Name", required: true })],
};
