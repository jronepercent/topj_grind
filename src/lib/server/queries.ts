import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { adminDb, must } from "@/lib/supabase/clients";
import { isActiveUntil } from "./auth";
import { bunnyImagesPublic, isBunnyCdnUrl } from "./bunny";
import { parseChapters } from "@/lib/richtext";
import { resolveHeroSlide } from "@/lib/hero";
import type {
  Category,
  Chapter,
  CommentRow,
  CommentView,
  Content,
  ContentLink,
  ContentResource,
  ContentRow,
  ContentType,
  HeroSlide,
  HeroSlideRow,
  HomeSection,
  Notification,
  Payment,
  Playlist,
  PlaylistItem,
  PlaylistWithMeta,
  SiteSettings,
  Subscription,
  Viewer,
  WatchProgress,
} from "@/lib/types";

// ───────────────────────── Catalogue cache ─────────────────────────
// Everything that's the same for every visitor, in one cached snapshot.
// Studio changes call revalidateTag(CATALOG_TAG); otherwise it refreshes every 30s.
export const CATALOG_TAG = "catalog";

/** Browser-safe columns (never media locations). */
const PUBLIC_COLS =
  "id, type, title, description, thumbnail_url, preview_url, duration_sec, width, height, visibility, status, media_status, published_at, scheduled_at, category_id, tags, comments_enabled, linked_content_id, linked_start_sec, has_captions, view_count, like_count, comment_count, deleted_at, created_at, updated_at";

interface Catalog {
  content: Content[]; // published or scheduled, media ready, not deleted — "live" is decided per request
  categories: Category[];
  playlists: Playlist[];
  items: PlaylistItem[];
  links: ContentLink[];
  resources: Omit<ContentResource, "storage_path">[];
  home: HomeSection[];
  hero: HeroSlideRow[];
  settings: SiteSettings;
  at: number;
}

const DEFAULT_SETTINGS: SiteSettings = {
  channel_name: "TOPJ_GRIND",
  tagline: "",
  about: "",
  avatar_url: "",
  banner_url: "",
  socials: [],
  paywall_title: "คอนเทนต์นี้สำหรับสมาชิก TOPJ_GRIND",
  paywall_benefits: ["ดูได้ทุกคลิปวิดีโอ และอ่านบทความสำหรับสมาชิก", "ฟังพอดแคสต์ทุกตอน", "ดาวน์โหลดไฟล์ประกอบและ Template", "คอมเมนต์คุยกับ JR ได้โดยตรง"],
};

const loadCatalog = unstable_cache(
  async (): Promise<Catalog> => {
    const db = adminDb();
    const [content, categories, playlists, items, links, resources, home, hero, settings] = await Promise.all([
      db.from("content").select(PUBLIC_COLS).is("deleted_at", null).eq("media_status", "ready").in("status", ["published", "scheduled"]),
      db.from("categories").select("*").order("position"),
      db.from("playlists").select("*").order("position"),
      db.from("playlist_items").select("*").order("position"),
      db.from("content_links").select("*").order("position"),
      db.from("content_resources").select("id, content_id, file_name, size_bytes, position").order("position"),
      db.from("home_sections").select("*").order("position"),
      db.from("hero_slides").select("*").order("position"),
      db.from("site_settings").select("value").eq("key", "site").maybeSingle(),
    ]);
    return {
      content: must(content, "catalog content") as unknown as Content[],
      categories: must(categories, "catalog categories") as Category[],
      playlists: must(playlists, "catalog playlists") as Playlist[],
      items: must(items, "catalog playlist items") as PlaylistItem[],
      links: must(links, "catalog links") as ContentLink[],
      resources: must(resources, "catalog resources") as Omit<ContentResource, "storage_path">[],
      home: must(home, "catalog home") as HomeSection[],
      hero: must(hero, "catalog hero") as HeroSlideRow[],
      settings: { ...DEFAULT_SETTINGS, ...((settings.data?.value as Partial<SiteSettings>) ?? {}) },
      at: Date.now(),
    };
  },
  ["tg-catalog-v2"],
  { tags: [CATALOG_TAG], revalidate: 30 },
);

