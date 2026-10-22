import { ImageResponse } from "next/og";
import { BRAND_BLACK, BRAND_RED, Wordmark, brandFont } from "@/lib/brand";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TOPJ GRIND by JR_ONEPERCENT";

/**
 * Share image for pages without their own cover (home, about, lists). Watch, article and shop pages
 * set their own. Latin text only: the fonts used here have no Thai glyphs.
 */
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BRAND_RED }}>
        <Wordmark size={132} />
        <div style={{ display: "flex", marginTop: 44, fontSize: 30, color: BRAND_BLACK, letterSpacing: 2 }}>DIGITAL PRODUCT · BY JR_ONEPERCENT</div>
      </div>
    ),
    { ...size, fonts: await brandFont("TOPJGRIND DIGITALPRODUCTBYJR_ONEPERCENT·") },
  );
}
