"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, History, House, Info, Library, ListVideo, MessagesSquare, Podcast, ShoppingBag, User } from "lucide-react";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Logo } from "@/components/ui/logo";
import { useUI } from "@/lib/stores/player";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> };

const PRIMARY: NavItem[] = [
  { href: "/", label: "หน้าแรก", icon: House },
  { href: "/community", label: "ชุมชน", icon: MessagesSquare },
  { href: "/podcasts", label: "พอดแคสต์", icon: Podcast },
  { href: "/playlists", label: "Playlist", icon: ListVideo },
  { href: "/shop", label: "ร้านค้า", icon: ShoppingBag },
];
const YOU: NavItem[] = [
  { href: "/library", label: "คลังของฉัน", icon: Library },
  { href: "/library?tab=history", label: "ประวัติ", icon: History },
  { href: "/library?tab=later", label: "ดูภายหลัง", icon: Clock },
];
const MORE: NavItem[] = [{ href: "/about", label: "เกี่ยวกับช่อง", icon: Info }];

function useActive() {
  const pathname = usePathname();
  return (href: string) => {
    const base = href.split("?")[0];
    if (href.includes("?")) return false;
    return base === "/" ? pathname === "/" : pathname.startsWith(base);
  };
}

function FullNav({ onNavigate }: { onNavigate?: () => void }) {
  const isActive = useActive();
  const group = (items: NavItem[]) =>
    items.map(({ href, label, icon: Icon }) => {
      const active = isActive(href);
      return (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-10 items-center gap-5 rounded-[10px] px-3 text-[14px] transition-colors hover:bg-hover",
            active && "bg-hover font-semibold",
          )}
        >
          <Icon className="size-[22px] shrink-0" strokeWidth={active ? 2.25 : 1.75} />
          {label}
        </Link>
      );
    });
  return (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="เมนูหลัก">
      {group(PRIMARY)}
      <hr className="my-3 border-border" />
      {group(YOU)}
      <hr className="my-3 border-border" />
      {group(MORE)}
      <p className="t-caption mt-6 px-3 text-text-2">© {new Date().getFullYear()} TOPJ_GRIND</p>
    </nav>
  );
}

function MiniNav() {
  const isActive = useActive();
  return (
    <nav className="flex flex-col gap-1 px-1 py-2" aria-label="เมนูหลัก">
      {[...PRIMARY, YOU[0]].map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="flex flex-col items-center gap-1 rounded-[10px] py-4 text-[10px] hover:bg-hover"
          >
            <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
            <span className={cn(active && "font-semibold")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar (≥1024px). Auto: mini until 1440px, full above. */
export function Sidebar({ overlayOnly }: { overlayOnly?: boolean }) {
  const { sidebar, setSidebar, drawer, setDrawer } = useUI();
  const pathname = usePathname();

  React.useEffect(() => {
    try {
      const v = localStorage.getItem("tg_sidebar");
      if (v === "full" || v === "mini") setSidebar(v);
    } catch {}
  }, [setSidebar]);
  React.useEffect(() => setDrawer(false), [pathname, setDrawer]);

  return (
    <>
      {!overlayOnly && (
        <aside
          className={cn(
            "fixed bottom-0 left-0 top-14 z-30 hidden overflow-y-auto bg-bg lg:block no-scrollbar",
            sidebar === "auto" && "w-[72px] 3xl:w-60",
            sidebar === "full" && "w-60",
            sidebar === "mini" && "w-[72px]",
          )}
        >
          <div className={cn(sidebar === "auto" && "3xl:hidden", sidebar === "full" && "hidden")}>
            <MiniNav />
          </div>
          <div className={cn(sidebar === "auto" && "hidden 3xl:block", sidebar === "mini" && "hidden")}>
            <FullNav />
          </div>
        </aside>
      )}
      <Dialog open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="bg-bg">
          <div className="flex h-14 items-center px-6">
            <Logo />
          </div>
          <div className="overflow-y-auto">
            <FullNav onNavigate={() => setDrawer(false)} />
          </div>
        </SheetContent>
      </Dialog>
    </>
  );
}

export function sidebarPad(sidebar: "auto" | "full" | "mini", hidden: boolean) {
  if (hidden) return "";
  return {
    auto: "lg:pl-[72px] 3xl:pl-60",
    full: "lg:pl-60",
    mini: "lg:pl-[72px]",
  }[sidebar];
}

const TABS: NavItem[] = [
  { href: "/", label: "หน้าแรก", icon: House },
  { href: "/community", label: "ชุมชน", icon: MessagesSquare },
  { href: "/podcasts", label: "พอดแคสต์", icon: Podcast },
  { href: "/library", label: "คลัง", icon: Library },
  { href: "/account", label: "บัญชี", icon: User },
];

/** Mobile bottom tab bar (<640px). */
export function BottomTabs() {
  const isActive = useActive();
  return (
    <nav
      className="glass tg-vv-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border sm:hidden safe-bottom"
      aria-label="แท็บหลัก"
    >
      <div className="grid h-14 grid-cols-5">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-0.5 text-[10px]"
            >
              <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
              <span className={cn(active ? "font-semibold" : "opacity-80")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
