export const revalidate = 3600;

import type { MetadataRoute } from "next";
import { listContent, playlistsWithMeta } from "@/lib/server/queries";
import { contentHref } from "@/lib/format";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://topjgrind.com";

/** Public content only. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const content = await listContent({ visibility: "public", limit: 5000 });
  return [
    { url: `${SITE}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/shorts`, changeFrequency: "daily" },
    { url: `${SITE}/podcasts`, changeFrequency: "weekly" },
    { url: `${SITE}/about`, changeFrequency: "monthly" },
    { url: `${SITE}/membership`, changeFrequency: "monthly" },
    ...content.map((c) => ({ url: `${SITE}${contentHref(c)}`, lastModified: c.updated_at })),
    ...(await playlistsWithMeta(null))
      .filter((p) => p.visibility === "public")
      .map((p) => ({ url: `${SITE}/playlists/${p.id}` })),
  ];
}
