// Hero slide rules shared by the public Home page and the Studio preview.
import { contentHref } from "@/lib/format";
import type { Content, HeroSlide, HeroSlideRow } from "@/lib/types";

export const HERO_MAX_SLIDES = 8;
export const HERO_LIMITS = { title: 100, subtitle: 200, cta_label: 30, cta_href: 500 } as const;

export type HeroContent = Pick<Content, "id" | "type" | "title" | "description" | "thumbnail_url" | "duration_sec" | "visibility">;

/** A button link is a site path ("/membership") or a full http(s) URL. Empty means "open the linked clip". */
export function isHeroHref(v: string) {
  if (!v) return true;
  if (v.startsWith("/")) return !v.startsWith("//");
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export const isExternalHref = (v: string) => /^https?:\/\//i.test(v);

/** Apply the clip fallbacks. Returns null when the slide has nothing to show or nowhere to go. */
export function resolveHeroSlide(row: HeroSlideRow, clip: HeroContent | null): HeroSlide | null {
  const href = row.cta_href.trim() || (clip ? contentHref(clip) : "");
  const title = row.title.trim() || clip?.title || "";
  const image = row.image_url || clip?.thumbnail_url || null;
  if (!title || !href || !(image || row.mobile_image_url)) return null;
  const opensClip = !!clip && href === contentHref(clip);
  return {
    id: row.id,
    title,
    subtitle: row.subtitle.trim() || (clip ? clip.description.split("\n")[0] : ""),
    image: image ?? row.mobile_image_url,
    mobile_image: row.mobile_image_url,
    cta_label: row.cta_label.trim() || "ดูเลย",
    href,
    external: isExternalHref(href),
    content: clip ? { id: clip.id, type: clip.type, duration_sec: clip.duration_sec, visibility: clip.visibility } : null,
  };
}

export type HeroSlideState = "on" | "off" | "scheduled" | "ended" | "unpublished" | "incomplete";

/** Why a slide is or isn't on the site right now (Studio badge). */
export function heroSlideState(row: HeroSlideRow, clip: HeroContent | null, clipLive: boolean, now = Date.now()): HeroSlideState {
  if (!row.enabled) return "off";
  if (row.content_id && !clipLive) return "unpublished";
  if (!resolveHeroSlide(row, clip)) return "incomplete";
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return "scheduled";
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return "ended";
  return "on";
}
