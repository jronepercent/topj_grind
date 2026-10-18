export const revalidate = 3600;

import type { MetadataRoute } from "next";
import { listContent, playlistsWithMeta } from "@/lib/server/queries";
import { contentHref } from "@/lib/format";
import { articleSitemap } from "@/lib/server/community";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://topjgrind.com";

/** Public content only. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const content = await listContent({ visibility: "public", limit: 5000 });
  const articles = await articleSitemap().catch(() => []);
  return [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/community`, changeFrequency: "daily" },
    { url: `${SITE}/community/articles`, changeFrequency: "daily" },
    { url: `${SITE}/podcasts`, changeFrequency: "weekly" },
    { url: `${SITE}/about`, changeFrequency: "monthly" },
    { url: `${SITE}/membership`, changeFrequency: "monthly" },
    ...content.map((c) => ({ url: `${SITE}${contentHref(c)}`, lastModified: c.updated_at })),
    ...articles.map((a) => ({ url: `${SITE}/community/articles/${a.id}`, lastModified: a.updated_at })),
    ...(await playlistsWithMeta(null))
      .filter((p) => p.visibility === "public")
      .map((p) => ({ url: `${SITE}/playlists/${p.id}` })),
  ];
}
