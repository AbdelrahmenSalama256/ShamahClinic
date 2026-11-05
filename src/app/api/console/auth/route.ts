import { loginHandler, logoutHandler } from '@/lib/auth/login';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  return loginHandler(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return logoutHandler(req);
}
