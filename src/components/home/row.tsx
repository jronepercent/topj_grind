"use client";
import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import { cn, shuffle as shuffled } from "@/lib/utils";

/**
 * One home topic: title + optional "ดูทั้งหมด" link, and a horizontally scrolling track
 * (CSS scroll-snap, hidden scrollbar). The track bleeds to the screen edge so the next card peeks;
 * the first card still starts on the page gutter. Arrow buttons appear on desktop (≥ 1024px).
 * `shuffle` adds a "สุ่มใหม่" button that reorders the cards in place (the server already sends them shuffled).
 */
export function Row({
  title,
  href,
  linkLabel = "ดูทั้งหมด",
  itemClass,
  children,
  className,
  shuffle,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  /** width class of each card, see ROW_W */
  itemClass: string;
  children: React.ReactNode;
  className?: string;
  shuffle?: boolean;
}) {
  const all = React.Children.toArray(children);
  const [order, setOrder] = React.useState<number[] | null>(null);
  const items = order && order.length === all.length ? order.map((i) => all[i]) : all;
  const track = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: true, end: true });
  const headingId = React.useId();

  const measure = React.useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);

  React.useEffect(() => {
    measure();
    const el = track.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, items.length]);

  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };

  const reshuffle = () => {
    setOrder(shuffled(all.map((_, i) => i)));
    track.current?.scrollTo({ left: 0 });
  };

  if (!items.length) return null;

  return (
    <section aria-labelledby={headingId} className={className}>
      <div className="mb-3 flex items-end justify-between gap-4 sm:mb-4">
        <h2 id={headingId} className="t-h2">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-4">
          {shuffle && (
            <button
              type="button"
              onClick={reshuffle}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[13px] font-medium text-text-2 transition-colors hover:border-border-strong hover:text-text"
            >
              <Shuffle className="size-3.5" aria-hidden /> สุ่มใหม่
            </button>
          )}
          {href && (
            <Link href={href} className="text-[14px] font-medium text-text-2 hover:text-text">
              {linkLabel}
              <span className="sr-only"> {title}</span>
            </Link>
          )}
        </div>
      </div>
      <div className="relative">
        <div
          ref={track}
          onScroll={measure}
          role="list"
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8"
        >
          {items.map((child, i) => (
            <div key={React.isValidElement(child) && child.key != null ? child.key : i} role="listitem" className={cn("shrink-0 snap-start", itemClass)}>
              {child}
            </div>
          ))}
        </div>
        <ArrowButton dir="prev" hidden={edges.start} onClick={() => scroll(-1)} />
        <ArrowButton dir="next" hidden={edges.end} onClick={() => scroll(1)} />
      </div>
    </section>
  );
}

function ArrowButton({ dir, hidden, onClick }: { dir: "prev" | "next"; hidden: boolean; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={hidden}
      aria-label={dir === "prev" ? "เลื่อนกลับ" : "เลื่อนไปข้างหน้า"}
      className={cn(
        "glass absolute top-1/2 z-10 -mt-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border shadow-lg transition-opacity duration-150 lg:flex",
        dir === "prev" ? "left-1" : "right-1",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
