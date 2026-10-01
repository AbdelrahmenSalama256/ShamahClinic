import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/en", destination: "/" },
      { source: "/en/:path*", destination: "/:path*" },
      { source: "/ar", destination: "/" },
      { source: "/ar/:path*", destination: "/:path*" },
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
    ],
  },
};

export default nextConfig;
