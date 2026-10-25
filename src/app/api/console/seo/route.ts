import { seoHandler } from '@/lib/content/seo-api';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  return seoHandler(req);
}
