import { redirectsHandler } from '@/lib/content/redirects-api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return redirectsHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  return redirectsHandler(req);
}
