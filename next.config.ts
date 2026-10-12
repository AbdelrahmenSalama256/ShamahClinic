import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ISR pages keep serving from cache while the next render refreshes WordPress,
  // so no visitor waits on the CMS host.
  expireTime: 3600,
  // Content comes from the committed snapshot during prerender, so this is only
  // a safety net for an unusually heavy page — not a wait on WordPress.
  staticPageGenerationTimeout: 120,
  experimental: {
    // Modest prerender concurrency keeps local CPU/memory predictable.
    cpus: 2,
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

export default nextConfig;
