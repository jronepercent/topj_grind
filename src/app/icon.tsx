import { ImageResponse } from "next/og";
import { BrandIcon, brandFont } from "@/lib/brand";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Favicon / PWA icon: "TG" on brand red, black T and white G like the banner wordmark. */
export default async function Icon() {
  return new ImageResponse(<BrandIcon px={512} />, { ...size, fonts: await brandFont("TG") });
}