export const catalog = () => loadCatalog();

// ───────────────────────── Content ─────────────────────────
type Liveable = Pick<ContentRow, "deleted_at" | "media_status" | "status" | "published_at" | "scheduled_at">;

/** A clip is on the site only when published, media ready and its publish time has passed. */
export function isLive(c: Liveable, now = Date.now()) {
  if (c.deleted_at || c.media_status !== "ready") return false;
  if (c.status === "published") return !!c.published_at && new Date(c.published_at).getTime() <= now;
  if (c.status === "scheduled") return !!c.scheduled_at && new Date(c.scheduled_at).getTime() <= now;
  return false;
}

export function liveAt(c: Pick<ContentRow, "status" | "scheduled_at" | "published_at">) {
  return c.status === "scheduled" ? c.scheduled_at : c.published_at;
}

/** Strip server-only fields; scheduled clips show their scheduled time as the publish date. */
export function toPublic(c: ContentRow | Content): Content {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { demo_src, audio_path, bunny_video_id, captions_vtt, publish_when_ready, ...rest } = c as ContentRow;
  // Rows synced before token auth was turned on still hold an unsigned Bunny preview, which now 403s.
  const preview_url = rest.preview_url && !bunnyImagesPublic() && isBunnyCdnUrl(rest.preview_url) ? null : rest.preview_url;
  return { ...rest, preview_url, published_at: liveAt(c), has_captions: (c as Content).has_captions ?? !!captions_vtt };
}

/**
 * May this viewer watch / listen? Public → anyone. Members-only → admins, members, and buyers of a course product whose
 * playlist contains the clip. Pass `unlocked` (from ownedCourseContentIds) so the course rule is applied without a query;
 * leave it out for the plain membership rule, or use canWatchContent() when you only have a viewer.
 */
export function canWatch(viewer: Viewer | null, c: Pick<ContentRow, "visibility"> & { id?: string }, unlocked?: ReadonlySet<string> | null) {
  if (c.visibility === "public") return true;
  if (!viewer) return false;
  if (viewer.is_admin || viewer.is_member) return true;
  return !!c.id && !!unlocked?.has(c.id);
}

/** Async form of canWatch() that also honours course purchases (one cached lookup per request). */
export async function canWatchContent(viewer: Viewer | null, c: Pick<ContentRow, "visibility"> & { id: string }) {
  if (canWatch(viewer, c)) return true;
  if (!viewer) return false;
  return canWatch(viewer, c, await ownedCourseContentIds(viewer.id));
}

// ───────────────────────── Shop: course purchases unlock a playlist ─────────────────────────
/** True when an error only means “the shop tables are not there yet” (migration 0013 not applied). */
export function isMissingRelation(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /could not find the table|does not exist/i.test(err.message ?? "");
}

/**
 * Ids of the clips a signed-in user unlocked by buying a course product (every item of the product's playlist).
 * Ownership survives a product being unpublished or deleted. Cached per request.
 */
export const ownedCourseContentIds = cache(async (userId: string): Promise<ReadonlySet<string>> => {
  const none: ReadonlySet<string> = new Set();
  if (!isUuid(userId)) return none;
  const db = adminDb();
  const bought = await db.from("purchases").select("product_id").eq("user_id", userId).eq("status", "paid");
  if (bought.error) {
    if (isMissingRelation(bought.error)) return none;
    throw new Error(`purchases: ${bought.error.message}`);
  }
  const productIds = (bought.data ?? []).map((r) => r.product_id as string);
  if (!productIds.length) return none;
  const prods = await db
    .from("products")
    .select("course_playlist_id")
    .in("id", productIds)
    .eq("product_type", "course")
    .not("course_playlist_id", "is", null);
  if (prods.error) throw new Error(`course products: ${prods.error.message}`);
  const playlists = new Set((prods.data ?? []).map((p) => p.course_playlist_id as string));
  if (!playlists.size) return none;
  return new Set((await catalog()).items.filter((i) => playlists.has(i.playlist_id)).map((i) => i.content_id));
});

