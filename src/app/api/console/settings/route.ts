import { settingsHandler } from '@/lib/content/api';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return settingsHandler(req);
}

export async function PATCH(req: Request): Promise<Response> {
  return settingsHandler(req);
}
