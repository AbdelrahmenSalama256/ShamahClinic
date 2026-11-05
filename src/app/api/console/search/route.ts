import { searchHandler } from '@/lib/console/search-route';

export const runtime = 'nodejs';

/** `GET` the titled rows this caller may read. Everything else is in `@/lib/console/search-route`. */
export async function GET(req: Request): Promise<Response> {
  return searchHandler(req);
}