/** Shorts were replaced by ชุมชน: old `short` rows may remain in the DB but never surface in any list. */
const isListed = (c: Pick<ContentRow, "type">) => c.type !== "short";

async function liveRows(type?: ContentType) {
  const now = Date.now();
  return (await catalog()).content
    .filter((c) => isListed(c) && isLive(c, now) && (!type || c.type === type))
    .sort((a, b) => +new Date(liveAt(b)!) - +new Date(liveAt(a)!));
}

export interface FeedQuery {
  type?: ContentType;
  types?: ContentType[];
  categoryId?: string;
  visibility?: "public" | "members";
  limit?: number;
  offset?: number;
  exclude?: string[];
}

export async function listContent(opts: FeedQuery = {}) {
  let rows = await liveRows(opts.type);
  if (opts.types?.length) rows = rows.filter((c) => opts.types!.includes(c.type));
  if (opts.categoryId) rows = rows.filter((c) => c.category_id === opts.categoryId);
  if (opts.visibility) rows = rows.filter((c) => c.visibility === opts.visibility);
  if (opts.exclude?.length) rows = rows.filter((c) => !opts.exclude!.includes(c.id));
  const offset = opts.offset ?? 0;
  return rows.slice(offset, offset + (opts.limit ?? 24)).map(toPublic);
}

export async function countContent(type?: ContentType) {
  return (await liveRows(type)).length;
}

/** Full row including media locations — server use only (play gate, Studio). */
export async function getContentRow(id: string): Promise<ContentRow | null> {
  if (!isUuid(id)) return null;
  const { data } = await adminDb().from("content").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  return (data as ContentRow) ?? null;
}

/** Content visible to this viewer (admins can preview unpublished). */
export async function getContent(id: string, viewer: Viewer | null): Promise<Content | null> {
  const fromCache = (await catalog()).content.find((c) => c.id === id);
  if (fromCache && isLive(fromCache)) return toPublic(fromCache);
  if (!viewer?.is_admin) return null;
  const row = await getContentRow(id);
  return row ? toPublic(row) : null;
}

export async function getContentsByIds(ids: string[]) {
  const now = Date.now();
  const map = new Map((await catalog()).content.filter((c) => isListed(c) && isLive(c, now)).map((c) => [c.id, c]));
  return ids.map((id) => map.get(id)).filter((c): c is Content => !!c).map(toPublic);
}

export function getChapters(c: Pick<ContentRow, "description">): Chapter[] {
  return parseChapters(c.description);
}

export async function getLinks(contentId: string) {
  return (await catalog()).links.filter((l) => l.content_id === contentId);
}

/** Resource metadata only — downloads go through /api/resources/[id] (members only). */
export async function getResources(contentId: string) {
  return (await catalog()).resources.filter((r) => r.content_id === contentId);
}

export async function related(c: Content, limit = 12) {
  const rows = (await liveRows()).filter((x) => x.id !== c.id);
  const score = (x: Content) =>
    (x.category_id === c.category_id ? 10 : 0) + x.tags.filter((t) => c.tags.includes(t)).length * 3 + (x.type === c.type ? 1 : 0);
  return rows
    .map((x, i) => ({ x, s: score(x), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ x }) => toPublic(x));
}

export async function categories() {
  return (await catalog()).categories;
}

// ───────────────────────── Search ─────────────────────────
function norm(s: string) {
  return s.toLowerCase().normalize("NFC");
}

