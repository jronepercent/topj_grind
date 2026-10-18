import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://topjgrind.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/studio", "/account", "/api", "/library", "/membership/success", "/community/posts"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
