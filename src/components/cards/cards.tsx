"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, Headphones, Lock, Pause, Play } from "lucide-react";
import { useViewer } from "@/components/providers";
import { MemberBadge } from "@/components/ui/misc";
import { ContentMenu } from "./content-menu";
import { contentHref, formatCount, formatDuration, formatLongDuration, thaiDate, timeAgo } from "@/lib/format";
import type { Content, PlaylistWithMeta } from "@/lib/types";
import { usePlayer, type PlayerItem } from "@/lib/stores/player";
import { cn } from "@/lib/utils";

export type ProgressMap = Record<string, { position_sec: number; completed: boolean }>;

export function useLocked(c: Pick<Content, "visibility">) {
  const { viewer } = useViewer();
  return c.visibility === "members" && !viewer?.is_member;
}

/** Hover: scale 1.02 + animated preview after 600ms. Prefetch after 200ms. */
function useHoverPreview(href: string, hasPreview: boolean) {
  const router = useRouter();
  const [preview, setPreview] = React.useState(false);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
  const onEnter = () => {
    timers.current.push(setTimeout(() => router.prefetch(href), 200));
    if (hasPreview) timers.current.push(setTimeout(() => setPreview(true), 600));
  };
  const onLeave = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPreview(false);
  };
  return { preview, onEnter, onLeave };
}

export function Thumb({
  src,
  alt,
  ratio = "16/9",
  sizes,
  className,
  priority,
  children,
}: {
  src: string | null;
  alt: string;
  ratio?: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-[12px] bg-surface", className)} style={{ aspectRatio: ratio }}>
      {src && (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover transition-transform duration-150 ease-[var(--ease-apple)] group-hover:scale-[1.02]"
        />
      )}
      {children}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  if (value <= 0) return null;
  return (
    <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25" aria-hidden>
      <div className="h-full bg-accent" style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

function progressRatio(c: Content, progress?: ProgressMap) {
  const p = progress?.[c.id];
  if (!p) return 0;
  if (p.completed) return 1;
  return c.duration_sec ? p.position_sec / c.duration_sec : 0;
}

/** Badge rule: non-members see 🔒 + "สมาชิก", members see a small "สมาชิก" without the lock. */
function VisibilityBadge({ c }: { c: Content }) {
  const locked = useLocked(c);
  if (c.visibility !== "members") return null;
  return <MemberBadge locked={locked} className={cn("absolute left-2 top-2", !locked && "bg-black/60 backdrop-blur")} />;
}

export function VideoCard({ c, progress, priority }: { c: Content; progress?: ProgressMap; priority?: boolean }) {
  const href = contentHref(c);
  const { preview, onEnter, onLeave } = useHoverPreview(href, !!c.preview_url);
  return (
    <article className="group relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <Link href={href} className="block rounded-[12px]" aria-label={c.title}>
        <Thumb src={c.thumbnail_url} alt="" sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, (max-width:1440px) 33vw, 25vw" priority={priority}>
          {preview && c.preview_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.preview_url} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <VisibilityBadge c={c} />
          {c.type === "podcast" && (
            <span className="absolute left-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
              <Headphones className="size-3" /> พอดแคสต์
            </span>
          )}
          <span className="tnum absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[12px] font-medium text-white">
            {formatDuration(c.duration_sec)}
          </span>
          <ProgressBar value={progressRatio(c, progress)} />
        </Thumb>
      </Link>
      <div className="mt-3 flex gap-2 pr-1">
        <div className="min-w-0 flex-1">
          <Link href={href}>
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-[21px]">{c.title}</h3>
          </Link>
          <p className="t-meta tnum mt-1">
            การดู {formatCount(c.view_count)} ครั้ง · {timeAgo(c.published_at)}
          </p>
        </div>
        <ContentMenu content={c} className="-mr-1 self-start" />
      </div>
    </article>
  );
}

/** Horizontal card for "ถัดไป" column, search results, library. */
export function RowCard({
  c,
  progress,
  size = "sm",
  active,
  href: hrefOverride,
  extra,
}: {
  c: Content;
  progress?: ProgressMap;
  size?: "sm" | "lg";
  active?: boolean;
  href?: string;
  extra?: React.ReactNode;
}) {
  const href = hrefOverride ?? contentHref(c);
  const ratio = "16/9";
  const width = size === "lg" ? "w-[44%] max-w-[360px] min-w-[160px]" : "w-[168px]";
  return (
    <article className={cn("group relative flex gap-3 rounded-[12px]", active && "bg-hover")}>
      <Link href={href} className={cn("shrink-0", width, c.type !== "video" && size === "sm" && "w-[168px]")} aria-label={c.title}>
        <Thumb
          src={c.thumbnail_url}
          alt=""
          ratio={ratio}
          sizes={size === "lg" ? "360px" : "168px"}
        >
          <VisibilityBadge c={c} />
          <span className="tnum absolute bottom-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {formatDuration(c.duration_sec)}
          </span>
          <ProgressBar value={progressRatio(c, progress)} />
        </Thumb>
      </Link>
      <div className="min-w-0 flex-1 py-0.5">
        <Link href={href}>
          <h3 className={cn("line-clamp-2 font-semibold", size === "lg" ? "text-[17px] leading-6" : "text-[14px] leading-5")}>{c.title}</h3>
        </Link>
        <p className="t-meta tnum mt-1">
          {c.type === "podcast" ? "พอดแคสต์ · " : ""}การดู {formatCount(c.view_count)} ครั้ง · {timeAgo(c.published_at)}
        </p>
        {size === "lg" && <p className="t-meta mt-2 line-clamp-2">{c.description.split("\n")[0]}</p>}
        {extra}
      </div>
      <ContentMenu content={c} className="self-start" />
    </article>
  );
}

export function toPlayerItem(c: Content): PlayerItem {
  return { id: c.id, type: "podcast", title: c.title, thumb: c.thumbnail_url, duration: c.duration_sec };
}

/** Play/pause straight from a card without opening the episode page. */
export function PodcastPlayButton({ c, queue, size = "md", startAt }: { c: Content; queue?: Content[]; size?: "md" | "lg"; startAt?: number }) {
  const { openPaywall } = useViewer();
  const locked = useLocked(c);
  const current = usePlayer((s) => s.item?.id === c.id);
  const paused = usePlayer((s) => s.paused);
  const play = usePlayer((s) => s.play);
  const controls = usePlayer((s) => s.controls);
  const playing = current && !paused;
  const Icon = locked ? Lock : playing ? Pause : Play;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (locked) return openPaywall(c.thumbnail_url);
        if (current) return controls?.toggle();
        const rest = queue ? queue.slice(queue.findIndex((q) => q.id === c.id) + 1).filter((q) => q.visibility === "public" || !locked).map(toPlayerItem) : [];
        play({ ...toPlayerItem(c), startAt }, rest);
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95",
        locked ? "bg-[#E8C77A] text-[#1d1606]" : "bg-text text-bg",
        size === "lg" ? "size-14 [&_svg]:size-6" : "size-10 [&_svg]:size-[18px]",
      )}
      aria-label={locked ? "เฉพาะสมาชิก" : playing ? "หยุดชั่วคราว" : "เล่น"}
    >
      <Icon className={cn(!locked && !playing && "translate-x-[1px]", !locked && "fill-current")} strokeWidth={locked ? 2 : 0} />
    </button>
  );
}

