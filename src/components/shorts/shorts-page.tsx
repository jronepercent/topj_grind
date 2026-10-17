import { getViewer } from "@/lib/server/auth";
import { getContent, getLinks, likedIds, listContent } from "@/lib/server/queries";
import { ShortsFeed } from "./shorts-feed";
import { EmptyState } from "@/components/ui/misc";

/** Server wrapper shared by /shorts and /shorts/[id]. */
export async function ShortsPage({ id }: { id?: string } = {}) {
  const viewer = await getViewer();
  let shorts = await listContent({ type: "short", limit: 200 });
  if (id) {
    const c = await getContent(id, viewer);
    if (!c || c.type !== "short") return null;
    if (!shorts.some((s) => s.id === id)) shorts = [c, ...shorts];
  }
  if (!shorts.length) return <EmptyState title="ยังไม่มี Shorts" body="คลิปสั้นจะขึ้นที่นี่เร็วๆ นี้" />;
  const [liked, links] = await Promise.all([likedIds(viewer?.id, shorts.map((c) => c.id)), Promise.all(shorts.map((c) => getLinks(c.id)))]);
  const items = shorts.map((c, i) => ({ c, liked: liked.has(c.id), links: links[i] }));
  const startIndex = id ? Math.max(0, items.findIndex((x) => x.c.id === id)) : 0;
  return <ShortsFeed items={items} startIndex={startIndex} />;
}
