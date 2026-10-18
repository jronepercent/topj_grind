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

// ───────── Articles (บทความ) ─────────
interface ArticleSeo {
  id: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  visibility: "public" | "members";
  published_at: string | null;
  updated_at: string;
}

/** Public articles: full OG. Members-only: title + cover, no excerpt ("สำหรับสมาชิก TOPJ_GRIND"). */
export function articleMetadata(a: ArticleSeo, path: string): Metadata {
  const description = a.visibility === "public" ? a.excerpt || undefined : "บทความสำหรับสมาชิก TOPJ_GRIND";
  const images = a.cover_url ? [{ url: a.cover_url }] : undefined;
  return {
    title: a.title,
    description,
    alternates: { canonical: path },
    openGraph: { title: a.title, description, url: path, type: "article", publishedTime: a.published_at ?? undefined, modifiedTime: a.updated_at, images },
    twitter: { card: "summary_large_image", title: a.title, description, images: a.cover_url ? [a.cover_url] : undefined },
  };
}

export function articleJsonLd(a: ArticleSeo, path: string, authorName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.visibility === "public" ? a.excerpt : undefined,
    image: a.cover_url ? [a.cover_url] : undefined,
    datePublished: a.published_at ?? undefined,
    dateModified: a.updated_at,
    author: { "@type": "Person", name: authorName },
    mainEntityOfPage: `${SITE}${path}`,
    isAccessibleForFree: a.visibility === "public",
    inLanguage: "th",
  };
}
