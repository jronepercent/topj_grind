import "server-only";
import { homeSections, listContent } from "./queries";
import { latestArticles } from "./community";
import type { ArticleView } from "@/lib/community";
import type { Content, HomeSection, HomeSectionType } from "@/lib/types";

export const HOME_ROW_LIMIT = 12;

export type MixedItem = { kind: "content"; c: Content } | { kind: "article"; a: ArticleView };

/** Newest videos, podcasts and articles interleaved by publish date. */
export async function latestMixed(limit = HOME_ROW_LIMIT): Promise<MixedItem[]> {
  const [content, articles] = await Promise.all([
    listContent({ types: ["video", "podcast"], limit }),
    latestArticles(limit).catch(() => [] as ArticleView[]), // community tables may not be migrated yet
  ]);
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
  const all: MixedItem[] = [
    ...content.map((c) => ({ kind: "content" as const, c })),
    ...articles.map((a) => ({ kind: "article" as const, a })),
  ];
  const at = (m: MixedItem) => time(m.kind === "content" ? m.c.published_at : m.a.published_at);
  return all.sort((x, y) => at(y) - at(x)).slice(0, limit);
}

/** The owner's layout, used until Studio has saved rows with the new section types (migration 0014). */
const DEFAULT_ORDER: { type: HomeSectionType; title: string }[] = [
  { type: "continue", title: "ดูต่อจากที่ค้างไว้" },
  { type: "latest", title: "ใหม่ล่าสุด" },
  { type: "products", title: "สินค้าแนะนำ" },
  { type: "videos", title: "วิดีโอ" },
  { type: "articles", title: "บทความ" },
  { type: "podcasts", title: "พอดแคสต์" },
  { type: "playlists", title: "Playlist และซีรีส์" },
  { type: "all", title: "คอนเทนต์ทั้งหมด" },
];

const NEW_TYPES: HomeSectionType[] = ["products", "videos", "articles", "all"];

/**
 * Rows to render below the Hero, in order. Comes from `home_sections` (Studio can reorder / hide / rename).
 * If the table still holds the pre-0014 rows (no products/videos/articles/all), fall back to the default order
 * so the page is right even before the migration is applied. Disabled rows and unknown/legacy types are dropped.
 */
export async function homeLayout(): Promise<Pick<HomeSection, "id" | "type" | "title" | "content_ids">[]> {
  const rows = (await homeSections()).filter((s) => s.type !== "hero");
  const migrated = rows.some((s) => NEW_TYPES.includes(s.type));
  if (!migrated) {
    const customs = rows.filter((s) => s.type === "custom" && s.enabled);
    const cont = rows.find((s) => s.type === "continue");
    const out: Pick<HomeSection, "id" | "type" | "title" | "content_ids">[] = [];
    for (const d of DEFAULT_ORDER) {
      if (d.type === "continue" && cont && !cont.enabled) continue;
      out.push({ id: `default-${d.type}`, type: d.type, title: d.type === "continue" ? cont?.title || d.title : d.title, content_ids: [] });
      if (d.type === "playlists") out.push(...customs); // hand-picked rows sit just above "all"
    }
    return out;
  }
  const known = new Set<HomeSectionType>(DEFAULT_ORDER.map((d) => d.type).concat("custom"));
  const title = (s: HomeSection) => s.title.trim() || DEFAULT_ORDER.find((d) => d.type === s.type)?.title || "";
  return rows.filter((s) => s.enabled && known.has(s.type)).map((s) => ({ id: s.id, type: s.type, title: title(s), content_ids: s.content_ids }));
}
