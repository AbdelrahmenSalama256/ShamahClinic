import { contentActionHandler } from '@/lib/content/api';

export const runtime = 'nodejs';

/** `GET .../revisions` — the history, which is never garbage-collected. */
export async function GET(req: Request): Promise<Response> {
  return contentActionHandler(req);
}

/** `POST .../publish`, `.../restore` or `.../rollback`. */
export async function POST(req: Request): Promise<Response> {
  return contentActionHandler(req);
}
