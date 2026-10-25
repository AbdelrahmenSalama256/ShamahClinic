import { mediaHandler } from '@/lib/media/api';

export const runtime = 'nodejs';

/** `GET` the newest pictures, `POST` an upload. Everything else is in `@/lib/media/api`. */
export async function GET(req: Request): Promise<Response> {
  return mediaHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  return mediaHandler(req);
}
