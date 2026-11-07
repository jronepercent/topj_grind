import { history, playlistItems, playlistsWithMeta } from "@/lib/server/queries";
import { thaiDate } from "@/lib/format";
import type { ProgressMap } from "@/components/cards/cards";
import type { HistoryGroup } from "./_components/library-view";

/** YYYY-MM-DD in Asia/Bangkok. */
function dayKey(d: Date | string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

/** Watch history grouped by day (วันนี้ / เมื่อวาน / date), newest first. */
export async function historyGroups(userId: string): Promise<HistoryGroup[]> {
  const hist = await history(userId);
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
  return groups;
}

/** Playlists the viewer has started, unfinished first. */
export async function learningCourses(userId: string, progress: ProgressMap) {
  const all = await playlistsWithMeta(userId);
  const itemsByPlaylist = await Promise.all(all.map((p) => playlistItems(p.id)));
  return all
    .filter((p, i) => p.completed_count > 0 || itemsByPlaylist[i].some((c) => progress[c.id]))
    .sort((a, b) => Number(a.completed_count === a.item_count) - Number(b.completed_count === b.item_count));
}
