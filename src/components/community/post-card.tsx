"use client";
import * as React from "react";
import Link from "next/link";
import { EyeOff, Heart, MessageCircle, Pin, PinOff, Trash2, EllipsisVertical, Eye, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useViewer } from "@/components/providers";
import { RichText } from "@/components/content/rich-text";
import { ConfirmDialog } from "@/components/studio/confirm";
import { Avatar, CreatorBadge, MemberBadge } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ImageCarousel } from "./image-carousel";
import { deletePostAction, moderatePostAction, togglePostLikeAction } from "@/app/community-actions";
import type { PostView } from "@/lib/community";
import { formatCount, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const LONG = 180;

export function PostCard({
  post,
  detail,
  priority,
  onChange,
  className,
}: {
  post: PostView;
  /** On the post page: full caption, no "view comments" link. */
  detail?: boolean;
  priority?: boolean;
  /** patch = partial update, null = removed from the list */
  onChange?: (patch: Partial<PostView> | null) => void;
  className?: string;
}) {
  const { viewer, requireAuth, settings } = useViewer();
  const [expanded, setExpanded] = React.useState(!!detail);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [pop, setPop] = React.useState(false);
  const [burst, setBurst] = React.useState(0);
  const lastTap = React.useRef(0);
  const busy = React.useRef(false);
  const mine = viewer?.id === post.author.id;
  const admin = !!viewer?.is_admin;
  const long = post.body.length > LONG || post.body.split("\n").length > 3;
  const href = `/community/posts/${post.id}`;
  const name = post.author.is_admin ? settings.channel_name || post.author.display_name : post.author.display_name;

  const setLiked = async (next: boolean) => {
    if (!requireAuth("เข้าสู่ระบบเพื่อถูกใจโพสต์")) return;
    if (busy.current || next === post.liked_by_me) return;
    busy.current = true;
    const prev = { liked_by_me: post.liked_by_me, like_count: post.like_count };
    onChange?.({ liked_by_me: next, like_count: Math.max(0, post.like_count + (next ? 1 : -1)) });
    if (next) setPop(true);
    const r = await togglePostLikeAction(post.id, next);
    busy.current = false;
    if (!r.ok) {
      onChange?.(prev);
      toast(r.error);
    } else onChange?.({ liked_by_me: r.data.liked, like_count: r.data.like_count });
  };

  // Double-click / double-tap anywhere on the card likes it (never unlikes), like Instagram.
  // Buttons, links and menus keep their own clicks.
  const onCard = (target: EventTarget) => !(target as HTMLElement).closest("a, button, [role='menu'], [role='dialog']");
  const touchLikedAt = React.useRef(0);
  const likeFromCard = () => {
    if (viewer) setBurst((n) => n + 1);
    void setLiked(true);
  };

  const moderate = async (action: "pin" | "unpin" | "hide" | "unhide") => {
    const r = await moderatePostAction(post.id, action);
    if (!r.ok) return toast(r.error);
    if (action === "hide") {
      onChange?.(null);
      toast("ซ่อนโพสต์แล้ว");
    } else {
      onChange?.({ is_pinned: action === "pin", is_hidden: action === "unhide" ? false : post.is_hidden });
      toast(action === "pin" ? "ปักหมุดแล้ว" : action === "unpin" ? "เลิกปักหมุดแล้ว" : "แสดงโพสต์แล้ว");
    }
  };

  return (
    <article
      className={cn("relative overflow-hidden rounded-[16px] border border-border bg-surface", post.is_hidden && "opacity-60", className)}
      onDoubleClick={(e) => {
        // phones may also send dblclick after a double-tap that onTouchEnd already handled
        if (!onCard(e.target) || Date.now() - touchLikedAt.current < 600) return;
        window.getSelection()?.removeAllRanges();
        likeFromCard();
      }}
      onTouchEnd={(e) => {
        if (!onCard(e.target)) return;
        const now = Date.now();
        if (now - lastTap.current < 300) {
          lastTap.current = 0;
          touchLikedAt.current = now;
          likeFromCard();
        } else lastTap.current = now;
      }}
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <Avatar src={post.author.avatar_url} name={post.author.display_name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[14px] font-semibold">{name}</span>
            {post.author.is_admin && <CreatorBadge />}
            {post.author.is_member && <MemberBadge />}
          </div>
          <p className="t-caption flex items-center gap-1.5 text-text-2">
            <Link href={href} className="hover:underline">
              {timeAgo(post.published_at)}
            </Link>
            {post.is_pinned && (
              <span className="inline-flex items-center gap-1 font-medium">
                · <Pin className="size-3" aria-hidden /> ปักหมุด
              </span>
            )}
            {post.is_hidden && <span>· ซ่อนอยู่</span>}
          </p>
        </div>
        {viewer && (mine || admin) && (
          <Dropdown>
            <DropdownTrigger asChild>
              <button className="rounded-full p-2 text-text-2 hover:bg-hover hover:text-text" aria-label="ตัวเลือกโพสต์">
                <EllipsisVertical className="size-5" />
              </button>
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownItem
                onSelect={async () => {
                  try {
                    await navigator.clipboard.writeText(`${location.origin}${href}`);
                    toast("คัดลอกลิงก์แล้ว");
                  } catch {
                    toast("คัดลอกลิงก์ไม่ได้");
                  }
                }}
              >
                <Link2 /> คัดลอกลิงก์
              </DropdownItem>
              {admin && (
                <>
                  <DropdownItem onSelect={() => moderate(post.is_pinned ? "unpin" : "pin")}>
                    {post.is_pinned ? <PinOff /> : <Pin />} {post.is_pinned ? "เลิกปักหมุด" : "ปักหมุด"}
                  </DropdownItem>
                  <DropdownItem onSelect={() => moderate(post.is_hidden ? "unhide" : "hide")}>
                    {post.is_hidden ? <Eye /> : <EyeOff />} {post.is_hidden ? "แสดงโพสต์" : "ซ่อนโพสต์"}
                  </DropdownItem>
                </>
              )}
              <DropdownSeparator />
              <DropdownItem className="text-danger [&_svg]:text-danger" onSelect={() => setConfirmDelete(true)}>
                <Trash2 /> ลบโพสต์
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        )}
      </header>

      {post.body && (
        <div className="px-4 pb-3 text-[15px] leading-[24px]">
          <div className={cn(!expanded && long && "line-clamp-4")}>
            <RichText text={post.body} />
          </div>
          {long && !expanded && (
            <button onClick={() => setExpanded(true)} className="mt-0.5 block text-text-2 hover:text-text">
              ดูเพิ่มเติม
            </button>
          )}
        </div>
      )}

      {post.images.length > 0 && <ImageCarousel images={post.images} priority={priority} />}

      <div className="px-4 pb-4 pt-2.5">
        <div className="-ml-2 flex items-center gap-1">
          <button
            onClick={() => void setLiked(!post.liked_by_me)}
            className="flex items-center gap-1.5 rounded-full px-2 py-1.5 hover:bg-hover"
            aria-label={post.liked_by_me ? "เลิกถูกใจ" : "ถูกใจ"}
            aria-pressed={post.liked_by_me}
          >
            <Heart
              className={cn("size-[26px]", post.liked_by_me ? "fill-danger text-danger" : "text-text", pop && "like-pop")}
              strokeWidth={1.75}
              onAnimationEnd={() => setPop(false)}
            />
          </button>
          <Link href={`${href}#comments`} className="flex items-center gap-1.5 rounded-full px-2 py-1.5 hover:bg-hover" aria-label={`ความคิดเห็น ${post.comment_count} รายการ`}>
            <MessageCircle className="size-[26px]" strokeWidth={1.75} />
          </Link>
        </div>

        {post.like_count > 0 && <p className="tnum mt-1 text-[14px] font-semibold">{formatCount(post.like_count)} ถูกใจ</p>}

        {!detail && (
          <Link href={`${href}#comments`} className="t-meta mt-2 block hover:text-text">
            {post.comment_count > 0 ? `ดูความคิดเห็นทั้งหมด ${formatCount(post.comment_count)} รายการ` : "เป็นคนแรกที่แสดงความคิดเห็น"}
          </Link>
        )}
      </div>

      {burst > 0 && (
        <Heart
          key={burst}
          className="pointer-events-none absolute left-1/2 top-1/2 size-24 fill-white text-white drop-shadow-lg"
          style={{ animation: "floatHeart 900ms var(--ease-apple) forwards" }}
          aria-hidden
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="ลบโพสต์นี้?"
        body="โพสต์และความคิดเห็นจะหายไปจากชุมชน ย้อนกลับไม่ได้"
        confirmLabel="ลบโพสต์"
        onConfirm={async () => {
          const r = await deletePostAction(post.id);
          setConfirmDelete(false);
          if (!r.ok) return toast(r.error);
          toast("ลบโพสต์แล้ว");
          if (onChange) onChange(null);
          else window.location.assign("/community");
        }}
      />
    </article>
  );
}
