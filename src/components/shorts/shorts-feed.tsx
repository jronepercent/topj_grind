"use client";
import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BadgeCheck, ChevronDown, ChevronUp, Heart, MessageCircle, MoreHorizontal, Play, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useViewer } from "@/components/providers";
import { Paywall } from "@/components/content/paywall";
import { RichText } from "@/components/content/rich-text";
import { Comments } from "@/components/social/comments";
import { Avatar, MemberBadge } from "@/components/ui/misc";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { loadCommentsAction, toggleLikeAction, toggleSaveAction } from "@/app/actions";
import { copyLink, share } from "@/lib/stores/share";
import { formatCount } from "@/lib/format";
import type { CommentView, Content, ContentLink } from "@/lib/types";
import { cn } from "@/lib/utils";

const ShortVideo = dynamic(() => import("./short-video").then((m) => m.ShortVideo), {
  ssr: false,
  loading: () => <div className="skeleton absolute inset-0 bg-transparent" />,
});

export interface ShortItem {
  c: Content;
  liked: boolean;
  links: ContentLink[];
}

/** Vertical, scroll-snapped Shorts feed. URL follows the active clip. */
export function ShortsFeed({ items, startIndex }: { items: ShortItem[]; startIndex: number }) {
  const [active, setActive] = React.useState(startIndex);
  const [muted, setMuted] = React.useState(true); // muted until the first tap
  // Only the visible clip gets a player at first; the next two warm up once the browser is idle.
  const [warm, setWarm] = React.useState(false);
  React.useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => setWarm(true), { timeout: 2500 });
    else setTimeout(() => setWarm(true), 1500);
  }, []);
  const scroller = React.useRef<HTMLDivElement>(null);
  const refs = React.useRef<(HTMLElement | null)[]>([]);

  React.useLayoutEffect(() => {
    refs.current[startIndex]?.scrollIntoView({ block: "start" });
  }, [startIndex]);

  React.useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const i = Number((e.target as HTMLElement).dataset.index);
            setActive(i);
            const id = items[i]?.c.id;
            if (id) window.history.replaceState(null, "", `/shorts/${id}`);
          }
        }
      },
      { root: scroller.current, threshold: [0.6] },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [items]);

  const go = React.useCallback(
    (d: 1 | -1) => refs.current[Math.max(0, Math.min(items.length - 1, active + d))]?.scrollIntoView({ behavior: "smooth", block: "start" }),
    [active, items.length],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA/.test(t.tagName) || t.isContentEditable) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="relative bg-black sm:bg-bg">
      <div
        ref={scroller}
        className="no-scrollbar h-[calc(100dvh-56px-56px)] snap-y snap-mandatory overflow-y-scroll overscroll-contain sm:h-[calc(100dvh-56px)]"
        aria-label="Shorts"
      >
        {items.map((it, i) => (
          <section
            key={it.c.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-index={i}
            className="flex h-full snap-start snap-always items-center justify-center sm:py-4"
            aria-roledescription="slide"
            aria-label={it.c.title}
          >
            <ShortSlide item={it} active={i === active} mounted={i === active || (warm && (i - active === -1 || (i > active && i - active <= 2)))} muted={muted} setMuted={setMuted} />
          </section>
        ))}
      </div>
      <div className="absolute right-6 top-1/2 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
        <button onClick={() => go(-1)} disabled={active === 0} className="flex size-12 items-center justify-center rounded-full bg-hover hover:bg-[var(--border-strong)] disabled:opacity-30" aria-label="คลิปก่อนหน้า">
          <ChevronUp className="size-6" />
        </button>
        <button onClick={() => go(1)} disabled={active === items.length - 1} className="flex size-12 items-center justify-center rounded-full bg-hover hover:bg-[var(--border-strong)] disabled:opacity-30" aria-label="คลิปถัดไป">
          <ChevronDown className="size-6" />
        </button>
      </div>
    </div>
  );
}

