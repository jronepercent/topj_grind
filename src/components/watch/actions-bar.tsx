"use client";
import * as React from "react";
import Link from "next/link";
import { BadgeCheck, Clock, EllipsisVertical, Flag, ListPlus, Share2, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { useViewer } from "@/components/providers";
import { useSubscribeHref } from "@/components/content/paywall";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { AddToPlaylistDialog } from "@/components/cards/add-to-playlist";
import { toggleLikeAction, toggleSaveAction } from "@/app/actions";
import { share } from "@/lib/stores/share";
import { useSeekBus } from "@/lib/stores/bus";
import { contentHref, formatCount } from "@/lib/format";
import type { Content } from "@/lib/types";
import { cn } from "@/lib/utils";

export function useLike(c: Content, initialLiked: boolean) {
  const { viewer, requireAuth, openPaywall } = useViewer();
  const [liked, setLiked] = React.useState(initialLiked);
  const [count, setCount] = React.useState(c.like_count);
  const [pop, setPop] = React.useState(0);
  const toggle = async (force?: boolean) => {
    if (!requireAuth("เข้าสู่ระบบเพื่อถูกใจคลิปนี้")) return;
    if (c.visibility === "members" && !viewer?.is_member) return openPaywall(c.thumbnail_url);
    const next = force ?? !liked;
    if (next === liked) return setPop((p) => p + 1);
    setLiked(next);
    setCount((n) => n + (next ? 1 : -1));
    if (next) {
      setPop((p) => p + 1);
      try {
        navigator.vibrate?.(10);
      } catch {}
    }
    const r = await toggleLikeAction(c.id);
    if (!r.ok) {
      setLiked(!next);
      setCount((n) => n + (next ? -1 : 1));
      toast(r.error);
    } else setCount(r.data.count);
  };
  return { liked, count, pop, toggle };
}

export function ChannelRow() {
  const { settings, viewer } = useViewer();
  const href = useSubscribeHref();
  return (
    <div className="flex items-center gap-3">
      <Link href="/about">
        <Avatar src={settings.avatar_url} name={settings.channel_name} size={40} />
      </Link>
      <div className="min-w-0">
        <Link href="/about" className="flex items-center gap-1 font-semibold">
          {settings.channel_name} <BadgeCheck className="size-4 text-text-2" aria-label="ยืนยันแล้ว" />
        </Link>
        <p className="t-caption text-text-2">ครีเอเตอร์</p>
      </div>
      {!viewer?.is_member && (
        <Button asChild variant="member" size="sm" className="ml-2">
          <Link href={href}>สมัครสมาชิก</Link>
        </Button>
      )}
    </div>
  );
}

export function ActionsBar({ c, liked, saved: initialSaved }: { c: Content; liked: boolean; saved: boolean }) {
  const { viewer, requireAuth } = useViewer();
  const like = useLike(c, liked);
  const [saved, setSaved] = React.useState(initialSaved);
  const [playlistOpen, setPlaylistOpen] = React.useState(false);
  const currentTime = useSeekBus((s) => s.currentTime);

  const toggleSave = async () => {
    if (!requireAuth("เข้าสู่ระบบเพื่อบันทึกไว้ดูภายหลัง")) return;
    const next = !saved;
    setSaved(next);
    const r = await toggleSaveAction(c.id, next);
    if (!r.ok) {
      setSaved(!next);
      return toast(r.error);
    }
    toast(next ? "บันทึกไว้ดูภายหลังแล้ว" : "นำออกจากดูภายหลังแล้ว", {
      action: {
        label: "เลิกทำ",
        onClick: async () => {
          setSaved(!next);
          await toggleSaveAction(c.id, !next);
        },
      },
    });
  };

  const pill = "flex h-9 items-center gap-2 rounded-full bg-hover px-4 text-[14px] font-medium transition-colors hover:bg-[var(--border-strong)] [&_svg]:size-5";

  return (
    <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <button onClick={() => like.toggle()} className={pill} aria-pressed={like.liked} aria-label="ถูกใจ">
        <ThumbsUp key={like.pop} className={cn(like.liked && "fill-current", like.pop > 0 && "like-pop")} strokeWidth={1.75} />
        <span className="tnum">{formatCount(like.count)}</span>
      </button>
      <button onClick={() => share({ title: c.title, path: contentHref(c), time: currentTime() })} className={pill}>
        <Share2 strokeWidth={1.75} /> แชร์
      </button>
      <button onClick={toggleSave} className={pill} aria-pressed={saved}>
        <Clock className={cn(saved && "text-accent")} strokeWidth={1.75} /> {saved ? "บันทึกแล้ว" : "ดูภายหลัง"}
      </button>
      <Dropdown>
        <DropdownTrigger asChild>
          <button className={cn(pill, "px-2.5")} aria-label="ตัวเลือกเพิ่มเติม">
            <EllipsisVertical strokeWidth={1.75} />
          </button>
        </DropdownTrigger>
        <DropdownContent align="end">
          {viewer?.is_admin && (
            <DropdownItem onSelect={() => setPlaylistOpen(true)}>
              <ListPlus /> เพิ่มลง Playlist
            </DropdownItem>
          )}
          <DropdownItem
            onSelect={() => {
              const subject = encodeURIComponent(`รายงานปัญหา: ${c.title}`);
              window.location.href = `mailto:support@topjgrind.com?subject=${subject}&body=${encodeURIComponent(window.location.href)}`;
            }}
          >
            <Flag /> รายงานปัญหา
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      {playlistOpen && <AddToPlaylistDialog contentIds={[c.id]} onClose={() => setPlaylistOpen(false)} />}
    </div>
  );
}
