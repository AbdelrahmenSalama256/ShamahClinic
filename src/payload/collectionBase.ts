import type { CollectionConfig } from "payload";
import { contentUpdate, staffOrPublished, staffOnly } from "./access";
import { revalidateAfterChange, revalidateAfterDelete } from "./hooks";

/**
 * The shared spine for every publicly-rendered content collection: drafts with
 * autosave, published-only reads for anonymous visitors, and on-demand
 * revalidation of both locales on save/delete. `slug` is passed to the hooks so
 * each collection revalidates only the routes it actually feeds.
 */
export const draftedContent = (
  slug: string,
  rest: Partial<CollectionConfig> & Pick<CollectionConfig, "fields">,
): CollectionConfig => ({
  slug,
  versions: {
    drafts: {
      autosave: { interval: 5 },
      schedulePublish: false,
    },
    maxPerDoc: 30,
  },
  access: {
    read: staffOrPublished,
    create: staffOnly,
    update: contentUpdate,
    delete: staffOnly,
    ...(rest.access ?? {}),
  },
  hooks: {
    afterChange: [revalidateAfterChange(slug)],
    afterDelete: [revalidateAfterDelete(slug)],
    ...(rest.hooks ?? {}),
  },
  admin: {
    useAsTitle: "title",
    ...(rest.admin ?? {}),
  },
  ...rest,
});
