import type { Access } from "payload";

/**
 * Roles: `admin` manages people + site settings; `editor` (and admin) manage
 * content. `req.user` is the bound user document, so `role` is available without
 * an extra query.
 */
type User = { id: string | number; role?: "admin" | "editor" } | null | undefined;

const isAdmin = (user: User): boolean => user?.role === "admin";
const isStaff = (user: User): boolean => Boolean(user);

export const adminOnly: Access = ({ req: { user } }) => isAdmin(user as User);

export const staffOnly: Access = ({ req: { user } }) => isStaff(user as User);

/**
 * Anonymous visitors may read published documents only — drafts and unreleased
 * versions stay behind login. Logged-in staff see everything.
 */
export const staffOrPublished: Access = ({ req: { user } }) =>
  isStaff(user as User) ? true : { status: { equals: "published" } };

/** Only staff may mutate content; the `status` field drives public visibility. */
export const contentUpdate: Access = ({ req: { user } }) => isStaff(user as User);

/** No self-service signup: an account is created only by an existing admin (or
 *  Payload's first-user bootstrap on an empty database, which bypasses access). */
export const usersCreate: Access = ({ req: { user } }) => isAdmin(user as User);
