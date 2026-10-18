"use client";
import * as React from "react";
import { InfiniteGrid, GRID } from "./feed";
import { CardSkeleton, type ProgressMap } from "@/components/cards/cards";
import { loadFeedAction } from "@/app/actions";
import type { FeedQuery } from "@/lib/server/queries";
import type { Category, Content } from "@/lib/types";
import { cn } from "@/lib/utils";

type Chip = { key: string; label: string; query: Omit<FeedQuery, "offset" | "limit"> };

/** Sticky category chips. Filtering happens in place — no page reload. */
export function HomeFeed({
  categories,
  initialFilter,
  progress,
  children,
}: {
  categories: Category[];
  initialFilter?: string;
  progress: ProgressMap;
  children: React.ReactNode;
}) {
  const chips: Chip[] = React.useMemo(
    () => [
      { key: "all", label: "ทั้งหมด", query: {} },
      { key: "video", label: "วิดีโอ", query: { type: "video" } },
      { key: "podcast", label: "พอดแคสต์", query: { type: "podcast" } },
      ...categories.map((c) => ({ key: c.slug, label: c.name, query: { categoryId: c.id } })),
      ...(initialFilter === "free" ? [{ key: "free", label: "ดูฟรี", query: { visibility: "public" as const } }] : []),
    ],
    [categories, initialFilter],
  );
  const [active, setActive] = React.useState(chips.some((c) => c.key === initialFilter) ? initialFilter! : "all");
  const [items, setItems] = React.useState<Content[] | null>(null);
  const chip = chips.find((c) => c.key === active)!;

  React.useEffect(() => {
    if (active === "all") return;
    let cancelled = false;
    setItems(null);
    loadFeedAction({ ...chip.query, offset: 0 }).then((r) => !cancelled && setItems(r.ok ? r.data : []));
    return () => {
      cancelled = true;
    };
  }, [active, chip.query]);

  const select = (key: string) => {
    setActive(key);
    const url = new URL(window.location.href);
    if (key === "all") url.searchParams.delete("filter");
    else url.searchParams.set("filter", key);
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: Math.min(window.scrollY, document.getElementById("feed-top")?.offsetTop ?? 0), behavior: "smooth" });
  };

  return (
    <>
      <div id="feed-top" className="glass sticky top-14 z-20 -mx-4 border-b border-transparent px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="no-scrollbar flex gap-2 overflow-x-auto" role="tablist" aria-label="กรองคอนเทนต์">
          {chips.map((c) => (
            <button
              key={c.key}
              role="tab"
              aria-selected={active === c.key}
              onClick={() => select(c.key)}
              className={cn(
                "h-8 shrink-0 rounded-[8px] px-3 text-[14px] font-medium transition-colors duration-150",
                active === c.key ? "bg-text text-bg" : "bg-hover text-text hover:bg-[var(--border-strong)]",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        {active === "all" ? (
          children
        ) : items === null ? (
          <div className={GRID}>
            {Array.from({ length: 8 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <InfiniteGrid initial={items} query={chip.query} progress={progress} />
        )}
      </div>
    </>
  );
}
