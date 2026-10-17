import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // SiteDash: @sitedash/* ship TypeScript source whose internal imports use Node ESM
  // `.js` specifiers, so the bundler transpiles them and resolves `.js` -> `.ts`.
  transpilePackages: ["@sitedash/core", "@sitedash/db", "@sitedash/ui"],
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] };
    return config;
  },
  // A throwaway build dir so a one-off production build (SEO/curl checks, bundle
  // measurement) can run without rewriting the `.next` cache a live `next dev`
  // server is watching. Unset means the normal `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // ISR pages keep serving from cache while the next render refreshes WordPress,
  // so no visitor waits on the CMS host.
  expireTime: 3600,
  // Content comes from the committed snapshot during prerender, so this is only
  // a safety net for an unusually heavy page — not a wait on WordPress.
  staticPageGenerationTimeout: 120,
  experimental: {
    // Modest prerender concurrency keeps local CPU/memory predictable.
    cpus: 2,
    // A not-found render has no layouts above it, and the only layout here is the
    // `[lang]` dynamic segment — so the 404 document is composed by
    // `src/app/global-not-found.tsx` instead.
    globalNotFound: true,
  },
  async redirects() {
    return [
      {
        source: "/journal/:path*",
        destination: "/blogs/:path*",
        permanent: true,
      },
      {
        source: "/ar/journal/:path*",
        destination: "/ar/blogs/:path*",
        permanent: true,
      },
      {
        source: "/en/journal/:path*",
        destination: "/en/blogs/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    // Serve modern formats for all raster photography.
    formats: ["image/avif", "image/webp"],
    // The brand wordmark is a local, trusted SVG in /public/images.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "shamahclinics.com",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "www.shamahclinics.com",
        pathname: "/wp-content/**",
      },
    ],
  },
};

export default withPayload(nextConfig);
