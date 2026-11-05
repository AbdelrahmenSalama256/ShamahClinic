import { changePasswordHandler } from '@/lib/auth/login';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  return changePasswordHandler(req);
}
