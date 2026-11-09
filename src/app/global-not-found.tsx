import type { Metadata, Viewport } from "next";
import NotFoundDocument, {
  notFoundMetadata,
  notFoundViewport,
} from "@/components/pages/NotFoundDocument";

/**
 * URLs that match no route are answered here — the render bypasses the `[lang]`
 * layout entirely, which is the only layout this app has (`experimental.globalNotFound`).
 *
 * Needs `next build --webpack`: a Turbopack production build compiles this file but
 * still serves the built-in 404 document.
 */
export const viewport: Viewport = notFoundViewport;

export async function generateMetadata(): Promise<Metadata> {
  return notFoundMetadata();
}

export default function GlobalNotFound() {
  return <NotFoundDocument source="global" />;
}
