import { heroHandler } from '@/lib/hero/api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return heroHandler(req);
}

export async function PATCH(req: Request): Promise<Response> {
  return heroHandler(req);
}

export async function PUT(req: Request): Promise<Response> {
  return heroHandler(req);
}
