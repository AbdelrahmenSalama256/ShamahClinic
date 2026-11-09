import { promoHandler } from '@/lib/content/promo-api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return promoHandler(req);
}

export async function PATCH(req: Request): Promise<Response> {
  return promoHandler(req);
}
