import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PostHog reverse proxy (/ingest) calls paths with trailing slashes; do not redirect them.
  skipTrailingSlashRedirect: true,
  images: {
    // Supabase resizes Storage images; Vercel's optimizer is off (Hobby quota). See src/lib/image-loader.ts.
    loader: "custom",
    loaderFile: "./src/lib/image-loader.ts",
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "*.b-cdn.net" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: {
    authInterrupts: true, // enables forbidden() → real 403 for /studio
    serverActions: { bodySizeLimit: "3mb" }, // thumbnails ≤ 2MB
  },
  async redirects() {
    // The old production host keeps serving a duplicate site. Send people (and Google) to the real domain;
    // /api stays reachable there because payment/video webhooks are registered against it.
    return [
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "topj-grind.vercel.app" }],
        destination: "https://topjgrind.com/:path",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    // Analytics goes through our own domain so ad blockers do not drop it. Static assets first (more specific).
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
