import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { cookies } from "next/headers";
import { ViewportGuard } from "@/components/shell/viewport-guard";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const thai = Noto_Sans_Thai({ subsets: ["thai"], variable: "--font-thai", weight: ["400", "500", "600", "700"], display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://topjgrind.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "TOPJ_GRIND", template: "%s · TOPJ_GRIND" },
  description: "คอร์สออนไลน์ของ JR — วิดีโอ, พอดแคสต์ และบทความ เรื่องการสร้างรายได้จาก Digital Product",
  applicationName: "TOPJ_GRIND",
  appleWebApp: { capable: true, title: "TOPJ_GRIND", statusBarStyle: "black-translucent" },
  openGraph: { siteName: "TOPJ_GRIND", locale: "th_TH", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
  // Pinch/double-tap zoom off on phones; ViewportGuard lifts this while a video is fullscreen.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("tg_theme")?.value ?? "dark";
  return (
    <html lang="th" data-theme={theme} className={`${inter.variable} ${thai.variable}`} suppressHydrationWarning>
      <body>
        <ViewportGuard />
        {children}
      </body>
    </html>
  );
}
