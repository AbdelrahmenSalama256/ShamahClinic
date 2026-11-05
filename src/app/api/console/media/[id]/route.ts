import { mediaHandler } from '@/lib/media/api';

export const runtime = 'nodejs';

/** `PATCH` a stored picture's alt text in both languages. */
export async function PATCH(req: Request): Promise<Response> {
  return mediaHandler(req);
}
