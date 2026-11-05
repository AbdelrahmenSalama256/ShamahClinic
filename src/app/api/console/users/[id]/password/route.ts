import { userPasswordHandler } from '@/lib/users/api';

export const runtime = 'nodejs';

/** `POST` a temporary password for an account. Every one of its sessions is revoked. */
export async function POST(req: Request): Promise<Response> {
  return userPasswordHandler(req);
}
