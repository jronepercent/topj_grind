"use client";
import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewer } from "@/components/providers";
import { markTouredAction } from "@/app/(site)/tour-actions";
import { track } from "@/lib/analytics";
import { findTarget, TOURED_KEY, tourLayout, tourSteps, type TourSource, type TourStep } from "@/lib/tour";
import { cn } from "@/lib/utils";

/** Loaded on demand by TourHost (never in the page bundle). Spotlight + popover, one step at a time. */

const PAD = 6; // spotlight padding around the target
const GUT = 16; // keep the popover this far from the screen edge
const GAP = 12; // between the spotlight and the popover
const POP_MAX_W = 340;

type Rect = { x: number; y: number; w: number; h: number };

function resolveSteps(isMember: boolean): TourStep[] {
  return tourSteps(tourLayout(window.innerWidth), { isMember }).filter((s) => !s.target || findTarget(s.target));
}

export default function SiteTour({ source, onClose }: { source: TourSource; onClose: () => void }) {
  const { viewer } = useViewer();
  const isMember = !!viewer?.is_member;
  const [steps, setSteps] = React.useState<TourStep[]>(() => resolveSteps(isMember));
  const [index, setIndex] = React.useState(0);
  const [hole, setHole] = React.useState<Rect | null>(null);
  const [pop, setPop] = React.useState<{ left: number; top: number; width: number } | null>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const returnFocus = React.useRef<Element | null>(null);
  const closed = React.useRef(false);

  const step = steps[Math.min(index, steps.length - 1)];
  const counted = steps.length - 1; // the intro card is not counted
  const isLast = index >= steps.length - 1;

  const finish = React.useCallback(
    (completed: boolean) => {
      if (closed.current) return;
      closed.current = true;
      try {
        localStorage.setItem(TOURED_KEY, "1");
      } catch {}
      track(completed ? "tour_completed" : "tour_skipped", { source, step: step?.id ?? null, position: index, total: counted });
      void markTouredAction();
      onClose();
    },
    [counted, index, onClose, source, step?.id],
  );

  React.useEffect(() => {
    returnFocus.current = document.activeElement;
    track("tour_started", { source });
    return () => {
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, [source]);

  React.useEffect(() => {
    if (step) track("tour_step_viewed", { source, step: step.id, position: index });
  }, [index, source, step]);

  // Place the spotlight and the popover; follow resizes, scrolls and screen rotation.
  const place = React.useCallback(() => {
    if (!step) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(POP_MAX_W, vw - GUT * 2);
    const popH = popRef.current?.offsetHeight ?? 180;
    const el = step.target ? findTarget(step.target) : null;
    if (!el) {
      setHole(null);
      setPop({ width, left: (vw - width) / 2, top: Math.max(GUT, (vh - popH) / 2) });
      return;
    }
    const r = el.getBoundingClientRect();
    // Keep the ring on screen (the mini sidebar sits flush against the left edge).
    const x = Math.max(2, r.left - PAD);
    const y = Math.max(2, r.top - PAD);
    const h: Rect = { x, y, w: Math.min(vw - 2, r.right + PAD) - x, h: Math.min(vh - 2, r.bottom + PAD) - y };
    setHole(h);
    const below = h.y + h.h + GAP;
    const above = h.y - GAP - popH;
    let top: number;
    let left: number;
    if (el.closest("aside") && h.x + h.w + GAP + width <= vw - GUT) {
      // Sidebar item: beside it, so the menu items below stay visible.
      top = Math.min(Math.max(GUT, h.y + h.h / 2 - popH / 2), vh - GUT - popH);
      setPop({ width, left: h.x + h.w + GAP, top });
      return;
    }
    if (below + popH <= vh - GUT) top = below;
    else if (above >= GUT) top = above;
    else if (h.x + h.w + GAP + width <= vw - GUT) {
      // Tall target with no room above or below (rare): put it to the right.
      top = Math.min(Math.max(GUT, h.y), vh - GUT - popH);
      left = h.x + h.w + GAP;
      setPop({ width, left, top });
      return;
    } else top = Math.max(GUT, vh - GUT - popH);
    left = Math.min(Math.max(GUT, h.x + h.w / 2 - width / 2), vw - GUT - width);
    setPop({ width, left, top });
  }, [step]);

  React.useLayoutEffect(() => {
    const el = step?.target ? findTarget(step.target) : null;
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    place();
    // Second pass once the popover has its real height for this step's text.
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [place, step]);

  React.useEffect(() => {
    let raf = 0;
    let lastLayout = tourLayout(window.innerWidth);
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const layout = tourLayout(window.innerWidth);
        if (layout !== lastLayout) {
          // Rotated / resized across a breakpoint: rebuild the steps for the new menus, keep the same step if it still exists.
          lastLayout = layout;
          const next = resolveSteps(isMember);
          const keep = next.findIndex((s) => s.id === step?.id);
          setSteps(next);
          setIndex(keep >= 0 ? keep : Math.min(index, next.length - 1));
        } else place();
      });
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [index, isMember, place, step?.id]);

  React.useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, [index]);

  const next = () => (isLast ? finish(true) : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    } else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") back();
    else if (e.key === "Tab") {
      // Keep focus inside the popover.
      const f = popRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!f?.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!step) return null;
  const intro = step.id === "intro";

  return (
    <div className="fixed inset-0 z-[90]" onKeyDown={onKeyDown}>
      {/* Blocks the page while the tour is open: four dark panels around the spotlight (a transparent one over it). */}
      {hole ? (
        <div aria-hidden>
          <div className="absolute inset-0" />
          <div className="absolute inset-x-0 top-0 bg-black/60" style={{ height: hole.y }} />
          <div className="absolute inset-x-0 bottom-0 bg-black/60" style={{ top: hole.y + hole.h }} />
          <div className="absolute left-0 bg-black/60" style={{ top: hole.y, height: hole.h, width: hole.x }} />
          <div className="absolute right-0 bg-black/60" style={{ top: hole.y, height: hole.h, left: hole.x + hole.w }} />
          <div className="absolute rounded-[14px] border-2 border-accent" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
        </div>
      ) : (
        <div className="absolute inset-0 bg-black/60" aria-hidden />
      )}
      <div
        ref={popRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tg-tour-title"
        aria-describedby="tg-tour-body"
        className={cn(
          "absolute rounded-[18px] border border-border bg-elevated p-4 text-text shadow-2xl transition-[left,top] duration-200 ease-[var(--ease-apple)] motion-reduce:transition-none",
          // opacity, not visibility: a visibility-hidden button cannot take focus on the first frame.
          !pop && "opacity-0",
        )}
        style={pop ? { left: pop.left, top: pop.top, width: pop.width } : { left: GUT, top: GUT, width: POP_MAX_W }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {!intro && (
              <p className="t-meta tnum text-text-2" aria-label={`ขั้นที่ ${index} จาก ${counted}`}>
                {index}/{counted}
              </p>
            )}
            <h2 id="tg-tour-title" className="text-[17px] font-semibold leading-6">
              {step.title}
            </h2>
          </div>
          <button type="button" onClick={() => finish(false)} className="-mr-1.5 -mt-1 rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label="ปิดทัวร์">
            <X className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        <p id="tg-tour-body" className="mt-1.5 text-[15px] leading-6 text-text-2">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          {intro ? (
            <Button variant="ghost" size="sm" onClick={() => finish(false)}>
              ไว้ทีหลัง
            </Button>
          ) : (
            index > 1 && (
              <Button variant="ghost" size="sm" onClick={back}>
                ย้อนกลับ
              </Button>
            )
          )}
          <Button ref={primaryRef} variant="primary" size="sm" onClick={next}>
            {intro ? "เริ่มเลย" : isLast ? "เสร็จแล้ว" : "ถัดไป"}
          </Button>
        </div>
      </div>
    </div>
  );
}
