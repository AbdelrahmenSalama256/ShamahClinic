import type { Metadata, Viewport } from "next";
import NotFoundDocument, {
  notFoundMetadata,
  notFoundViewport,
} from "@/components/pages/NotFoundDocument";

/**
 * A page that calls `notFound()` is answered here, while URLs that match no route at
 * all go to `src/app/global-not-found.tsx`. Both render outside `src/app/[lang]/layout.tsx`,
 * so both compose the full document through the same component.
 */
export const viewport: Viewport = notFoundViewport;

export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata();
}

export default NotFoundDocument;
