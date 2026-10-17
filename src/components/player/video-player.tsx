"use client";
import * as React from "react";
import {
  MediaPlayer,
  MediaProvider,
  Poster,
  TimeSlider,
  Track,
  useMediaRemote,
  useMediaState,
  useVideoQualityOptions,
  type MediaPlayerInstance,
} from "@vidstack/react";
import {
  Captions,
  Check,
  Gauge,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useSeekBus } from "@/lib/stores/bus";
import { usePlaySource, useProgressSaver, useViewTracker, type PlaySource } from "./playback-hooks";
import { formatDuration } from "@/lib/format";
import type { Chapter } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface VideoPlayerProps {
  id: string;
  title: string;
  poster: string | null;
  durationHint: number;
  chapters: Chapter[];
  startAt?: number;
  autoPlay?: boolean;
  theater?: boolean;
  onToggleTheater?: () => void;
  onEnded?: () => void;
  /** live time reporter (used for mini-player handoff + share "start at") */
  onTime?: (t: number, paused: boolean) => void;
  loop?: boolean;
  variant?: "watch" | "mini";
  className?: string;
  children?: React.ReactNode;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * Fetches a short-lived signed URL from /api/play/[id] (which checks membership)
 * and renders Vidstack with brand-styled custom controls.
 */
export function VideoPlayer(props: VideoPlayerProps) {
  const { source, error, retry } = usePlaySource(props.id);

  if (error)
    return (
      <div className={cn("relative aspect-video overflow-hidden bg-black", props.className)}>
        <PlayFailure members={error === "members_only"} onRetry={retry} />
      </div>
    );
  if (!source)
    return (
      <div className={cn("relative aspect-video overflow-hidden bg-black", props.className)}>
        {props.poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.poster} alt="" fetchPriority="high" className="absolute inset-0 size-full object-cover opacity-60" />
        )}
        <div className="skeleton absolute inset-0 bg-transparent" />
      </div>
    );
  return <PlayerInner {...props} source={source} onRetry={retry} />;
}

/** Shown instead of an endless spinner when a video can't be loaded. */
function PlayFailure({ members, onRetry }: { members?: boolean; onRetry: () => void }) {
  return (
    <div role="alert" className="absolute inset-0 z-[7] flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center text-white">
      <p className="text-[15px] font-medium">{members ? "คอนเทนต์นี้สำหรับสมาชิก" : "เล่นวิดีโอนี้ไม่ได้ตอนนี้"}</p>
      {!members && (
        <>
          <p className="max-w-xs text-[13px] text-white/70">อาจเป็นเพราะเน็ตหลุดหรือลิงก์หมดอายุ ลองโหลดใหม่ได้เลย</p>
          <button onClick={onRetry} className="mt-1 h-11 rounded-[6px] bg-white px-5 text-[14px] font-semibold text-black">
            โหลดใหม่
          </button>
        </>
      )}
    </div>
  );
}

