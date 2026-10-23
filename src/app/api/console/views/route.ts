import { viewsHandler } from '@/lib/console/views-route';

export const runtime = 'nodejs';

/** `GET` one kind's saved filters, `POST` a new one. Everything else is in `@/lib/console/views-route`. */
export async function GET(req: Request): Promise<Response> {
  return viewsHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  return viewsHandler(req);
}