export async function search(q: string, type?: ContentType | "playlist") {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return { content: [] as Content[], playlists: [] as PlaylistWithMeta[] };
  const hay = (c: Content) => norm(`${c.title} ${c.description} ${c.tags.join(" ")}`);
  const scored = (await liveRows())
    .map((c) => {
      const h = hay(c);
      const t = norm(c.title);
      let s = 0;
      for (const term of terms) {
        const bare = term.replace(/^#/, "");
        if (t.includes(bare)) s += 5;
        if (c.tags.some((tag) => norm(tag) === bare)) s += 4;
        if (h.includes(bare)) s += 1;
        else return { c, s: 0 };
      }
      return { c, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const content = type === "playlist" ? [] : scored.filter((x) => !type || x.c.type === type).map((x) => toPublic(x.c));
  const playlists =
    !type || type === "playlist"
      ? (await playlistsWithMeta(null)).filter((p) => terms.every((t) => norm(`${p.title} ${p.description}`).includes(t)))
      : [];
  return { content, playlists };
}

export async function suggest(q: string) {
  const t = norm(q.trim());
  if (!t) return [];
  return (await liveRows())
    .filter((c) => norm(c.title).includes(t) || c.tags.some((tag) => norm(tag).startsWith(t.replace(/^#/, ""))))
    .slice(0, 8)
    .map((c) => ({ id: c.id, type: c.type, title: c.title }));
}

export async function popular(limit = 8) {
  return [...(await liveRows("video"))].sort((a, b) => b.view_count - a.view_count).slice(0, limit).map(toPublic);
}

// ───────────────────────── Progress (per user) ─────────────────────────
export async function progressMap(userId: string | null | undefined, ids?: string[]) {
  const out: Record<string, { position_sec: number; completed: boolean }> = {};
  if (!userId) return out;
  let query = adminDb().from("watch_progress").select("content_id, position_sec, completed").eq("user_id", userId);
  if (ids) {
    if (!ids.length) return out;
    query = query.in("content_id", ids.filter(isUuid));
  }
  for (const p of must(await query, "progress") ?? []) out[p.content_id] = { position_sec: p.position_sec, completed: p.completed };
  return out;
}

export async function getProgress(userId: string | null | undefined, contentId: string): Promise<WatchProgress | null> {
  if (!userId || !isUuid(contentId)) return null;
  const { data } = await adminDb().from("watch_progress").select("*").eq("user_id", userId).eq("content_id", contentId).maybeSingle();
  return (data as WatchProgress) ?? null;
}

export async function continueWatching(userId: string | null | undefined, limit = 12) {
  if (!userId) return [];
  const rows = must(
    await adminDb()
      .from("watch_progress")
      .select("content_id")
      .eq("user_id", userId)
      .eq("completed", false)
      .gt("position_sec", 5)
      .order("updated_at", { ascending: false })
      .limit(40),
    "continue watching",
  );
  return (await getContentsByIds(rows.map((r) => r.content_id))).slice(0, limit);
}

// ───────────────────────── Playlists ─────────────────────────
export async function playlistItems(playlistId: string) {
  const ids = (await catalog()).items.filter((i) => i.playlist_id === playlistId).map((i) => i.content_id);
  return getContentsByIds(ids);
}

export async function playlistsWithMeta(userId: string | null | undefined): Promise<PlaylistWithMeta[]> {
  const cat = await catalog();
  const prog = await progressMap(userId);
  const out: PlaylistWithMeta[] = [];
  for (const p of cat.playlists) {
    const items = await playlistItems(p.id);
    if (!items.length) continue;
    out.push({
      ...p,
      item_count: items.length,
      total_sec: items.reduce((s, c) => s + c.duration_sec, 0),
      completed_count: items.filter((c) => prog[c.id]?.completed).length,
      first_thumb: p.thumbnail_url ?? items[0]?.thumbnail_url ?? null,
    });
  }
  return out;
}

export async function getPlaylist(id: string, userId: string | null | undefined) {
  return (await playlistsWithMeta(userId)).find((p) => p.id === id) ?? null;
}

export async function playlistsForContent(contentId: string) {
  return (await catalog()).items.filter((i) => i.content_id === contentId).map((i) => i.playlist_id);
}

// ───────────────────────── Likes / saved / history (per user) ─────────────────────────
async function exists(table: "likes" | "saved", userId: string | null | undefined, contentId: string) {
  if (!userId || !isUuid(contentId)) return false;
  const { count } = await adminDb().from(table).select("content_id", { count: "exact", head: true }).eq("user_id", userId).eq("content_id", contentId);
  return (count ?? 0) > 0;
}
export const hasLiked = (userId: string | null | undefined, contentId: string) => exists("likes", userId, contentId);
export const hasSaved = (userId: string | null | undefined, contentId: string) => exists("saved", userId, contentId);

export async function likedIds(userId: string | null | undefined, contentIds: string[]) {
  if (!userId || !contentIds.length) return new Set<string>();
  const rows = must(await adminDb().from("likes").select("content_id").eq("user_id", userId).in("content_id", contentIds.filter(isUuid)), "liked ids");
  return new Set(rows.map((r) => r.content_id as string));
}

export async function savedIds(userId: string | null | undefined) {
  if (!userId) return [] as string[];
  const rows = must(await adminDb().from("saved").select("content_id").eq("user_id", userId), "saved ids");
  return rows.map((r) => r.content_id as string);
}

async function contentIdsByRecency(table: "likes" | "saved", userId: string) {
  const rows = must(await adminDb().from(table).select("content_id").eq("user_id", userId).order("created_at", { ascending: false }), table);
  return rows.map((r) => r.content_id as string);
}
export const likedContent = async (userId: string) => getContentsByIds(await contentIdsByRecency("likes", userId));
export const savedContent = async (userId: string) => getContentsByIds(await contentIdsByRecency("saved", userId));

export async function history(userId: string) {
  const rows = must(
    await adminDb().from("watch_progress").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(200),
    "history",
  ) as WatchProgress[];
  const map = new Map((await getContentsByIds(rows.map((r) => r.content_id))).map((c) => [c.id, c]));
  return rows
    .filter((r) => map.has(r.content_id))
    .map((r) => ({ content: map.get(r.content_id)!, watched_at: r.updated_at, position_sec: r.position_sec, completed: r.completed }));
}

// ───────────────────────── Comments ─────────────────────────
async function enrich(rows: CommentRow[], viewerId: string | null): Promise<CommentView[]> {
  if (!rows.length) return [];
  const db = adminDb();
  const userIds = [...new Set(rows.map((c) => c.user_id))];
  const ids = rows.map((c) => c.id);
  const [profiles, subs, liked, replies] = await Promise.all([
    db.from("profiles").select("id, display_name, avatar_url, role").in("id", userIds),
    db.from("subscriptions").select("user_id, expires_at").in("user_id", userIds),
    viewerId ? db.from("comment_likes").select("comment_id").eq("user_id", viewerId).in("comment_id", ids) : Promise.resolve({ data: [], error: null }),
    db.from("comments").select("parent_id").in("parent_id", ids).is("deleted_at", null).eq("is_hidden", false),
  ]);
  const prof = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const memberUntil = new Map((subs.data ?? []).map((s) => [s.user_id, s.expires_at]));
  const likedSet = new Set((liked.data ?? []).map((l: { comment_id: string }) => l.comment_id));
  const replyCount = new Map<string, number>();
  for (const r of replies.data ?? []) replyCount.set(r.parent_id, (replyCount.get(r.parent_id) ?? 0) + 1);
  return rows.map((c) => {
    const p = prof.get(c.user_id);
    const creator = p?.role === "admin";
    return {
      ...c,
      author: {
        id: c.user_id,
        display_name: p?.display_name || "ผู้ใช้",
        avatar_url: p?.avatar_url ?? null,
        is_creator: creator,
        is_member: !creator && isActiveUntil(memberUntil.get(c.user_id)),
      },
      liked_by_me: likedSet.has(c.id),
      reply_count: replyCount.get(c.id) ?? 0,
    };
  });
}

export async function listComments(
  contentId: string,
  viewer: Viewer | null,
  opts: { sort?: "top" | "new"; offset?: number; limit?: number } = {},
) {
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 20;
  if (!isUuid(contentId)) return { items: [] as CommentView[], total: 0, hasMore: false };
  const db = adminDb();
  let top = db.from("comments").select("*").eq("content_id", contentId).is("parent_id", null).is("deleted_at", null);
  let all = db.from("comments").select("id", { count: "exact", head: true }).eq("content_id", contentId).is("deleted_at", null);
  if (!viewer?.is_admin) {
    top = top.eq("is_hidden", false);
    all = all.eq("is_hidden", false);
  }
  top = top.order("is_pinned", { ascending: false });
  top = opts.sort === "new" ? top.order("created_at", { ascending: false }) : top.order("like_count", { ascending: false }).order("created_at", { ascending: false });
  const [rows, total] = await Promise.all([top.range(offset, offset + limit), all]);
  const list = must(rows, "comments") as CommentRow[];
  return {
    items: await enrich(list.slice(0, limit), viewer?.id ?? null),
    total: total.count ?? 0,
    hasMore: list.length > limit,
  };
}

export async function listReplies(parentId: string, viewer: Viewer | null) {
  if (!isUuid(parentId)) return [];
  let q = adminDb().from("comments").select("*").eq("parent_id", parentId).is("deleted_at", null);
  if (!viewer?.is_admin) q = q.eq("is_hidden", false);
  const rows = must(await q.order("created_at"), "replies") as CommentRow[];
  return enrich(rows, viewer?.id ?? null);
}

export async function getCommentView(id: string, viewer: Viewer | null) {
  if (!isUuid(id)) return null;
  const { data } = await adminDb().from("comments").select("*").eq("id", id).maybeSingle();
  return data ? (await enrich([data as CommentRow], viewer?.id ?? null))[0] : null;
}

// ───────────────────────── Notifications / payments (per user) ─────────────────────────
export async function notificationsFor(userId: string, limit = 30): Promise<Notification[]> {
  return must(
    await adminDb().from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit),
    "notifications",
  ) as Notification[];
}

export async function unreadCount(userId: string) {
  const { count } = await adminDb().from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count ?? 0;
}

export async function subscriptionFor(userId: string): Promise<Subscription | null> {
  const { data } = await adminDb().from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  return (data as Subscription) ?? null;
}

export async function paymentsFor(userId: string): Promise<Payment[]> {
  return must(await adminDb().from("payments").select("*").eq("user_id", userId).order("paid_at", { ascending: false }), "payments") as Payment[];
}

// ───────────────────────── Home / settings ─────────────────────────
export async function homeSections() {
  return (await catalog()).home;
}

/** Hero slides on the site right now: switched on, inside their start/end time, clip (if any) live. */
export async function heroSlides(): Promise<HeroSlide[]> {
  const cat = await catalog();
  if (cat.home.some((s) => s.type === "hero" && !s.enabled)) return [];
  const now = Date.now();
  const live = new Map(cat.content.filter((c) => isListed(c) && isLive(c, now)).map((c) => [c.id, c]));
  const out: HeroSlide[] = [];
  for (const row of cat.hero) {
    if (!row.enabled) continue;
    if (row.starts_at && new Date(row.starts_at).getTime() > now) continue;
    if (row.ends_at && new Date(row.ends_at).getTime() <= now) continue;
    const clip = row.content_id ? live.get(row.content_id) : null;
    if (row.content_id && !clip) continue;
    const slide = resolveHeroSlide(row, clip ? toPublic(clip) : null);
    if (slide) out.push(slide);
  }
  return out;
}

export async function siteSettings() {
  return (await catalog()).settings;
}

// ───────────────────────── helpers ─────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Guards DB calls from junk ids in URLs (Postgres would throw on a non-uuid). */
export function isUuid(id: string) {
  return UUID_RE.test(id);
}
