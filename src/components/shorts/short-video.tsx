"use client";
import * as React from "react";
import { MediaPlayer, MediaProvider, useMediaRemote, useMediaState, type MediaPlayerInstance } from "@vidstack/react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { usePlaySource, useViewTracker } from "@/components/player/playback-hooks";
import type { Content } from "@/lib/types";

/** The playing part of a Grind slide. Lazy-loaded so the feed paints before the player library. */
export function ShortVideo({
  c,
  active,
  muted,
  setMuted,
  onDoubleTap,
}: {
  c: Content;
  active: boolean;
  muted: boolean;
  setMuted: (v: boolean) => void;
  onDoubleTap: (x: number, y: number) => void;
}) {
  const { source: src, error, retry } = usePlaySource(c.id);
  const player = React.useRef<MediaPlayerInstance>(null);
  const trackView = useViewTracker(c.id, "short");

  React.useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (active) p.play().catch(() => {});
    else {
      p.pause();
      p.currentTime = 0;
    }
  }, [active, src]);

  if (error === "unavailable")
    return (
      <div role="alert" className="absolute inset-0 z-[7] flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
        <p className="text-[15px] font-medium">เล่นคลิปนี้ไม่ได้ตอนนี้</p>
        <button onClick={retry} className="h-11 rounded-[6px] bg-white px-5 text-[14px] font-semibold text-black">
          โหลดใหม่
        </button>
      </div>
    );
  if (!src) return <div className="skeleton absolute inset-0 bg-transparent" />;

  return (
    <MediaPlayer
      ref={player}
      src={{ src: src.src, type: src.type as "video/mp4" }}
      title={c.title}
      playsInline
      loop
      muted={muted}
      autoPlay={active}
      keyDisabled
      load="eager"
      className="absolute inset-0 size-full"
      onTimeUpdate={() => {
        const p = player.current;
        if (p) trackView(p.currentTime, p.paused, p.state.duration);
      }}
    >
      <MediaProvider className="size-full [&_video]:size-full [&_video]:object-cover" />
      <ShortSurface muted={muted} setMuted={setMuted} onDoubleTap={onDoubleTap} />
    </MediaPlayer>
  );
}

function ShortSurface({ muted, setMuted, onDoubleTap }: { muted: boolean; setMuted: (v: boolean) => void; onDoubleTap: (x: number, y: number) => void }) {
  const remote = useMediaRemote();
  const paused = useMediaState("paused");
  const time = useMediaState("currentTime");
  const duration = useMediaState("duration");
  const last = React.useRef(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = React.useState<null | "play" | "pause">(null);

  const onTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const now = Date.now();
    if (now - last.current < 280) {
      if (timer.current) clearTimeout(timer.current);
      last.current = 0;
      onDoubleTap(x, y);
      return;
    }
    last.current = now;
    timer.current = setTimeout(() => {
      if (muted) {
        setMuted(false); // first tap only unmutes
        return;
      }
      setFlash(paused ? "play" : "pause");
      setTimeout(() => setFlash(null), 500);
      remote.togglePaused();
    }, 280);
  };

  return (
    <>
      <div className="absolute inset-0 z-[5]" onPointerUp={onTap} />
      {flash && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 z-[6] flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/50" style={{ animation: "fadeOut 500ms ease forwards" }}>
          {flash === "play" ? <Play className="size-7 fill-white text-white" /> : <Pause className="size-7 fill-white text-white" />}
        </span>
      )}
      <button
        onClick={() => setMuted(!muted)}
        className="absolute right-3 top-3 z-[6] flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
        aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"}
      >
        {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
      </button>
      {muted && (
        <span className="pointer-events-none absolute left-3 top-4 z-[6] rounded-full bg-black/40 px-2.5 py-1 text-[12px] text-white backdrop-blur">แตะเพื่อเปิดเสียง</span>
      )}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={time}
        onChange={(e) => remote.seek(Number(e.target.value))}
        aria-label="ตำแหน่งคลิป"
        className="absolute inset-x-0 bottom-0 z-[11] h-1 w-full cursor-pointer appearance-none bg-white/25 accent-white [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        style={{ background: `linear-gradient(to right, #fff ${duration ? (time / duration) * 100 : 0}%, rgba(255,255,255,.25) 0)` }}
      />
    </>
  );
}
