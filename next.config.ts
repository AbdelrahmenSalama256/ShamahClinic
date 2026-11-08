import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A throwaway build dir so a one-off production build (SEO/curl checks, bundle
  // measurement) can run without rewriting the `.next` cache a live `next dev`
  // server is watching. Unset means the normal `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  productionBrowserSourceMaps: true,
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
      {
        source: "/treatments/:path*",
        destination: "/services/:path*",
        permanent: true,
      },
      {
        source: "/ar/treatments/:path*",
        destination: "/ar/services/:path*",
        permanent: true,
      },
      {
        source: "/en/treatments/:path*",
        destination: "/en/services/:path*",
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

export default nextConfig;
