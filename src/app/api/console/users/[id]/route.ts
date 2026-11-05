import { userHandler } from '@/lib/users/api';

export const runtime = 'nodejs';

/** `PATCH` an account's name, language, role or status. Accounts are disabled, never deleted. */
export async function PATCH(req: Request): Promise<Response> {
  return userHandler(req);
}
