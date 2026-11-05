import { rolesHandler } from '@/lib/users/api';

export const runtime = 'nodejs';

/** `GET` every role with its grants, `POST` a custom one. */
export async function GET(req: Request): Promise<Response> {
  return rolesHandler(req);
}

export async function POST(req: Request): Promise<Response> {
  return rolesHandler(req);
}
