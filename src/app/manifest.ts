import type { MetadataRoute } from "next";

/** PWA — "เพิ่มลงหน้าจอโฮม", opens standalone like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TOPJ_GRIND",
    short_name: "TOPJ_GRIND",
    description: "วิดีโอ, Shorts และพอดแคสต์จาก JR",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0B",
    theme_color: "#0A0A0B",
    lang: "th",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
