"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import {
  ArrowUpRight,
  BookOpen,
  Clapperboard,
  House,
  LayoutDashboard,
  ListVideo,
  MessageSquare,
  Mic,
  Plus,
  Settings,
  Smartphone,
  Users,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { activeUploads, useUploads } from "./upload-store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/studio", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/studio/content", label: "คอนเทนต์", icon: Clapperboard },
  { href: "/studio/playlists", label: "Playlist", icon: ListVideo },
  { href: "/studio/comments", label: "ความคิดเห็น", icon: MessageSquare },
  { href: "/studio/members", label: "สมาชิก", icon: Users },
  { href: "/studio/home", label: "จัดหน้า Home", icon: House },
  { href: "/studio/settings", label: "ตั้งค่า", icon: Settings },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  if (href === "/studio/content") return pathname.startsWith(href) || pathname.startsWith("/studio/upload");
  return pathname.startsWith(href);
}

export function StudioShell({
  viewer,
  children,
}: {
  viewer: { display_name: string; avatar_url: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="glass sticky top-0 z-40 border-b border-border">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Logo href="/studio" />
          <span className="rounded-full border border-border-strong px-2 py-0.5 text-[12px] font-semibold leading-4 tracking-wide text-text-2">
            Studio
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <UploadIndicator />
            <CreateMenu />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/">
                ดูช่อง <ArrowUpRight />
              </Link>
            </Button>
            <Link href="/" aria-label="ดูช่อง" className="rounded-full p-2 hover:bg-hover sm:hidden">
              <ArrowUpRight className="size-5" strokeWidth={1.75} />
            </Link>
            <span className="ml-1" title={viewer.display_name}>
              <Avatar src={viewer.avatar_url} name={viewer.display_name} size={30} />
            </span>
          </div>
        </div>
        {/* Mobile / tablet: horizontal nav */}
        <nav aria-label="เมนู Studio" className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
          {NAV.map((n) => {
            const active = isActive(pathname, n.href, "exact" in n && n.exact);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  active ? "bg-text text-bg" : "text-text-2 hover:bg-hover hover:text-text",
                )}
              >
                <n.icon className="size-4" strokeWidth={1.75} aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-14 hidden h-[calc(100dvh-56px)] w-60 shrink-0 flex-col border-r border-border px-3 py-5 lg:flex">
          <nav aria-label="เมนู Studio" className="flex flex-col gap-0.5">
            {NAV.map((n) => {
              const active = isActive(pathname, n.href, "exact" in n && n.exact);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] transition-colors",
                    active ? "bg-hover font-semibold text-text" : "text-text-2 hover:bg-hover hover:text-text",
                  )}
                >
                  <n.icon className="size-5" strokeWidth={active ? 2 : 1.75} aria-hidden />
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto rounded-[12px] border border-border p-3">
            <p className="text-[13px] font-medium">TOPJ_GRIND Studio</p>
            <p className="t-caption mt-0.5 text-text-2">จัดการคอนเทนต์ สมาชิก และหน้า Home ได้จากที่เดียว</p>
          </div>
        </aside>
        <main className="tg-page min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <UnloadGuard />
      <Toaster
        position="bottom-center"
        offset={32}
        mobileOffset={{ bottom: 24 }}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "glass flex w-auto min-w-[260px] max-w-[92vw] items-center gap-3 rounded-full border border-border px-5 py-3 text-[14px] text-text shadow-2xl",
            actionButton: "ml-auto font-semibold text-accent",
            title: "font-medium",
          },
        }}
      />
    </div>
  );
}

function CreateMenu() {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="inverse" size="sm" aria-label="สร้าง">
          <Plus /> <span className="hidden sm:inline">สร้าง</span>
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end">
        <DropdownItem asChild>
          <Link href="/studio/upload?type=video">
            <Clapperboard /> อัปโหลดวิดีโอ
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/studio/upload?type=short">
            <Smartphone /> อัปโหลด Short
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/studio/upload?type=podcast">
            <Mic /> อัปโหลดพอดแคสต์
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/studio/playlists?new=1">
            <BookOpen /> สร้าง Playlist
          </Link>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

/** Small pill in the header while files upload / process in the background. */
function UploadIndicator() {
  const jobs = useUploads((s) => s.jobs);
  const active = activeUploads(jobs);
  if (!active.length) return null;
  const first = active[0];
  const label =
    first.phase === "uploading" ? `อัปโหลด ${Math.round(first.progress * 100)}%` : "กำลังประมวลผล";
  return (
    <Link
      href={`/studio/content/${first.id}/edit`}
      className="tnum hidden items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium text-text-2 hover:bg-hover hover:text-text sm:inline-flex"
      aria-live="polite"
    >
      <span className="relative h-1 w-10 overflow-hidden rounded-full bg-hover" aria-hidden>
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full bg-text", first.phase === "processing" && "animate-pulse")}
          style={{ width: `${first.phase === "uploading" ? first.progress * 100 : 100}%` }}
        />
      </span>
      {label}
      {active.length > 1 && <span className="text-text-2">+{active.length - 1}</span>}
    </Link>
  );
}

/** Warn before a full page unload while a file is still uploading (client navigation is safe). */
function UnloadGuard() {
  const uploading = useUploads((s) => Object.values(s.jobs).some((j) => j.phase === "uploading"));
  React.useEffect(() => {
    if (!uploading) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [uploading]);
  return null;
}
