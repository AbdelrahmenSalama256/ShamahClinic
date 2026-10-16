import type { CollectionConfig } from "payload";
import { biTextarea } from "../fields";

type User = { id?: string | number; role?: string } | null | undefined;
const isAdmin = (user: User): boolean => user?.role === "admin";

// Auth collections require boolean access results (not a `Where` clause), so the
// self-vs-admin decision is made here rather than delegated to a query filter.
const selfOrAdmin = ({ req: { user }, id }: { req: { user: User }; id?: string | number }): boolean => {
  if (isAdmin(user)) return true;
  return user?.id != null && id != null && String(user.id) === String(id);
};
const adminBoolean = ({ req: { user } }: { req: { user: User } }): boolean => isAdmin(user);

export const Users: CollectionConfig = {
  slug: "users",
  auth: {
    // Brute-force protection: lock the account for 15 minutes after 5 failures.
    maxLoginAttempts: 5,
    lockTime: 1000 * 60 * 15,
    // Do not leak the JWT into REST login/refresh bodies.
    removeTokenFromResponses: true,
    tokenExpiration: 60 * 60 * 8, // one working day
    // Secure cookies; TLS is terminated by Vercel in production.
    cookies: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
    },
  },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "role"],
    enableRichTextLink: false,
  },
  access: {
    admin: adminBoolean,
    read: selfOrAdmin,
    // No self-service signup — an account is created only by an admin (or by
    // Payload's first-user bootstrap on an empty database, which bypasses access).
    create: adminBoolean,
    update: selfOrAdmin,
    delete: adminBoolean,
  },
  fields: [
    { name: "name", type: "text", label: "Display name" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "editor",
      options: [
        { label: { en: "Administrator", ar: "مدير" }, value: "admin" },
        { label: { en: "Editor", ar: "محرر" }, value: "editor" },
      ],
      // Changing your own role would be privilege escalation — admins only.
      access: { update: adminBoolean, read: adminBoolean },
    },
    biTextarea({ name: "bio", admin: { position: "right" } }),
  ],
};
