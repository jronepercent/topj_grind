"use client";
import * as React from "react";
import { Maximize2 } from "lucide-react";
import { toPlayerItem } from "@/components/cards/cards";
import { usePlayer } from "@/lib/stores/player";
import type { Chapter, Content } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Cue = { start: number; end: number; text: string };
type Episode = Pick<Content, "id" | "title" | "thumbnail_url" | "duration_sec" | "has_captions">;
type Loaded = { status: "idle" } | { status: "loading" } | { status: "ok"; cues: Cue[] } | { status: "forbidden" } | { status: "error" };

// ───────────────────────── VTT ─────────────────────────
function parseTime(s: string): number {
  const p = s.trim().replace(",", ".").split(":").map(Number);
  if (p.some((n) => Number.isNaN(n))) return NaN;
  return p.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseVtt(text: string): Cue[] {
  const out: Cue[] = [];
  for (const block of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const start = parseTime(a);
    const end = parseTime((b ?? "").trim().split(/\s+/)[0] ?? "");
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const t = lines
      .slice(i + 1)
      .map((l) => l.replace(/<[^>]+>/g, "").trim())
      .filter(Boolean)
      .join(" ");
    if (t) out.push({ start, end, text: t });
  }
  return out;
}

/** Binary search: index of the last cue with start <= t, or -1. */
function findCue(cues: Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

// One download shared by the episode page card and the player sheet. Only successes stay cached.
const cache = new Map<string, Promise<Loaded>>();
function loadCues(id: string): Promise<Loaded> {
  const hit = cache.get(id);
  if (hit) return hit;
  const p: Promise<Loaded> = fetch(`/api/play/${id}/captions`)
    .then(async (r): Promise<Loaded> => {
      if (r.status === 403) return { status: "forbidden" };
      if (!r.ok) return { status: "error" };
      const cues = parseVtt(await r.text());
      return cues.length ? { status: "ok", cues } : { status: "error" };
    })
    .catch((): Loaded => ({ status: "error" }));
  cache.set(id, p);
  void p.then((v) => {
    if (v.status !== "ok") cache.delete(id);
  });
  return p;
}

// ───────────────────────── Component ─────────────────────────
export function TranscriptLyrics({
  c,
  queue,
  chapters,
  variant,
}: {
  c: Episode;
  queue?: Content[];
  chapters?: Chapter[];
  variant: "card" | "sheet";
}) {
  const [state, setState] = React.useState<Loaded>(() => ({ status: "idle" }));
  const playing = usePlayer((s) => s.item?.id === c.id);

  // Loads on mount: the card sits near the top of the episode page and the sheet only mounts when opened.
  React.useEffect(() => {
    if (!c.has_captions) return;
    let dead = false;
    setState({ status: "loading" });
    loadCues(c.id).then((v) => !dead && setState(v));
    return () => {
      dead = true;
    };
  }, [c.id, c.has_captions]);

  // Like ShowNotes.onTime: seek if this episode is loaded, otherwise start it from t.
  const jump = React.useCallback(
    (t: number) => {
      const s = usePlayer.getState();
      if (s.item?.id === c.id && s.controls) {
        s.controls.seek(t);
        if (s.paused) s.controls.toggle(); // Spotify-style: tapping a line also plays
        return;
      }
      const rest = queue ? queue.slice(queue.findIndex((q) => q.id === c.id) + 1).map(toPlayerItem) : undefined;
      s.play({ ...toPlayerItem(c), chapters, startAt: t }, rest);
    },
    [c, queue, chapters],
  );

  if (!c.has_captions || state.status === "error") return null;

  const body =
    state.status === "forbidden" ? (
      <p className="t-meta flex h-full items-center justify-center px-6 text-center">ล็อกอินหรือเป็นสมาชิกเพื่ออ่านตัวหนังสือของตอนนี้</p>
    ) : state.status === "ok" ? (
      <Scroller key={c.id} cues={state.cues} id={c.id} variant={variant} onJump={jump} />
    ) : (
      <div className="flex h-full flex-col gap-4 px-5 pt-6" aria-busy="true" aria-label="กำลังโหลดตัวหนังสือ">
        {[88, 64, 76, 52, 80].map((w, i) => (
          <div key={i} className="h-6 animate-pulse rounded-full bg-hover" style={{ width: `${w}%` }} />
        ))}
      </div>
    );

  if (variant === "sheet")
    return (
      <div className="relative h-full min-h-[240px]">
        {body}
      </div>
    );

  return (
    <section
      aria-label="ตัวหนังสือ"
      className="overflow-hidden rounded-[20px] border border-border"
      style={{ background: "color-mix(in srgb, var(--accent) 24%, var(--surface))" }}
    >
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="t-h2">ตัวหนังสือ</h2>
        {state.status === "ok" && (
          <button
            onClick={() => {
              if (!playing) jump(0);
              usePlayer.getState().setLyricsOn(true);
              usePlayer.setState({ expanded: true });
            }}
            className="flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--border-strong)]"
          >
            <Maximize2 className="size-3.5" /> ขยาย
          </button>
        )}
      </div>
      <div className="h-[360px] sm:h-[420px]">{body}</div>
    </section>
  );
}

// ───────────────────────── Scrolling lines ─────────────────────────
const FADE = "linear-gradient(to bottom, transparent 0, #000 12%, #000 88%, transparent 100%)";

function Scroller({ cues, id, variant, onJump }: { cues: Cue[]; id: string; variant: "card" | "sheet"; onJump: (t: number) => void }) {
  // The selector returns a number, so the store's ~4 Hz time ticks only re-render when the line changes.
  const idx = usePlayer((s) => (s.item?.id === id ? findCue(cues, s.currentTime) : -1));
  const boxRef = React.useRef<HTMLDivElement>(null);
  const lineRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const idxRef = React.useRef(idx);
  idxRef.current = idx;
  const pausedRef = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const placed = React.useRef(false);
  const [paused, setPaused] = React.useState(false);

  const scrollTo = React.useCallback((i: number, smooth: boolean) => {
    const box = boxRef.current;
    const el = lineRefs.current[i];
    if (!box || !el) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ top: Math.max(0, el.offsetTop - box.clientHeight * 0.3), behavior: smooth && !reduce ? "smooth" : "auto" });
  }, []);

  const resume = React.useCallback(() => {
    clearTimeout(timer.current);
    pausedRef.current = false;
    setPaused(false);
    if (idxRef.current >= 0) scrollTo(idxRef.current, true);
  }, [scrollTo]);

  const userTouched = React.useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(resume, 4000);
  }, [resume]);

  React.useEffect(() => () => clearTimeout(timer.current), []);

  React.useEffect(() => {
    if (idx < 0 || pausedRef.current) return;
    scrollTo(idx, placed.current);
    placed.current = true;
  }, [idx, scrollTo]);

  const text = variant === "sheet" ? "text-[17px] sm:text-[18px] py-2.5" : "text-[16px] sm:text-[17px] py-2";
  const mask = { maskImage: FADE, WebkitMaskImage: FADE };

  return (
    <div className="relative h-full">
      <div
        ref={boxRef}
        onWheel={userTouched}
        onTouchStart={userTouched}
        onTouchMove={userTouched}
        onPointerDown={(e) => e.target === e.currentTarget && userTouched()}
        className="relative h-full overflow-y-auto overscroll-contain px-5 py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={mask}
      >
        {cues.map((cue, i) => (
          <button
            key={i}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            onClick={() => {
              onJump(cue.start);
              pausedRef.current = false;
              setPaused(false);
              clearTimeout(timer.current);
            }}
            aria-current={i === idx ? "true" : undefined}
            className={cn(
              "block w-full rounded-[10px] px-0.5 text-left font-normal leading-[1.6] text-text transition-opacity duration-200 motion-reduce:transition-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
              text,
              idx < 0 ? "opacity-[0.65]" : i === idx ? "opacity-100" : i < idx ? "opacity-[0.4]" : "opacity-[0.65]",
            )}
          >
            {cue.text}
          </button>
        ))}
        <div aria-hidden className="h-[60%]" />
      </div>
      {paused && idx >= 0 && (
        <button
          onClick={resume}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-text px-4 py-2 text-[13px] font-semibold text-bg shadow-lg"
        >
          กลับไปที่กำลังเล่น
        </button>
      )}
    </div>
  );
}
