import type { Metadata } from "next";
import { excerpt } from "./richtext";
import type { Content } from "./types";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://topjgrind.com";

/** Public: full OG. Members: cover + title + "สำหรับสมาชิก TOPJ_GRIND" (no extra detail). */
export function contentMetadata(c: Content, path: string): Metadata {
  const isPublic = c.visibility === "public";
  const description = isPublic ? excerpt(c.description, 160) : "สำหรับสมาชิก TOPJ_GRIND";
  const images = c.thumbnail_url ? [{ url: c.thumbnail_url }] : undefined;
  return {
    title: c.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: c.title,
      description,
      url: path,
      type: c.type === "podcast" ? "music.song" : "video.other",
      images,
    },
    twitter: { card: "summary_large_image", title: c.title, description, images: c.thumbnail_url ? [c.thumbnail_url] : undefined },
  };
}

export function videoJsonLd(c: Content, path: string) {
  const iso = (sec: number) => `PT${Math.floor(sec / 60)}M${Math.floor(sec % 60)}S`;
  return {
    "@context": "https://schema.org",
    "@type": c.type === "podcast" ? "PodcastEpisode" : "VideoObject",
    name: c.title,
    description: excerpt(c.description, 300),
    thumbnailUrl: c.thumbnail_url ? [c.thumbnail_url] : undefined,
    uploadDate: c.published_at,
    duration: iso(c.duration_sec),
    url: `${SITE}${path}`,
    interactionStatistic: { "@type": "InteractionCounter", interactionType: { "@type": "WatchAction" }, userInteractionCount: c.view_count },
  };
}
