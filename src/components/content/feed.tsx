"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CardSkeleton, PodcastCard, ShortCard, VideoCard, type ProgressMap } from "@/components/cards/cards";
import { loadFeedAction } from "@/app/actions";
import type { FeedQuery } from "@/lib/server/queries";
import type { Content } from "@/lib/types";
import { EmptyState, SectionHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const GRID = "grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5";

export function ContentGrid({ items, progress, priorityFirst }: { items: Content[]; progress?: ProgressMap; priorityFirst?: boolean }) {
  return (
    <div className={GRID}>
      {items.map((c, i) => (c.type === "podcast" ? <PodcastCard key={c.id} c={c} progress={progress} /> : <VideoCard key={c.id} c={c} progress={progress} priority={priorityFirst && i < 4} />))}
    </div>
  );
}

/** Infinite scroll, 24 at a time. */
export function InfiniteGrid({
  initial,
  query,
  progress,
  empty,
}: {
  initial: Content[];
  query: Omit<FeedQuery, "offset" | "limit">;
  progress?: ProgressMap;
  empty?: React.ReactNode;
}) {
  const [items, setItems] = React.useState(initial);
  const [done, setDone] = React.useState(initial.length < 24);
  const [loading, setLoading] = React.useState(false);
  const sentinel = React.useRef<HTMLDivElement>(null);
  const key = JSON.stringify(query);

  React.useEffect(() => {
    setItems(initial);
    setDone(initial.length < 24);
  }, [initial, key]);

  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || loading) return;
      setLoading(true);
      const r = await loadFeedAction({ ...query, offset: items.length });
      setLoading(false);
      if (r.ok) {
        setItems((xs) => [...xs, ...r.data.filter((c) => !xs.some((x) => x.id === c.id))]);
        if (r.data.length < 24) setDone(true);
      } else setDone(true);
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, done, loading, key]);

  if (!items.length) return <>{empty ?? <EmptyState title="ยังไม่มีคอนเทนต์ในหมวดนี้" body="ลองเลือกหมวดอื่นดูนะ" />}</>;

  const shorts = items.filter((c) => c.type === "short");
  const rest = items.filter((c) => c.type !== "short");
  return (
    <>
      {rest.length > 0 && <ContentGrid items={rest} progress={progress} />}
      {shorts.length > 0 && (
        <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", rest.length > 0 && "mt-10")}>
          {shorts.map((c) => (
            <ShortCard key={c.id} c={c} />
          ))}
        </div>
      )}
      {!done && (
        <div ref={sentinel} className={cn(GRID, "mt-8")}>
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}
    </>
  );
}

/** Horizontal scroller with arrow buttons on desktop. */
export function Shelf({
  title,
  action,
  children,
  itemClass,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode[];
  itemClass: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  React.useEffect(update, [children.length]);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <section className="group/shelf relative">
      <SectionHeader title={title} action={action} />
      <div ref={ref} onScroll={update} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 sm:-mx-6 sm:scroll-px-6 sm:px-6">
        {children.map((child, i) => (
          <div key={i} className={cn("shrink-0 snap-start", itemClass)}>
            {child}
          </div>
        ))}
      </div>
      {!edges.start && (
        <button
          onClick={() => scroll(-1)}
          className="glass absolute -left-3 top-1/2 z-10 hidden size-10 items-center justify-center rounded-full border border-border shadow-lg lg:flex"
          aria-label="เลื่อนซ้าย"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {!edges.end && (
        <button
          onClick={() => scroll(1)}
          className="glass absolute -right-3 top-1/2 z-10 hidden size-10 items-center justify-center rounded-full border border-border shadow-lg lg:flex"
          aria-label="เลื่อนขวา"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
    </section>
  );
}
