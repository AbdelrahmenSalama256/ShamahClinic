import { meHandler } from '@/lib/auth/login';

export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return meHandler(req);
}
