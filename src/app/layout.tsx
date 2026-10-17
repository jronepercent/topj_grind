import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const thai = Noto_Sans_Thai({ subsets: ["thai"], variable: "--font-thai", weight: ["400", "500", "600", "700"], display: "swap" });

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://topjgrind.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "TOPJ_GRIND", template: "%s · TOPJ_GRIND" },
  description: "คอร์สออนไลน์ของ JR — วิดีโอ, Shorts และพอดแคสต์ เรื่องการสร้างรายได้จาก Digital Product",
  applicationName: "TOPJ_GRIND",
  appleWebApp: { capable: true, title: "TOPJ_GRIND", statusBarStyle: "black-translucent" },
  openGraph: { siteName: "TOPJ_GRIND", locale: "th_TH", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("tg_theme")?.value ?? "dark";
  return (
    <html lang="th" data-theme={theme} className={`${inter.variable} ${thai.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
