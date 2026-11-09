import { redirectsHandler } from '@/lib/content/redirects-api';

export const runtime = 'nodejs';

export async function PATCH(req: Request): Promise<Response> {
  return redirectsHandler(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return redirectsHandler(req);
}
