import { updatePrefsHandler } from '@/lib/console/prefs-route';

export const runtime = 'nodejs';

export async function PATCH(req: Request): Promise<Response> {
  return updatePrefsHandler(req);
}
