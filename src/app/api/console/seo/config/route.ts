import { seoConfigHandler } from '@/lib/content/seo-api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return seoConfigHandler(req);
}

export async function PATCH(req: Request): Promise<Response> {
  return seoConfigHandler(req);
}