function PlayerInner({
  id,
  title,
  poster,
  chapters,
  startAt,
  autoPlay = true,
  theater,
  onToggleTheater,
  onEnded,
  onTime,
  loop,
  variant = "watch",
  className,
  children,
  source,
  onRetry,
}: VideoPlayerProps & { source: PlaySource; onRetry: () => void }) {
  const player = React.useRef<MediaPlayerInstance>(null);
  const register = useSeekBus((s) => s.register);
  const trackView = useViewTracker(id, "video");
  const progress = useProgressSaver(id);
  const started = React.useRef(false);

  // chapters → VTT JSON for the chapter-segmented progress bar
  const chapterContent = React.useMemo(() => {
    if (!chapters.length) return null;
    return {
      cues: chapters.map((c, i) => ({
        startTime: c.start_sec,
        endTime: chapters[i + 1]?.start_sec ?? 359_999,
        text: c.title,
      })),
    };
  }, [chapters]);

  React.useEffect(() => {
    if (variant !== "watch") return;
    register(
      (t) => {
        const p = player.current;
        if (!p) return;
        p.currentTime = t;
        p.play().catch(() => {});
      },
      () => player.current?.currentTime ?? 0,
    );
    return () => register(null);
  }, [register, variant]);

  const onTimeUpdate = React.useCallback(() => {
    const p = player.current;
    if (!p) return;
    const t = p.currentTime;
    trackView(t, p.paused, p.state.duration);
    progress.tick(t, p.state.duration);
    onTime?.(t, p.paused);
  }, [onTime, trackView, progress]);

  return (
    <MediaPlayer
      ref={player}
      src={{ src: source.src, type: source.type as "video/mp4" }}
      title={title}
      playsInline
      autoPlay={autoPlay}
      loop={loop}
      keyDisabled
      load="eager"
      className={cn("group/player relative aspect-video w-full overflow-hidden bg-black text-white", className)}
      onCanPlay={() => {
        if (started.current) return;
        started.current = true;
        if (startAt && player.current) player.current.currentTime = startAt;
      }}
      onTimeUpdate={onTimeUpdate}
      onPause={() => {
        progress.flush();
        onTime?.(player.current?.currentTime ?? 0, true);
      }}
      onEnded={() => {
        progress.flush();
        onEnded?.();
      }}
    >
      <MediaProvider className="size-full [&_video]:size-full [&_video]:object-contain">
        {poster && <Poster src={poster} alt="" className="absolute inset-0 size-full object-cover opacity-0 transition-opacity data-[visible]:opacity-100" />}
        {chapterContent && <Track kind="chapters" content={chapterContent} type="json" lang="th-TH" label="Chapters" default />}
        {source.captions && <Track src={source.captions} kind="subtitles" lang="th-TH" label="ไทย" />}
      </MediaProvider>
      {variant === "watch" ? (
        <WatchControls theater={theater} onToggleTheater={onToggleTheater} hasChapters={!!chapterContent} hasCaptions={!!source.captions} />
      ) : (
        <MiniControls />
      )}
      <PlaybackStatus onRetry={onRetry} />
      {children}
    </MediaPlayer>
  );
}

function PlaybackStatus({ onRetry }: { onRetry: () => void }) {
  const error = useMediaState("error");
  const waiting = useMediaState("waiting");
  const canPlay = useMediaState("canPlay");
  if (error) return <PlayFailure onRetry={onRetry} />;
  if (!waiting && canPlay) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      <div className="size-12 animate-spin rounded-full border-2 border-white/25 border-t-white" />
    </div>
  );
}

function MiniControls() {
  const paused = useMediaState("paused");
  const remote = useMediaRemote();
  return (
    <button
      className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity hover:bg-black/30 hover:opacity-100"
      onClick={() => remote.togglePaused()}
      aria-label={paused ? "เล่น" : "หยุดชั่วคราว"}
    >
      {paused ? <Play className="size-8 fill-white" /> : <Pause className="size-8 fill-white" />}
    </button>
  );
}

function IconBtn({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-white/15 [&_svg]:size-[22px]", className)}
    >
      {children}
    </button>
  );
}

