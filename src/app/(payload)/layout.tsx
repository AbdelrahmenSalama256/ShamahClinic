import type { ServerFunctionClient } from "payload";
import { RootLayout, handleServerFunctions } from "@payloadcms/next/layouts";
import "@payloadcms/next/css";

import configPromise from "@payload-config";
import { importMap } from "./admin/importMap.js";

// Payload supplies the base admin metadata (favicon, title suffix from config).
export { metadata } from "@payloadcms/next/layouts";

// Payload 3.90 splits the server-function API: `handleServerFunctions` is the
// server handler (needs config + importMap), while RootLayout wants the thin
// client wrapper that the admin tree calls. It is handed to `RootProvider` (a
// Client Component), so it must be a Server Action — the "use server" directive
// is what lets Next serialize it across the boundary; without it the admin 500s
// with "Functions cannot be passed directly to Client Components".
const serverFunction: ServerFunctionClient = async ({ args, name }) => {
  "use server";
  return handleServerFunctions({ config: configPromise, importMap, args, name });
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // RootLayout renders the <html>/<body> for this route group, so the admin
  // coexists with the public [lang] site (which renders its own) without a
  // shared root layout.
  return (
    <RootLayout config={configPromise} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  );
}
