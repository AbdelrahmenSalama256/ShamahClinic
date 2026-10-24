import { usersHandler } from '@/lib/users/api';

export const runtime = 'nodejs';

/** `GET` one page of accounts, `POST` a new one. Everything else is in `@/lib/users/api`. */
export async function GET(req: Request): Promise<Response> {
  return usersHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  return usersHandler(req);
}