function WatchControls({
  theater,
  onToggleTheater,
  hasChapters,
  hasCaptions,
}: {
  theater?: boolean;
  onToggleTheater?: () => void;
  hasChapters: boolean;
  hasCaptions: boolean;
}) {
  const remote = useMediaRemote();
  const paused = useMediaState("paused");
  const muted = useMediaState("muted");
  const volume = useMediaState("volume");
  const currentTime = useMediaState("currentTime");
  const duration = useMediaState("duration");
  const fullscreen = useMediaState("fullscreen");
  const controlsVisible = useMediaState("controlsVisible");
  const rate = useMediaState("playbackRate");
  const canPip = useMediaState("canPictureInPicture");
  const textTrack = useMediaState("textTrack");
  const ended = useMediaState("ended");
  const [menu, setMenu] = React.useState<null | "settings">(null);
  const [ripple, setRipple] = React.useState<null | { side: "l" | "r"; key: number }>(null);
  const showUi = controlsVisible || paused || menu !== null;

  // Keyboard shortcuts (spec §7.3)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const p = remote.getPlayer();
      if (!p) return;
      const k = e.key;
      const seek = (d: number) => remote.seek(Math.max(0, Math.min(p.state.duration, p.currentTime + d)));
      if (k === "k" || k === "K" || (k === " " && t.tagName !== "BUTTON")) {
        e.preventDefault();
        remote.togglePaused();
      } else if (k === "j" || k === "J") seek(-10);
      else if (k === "l" || k === "L") seek(10);
      else if (k === "ArrowLeft") {
        e.preventDefault();
        seek(-5);
      } else if (k === "ArrowRight") {
        e.preventDefault();
        seek(5);
      } else if (k === "f" || k === "F") remote.toggleFullscreen();
      else if (k === "m" || k === "M") remote.toggleMuted();
      else if (k === "t" || k === "T") onToggleTheater?.();
      else if (k === ">" || (e.shiftKey && k === ".")) remote.changePlaybackRate(RATES[Math.min(RATES.length - 1, RATES.indexOf(p.state.playbackRate) + 1)] ?? 1);
      else if (k === "<" || (e.shiftKey && k === ",")) remote.changePlaybackRate(RATES[Math.max(0, RATES.indexOf(p.state.playbackRate) - 1)] ?? 1);
      else if (/^[0-9]$/.test(k)) remote.seek((p.state.duration * Number(k)) / 10);
      else return;
      remote.resumeControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [remote, onToggleTheater]);

  // Tap: toggle play (desktop) / show controls (touch). Double-tap sides: ±10s with ripple.
  const lastTap = React.useRef(0);
  const tapTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSurface = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 2 ? "l" : "r";
    const now = Date.now();
    const touch = e.pointerType === "touch";
    if (now - lastTap.current < 300) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (touch) {
        const p = remote.getPlayer();
        if (p) remote.seek(Math.max(0, p.currentTime + (side === "l" ? -10 : 10)));
        setRipple({ side, key: now });
      } else remote.toggleFullscreen();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      if (touch && !controlsVisible) remote.resumeControls();
      else remote.togglePaused();
    }, 250);
  };

  return (
    <>
      <div className="absolute inset-0 z-[1]" onPointerUp={onSurface} aria-hidden />
      {ripple && (
        <div
          key={ripple.key}
          className={cn("pointer-events-none absolute inset-y-0 z-[2] flex w-1/2 items-center justify-center", ripple.side === "l" ? "left-0" : "right-0")}
        >
          <span className="absolute size-40 rounded-full bg-white/25" style={{ animation: "ripple 600ms var(--ease-apple) forwards" }} />
          <span className="relative flex items-center gap-1 text-[14px] font-semibold">
            {ripple.side === "l" ? <RotateCcw className="size-5" /> : <RotateCw className="size-5" />} 10 วินาที
          </span>
        </div>
      )}

      {/* Big center play when paused (not on ended) */}
      {paused && !ended && (
        <button
          onClick={() => remote.play()}
          className="absolute left-1/2 top-1/2 z-[3] flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 backdrop-blur transition-transform hover:scale-105 sm:size-20"
          aria-label="เล่น"
        >
          <Play className="size-8 translate-x-0.5 fill-white sm:size-9" strokeWidth={0} />
        </button>
      )}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[4] bg-gradient-to-t from-black/80 via-black/30 to-transparent px-2 pb-1 pt-16 transition-opacity duration-200 sm:px-4",
          showUi ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <ProgressBar hasChapters={hasChapters} />
        <div className="flex items-center gap-0.5 sm:gap-1">
          <IconBtn label={paused ? "เล่น (k)" : "หยุดชั่วคราว (k)"} onClick={() => remote.togglePaused()}>
            {paused ? <Play className="fill-white" strokeWidth={0} /> : <Pause className="fill-white" strokeWidth={0} />}
          </IconBtn>
          <IconBtn label="ย้อน 10 วินาที (j)" onClick={() => remote.seek(Math.max(0, currentTime - 10))} className="hidden sm:inline-flex">
            <RotateCcw />
          </IconBtn>
          <IconBtn label="ข้าม 10 วินาที (l)" onClick={() => remote.seek(currentTime + 10)} className="hidden sm:inline-flex">
            <RotateCw />
          </IconBtn>
          <div className="group/vol flex items-center">
            <IconBtn label={muted ? "เปิดเสียง (m)" : "ปิดเสียง (m)"} onClick={() => remote.toggleMuted()}>
              {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
            </IconBtn>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                remote.changeVolume(v);
                if (v > 0 && muted) remote.unmute();
              }}
              aria-label="ระดับเสียง"
              className="hidden h-1 w-0 cursor-pointer accent-white opacity-0 transition-all duration-200 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:w-20 focus:opacity-100 sm:block"
            />
          </div>
          <span className="tnum ml-2 text-[13px] text-white/90">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
          {hasChapters && <CurrentChapter />}
          <div className="ml-auto flex items-center">
            {hasCaptions && (
              <IconBtn label="คำบรรยาย (c)" onClick={() => remote.toggleCaptions()} className={cn(textTrack && "text-accent")}>
                <Captions />
              </IconBtn>
            )}
            <div className="relative">
              <IconBtn label="การตั้งค่า" onClick={() => setMenu(menu ? null : "settings")}>
                <Settings2 className={cn("transition-transform", menu && "rotate-45")} />
              </IconBtn>
              {menu && <SettingsMenu rate={rate} onClose={() => setMenu(null)} />}
            </div>
            {onToggleTheater && (
              <IconBtn label={theater ? "ออกจากโหมดโรงภาพยนตร์ (t)" : "โหมดโรงภาพยนตร์ (t)"} onClick={onToggleTheater} className="hidden lg:inline-flex">
                <RectangleHorizontal className={cn(theater && "scale-x-125")} />
              </IconBtn>
            )}
            {canPip && (
              <IconBtn label="ภาพซ้อนภาพ" onClick={() => remote.togglePictureInPicture()} className="hidden sm:inline-flex">
                <PictureInPicture2 />
              </IconBtn>
            )}
            <IconBtn label={fullscreen ? "ออกจากเต็มจอ (f)" : "เต็มจอ (f)"} onClick={() => remote.toggleFullscreen()}>
              {fullscreen ? <Minimize /> : <Maximize />}
            </IconBtn>
          </div>
        </div>
      </div>
    </>
  );
}

