import type { ImageLoaderProps } from "next/image";

const PUBLIC_OBJECT = "/storage/v1/object/public/";
/** Supabase refuses transform widths above this. */
const MAX_WIDTH = 2500;

/**
 * Resize through Supabase Storage image transformations instead of Vercel's optimizer
 * (the Hobby plan's monthly quota ran out and answered 402, breaking every uncached cover).
 * Supabase also serves WebP to browsers that accept it. Anything else loads as-is.
 * https://supabase.com/docs/guides/storage/serving/image-transformations
 */
export default function imageLoader({ src, width, quality }: ImageLoaderProps) {
  const i = src.indexOf(PUBLIC_OBJECT);
  if (i === -1 || !src.includes(".supabase.co/")) return src;
  const url = new URL(src.slice(0, i) + "/storage/v1/render/image/public/" + src.slice(i + PUBLIC_OBJECT.length));
  url.searchParams.set("width", String(Math.min(width, MAX_WIDTH)));
  url.searchParams.set("quality", String(quality ?? 75));
  return url.toString();
}
