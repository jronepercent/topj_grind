import "server-only";
import { createHash } from "node:crypto";

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
  return {
    endpoint: "https://video.bunnycdn.com/tusupload",
    videoId: video.guid,
    libraryId,
    signature,
    expire,
  };
}

export function bunnyThumbnail(videoId: string) {
  const host = process.env.BUNNY_STREAM_CDN_HOST;
  return host ? `https://${host}/${videoId}/thumbnail.jpg` : null;
}

export function bunnyPreview(videoId: string) {
  const host = process.env.BUNNY_STREAM_CDN_HOST;
  return host ? `https://${host}/${videoId}/preview.webp` : null;
}
