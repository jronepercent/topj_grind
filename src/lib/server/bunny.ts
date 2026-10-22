import "server-only";
import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { adminDb } from "@/lib/supabase/clients";
import type { ContentRow } from "@/lib/types";

/** True when Bunny Stream credentials are configured (otherwise Studio runs a simulated upload). */
export function bunnyStreamEnabled() {
  return !!(process.env.BUNNY_STREAM_LIBRARY_ID && process.env.BUNNY_STREAM_API_KEY);
}

/**
 * Create the video object server-side and return a TUS signature, so the browser
 * uploads straight to Bunny (never through our server) and the API key never leaves the server.
 * https://docs.bunny.net/reference/tus-resumable-uploads
 */
export async function createBunnyUpload(title: string) {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID!;
  const apiKey = process.env.BUNNY_STREAM_API_KEY!;
  const res = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
    method: "POST",
    headers: { AccessKey: apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Bunny create video failed: ${res.status}`);
  const video = (await res.json()) as { guid: string };
  const expire = Math.floor(Date.now() / 1000) + 6 * 3600;
  const signature = createHash("sha256").update(libraryId + apiKey + expire + video.guid).digest("hex");
  return { endpoint: "https://video.bunnycdn.com/tusupload", videoId: video.guid, libraryId, signature, expire };
}

/** With token authentication on, Bunny answers 403 to every unsigned file, images included, so there is no usable image URL. */
export function bunnyImagesPublic() {
  return !process.env.BUNNY_STREAM_TOKEN_KEY;
}

/** A file on this library's Stream CDN (the pull zone that token authentication guards). */
export function isBunnyCdnUrl(url: string) {
  const host = process.env.BUNNY_STREAM_CDN_HOST;
  return !!host && url.startsWith(`https://${host}/`);
}

export function bunnyThumbnail(videoId: string) {
  const host = process.env.BUNNY_STREAM_CDN_HOST;
  return host && bunnyImagesPublic() ? `https://${host}/${videoId}/thumbnail.jpg` : null;
}

export function bunnyPreview(videoId: string) {
  const host = process.env.BUNNY_STREAM_CDN_HOST;
  return host && bunnyImagesPublic() ? `https://${host}/${videoId}/preview.webp` : null;
}

// Bunny Stream video status codes: 0 created, 1 uploaded, 2 processing, 3 transcoding, 4 finished, 5 error, 6 upload failed
const FINISHED = 4;
const FAILED = new Set([5, 6]);

/**
 * Bring a row's media_status in line with Bunny. Used by the Bunny webhook, and by Studio's
 * status polling — on localhost the webhook can't reach us, so polling is how uploads finish there.
 * Returns the updated row (or the same row if nothing changed).
 */
export async function syncBunnyStatus(c: ContentRow): Promise<ContentRow> {
  if (!c.bunny_video_id || !bunnyStreamEnabled() || c.media_status === "ready") return c;
  const res = await fetch(`https://video.bunnycdn.com/library/${process.env.BUNNY_STREAM_LIBRARY_ID}/videos/${c.bunny_video_id}`, {
    headers: { AccessKey: process.env.BUNNY_STREAM_API_KEY!, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return c;
  const v = (await res.json()) as { status: number; length?: number; width?: number; height?: number };
  let patch: Partial<ContentRow> | null = null;
  if (v.status === FINISHED) {
    patch = {
      media_status: "ready",
      duration_sec: Math.round(v.length ?? c.duration_sec),
      width: v.width ?? c.width,
      height: v.height ?? c.height,
      thumbnail_url: c.thumbnail_url ?? bunnyThumbnail(c.bunny_video_id),
      preview_url: c.preview_url ?? bunnyPreview(c.bunny_video_id),
    };
  } else if (FAILED.has(v.status) && c.media_status !== "failed") {
    patch = { media_status: "failed" };
  } else if (v.status >= 1 && c.media_status === "uploading") {
    patch = { media_status: "processing" };
  }
  if (!patch) return c;
  const { data } = await adminDb()
    .from("content")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", c.id)
    .select("*")
    .single();
  const next = (data as ContentRow) ?? { ...c, ...patch };
  if (next.media_status === "ready") {
    const { finalizeIfReady } = await import("./mutations");
    await finalizeIfReady(next);
    revalidateTag("catalog");
  }
  return next;
}
