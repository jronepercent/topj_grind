"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { Header } from "./header";
import { BottomTabs, Sidebar, sidebarPad } from "./nav";
import { ExpiryBanner } from "./expiry-banner";
import { DemoSwitcher } from "./demo-switcher";
import { ShareDialog } from "@/components/content/share-dialog";
import dynamic from "next/dynamic";
import { useUI, usePlayer } from "@/lib/stores/player";
import { cn } from "@/lib/utils";

// The player library (~250 kB) loads only once something is actually playing.
const GlobalPlayer = dynamic(() => import("@/components/player/global-player").then((m) => m.GlobalPlayer), { ssr: false });

export function ShellClient({ unread, demo, children }: { unread: number; demo: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const sidebar = useUI((s) => s.sidebar);
  const hasMini = usePlayer((s) => !!s.item);
  // Watch page uses the full width (sidebar becomes a drawer), like YouTube.
  const isWatch = pathname.startsWith("/watch");

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-elevated focus:px-4 focus:py-2">
        ข้ามไปยังเนื้อหา
      </a>
      <Header unread={unread} />
      <Sidebar overlayOnly={isWatch} />
      <div className={cn(sidebarPad(sidebar, isWatch))}>
        <ExpiryBanner />
        <main
          id="main"
          className={cn("min-h-[calc(100dvh-56px)] pb-24 sm:pb-12", hasMini && "pb-40 sm:pb-28")}
        >
          {children}
        </main>
      </div>
      {hasMini && <GlobalPlayer />}
      <ShareDialog />
      <BottomTabs />
      {demo && <DemoSwitcher />}
    </>
  );
}
