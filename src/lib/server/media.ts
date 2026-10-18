import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/clients";
import type { ContentRow } from "@/lib/types";

const TWO_HOURS = 2 * 60 * 60;
/** Long episodes must not break mid-play, so audio links outlive video ones. */
const AUDIO_TTL = 6 * 60 * 60;

/** Private Supabase Storage bucket for podcast audio (see migration 0009). */
export const PODCAST_BUCKET = "podcasts";

const AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
};

/** MIME type for an audio file name / path, from its extension. */
export function audioMime(name: string) {
  return AUDIO_TYPES[name.split(".").pop()?.toLowerCase() ?? ""] ?? "audio/mpeg";
}

/** Best-effort removal of podcast objects. Never throws: a leftover file is better than a failed save. */
export async function removeAudioObjects(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p && p.startsWith("episodes/")))];
  if (!list.length) return;
  const { error } = await adminDb().storage.from(PODCAST_BUCKET).remove(list);
  if (error) console.error(`podcast storage remove: ${error.message}`);
}

/**
 * Bunny CDN "advanced" token authentication with a directory token_path, so the
 * HLS playlist and every segment under /{videoId}/ are covered by one token.
 * https://docs.bunny.net/docs/cdn-token-authentication
 */
export function signBunnyUrl(host: string, securityKey: string, filePath: string, tokenPath: string, ttl = TWO_HOURS) {
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const hashable = securityKey + tokenPath + expires + `token_path=${tokenPath}`;
  const token = createHash("sha256")
    .update(hashable)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const url = `https://${host}/bcdn_token=${token}&expires=${expires}&token_path=${encodeURIComponent(tokenPath)}${filePath}`;
  return { url, expires_at: new Date(expires * 1000).toISOString() };
}

export interface Playback {
  src: string;
  type: string;
  expires_at: string;
  storyboard?: string;
  captions?: string;
}

/** Build a short-lived playback URL. Only called after the access check in /api/play/[id]. */
export async function playbackFor(c: ContentRow): Promise<Playback | null> {
  const streamHost = process.env.BUNNY_STREAM_CDN_HOST; // e.g. vz-xxxx.b-cdn.net
  const streamKey = process.env.BUNNY_STREAM_TOKEN_KEY;

  if (c.type !== "podcast" && c.bunny_video_id && streamHost && streamKey) {
    const dir = `/${c.bunny_video_id}/`;
    const { url, expires_at } = signBunnyUrl(streamHost, streamKey, `${dir}playlist.m3u8`, dir);
    return { src: url, type: "application/x-mpegurl", expires_at };
  }
  if (c.type === "podcast" && c.audio_path) {
    const { data, error } = await adminDb().storage.from(PODCAST_BUCKET).createSignedUrl(c.audio_path, AUDIO_TTL);
    if (error || !data?.signedUrl) {
      console.error(`podcast sign: ${error?.message ?? "no url"}`);
      return null;
    }
    // Refresh a little early so a client never holds a link that is about to die.
    return { src: data.signedUrl, type: audioMime(c.audio_path), expires_at: new Date(Date.now() + (AUDIO_TTL - 60) * 1000).toISOString() };
  }
  if (c.demo_src) {
    const type = c.demo_src.endsWith(".m3u8") ? "application/x-mpegurl" : c.type === "podcast" ? "audio/mpeg" : "video/mp4";
    return { src: c.demo_src, type, expires_at: new Date(Date.now() + TWO_HOURS * 1000).toISOString() };
  }
  return null;
}
