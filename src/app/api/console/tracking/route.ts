import { trackingHandler, type PublicPageReader } from '@/lib/integrations/api';

export const runtime = 'nodejs';

/**
 * The one outbound request the console makes: asking our own origin for a page so
 * "Check installation" can look for the saved ID in the HTML the visitor receives.
 * It lives here rather than in `src/lib` because that tree is proved fetch-free.
 */
const readPublicPage: PublicPageReader = async (url) => {
  const res = await fetch(url, { cache: 'no-store' });
  return res.ok ? res.text() : null;
};

export async function GET(req: Request): Promise<Response> {
  return trackingHandler(req);
}

export async function PATCH(req: Request): Promise<Response> {
  return trackingHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  return trackingHandler(req, readPublicPage);
}
