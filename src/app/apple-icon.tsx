import { ImageResponse } from "next/og";
import { BrandIcon, brandFont } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(<BrandIcon px={180} />, { ...size, fonts: await brandFont("TG") });
}