function CurrentChapter() {
  const textTracks = useMediaState("textTracks");
  const currentTime = useMediaState("currentTime");
  const track = textTracks.find((t) => t.kind === "chapters");
  const cue = track?.cues.find((c) => currentTime >= c.startTime && currentTime < c.endTime);
  if (!cue) return null;
  return <span className="ml-3 hidden truncate text-[13px] text-white/90 md:inline">· {cue.text}</span>;
}

function ProgressBar({ hasChapters }: { hasChapters: boolean }) {
  const trackCls = "relative z-0 h-[4px] w-full rounded-full bg-white/25 transition-[height] duration-150 group-data-[active]/slider:h-[6px]";
  const fillCls = "absolute h-full rounded-full bg-accent will-change-[width]";
  const progressCls = "absolute h-full rounded-full bg-white/40 will-change-[width]";
  return (
    <TimeSlider.Root className="group/slider relative mx-1 flex h-5 w-[calc(100%-8px)] cursor-pointer touch-none select-none items-center outline-none">
      {hasChapters ? (
        <TimeSlider.Chapters className="relative flex h-full w-full items-center">
          {(cues, forwardRef) =>
            cues.map((cue) => (
              <div key={cue.startTime} ref={forwardRef} className="relative mr-[3px] flex h-full w-full items-center last:mr-0" style={{ contain: "layout style" }}>
                <TimeSlider.Track className={trackCls}>
                  <TimeSlider.TrackFill className={cn(fillCls, "w-[var(--chapter-fill)]")} />
                  <TimeSlider.Progress className={cn(progressCls, "w-[var(--chapter-progress)]")} />
                </TimeSlider.Track>
              </div>
            ))
          }
        </TimeSlider.Chapters>
      ) : (
        <TimeSlider.Track className={trackCls}>
          <TimeSlider.TrackFill className={cn(fillCls, "w-[var(--slider-fill)]")} />
          <TimeSlider.Progress className={cn(progressCls, "w-[var(--slider-progress)]")} />
        </TimeSlider.Track>
      )}
      <TimeSlider.Thumb className="absolute left-[var(--slider-fill)] top-1/2 z-20 size-[14px] -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent transition-transform duration-150 will-change-[left] group-data-[active]/slider:scale-100" />
      <TimeSlider.Preview className="pointer-events-none flex flex-col items-center opacity-0 transition-opacity duration-150 data-[visible]:opacity-100">
        <TimeSlider.ChapterTitle className="mb-1 max-w-[220px] truncate rounded-md bg-black/80 px-2 py-0.5 text-[12px] font-medium" />
        <TimeSlider.Value className="tnum rounded-md bg-black/80 px-2 py-0.5 text-[13px] font-medium" />
      </TimeSlider.Preview>
    </TimeSlider.Root>
  );
}

