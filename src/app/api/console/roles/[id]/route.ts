import { roleHandler } from '@/lib/users/api';

export const runtime = 'nodejs';

/** `PATCH` a custom role's name, description and grants; `DELETE` one no account holds. */
export async function PATCH(req: Request): Promise<Response> {
  return roleHandler(req);
}

export async function DELETE(req: Request): Promise<Response> {
  return roleHandler(req);
}
