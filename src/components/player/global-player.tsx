"use client";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { MediaPlayer, MediaProvider, useMediaRemote, useMediaState, type MediaPlayerInstance } from "@vidstack/react";
import { ChevronDown, Expand, ListMusic, Moon, Pause, Play, RotateCcw, RotateCw, X } from "lucide-react";
import { usePlayer, type PlayerItem } from "@/lib/stores/player";
import { VideoPlayer } from "./video-player";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { usePlaySource, useProgressSaver, useViewTracker, type PlaySource } from "./playback-hooks";
import { useViewer } from "@/components/providers";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * App-level player that lives outside the route tree, so audio never stops
 * when the user navigates. Podcasts → audio mini bar + full sheet.
 * Long videos left mid-play → floating mini video (bottom-right).
 */
export function GlobalPlayer() {
  const item = usePlayer((s) => s.item);
  const nonce = usePlayer((s) => s.nonce);
  const pathname = usePathname();
  if (!item) return null;
  if (item.type === "video") {
    if (pathname === `/watch/${item.id}`) return null;
    return <MiniVideo key={`${item.id}-${nonce}`} item={item} />;
  }
  return <AudioPlayer key={`${item.id}-${nonce}`} item={item} />;
}

// ───────────────────────── Mini video ─────────────────────────
function MiniVideo({ item }: { item: PlayerItem }) {
  const close = usePlayer((s) => s.close);
  const sync = usePlayer((s) => s.sync);
  return (
    <div className="tg-page fixed bottom-[72px] right-3 z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-[16px] border border-border bg-black shadow-2xl sm:bottom-4 sm:right-4">
      <VideoPlayer
        id={item.id}
        title={item.title}
        poster={item.thumb}
        durationHint={item.duration}
        chapters={[]}
        startAt={item.startAt}
        variant="mini"
        onTime={(t, paused) => sync({ currentTime: t, paused })}
        onEnded={close}
      />
      <div className="glass flex items-center gap-2 px-3 py-2">
        <p className="line-clamp-1 flex-1 text-[13px] font-medium">{item.title}</p>
        <Link href={`/watch/${item.id}`} className="rounded-full p-1.5 hover:bg-hover" aria-label="ขยายกลับไปหน้าดูคลิป">
          <Expand className="size-4" />
        </Link>
        <button onClick={close} className="rounded-full p-1.5 hover:bg-hover" aria-label="ปิดเครื่องเล่น">
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── Audio (podcast) ─────────────────────────
function AudioPlayer({ item }: { item: PlayerItem }) {
  const { source, error, retry } = usePlaySource(item.id);
  const { openPaywall } = useViewer();
  const close = usePlayer((s) => s.close);

  React.useEffect(() => {
    if (error !== "members_only") return;
    close();
    openPaywall(item.thumb);
  }, [error, close, openPaywall, item.thumb]);

  if (error === "unavailable")
    return (
      <Bar item={item}>
        <span className="t-meta flex-1">เล่นตอนนี้ไม่ได้</span>
        <button onClick={retry} className="h-10 rounded-[6px] bg-text px-3 text-[13px] font-semibold text-bg">
          โหลดใหม่
        </button>
      </Bar>
    );
  if (!source)
    return (
      <Bar item={item}>
        <span className="skeleton h-3 flex-1 rounded" />
      </Bar>
    );
  return <AudioInner item={item} src={source} />;
}

function Bar({ item, children }: { item: PlayerItem; children: React.ReactNode }) {
  const close = usePlayer((s) => s.close);
  return (
    <div className="fixed inset-x-0 bottom-14 z-40 px-2 pb-2 sm:bottom-0 sm:px-4 sm:pb-4 safe-bottom">
      <div className="glass mx-auto flex h-16 max-w-3xl items-center gap-3 rounded-[16px] border border-border px-3 shadow-2xl">
        <Cover src={item.thumb} size={44} />
        <p className="line-clamp-1 w-40 shrink-0 text-[14px] font-medium sm:w-56">{item.title}</p>
        {children}
        <button onClick={close} className="rounded-full p-2 hover:bg-hover" aria-label="ปิดเครื่องเล่น">
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}

function Cover({ src, size, className }: { src: string | null; size: number; className?: string }) {
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-[8px] bg-surface", className)} style={{ width: size, height: size }}>
      {src && <Image src={src} alt="" fill sizes={`${size * 2}px`} className="object-cover" />}
    </div>
  );
}

function AudioInner({ item, src }: { item: PlayerItem; src: PlaySource }) {
  const player = React.useRef<MediaPlayerInstance>(null);
  const { sync, setControls, next, sleep, setSleep } = usePlayer();
  const trackView = useViewTracker(item.id, "podcast");
  const progress = useProgressSaver(item.id);
  const lastSync = React.useRef(0);
  const started = React.useRef(false);

  React.useEffect(() => {
    setControls({
      toggle: () => {
        const p = player.current;
        if (!p) return;
        if (p.paused) p.play().catch(() => {});
        else p.pause();
      },
      seek: (t) => {
        if (player.current) player.current.currentTime = t;
      },
      setRate: (r) => {
        if (player.current) player.current.playbackRate = r;
      },
    });
    return () => setControls(null);
  }, [setControls]);

  // Sleep timer
  React.useEffect(() => {
    if (sleep.mode !== "time") return;
    const ms = sleep.at - Date.now();
    const t = setTimeout(() => {
      player.current?.pause();
      setSleep({ mode: "off" });
    }, Math.max(0, ms));
    return () => clearTimeout(t);
  }, [sleep, setSleep]);

  // Media Session — lock screen controls
  React.useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: item.title,
      artist: "TOPJ_GRIND",
      album: "GRIND TALK",
      artwork: item.thumb ? [{ src: item.thumb, sizes: "800x800", type: "image/jpeg" }] : [],
    });
    const p = () => player.current;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => p()?.play()],
      ["pause", () => p()?.pause()],
      ["seekbackward", () => p() && (p()!.currentTime -= 15)],
      ["seekforward", () => p() && (p()!.currentTime += 30)],
      ["seekto", (d) => d.seekTime != null && p() && (p()!.currentTime = d.seekTime)],
      ["nexttrack", () => usePlayer.getState().queue.length && next()],
    ];
    for (const [a, h] of handlers) {
      try {
        ms.setActionHandler(a, h);
      } catch {}
    }
    return () => {
      for (const [a] of handlers) {
        try {
          ms.setActionHandler(a, null);
        } catch {}
      }
    };
  }, [item.title, item.thumb, next]);

  return (
    <MediaPlayer
      ref={player}
      src={{ src: src.src, type: src.type as "audio/mpeg" }}
      viewType="audio"
      load="eager"
      autoPlay
      title={item.title}
      keyDisabled
      className="contents"
      onCanPlay={() => {
        if (started.current) return;
        started.current = true;
        if (item.startAt && player.current) player.current.currentTime = item.startAt;
      }}
      onPlay={() => sync({ paused: false })}
      onRateChange={() => sync({ rate: player.current?.playbackRate ?? 1 })}
      onPause={() => {
        sync({ paused: true });
        progress.flush();
      }}
      onTimeUpdate={() => {
        const p = player.current;
        if (!p) return;
        const t = p.currentTime;
        trackView(t, p.paused, p.state.duration);
        progress.tick(t, p.state.duration);
        if (Date.now() - lastSync.current > 500) {
          lastSync.current = Date.now();
          sync({ currentTime: t });
          if ("mediaSession" in navigator && p.state.duration) {
            try {
              navigator.mediaSession.setPositionState({ duration: p.state.duration, position: Math.min(t, p.state.duration), playbackRate: p.state.playbackRate });
            } catch {}
          }
        }
      }}
      onEnded={() => {
        progress.flush();
        if (sleep.mode === "end") {
          setSleep({ mode: "off" });
          sync({ paused: true });
          return;
        }
        next();
      }}
    >
      <MediaProvider />
      <AudioUI item={item} />
    </MediaPlayer>
  );
}

