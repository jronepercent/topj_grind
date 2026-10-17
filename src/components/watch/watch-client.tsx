"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Lock, Play, Repeat, X } from "lucide-react";
import dynamic from "next/dynamic";
import { Paywall } from "@/components/content/paywall";
import { RowCard, type ProgressMap } from "@/components/cards/cards";
import { useViewer } from "@/components/providers";
import { Switch } from "@/components/ui/switch";
import { usePlayer, useUI } from "@/lib/stores/player";
import { contentHref, formatDuration } from "@/lib/format";
import type { Chapter, Content, PlaylistWithMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

// Load the player code after the page shell; the poster shows meanwhile (fast LCP).
const VideoPlayer = dynamic(() => import("@/components/player/video-player").then((m) => m.VideoPlayer), {
  ssr: false,
  loading: () => <div className="aspect-video w-full" />,
});

export interface WatchData {
  c: Content;
  locked: boolean;
  chapters: Chapter[];
  resume: number | null;
  related: Content[];
  playlist: { meta: PlaylistWithMeta; items: Content[] } | null;
  progress: ProgressMap;
}

function hrefWithList(c: Content, listId?: string) {
  const base = contentHref(c);
  return listId ? `${base}?list=${listId}` : base;
}

export function WatchClient({ data, children }: { data: WatchData; children: React.ReactNode }) {
  const { c, locked, chapters, related, playlist, progress } = data;
  const { viewer } = useViewer();
  const router = useRouter();
  const params = useSearchParams();
  const { theater, setTheater } = useUI();
  const [ended, setEnded] = React.useState(false);
  const [plAutoplay, setPlAutoplay] = React.useState(true);
  const live = React.useRef({ t: 0, paused: true, ended: false });

  React.useEffect(() => {
    try {
      setTheater(localStorage.getItem("tg_theater") === "1");
      setPlAutoplay(localStorage.getItem("tg_pl_autoplay") !== "0");
    } catch {}
  }, [setTheater]);

  // Coming back from the mini player for this same video → continue from its time.
  const [startAt] = React.useState(() => {
    const t = Number(params.get("t"));
    if (t > 0) return t;
    const g = usePlayer.getState();
    if (g.item?.type === "video" && g.item.id === c.id) {
      const time = g.currentTime;
      g.close();
      return time;
    }
    return data.resume ?? 0;
  });
  const [resumeNotice, setResumeNotice] = React.useState(!params.get("t") && !!data.resume && startAt === data.resume);
  React.useEffect(() => {
    if (!resumeNotice) return;
    const t = setTimeout(() => setResumeNotice(false), 7000);
    return () => clearTimeout(t);
  }, [resumeNotice]);

  // Leaving the Watch page while playing → hand off to the global mini player.
  React.useEffect(() => {
    return () => {
      const s = live.current;
      if (locked || s.paused || s.ended) return;
      setTimeout(() => {
        if (window.location.pathname.startsWith("/watch")) return;
        usePlayer.getState().play({ id: c.id, type: "video", title: c.title, thumb: c.thumbnail_url, duration: c.duration_sec, chapters, startAt: s.t });
      }, 0);
    };
  }, [c.id, c.title, c.thumbnail_url, c.duration_sec, chapters, locked]);

  const listIdx = playlist ? playlist.items.findIndex((x) => x.id === c.id) : -1;
  const nextItem: Content | undefined = playlist
    ? playlist.items[listIdx + 1]
    : related.find((r) => r.visibility === "public" || viewer?.is_member) ?? related[0];
  const nextHref = nextItem ? hrefWithList(nextItem, playlist?.meta.id) : null;
  const autoplay = playlist ? plAutoplay : viewer ? viewer.autoplay : true;

  const [restartKey, setRestartKey] = React.useState(0);

  const player = locked ? (
    <div className="relative aspect-video w-full overflow-hidden bg-black sm:rounded-[12px]">
      <Paywall variant="player" thumb={c.thumbnail_url} />
    </div>
  ) : (
    <VideoPlayer
      key={`${c.id}-${restartKey}`}
      id={c.id}
      title={c.title}
      poster={c.thumbnail_url}
      durationHint={c.duration_sec}
      chapters={chapters}
      startAt={restartKey ? 0 : startAt}
      theater={theater}
      onToggleTheater={() => setTheater(!theater)}
      onTime={(t, paused) => {
        live.current.t = t;
        live.current.paused = paused;
        if (ended && !paused) setEnded(false);
      }}
      onEnded={() => {
        live.current.ended = true;
        setEnded(true);
      }}
      className={cn(!theater && "sm:rounded-[12px]")}
    >
      {resumeNotice && (
        <div className="glass absolute left-3 top-3 z-[5] flex items-center gap-3 rounded-full border border-white/10 px-4 py-2 text-[13px] text-white" style={{ background: "rgba(0,0,0,.6)" }}>
          ดูต่อจาก <span className="tnum font-semibold">{formatDuration(startAt)}</span>
          <button
            className="font-semibold text-accent"
            onClick={() => {
              setResumeNotice(false);
              setRestartKey((k) => k + 1);
            }}
          >
            เริ่มใหม่
          </button>
          <button onClick={() => setResumeNotice(false)} aria-label="ปิด" className="text-white/70">
            <X className="size-4" />
          </button>
        </div>
      )}
      {ended && (
        <EndScreen
          next={nextItem}
          href={nextHref}
          autoplay={autoplay}
          inPlaylist={!!playlist}
          onReplay={() => {
            setEnded(false);
            live.current.ended = false;
            setRestartKey((k) => k + 1);
          }}
          onGo={() => nextHref && router.push(nextHref)}
        />
      )}
    </VideoPlayer>
  );

  return (
    <div
      className={cn(
        "mx-auto grid max-w-[1800px] gap-x-6 sm:px-6 sm:pt-6 lg:px-8",
        theater
          ? "lg:grid-cols-[minmax(0,1fr)_400px] lg:[grid-template-areas:'player_player''info_side'] lg:px-0 lg:pt-0"
          : "lg:grid-cols-[minmax(0,1fr)_400px] lg:[grid-template-areas:'player_side''info_side']",
      )}
    >
      <div
        className={cn(
          "sticky top-14 z-10 bg-black sm:static sm:bg-transparent lg:[grid-area:player]",
          theater && "lg:bg-black",
        )}
      >
        <div className={cn("relative", theater && "lg:mx-auto lg:max-h-[calc(100dvh-140px)] lg:max-w-[calc((100dvh-140px)*16/9)]")}>
          {!locked && c.thumbnail_url && (
            <Image
              src={c.thumbnail_url}
              alt=""
              fill
              priority
              sizes="(max-width:1024px) 100vw, 70vw"
              className={cn("-z-0 object-cover opacity-70", !theater && "sm:rounded-[12px]")}
            />
          )}
          <div className="relative">{player}</div>
        </div>
      </div>

      <div className={cn("min-w-0 px-4 pt-3 sm:px-0 lg:[grid-area:info]", theater && "lg:pl-8")}>{children}</div>

      <aside className={cn("min-w-0 space-y-4 px-4 pb-8 pt-6 sm:px-0 lg:pt-0 lg:[grid-area:side]", theater && "lg:pr-8 lg:pt-6")}>
        {playlist && (
          <PlaylistBox
            meta={playlist.meta}
            items={playlist.items}
            current={c.id}
            progress={progress}
            autoplay={plAutoplay}
            setAutoplay={(v) => {
              setPlAutoplay(v);
              try {
                localStorage.setItem("tg_pl_autoplay", v ? "1" : "0");
              } catch {}
            }}
          />
        )}
        <h2 className="sr-only">ถัดไป</h2>
        <div className="space-y-3">
          {related.map((r) => (
            <RowCard key={r.id} c={r} progress={progress} />
          ))}
        </div>
      </aside>
    </div>
  );
}

function EndScreen({
  next,
  href,
  autoplay,
  inPlaylist,
  onReplay,
  onGo,
}: {
  next?: Content;
  href: string | null;
  autoplay: boolean;
  inPlaylist: boolean;
  onReplay: () => void;
  onGo: () => void;
}) {
  const { viewer } = useViewer();
  const nextLocked = next?.visibility === "members" && !viewer?.is_member;
  const [count, setCount] = React.useState(autoplay && next && !nextLocked ? 5 : -1);
  React.useEffect(() => {
    if (count < 0) return;
    if (count === 0) {
      onGo();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onGo]);

  return (
    <div className="absolute inset-0 z-[6] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md text-center text-white">
        {next && href ? (
          <>
            <p className="text-[13px] text-white/70">{count >= 0 ? `เล่นถัดไปใน ${count}` : inPlaylist ? "ตอนถัดไป" : "ถัดไป"}</p>
            <Link href={href} className="mt-3 flex items-center gap-3 rounded-[16px] bg-white/10 p-2 text-left transition-colors hover:bg-white/15">
              <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-[10px] bg-black">
                {next.thumbnail_url && <Image src={next.thumbnail_url} alt="" fill sizes="144px" className="object-cover" />}
                {nextLocked && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Lock className="size-5 text-[#E8C77A]" />
                  </span>
                )}
              </div>
              <span className="line-clamp-2 text-[14px] font-semibold">{next.title}</span>
            </Link>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={onReplay} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[14px] hover:bg-white/20">
                <Repeat className="size-4" /> ดูซ้ำ
              </button>
              {count >= 0 ? (
                <button onClick={() => setCount(-1)} className="rounded-full bg-white/10 px-4 py-2 text-[14px] hover:bg-white/20">
                  ยกเลิก
                </button>
              ) : (
                <button onClick={onGo} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[14px] font-semibold text-black">
                  <Play className="size-4 fill-current" /> เล่นเลย
                </button>
              )}
            </div>
          </>
        ) : (
          <button onClick={onReplay} className="mx-auto flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 hover:bg-white/20">
            <Repeat className="size-4" /> ดูอีกครั้ง
          </button>
        )}
      </div>
    </div>
  );
}

function PlaylistBox({
  meta,
  items,
  current,
  progress,
  autoplay,
  setAutoplay,
}: {
  meta: PlaylistWithMeta;
  items: Content[];
  current: string;
  progress: ProgressMap;
  autoplay: boolean;
  setAutoplay: (v: boolean) => void;
}) {
  const { viewer } = useViewer();
  const [open, setOpen] = React.useState(true);
  const idx = items.findIndex((i) => i.id === current);
  const listRef = React.useRef<HTMLOListElement>(null);
  React.useEffect(() => {
    listRef.current?.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest" });
  }, [current]);
  return (
    <div className="overflow-hidden rounded-[16px] border border-border">
      <div className="bg-surface px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link href={`/playlists/${meta.id}`} className="line-clamp-1 font-semibold hover:underline">
              {meta.title}
            </Link>
            <p className="t-meta tnum">
              {meta.is_course ? "ซีรีส์บทเรียน" : "Playlist"} · ตอนที่ {idx + 1}/{items.length}
              {meta.is_course && viewer && ` · เรียนแล้ว ${meta.completed_count}/${meta.item_count}`}
            </p>
          </div>
          <button onClick={() => setOpen((o) => !o)} className="rounded-full p-1.5 hover:bg-hover" aria-label={open ? "ย่อรายการ" : "ขยายรายการ"}>
            <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} />
          </button>
        </div>
        <label className="mt-2 flex cursor-pointer items-center justify-between text-[13px]">
          เล่นต่ออัตโนมัติ
          <Switch checked={autoplay} onCheckedChange={setAutoplay} aria-label="เล่นต่ออัตโนมัติ" />
        </label>
      </div>
      {open && (
        <ol ref={listRef} className="max-h-[400px] overflow-y-auto py-1">
          {items.map((it, i) => {
            const active = it.id === current;
            const done = progress[it.id]?.completed;
            const locked = it.visibility === "members" && !viewer?.is_member;
            return (
              <li key={it.id}>
                <Link
                  href={hrefWithList(it, meta.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn("flex items-center gap-3 px-3 py-2 hover:bg-hover", active && "bg-hover")}
                >
                  <span className="tnum w-5 shrink-0 text-center text-[12px] text-text-2">{active ? <Play className="mx-auto size-3 fill-current" /> : i + 1}</span>
                  <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-[8px] bg-surface">
                    {it.thumbnail_url && <Image src={it.thumbnail_url} alt="" fill sizes="96px" className="object-cover" />}
                    <span className="tnum absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px] text-white">{formatDuration(it.duration_sec)}</span>
                  </div>
                  <span className="line-clamp-2 min-w-0 flex-1 text-[13px] font-medium leading-[18px]">{it.title}</span>
                  {done ? <Check className="size-4 shrink-0 text-success" aria-label="ดูจบแล้ว" /> : locked ? <Lock className="size-4 shrink-0 text-member" aria-label="เฉพาะสมาชิก" /> : null}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
