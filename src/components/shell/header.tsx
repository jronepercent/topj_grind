"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  Clapperboard,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessagesSquare,
  Mic,
  Monitor,
  Moon,
  Newspaper,
  Plus,
  Search,
  Sun,
  User,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Avatar, EmptyState, MemberBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { useViewer } from "@/components/providers";
import { useSubscribeHref } from "@/components/content/paywall";
import { SearchBox } from "./search-box";
import { useUI } from "@/lib/stores/player";
import { markAllReadAction, notificationsAction, setThemeAction } from "@/app/actions";
import { logoutAction } from "@/app/(auth)/auth-actions";
import { thaiDate, timeAgo } from "@/lib/format";
import type { Notification, ThemePref } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Header({ unread }: { unread: number }) {
  const { viewer } = useViewer();
  const subscribeHref = useSubscribeHref();
  const { sidebar, setSidebar, setDrawer } = useUI();
  const [mobileSearch, setMobileSearch] = React.useState(false);

  const toggleNav = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      const isFull = sidebar === "full" || (sidebar === "auto" && window.matchMedia("(min-width: 1440px)").matches);
      setSidebar(isFull ? "mini" : "full");
    } else setDrawer(true);
  };

  return (
    <header className="glass sticky top-0 z-40 h-14 border-b border-border">
      {mobileSearch ? (
        <div className="flex h-full items-center px-2">
          <React.Suspense>
            <SearchBox mobile onClose={() => setMobileSearch(false)} />
          </React.Suspense>
        </div>
      ) : (
        <div className="flex h-full items-center gap-2 px-2 sm:px-4">
          <button onClick={toggleNav} className="hidden rounded-full p-2 hover:bg-hover sm:inline-flex" aria-label="เมนู">
            <Menu className="size-[22px]" strokeWidth={1.75} />
          </button>
          <Logo className="ml-2 sm:ml-1" />

          <div className="mx-auto hidden w-full max-w-[560px] px-4 sm:block">
            <React.Suspense>
              <SearchBox />
            </React.Suspense>
          </div>

          <div className="ml-auto flex items-center gap-1 sm:ml-0">
            <button onClick={() => setMobileSearch(true)} className="rounded-full p-2 hover:bg-hover sm:hidden" aria-label="ค้นหา">
              <Search className="size-[22px]" strokeWidth={1.75} />
            </button>
            {viewer?.is_admin && <CreateMenu />}
            {!viewer?.is_member && (
              <Button asChild variant="member" size="sm" className="mx-1 hidden sm:inline-flex">
                <Link href={subscribeHref}>สมัครสมาชิก</Link>
              </Button>
            )}
            {viewer && <NotificationBell initialUnread={unread} />}
            {viewer ? (
              <UserMenu />
            ) : (
              <Button asChild variant="outline" size="sm" className="ml-1">
                <Link href="/login">
                  <User /> เข้าสู่ระบบ
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function CreateMenu() {
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="secondary" size="sm" className="mr-1" aria-label="สร้าง">
          <Plus /> <span className="hidden md:inline">สร้าง</span>
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end">
        <DropdownItem asChild>
          <Link href="/studio/upload?type=video">
            <Clapperboard /> อัปโหลดวิดีโอ
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/studio/upload?type=podcast">
            <Mic /> อัปโหลดพอดแคสต์
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/studio/community">
            <MessagesSquare /> เขียนโพสต์ในชุมชน
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/studio/articles/new">
            <Newspaper /> เขียนบทความ
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/studio/playlists?new=1">
            <BookOpen /> สร้าง Playlist
          </Link>
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = React.useState(initialUnread);
  const [items, setItems] = React.useState<Notification[] | null>(null);
  React.useEffect(() => setUnread(initialUnread), [initialUnread]);

  return (
    <Dropdown
      onOpenChange={async (o) => {
        if (o) {
          const r = await notificationsAction();
          if (r.ok) setItems(r.data);
        }
      }}
    >
      <DropdownTrigger asChild>
        <button className="relative rounded-full p-2 hover:bg-hover" aria-label={`การแจ้งเตือน${unread ? ` ยังไม่อ่าน ${unread} รายการ` : ""}`}>
          <Bell className="size-[22px]" strokeWidth={1.75} />
          {unread > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-danger ring-2 ring-[var(--bg)]" />}
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-[min(400px,calc(100vw-16px))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-semibold">การแจ้งเตือน</span>
          {unread > 0 && (
            <button
              className="text-[13px] text-text-2 hover:text-text"
              onClick={async () => {
                setUnread(0);
                setItems((xs) => xs?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
                await markAllReadAction();
              }}
            >
              ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {items === null ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12 rounded-[10px]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState art="bell" title="ยังไม่มีการแจ้งเตือน" body="คลิปใหม่และการตอบกลับจะแสดงที่นี่" className="py-8" />
          ) : (
            items.map((n) => (
              <DropdownItem key={n.id} asChild className="items-start rounded-none px-4 py-3">
                <Link href={n.link ?? "#"}>
                  <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-[14px] leading-5">
                      <span className="font-medium">{n.title}</span> · {n.body}
                    </span>
                    <span className="t-caption mt-1 block text-text-2">{timeAgo(n.created_at)}</span>
                  </span>
                  {n.image_url && (
                    <Image src={n.image_url} alt="" width={86} height={48} className="h-12 w-[86px] shrink-0 rounded-[8px] object-cover" />
                  )}
                </Link>
              </DropdownItem>
            ))
          )}
        </div>
      </DropdownContent>
    </Dropdown>
  );
}

function UserMenu() {
  const { viewer } = useViewer();
  const router = useRouter();
  if (!viewer) return null;
  const setTheme = async (t: ThemePref) => {
    document.documentElement.dataset.theme = t;
    await setThemeAction(t);
  };
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="ml-1 rounded-full p-0.5 hover:ring-2 hover:ring-[var(--border-strong)]" aria-label="เมนูบัญชี">
          <Avatar src={viewer.avatar_url} name={viewer.display_name} size={32} />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-72">
        <div className="flex items-center gap-3 px-3 py-3">
          <Avatar src={viewer.avatar_url} name={viewer.display_name} size={40} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{viewer.display_name}</div>
            <div className="t-caption truncate text-text-2">{viewer.email}</div>
            <div className="mt-1">
              {viewer.is_admin ? (
                <span className="t-caption text-text-2">ผู้ดูแลช่อง</span>
              ) : viewer.is_member ? (
                <MemberBadge label={`สมาชิกถึง ${thaiDate(viewer.expires_at)}`} />
              ) : (
                <span className="t-caption text-text-2">{viewer.expires_at ? "สมาชิกหมดอายุแล้ว" : "ยังไม่ได้เป็นสมาชิก"}</span>
              )}
            </div>
          </div>
        </div>
        <DropdownSeparator />
        {viewer.is_admin && (
          <DropdownItem asChild>
            <Link href="/studio">
              <LayoutDashboard /> TOPJ_GRIND Studio
            </Link>
          </DropdownItem>
        )}
        <DropdownItem asChild>
          <Link href="/account">
            <User /> บัญชีของฉัน
          </Link>
        </DropdownItem>
        <DropdownItem asChild>
          <Link href="/library">
            <Library /> คลังของฉัน
          </Link>
        </DropdownItem>
        <DropdownSeparator />
        <DropdownLabel>ธีม</DropdownLabel>
        <div className="grid grid-cols-3 gap-1 px-1.5 pb-1.5">
          {(
            [
              ["dark", "มืด", Moon],
              ["light", "สว่าง", Sun],
              ["system", "ตามระบบ", Monitor],
            ] as const
          ).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="flex flex-col items-center gap-1 rounded-[10px] py-2 text-[12px] text-text-2 hover:bg-hover hover:text-text"
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <DropdownSeparator />
        <DropdownItem
          onSelect={async () => {
            await logoutAction();
            router.refresh();
          }}
        >
          <LogOut /> ออกจากระบบ
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
