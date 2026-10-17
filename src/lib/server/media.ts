import "server-only";
import { createHash } from "node:crypto";
import type { ContentRow } from "@/lib/types";

const TWO_HOURS = 2 * 60 * 60;

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
export function playbackFor(c: ContentRow): Playback | null {
  const streamHost = process.env.BUNNY_STREAM_CDN_HOST; // e.g. vz-xxxx.b-cdn.net
  const streamKey = process.env.BUNNY_STREAM_TOKEN_KEY;
  const audioHost = process.env.BUNNY_AUDIO_CDN_HOST; // pull zone in front of Bunny Storage
  const audioKey = process.env.BUNNY_AUDIO_TOKEN_KEY;

  if (c.type !== "podcast" && c.bunny_video_id && streamHost && streamKey) {
    const dir = `/${c.bunny_video_id}/`;
    const { url, expires_at } = signBunnyUrl(streamHost, streamKey, `${dir}playlist.m3u8`, dir);
    return { src: url, type: "application/x-mpegurl", expires_at };
  }
  if (c.type === "podcast" && c.audio_path && audioHost && audioKey) {
    const p = c.audio_path.startsWith("/") ? c.audio_path : `/${c.audio_path}`;
    const { url, expires_at } = signBunnyUrl(audioHost, audioKey, p, p);
    return { src: url, type: p.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg", expires_at };
  }
  if (c.demo_src) {
    const type = c.demo_src.endsWith(".m3u8") ? "application/x-mpegurl" : c.type === "podcast" ? "audio/mpeg" : "video/mp4";
    return { src: c.demo_src, type, expires_at: new Date(Date.now() + TWO_HOURS * 1000).toISOString() };
  }
  return null;
}
