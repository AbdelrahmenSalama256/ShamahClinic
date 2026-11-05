import { contentCollectionHandler } from '@/lib/content/api';

export const runtime = 'nodejs';

/** `GET` the rows of one kind, `POST` a new one. Everything else is in `@/lib/content/api`. */
export async function GET(req: Request): Promise<Response> {
  return contentCollectionHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  return contentCollectionHandler(req);
}
