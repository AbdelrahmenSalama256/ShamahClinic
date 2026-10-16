import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";

import { collections } from "./payload/collections";
import { globals } from "./payload/globals";

const dirname = path.dirname(fileURLToPath(import.meta.url));
// The config sits in `src/`, so the repo root is one level up. Resolve every
// generated artifact against the root, not `dirname`, to avoid `src/src/...`.
const rootDir = path.resolve(dirname, "..");

// The admin runs inside this Next app, which renders its own <html> per top-level
// route group, so Payload's RootLayout lives under src/app/(payload) and shares no
// layout with the public [lang] site.

/**
 * Neon's pooled connection (PgBouncer in transaction mode) cannot run the DDL that
 * Payload's migrations emit, so migrations must target the direct endpoint. The
 * migrate script sets DB_CONNECTION=direct; the app itself uses the pooled URI for
 * connection reuse on serverless.
 */
const isDirectConnection = process.env.DB_CONNECTION === "direct";
const connectionString = isDirectConnection
  ? process.env.DATABASE_URI_DIRECT
  : process.env.DATABASE_URI;

if (!connectionString) {
  throw new Error(
    isDirectConnection
      ? "DATABASE_URI_DIRECT is required for migrations."
      : "DATABASE_URI is required at runtime.",
  );
}

const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!process.env.PAYLOAD_SECRET) {
  throw new Error("PAYLOAD_SECRET is required (signs the auth JWT).");
}

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET,
  // Payload's own absolute base for REST/JSON responses and generated links.
  serverURL: siteUrl,
  admin: {
    user: "users",
    meta: {
      titleSuffix: "· Shamah admin",
    },
    // AR is the default, RTL-first admin (Phase 4 themes this).
    dateFormat: "YYYY-MM-DD HH:mm",
    importMap: {
      importMapFile: path.resolve(rootDir, "src/app/(payload)/admin/importMap.js"),
    },
  },
  // Payload's admin panel mounts at /admin (top-level, not under `admin`).
  routes: { admin: "/admin" },
  db: postgresAdapter({
    pool: { connectionString },
    idType: "uuid",
    migrationDir: path.resolve(rootDir, "src/payload/migrations"),
  }),
  editor: lexicalEditor(),
  localization: {
    locales: [
      { code: "ar", label: "العربية", rtl: true },
      { code: "en", label: "English", rtl: false },
    ],
    defaultLocale: "ar",
    // Arabic is authored first; an untranslated English field falls back to Arabic,
    // which Phase 3's lib/cms mirrors when it maps locale reads onto the Bi shape.
    fallback: true,
  },
  collections,
  globals,
  graphQL: { disable: true },
  cors: [siteUrl],
  cookiePrefix: "shamah",
  plugins: [
    vercelBlobStorage({
      // When the token is absent (a fresh clone) fall back to local disk uploads so
      // `payload dev` still boots; production always sets the token.
      enabled: Boolean(blobToken),
      token: blobToken,
      collections: { media: { prefix: "media" } },
      addRandomSuffix: true,
      access: "public",
    }),
  ],
  typescript: {
    outputFile: path.resolve(rootDir, "src/payload-types.ts"),
  },
});