export function PodcastCard({ c, queue, progress }: { c: Content; queue?: Content[]; progress?: ProgressMap }) {
  const ratio = progressRatio(c, progress);
  return (
    <article className="group relative w-full">
      <Link href={`/podcasts/${c.id}`} className="block" aria-label={c.title}>
        <Thumb src={c.thumbnail_url} alt="" ratio="1/1" sizes="(max-width:640px) 45vw, 220px">
          <VisibilityBadge c={c} />
          <ProgressBar value={ratio} />
        </Thumb>
      </Link>
      <div className="mt-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href={`/podcasts/${c.id}`}>
            <h3 className="line-clamp-2 text-[14px] font-semibold leading-5">{c.title}</h3>
          </Link>
          <p className="t-meta tnum mt-1">
            {thaiDate(c.published_at)} · {formatLongDuration(c.duration_sec)}
          </p>
        </div>
        <PodcastPlayButton c={c} queue={queue} startAt={progress?.[c.id]?.completed ? 0 : progress?.[c.id]?.position_sec} />
      </div>
    </article>
  );
}

export function PlaylistCard({ p }: { p: PlaylistWithMeta }) {
  const pct = p.item_count ? Math.round((p.completed_count / p.item_count) * 100) : 0;
  return (
    <article className="group relative">
      <Link href={`/playlists/${p.id}`} className="block" aria-label={p.title}>
        {/* stack effect */}
        <div className="relative pt-2">
          <div className="absolute inset-x-6 top-0 h-4 rounded-t-[12px] bg-[var(--border-strong)] opacity-60" aria-hidden />
          <div className="absolute inset-x-3 top-1 h-4 rounded-t-[12px] bg-[var(--border-strong)]" aria-hidden />
          <Thumb src={p.first_thumb} alt="" sizes="(max-width:640px) 100vw, 360px" className="relative">
            <div className="absolute inset-y-0 right-0 flex w-[38%] flex-col items-center justify-center gap-1 bg-black/70 text-white backdrop-blur-sm">
              <span className="tnum text-[20px] font-semibold">{p.item_count}</span>
              <span className="text-[12px]">ตอน</span>
            </div>
            {p.visibility === "members" && <PlaylistLockBadge />}
            {pct > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            )}
          </Thumb>
        </div>
      </Link>
      <div className="mt-3">
        <Link href={`/playlists/${p.id}`}>
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-[21px]">{p.title}</h3>
        </Link>
        <p className="t-meta tnum mt-1">
          {p.is_course ? "ซีรีส์บทเรียน · " : "Playlist · "}
          {formatLongDuration(p.total_sec)}
          {pct > 0 && (
            <>
              {" · "}
              <span className="text-text">เรียนแล้ว {pct}%</span>
            </>
          )}
          {pct === 100 && <Check className="ml-1 inline size-3.5 text-success" />}
        </p>
      </div>
    </article>
  );
}

function PlaylistLockBadge() {
  const { viewer } = useViewer();
  return <MemberBadge locked={!viewer?.is_member} className="absolute left-2 top-2 bg-black/60 backdrop-blur" />;
}

export function CardSkeleton({ kind = "video" }: { kind?: "video" | "podcast" }) {
  const ratio = kind === "podcast" ? "1/1" : "16/9";
  return (
    <div>
      <div className="skeleton rounded-[12px]" style={{ aspectRatio: ratio }} />
      <div className="skeleton mt-3 h-4 w-11/12 rounded-md" />
      <div className="skeleton mt-2 h-3 w-1/2 rounded-md" />
    </div>
  );
}
