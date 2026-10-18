"use client";
import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useViewer } from "@/components/providers";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { PostCard } from "./post-card";
import { PostComposer } from "./composer";
import { loadFeedAction } from "@/app/community-actions";
import type { FeedPage, PostView } from "@/lib/community";

/** The ชุมชน feed: composer on top, pinned first, then newest. Infinite scroll with a "โหลดเพิ่ม" fallback. */
export function CommunityFeed({ initial }: { initial: FeedPage }) {
  const { viewer, requireAuth } = useViewer();
  const [items, setItems] = React.useState(initial.items);
  const [cursor, setCursor] = React.useState(initial.cursor);
  const [hasMore, setHasMore] = React.useState(initial.hasMore);
  const [loading, setLoading] = React.useState(false);
  const sentinel = React.useRef<HTMLDivElement>(null);

  const more = React.useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const r = await loadFeedAction(cursor);
    setLoading(false);
    if (!r.ok) return toast(r.error);
    setItems((xs) => [...xs, ...r.data.items.filter((p) => !xs.some((x) => x.id === p.id))]);
    setCursor(r.data.cursor);
    setHasMore(r.data.hasMore);
  }, [loading, hasMore, cursor]);

  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && void more(), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, more]);

  const patch = (id: string, p: Partial<PostView> | null) =>
    setItems((xs) => (p === null ? xs.filter((x) => x.id !== id) : xs.map((x) => (x.id === id ? { ...x, ...p } : x))));

  const posted = (p: PostView) =>
    setItems((xs) => {
      const pinned = xs.filter((x) => x.is_pinned).length;
      return [...xs.slice(0, pinned), p, ...xs.slice(pinned)];
    });

  return (
    <div className="space-y-5">
      <PostComposer onPosted={posted} />

      {!viewer ? (
        <EmptyState
          art="comment"
          title="เข้าสู่ระบบเพื่อเข้าชุมชน"
          body="อ่านโพสต์ ถูกใจ และคุยกับ JR กับสมาชิกคนอื่น หลังเข้าสู่ระบบ"
          action={
            <div className="flex gap-2">
              <Button variant="inverse" onClick={() => requireAuth("เข้าสู่ระบบเพื่อเข้าชุมชน")}>
                เข้าสู่ระบบ
              </Button>
              <Button asChild variant="ghost">
                <Link href="/community/articles">อ่านบทความ</Link>
              </Button>
            </div>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState art="comment" title="ยังไม่มีโพสต์" body="เป็นคนแรกที่เริ่มคุยในชุมชน" />
      ) : (
        <>
          {items.map((p, i) => (
            <PostCard key={p.id} post={p} priority={i === 0} onChange={(c) => patch(p.id, c)} />
          ))}
          {hasMore && (
            <div ref={sentinel} className="flex justify-center py-4">
              <Button variant="outline" onClick={() => void more()} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : null} โหลดเพิ่ม
              </Button>
            </div>
          )}
          {!hasMore && items.length > 3 && <p className="t-meta py-6 text-center">ดูครบทุกโพสต์แล้ว</p>}
        </>
      )}
    </div>
  );
}

export function PostFeedSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="skeleton h-28 rounded-[16px]" />
      {[0, 1].map((i) => (
        <div key={i} className="overflow-hidden rounded-[16px] border border-border bg-surface">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="skeleton size-10 rounded-full" />
            <div className="space-y-2">
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton h-3 w-16 rounded" />
            </div>
          </div>
          <div className="skeleton aspect-[4/5] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