function ShortSlide({
  item,
  active,
  mounted,
  muted,
  setMuted,
}: {
  item: ShortItem;
  active: boolean;
  mounted: boolean;
  muted: boolean;
  setMuted: (v: boolean) => void;
}) {
  const { c } = item;
  const { viewer, requireAuth, openPaywall, settings } = useViewer();
  const locked = c.visibility === "members" && !viewer?.is_member;
  const [liked, setLiked] = React.useState(item.liked);
  const [likes, setLikes] = React.useState(c.like_count);
  const [hearts, setHearts] = React.useState<{ id: number; x: number; y: number }[]>([]);
  const [sheet, setSheet] = React.useState<null | "comments" | "info">(null);

  const like = async (force?: boolean) => {
    if (!requireAuth("เข้าสู่ระบบเพื่อถูกใจคลิปนี้")) return;
    if (locked) return openPaywall(c.thumbnail_url);
    const next = force ?? !liked;
    if (next === liked) return;
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      if (next) navigator.vibrate?.(10);
    } catch {}
    const r = await toggleLikeAction(c.id);
    if (!r.ok) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast(r.error);
    }
  };

  const onDoubleTap = (x: number, y: number) => {
    const id = Date.now();
    setHearts((h) => [...h, { id, x, y }]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 900);
    like(true);
  };

  const sideBtn = "flex flex-col items-center gap-1 text-[12px] font-medium text-white sm:text-text";
  const sideIcon = "flex size-12 items-center justify-center rounded-full bg-black/30 backdrop-blur sm:bg-hover [&_svg]:size-6";

  return (
    <div className="relative flex h-full items-end gap-4">
      <div className="relative h-full overflow-hidden bg-black sm:rounded-[16px]" style={{ aspectRatio: "9/16", maxWidth: "100vw" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className={cn("absolute inset-0 size-full object-cover", locked && "scale-110 blur-2xl")} />}
        {locked ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" />
            <Paywall variant="inline" className="relative border border-white/10 bg-[#141416]/85 text-[#F5F5F7] backdrop-blur-xl" />
          </div>
        ) : (
          mounted && <ShortVideo c={c} active={active} muted={muted} setMuted={setMuted} onDoubleTap={onDoubleTap} />
        )}
        {hearts.map((h) => (
          <Heart
            key={h.id}
            className="pointer-events-none absolute z-20 size-24 fill-accent text-accent drop-shadow-lg"
            style={{ left: h.x, top: h.y, animation: "floatHeart 900ms var(--ease-apple) forwards" }}
          />
        ))}

        {/* bottom-left info */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pb-6 pr-20 text-white sm:pr-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <Avatar src={settings.avatar_url} name={settings.channel_name} size={32} />
            <Link href="/about" className="flex items-center gap-1 text-[14px] font-semibold">
              {settings.channel_name} <BadgeCheck className="size-3.5" />
            </Link>
            {c.visibility === "members" && <MemberBadge locked={locked} className="bg-black/50 text-[#E8C77A]" />}
          </div>
          <button className="pointer-events-auto mt-2 line-clamp-2 text-left text-[14px] leading-5" onClick={() => setSheet("info")}>
            {c.title}
          </button>
          {c.linked_content_id && (
            <Link
              href={`/watch/${c.linked_content_id}${c.linked_start_sec ? `?t=${c.linked_start_sec}` : ""}`}
              className="pointer-events-auto mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-semibold backdrop-blur hover:bg-white/30"
            >
              <Play className="size-3.5 fill-current" /> ดูคลิปเต็ม
            </Link>
          )}
        </div>

        {/* mobile: action buttons overlay */}
        <div className="absolute bottom-24 right-2 z-10 flex flex-col gap-4 sm:hidden">
          <SideActions />
        </div>
      </div>

      {/* desktop: action buttons beside the clip */}
      <div className="hidden flex-col gap-4 pb-2 sm:flex">
        <SideActions />
      </div>

      <Dialog open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        <SheetContent side={typeof window !== "undefined" && window.innerWidth >= 1024 ? "right" : "bottom"} title={sheet === "comments" ? "ความคิดเห็น" : "คำอธิบาย"} className="lg:max-w-[420px]">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
            {sheet === "comments" ? (
              <ShortComments c={c} />
            ) : (
              <div className="space-y-4 text-[14px] leading-6">
                <h3 className="t-h2">{c.title}</h3>
                <p className="t-meta tnum">
                  การดู {formatCount(c.view_count)} ครั้ง · ถูกใจ {formatCount(likes)}
                </p>
                <RichText text={c.description} />
                {item.links.length > 0 && (
                  <div className="space-y-2">
                    {item.links.map((l) => (
                      <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="block rounded-[12px] border border-border p-3 font-medium hover:bg-hover">
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Dialog>
    </div>
  );

  function SideActions() {
    return (
      <>
        <button onClick={() => like()} className={sideBtn} aria-pressed={liked} aria-label="ถูกใจ">
          <span className={sideIcon}>
            <Heart className={cn(liked && "like-pop fill-accent text-accent")} strokeWidth={1.75} />
          </span>
          <span className="tnum">{formatCount(likes)}</span>
        </button>
        <button onClick={() => setSheet("comments")} className={sideBtn} aria-label="ความคิดเห็น">
          <span className={sideIcon}>
            <MessageCircle strokeWidth={1.75} />
          </span>
          <span className="tnum">{formatCount(c.comment_count)}</span>
        </button>
        <button onClick={() => share({ title: c.title, path: `/shorts/${c.id}` })} className={sideBtn} aria-label="แชร์">
          <span className={sideIcon}>
            <Share2 strokeWidth={1.75} />
          </span>
          แชร์
        </button>
        <Dropdown>
          <DropdownTrigger asChild>
            <button className={sideBtn} aria-label="ตัวเลือกเพิ่มเติม">
              <span className={sideIcon}>
                <MoreHorizontal strokeWidth={1.75} />
              </span>
            </button>
          </DropdownTrigger>
          <DropdownContent side="left" align="end">
            <DropdownItem onSelect={() => setSheet("info")}>คำอธิบาย</DropdownItem>
            <DropdownItem
              onSelect={async () => {
                if (!requireAuth("เข้าสู่ระบบเพื่อบันทึก")) return;
                const r = await toggleSaveAction(c.id, true);
                toast(r.ok ? "บันทึกไว้ดูภายหลังแล้ว" : r.error);
              }}
            >
              ดูภายหลัง
            </DropdownItem>
            <DropdownItem onSelect={() => copyLink(`/shorts/${c.id}`)}>คัดลอกลิงก์</DropdownItem>
          </DropdownContent>
        </Dropdown>
      </>
    );
  }
}

function ShortComments({ c }: { c: Content }) {
  const [data, setData] = React.useState<{ items: CommentView[]; total: number; hasMore: boolean } | null>(null);
  React.useEffect(() => {
    loadCommentsAction(c.id, "top", 0).then((r) => setData(r.ok ? r.data : { items: [], total: 0, hasMore: false }));
  }, [c.id]);
  if (!data) return <div className="skeleton h-24 rounded-[12px]" />;
  return <Comments contentId={c.id} visibility={c.visibility} enabled={c.comments_enabled} initial={data} compact />;
}
