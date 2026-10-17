import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/** Favicon / PWA icon: "TG" in a rounded square. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0A0B" }}>
        <div
          style={{
            width: 400,
            height: 400,
            borderRadius: 96,
            background: "#F5F5F7",
            color: "#0A0A0B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 190,
            fontWeight: 800,
            letterSpacing: -10,
          }}
        >
          TG
        </div>
      </div>
    ),
    size,
  );
}
