import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "TOPJ_GRIND by JR_ONEPERCENT";

/**
 * Share image for pages without their own cover (home, about, lists). Watch, article and shop pages
 * set their own. Latin text only: the built-in font has no Thai glyphs.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#0A0A0B",
          color: "#F5F5F7",
        }}
      >
        <div style={{ width: 96, height: 10, background: "#ff4d2e", marginBottom: 40 }} />
        <div style={{ fontSize: 120, fontWeight: 800, letterSpacing: -4 }}>TOPJ_GRIND</div>
        <div style={{ fontSize: 40, marginTop: 24, color: "#A1A1A6" }}>Digital Product · by JR_ONEPERCENT</div>
      </div>
    ),
    size,
  );
}
