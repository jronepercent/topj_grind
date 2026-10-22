/**
 * Brand marks for generated images (share image, favicon, app icons), matching the channel banner:
 * heavy black "TOPJ GRIND" on red, with J and R (JR) in white.
 */
export const BRAND_RED = "#CC1500";
export const BRAND_BLACK = "#0A0A0B";

/**
 * Archivo Black (the banner's typeface), subset to just `text`. ImageResponse's built-in font has no heavy weight.
 * Returns undefined when Google Fonts can't be reached, so the image still renders (in the default font).
 */
export async function brandFont(text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Archivo+Black&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return undefined;
    const data = await (await fetch(url)).arrayBuffer();
    return [{ name: "Archivo Black", data, style: "normal" as const, weight: 400 as const }];
  } catch {
    return undefined;
  }
}

/** "TOPJ GRIND" with J and R in white. */
export function Wordmark({ size }: { size: number }) {
  const white = new Set([3, 6]);
  return (
    <div style={{ display: "flex", fontFamily: "Archivo Black", fontSize: size, letterSpacing: -size * 0.02, color: BRAND_BLACK, lineHeight: 1 }}>
      {"TOPJ GRIND".split("").map((ch, i) =>
        ch === " " ? (
          <div key={i} style={{ width: size * 0.3 }} />
        ) : (
          <span key={i} style={{ color: white.has(i) ? "#FFFFFF" : BRAND_BLACK }}>
            {ch}
          </span>
        ),
      )}
    </div>
  );
}

/** App icon / favicon: "TG", black T and white G on brand red. Full-bleed square: iOS and Android round the corners themselves. */
export function BrandIcon({ px }: { px: number }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_RED }}>
      <div style={{ display: "flex", fontFamily: "Archivo Black", fontSize: px * 0.46, letterSpacing: -px * 0.02, lineHeight: 1 }}>
        <span style={{ color: BRAND_BLACK }}>T</span>
        <span style={{ color: "#FFFFFF" }}>G</span>
      </div>
    </div>
  );
}