const SPEEDS = [0.8, 1, 1.25, 1.5, 1.75, 2];

function AudioUI({ item }: { item: PlayerItem }) {
  const remote = useMediaRemote();
  const paused = useMediaState("paused");
  const time = useMediaState("currentTime");
  const duration = useMediaState("duration") || item.duration;
  const rate = useMediaState("playbackRate");
  const { expanded, setExpanded, close, queue, sleep, setSleep, play } = usePlayer();
  const pct = duration ? (time / duration) * 100 : 0;
  const chapter = item.chapters?.filter((c) => c.start_sec <= time).at(-1);

  const PlayIcon = paused ? Play : Pause;

  return (
    <>
      {/* Mini bar */}
      <div className="fixed inset-x-0 bottom-14 z-40 px-2 pb-2 sm:bottom-0 sm:px-4 sm:pb-4 safe-bottom">
        <div className="glass relative mx-auto flex h-16 max-w-3xl items-center gap-2 overflow-hidden rounded-[16px] border border-border pl-2 pr-1 shadow-2xl sm:gap-3 sm:px-3">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-[var(--border)]" aria-hidden>
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setExpanded(true)} aria-label="เปิดเครื่องเล่นแบบเต็ม">
            <Cover src={item.thumb} size={44} />
            <span className="min-w-0">
              <span className="line-clamp-1 block text-[14px] font-medium">{item.title}</span>
              <span className="tnum line-clamp-1 block text-[12px] text-text-2">
                {chapter ? chapter.title + " · " : ""}
                {formatDuration(time)} / {formatDuration(duration)}
              </span>
            </span>
          </button>
          <button onClick={() => remote.seek(Math.max(0, time - 15))} className="hidden rounded-full p-2 hover:bg-hover sm:block" aria-label="ย้อน 15 วินาที">
            <RotateCcw className="size-5" />
          </button>
          <button onClick={() => remote.togglePaused()} className="rounded-full p-2 hover:bg-hover" aria-label={paused ? "เล่น" : "หยุดชั่วคราว"}>
            <PlayIcon className="size-6 fill-current" strokeWidth={0} />
          </button>
          <button onClick={() => remote.seek(time + 30)} className="rounded-full p-2 hover:bg-hover" aria-label="ข้าม 30 วินาที">
            <RotateCw className="size-5" />
          </button>
          <button onClick={close} className="rounded-full p-2 hover:bg-hover" aria-label="ปิดเครื่องเล่น">
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Full player sheet (Apple Music style) */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <SheetContent side="bottom" className="h-[100dvh] max-h-none rounded-none sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90dvh] sm:w-[460px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[20px]">
          <div className="flex items-center justify-between px-4 pt-2">
            <button onClick={() => setExpanded(false)} className="rounded-full p-2 hover:bg-hover" aria-label="ย่อเครื่องเล่น">
              <ChevronDown className="size-6" />
            </button>
            <span className="t-caption font-semibold uppercase tracking-wider text-text-2">กำลังเล่น</span>
            <Link href={`/podcasts/${item.id}`} onClick={() => setExpanded(false)} className="rounded-full px-3 py-1.5 text-[13px] font-medium hover:bg-hover">
              หน้าตอน
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-8 pt-4">
            <div className={cn("mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-[20px] shadow-2xl transition-transform duration-500 ease-[var(--ease-apple)]", paused && "scale-[0.88]")}>
              {item.thumb && <Image src={item.thumb} alt="" width={680} height={680} className="size-full object-cover" />}
            </div>
            <h2 className="t-h2 mt-6 line-clamp-2">{item.title}</h2>
            <p className="t-meta">TOPJ_GRIND{chapter ? ` · ${chapter.title}` : ""}</p>

            <input
              type="range"
              min={0}
              max={duration || 1}
              step={1}
              value={time}
              onChange={(e) => remote.seek(Number(e.target.value))}
              aria-label="ตำแหน่งการเล่น"
              className="mt-5 h-1.5 w-full cursor-pointer accent-[var(--accent)]"
            />
            <div className="tnum flex justify-between text-[12px] text-text-2">
              <span>{formatDuration(time)}</span>
              <span>-{formatDuration(Math.max(0, duration - time))}</span>
            </div>

            <div className="mt-4 flex items-center justify-center gap-8">
              <button onClick={() => remote.seek(Math.max(0, time - 15))} className="rounded-full p-3 hover:bg-hover" aria-label="ย้อน 15 วินาที">
                <RotateCcw className="size-7" />
              </button>
              <button onClick={() => remote.togglePaused()} className="flex size-16 items-center justify-center rounded-full bg-text text-bg active:scale-95" aria-label={paused ? "เล่น" : "หยุดชั่วคราว"}>
                <PlayIcon className={cn("size-7 fill-current", paused && "translate-x-0.5")} strokeWidth={0} />
              </button>
              <button onClick={() => remote.seek(time + 30)} className="rounded-full p-3 hover:bg-hover" aria-label="ข้าม 30 วินาที">
                <RotateCw className="size-7" />
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-[14px] bg-surface p-3">
                <p className="t-caption mb-2 text-text-2">ความเร็ว</p>
                <div className="flex flex-wrap gap-1">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => remote.changePlaybackRate(s)}
                      className={cn("tnum rounded-full px-2 py-1 text-[12px] font-medium", rate === s ? "bg-text text-bg" : "hover:bg-hover")}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[14px] bg-surface p-3">
                <p className="t-caption mb-2 flex items-center gap-1 text-text-2">
                  <Moon className="size-3" /> ตั้งเวลาปิด
                  {sleep.mode === "time" && <SleepLeft at={sleep.at} />}
                </p>
                <div className="flex flex-wrap gap-1">
                  {([15, 30, 60] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setSleep(sleep.mode === "time" && sleep.minutes === m ? { mode: "off" } : { mode: "time", minutes: m, at: Date.now() + m * 60_000 })}
                      className={cn("tnum rounded-full px-2 py-1 text-[12px] font-medium", sleep.mode === "time" && sleep.minutes === m ? "bg-text text-bg" : "hover:bg-hover")}
                    >
                      {m} นาที
                    </button>
                  ))}
                  <button
                    onClick={() => setSleep(sleep.mode === "end" ? { mode: "off" } : { mode: "end" })}
                    className={cn("rounded-full px-2 py-1 text-[12px] font-medium", sleep.mode === "end" ? "bg-text text-bg" : "hover:bg-hover")}
                  >
                    จบตอน
                  </button>
                </div>
              </div>
            </div>

            {item.chapters && item.chapters.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 font-semibold">Chapters</h3>
                <ul>
                  {item.chapters.map((c) => (
                    <li key={c.start_sec}>
                      <button
                        onClick={() => remote.seek(c.start_sec)}
                        className={cn("flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left text-[14px] hover:bg-hover", chapter?.start_sec === c.start_sec && "font-semibold")}
                      >
                        <span className="tnum w-12 text-[12px] text-text-2">{formatDuration(c.start_sec)}</span>
                        {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {queue.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <ListMusic className="size-4" /> ถัดไป
                </h3>
                <ul>
                  {queue.map((q, i) => (
                    <li key={q.id}>
                      <button
                        onClick={() => play(q, queue.slice(i + 1))}
                        className="flex w-full items-center gap-3 rounded-[10px] p-2 text-left hover:bg-hover"
                      >
                        <Cover src={q.thumb} size={40} />
                        <span className="line-clamp-2 flex-1 text-[13px] font-medium">{q.title}</span>
                        <span className="tnum text-[12px] text-text-2">{formatDuration(q.duration)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </SheetContent>
      </Dialog>
    </>
  );
}

function SleepLeft({ at }: { at: number }) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  return <span className="tnum ml-auto">{Math.max(1, Math.round((at - Date.now()) / 60_000))} นาที</span>;
}
