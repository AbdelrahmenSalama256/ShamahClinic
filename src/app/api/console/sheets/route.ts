import { sheetsHandler } from '@/lib/integrations/api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return sheetsHandler(req);
}

export async function PATCH(req: Request): Promise<Response> {
  return sheetsHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  return sheetsHandler(req);
}