function SettingsMenu({ rate, onClose }: { rate: number; onClose: () => void }) {
  const remote = useMediaRemote();
  const qualities = useVideoQualityOptions({ auto: "อัตโนมัติ", sort: "descending" });
  const [tab, setTab] = React.useState<"root" | "speed" | "quality">("root");
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);
  const selectedQuality = qualities.find((q) => q.selected);
  const row = "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[14px] hover:bg-white/10";
  return (
    <div ref={ref} className="tg-drop absolute bottom-12 right-0 z-10 w-60 rounded-[14px] border border-white/10 bg-[#1c1c1f]/95 p-1.5 shadow-2xl backdrop-blur-xl">
      {tab === "root" && (
        <>
          <button className={row} onClick={() => setTab("speed")}>
            <Gauge className="size-[18px]" /> ความเร็ว <span className="ml-auto text-white/60">{rate === 1 ? "ปกติ" : `${rate}x`}</span>
          </button>
          {qualities.length > 1 && (
            <button className={row} onClick={() => setTab("quality")}>
              <Settings2 className="size-[18px]" /> คุณภาพ
              <span className="ml-auto text-white/60">{selectedQuality?.label ?? "อัตโนมัติ"}</span>
            </button>
          )}
        </>
      )}
      {tab === "speed" &&
        RATES.map((r) => (
          <button
            key={r}
            className={row}
            onClick={() => {
              remote.changePlaybackRate(r);
              onClose();
            }}
          >
            <Check className={cn("size-4", r === rate ? "opacity-100" : "opacity-0")} />
            {r === 1 ? "ปกติ" : `${r}x`}
          </button>
        ))}
      {tab === "quality" &&
        qualities.map((q) => (
          <button
            key={q.value}
            className={row}
            onClick={() => {
              q.select();
              onClose();
            }}
          >
            <Check className={cn("size-4", q.selected ? "opacity-100" : "opacity-0")} />
            {q.label}
            {q.bitrateText && <span className="ml-auto text-[12px] text-white/50">{q.bitrateText}</span>}
          </button>
        ))}
    </div>
  );
}
