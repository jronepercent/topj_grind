import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { history, likedContent, playlistItems, playlistsWithMeta, popular, progressMap, savedContent } from "@/lib/server/queries";
import { myPurchases } from "@/lib/server/shop";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { thaiDate } from "@/lib/format";
import { LibraryView, type HistoryGroup, type LibraryTab } from "./_components/library-view";

export const metadata: Metadata = {
  title: "คลังของฉัน",
  robots: { index: false, follow: false },
};

const TABS: LibraryTab[] = ["overview", "history", "later", "liked", "courses", "purchases"];

/** YYYY-MM-DD in Asia/Bangkok. */
function dayKey(d: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <EmptyState
          art="history"
          className="py-24"
          title="เข้าสู่ระบบเพื่อดูคลังของคุณ"
          body="ประวัติการดู คลิปที่บันทึกไว้ คลิปที่ถูกใจ และ Playlist ที่กำลังเรียน จะรวมอยู่ที่นี่"
          action={
            <Button asChild variant="inverse" size="lg">
              <Link href="/login?next=/library">เข้าสู่ระบบ</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const hist = await history(viewer.id);
  const now = Date.now();
  const today = dayKey(new Date(now));
  const yesterday = dayKey(new Date(now - 86_400_000));
  const groups: HistoryGroup[] = [];
  for (const h of hist) {
    const key = dayKey(h.watched_at);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: key === today ? "วันนี้" : key === yesterday ? "เมื่อวาน" : thaiDate(h.watched_at), items: [] };
      groups.push(g);
    }
    g.items.push(h.content);
  }

  const progress = await progressMap(viewer.id);
  const all = await playlistsWithMeta(viewer.id);
  const itemsByPlaylist = await Promise.all(all.map((p) => playlistItems(p.id)));
  const learning = all
    .filter((p, i) => p.completed_count > 0 || itemsByPlaylist[i].some((c) => progress[c.id]))
    .sort((a, b) => Number(a.completed_count === a.item_count) - Number(b.completed_count === b.item_count));

  const saveHistory = viewer.save_history;
  const initialTab = TABS.find((t) => t === tab) ?? "overview";

  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <h1 className="t-h1">คลังของฉัน</h1>
      <LibraryView
        initialTab={initialTab}
        history={groups}
        later={await savedContent(viewer.id)}
        liked={await likedContent(viewer.id)}
        courses={learning}
        purchases={await myPurchases(viewer.id)}
        progress={progress}
        saveHistory={saveHistory}
        suggestions={await popular(4)}
      />
    </div>
  );
}
