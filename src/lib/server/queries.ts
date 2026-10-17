import "server-only";
import { db } from "./store";
import { isMemberUser } from "./auth";
import { parseChapters } from "@/lib/richtext";
import type {
  Chapter,
  CommentRow,
  CommentView,
  Content,
  ContentRow,
  ContentType,
  Notification,
  PlaylistWithMeta,
  Viewer,
  WatchProgress,
} from "@/lib/types";

/** A clip is on the site only when published, media ready and its publish time has passed. */
export function isLive(c: ContentRow, now = Date.now()) {
  if (c.deleted_at || c.media_status !== "ready") return false;
  if (c.status === "published") return !!c.published_at && new Date(c.published_at).getTime() <= now;
  if (c.status === "scheduled") return !!c.scheduled_at && new Date(c.scheduled_at).getTime() <= now;
  return false;
}

export function liveAt(c: ContentRow) {
  return c.status === "scheduled" ? c.scheduled_at : c.published_at;
}

export function toPublic(c: ContentRow): Content {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { demo_src, audio_path, bunny_video_id, captions_vtt, publish_when_ready, ...rest } = c;
  return { ...rest, published_at: liveAt(c), has_captions: !!captions_vtt };
}

export function canWatch(viewer: Viewer | null, c: Pick<ContentRow, "visibility">) {
  if (c.visibility === "public") return true;
  return !!viewer && (viewer.is_admin || viewer.is_member);
}

function liveRows(type?: ContentType) {
  return db()
    .content.filter((c) => isLive(c) && (!type || c.type === type))
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

export function listContent(opts: FeedQuery = {}) {
  let rows = liveRows(opts.type);
  if (opts.types?.length) rows = rows.filter((c) => opts.types!.includes(c.type));
  if (opts.categoryId) rows = rows.filter((c) => c.category_id === opts.categoryId);
  if (opts.visibility) rows = rows.filter((c) => c.visibility === opts.visibility);
  if (opts.exclude?.length) rows = rows.filter((c) => !opts.exclude!.includes(c.id));
  const offset = opts.offset ?? 0;
  return rows.slice(offset, offset + (opts.limit ?? 24)).map(toPublic);
}

export function countContent(type?: ContentType) {
  return liveRows(type).length;
}

export function getContentRow(id: string) {
  return db().content.find((c) => c.id === id && !c.deleted_at) ?? null;
}

/** Content visible to this viewer (admins can preview unpublished). */
export function getContent(id: string, viewer: Viewer | null): Content | null {
  const c = getContentRow(id);
  if (!c) return null;
  if (!isLive(c) && !viewer?.is_admin) return null;
  return toPublic(c);
}

export function getContentsByIds(ids: string[]) {
  const map = new Map(db().content.filter((c) => isLive(c)).map((c) => [c.id, c]));
  return ids.map((id) => map.get(id)).filter(Boolean).map((c) => toPublic(c!));
}

export function getChapters(c: Pick<ContentRow, "description">): Chapter[] {
  return parseChapters(c.description);
}

export function getLinks(contentId: string) {
  return db()
    .content_links.filter((l) => l.content_id === contentId)
    .sort((a, b) => a.position - b.position);
}

/** Resource metadata only — downloads go through /api/resources/[id] (members only). */
export function getResources(contentId: string) {
  return db()
    .content_resources.filter((r) => r.content_id === contentId)
    .sort((a, b) => a.position - b.position)
    .map(({ storage_path: _s, ...r }) => r);
}

export function related(c: Content, limit = 12) {
  const rows = liveRows().filter((x) => x.id !== c.id && x.type !== "short");
  const score = (x: ContentRow) =>
    (x.category_id === c.category_id ? 10 : 0) + x.tags.filter((t) => c.tags.includes(t)).length * 3 + (x.type === c.type ? 1 : 0);
  return rows
    .map((x, i) => ({ x, s: score(x), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map(({ x }) => toPublic(x));
}

export function categories() {
  return [...db().categories].sort((a, b) => a.position - b.position);
}

// ───────── Search ─────────
function norm(s: string) {
  return s.toLowerCase().normalize("NFC");
}

export function search(q: string, type?: ContentType | "playlist") {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return { content: [] as Content[], playlists: [] as PlaylistWithMeta[] };
  const hay = (c: ContentRow) => norm(`${c.title} ${c.description} ${c.tags.join(" ")}`);
  const scored = liveRows()
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
      ? playlistsWithMeta(null).filter((p) => terms.every((t) => norm(`${p.title} ${p.description}`).includes(t)))
      : [];
  return { content, playlists };
}

export function suggest(q: string) {
  const t = norm(q.trim());
  if (!t) return [];
  return liveRows()
    .filter((c) => norm(c.title).includes(t) || c.tags.some((tag) => norm(tag).startsWith(t.replace(/^#/, ""))))
    .slice(0, 8)
    .map((c) => ({ id: c.id, type: c.type, title: c.title }));
}

export function popular(limit = 8) {
  return [...liveRows("video")].sort((a, b) => b.view_count - a.view_count).slice(0, limit).map(toPublic);
}

// ───────── Progress ─────────
export function progressMap(userId: string | null | undefined, ids?: string[]) {
  const out: Record<string, { position_sec: number; completed: boolean }> = {};
  if (!userId) return out;
  for (const p of db().watch_progress) {
    if (p.user_id !== userId) continue;
    if (ids && !ids.includes(p.content_id)) continue;
    out[p.content_id] = { position_sec: p.position_sec, completed: p.completed };
  }
  return out;
}

export function getProgress(userId: string | null | undefined, contentId: string): WatchProgress | null {
  if (!userId) return null;
  return db().watch_progress.find((p) => p.user_id === userId && p.content_id === contentId) ?? null;
}

export function continueWatching(userId: string | null | undefined, limit = 12) {
  if (!userId) return [];
  const rows = db()
    .watch_progress.filter((p) => p.user_id === userId && !p.completed && p.position_sec > 5)
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  return getContentsByIds(rows.map((r) => r.content_id)).filter((c) => c.type !== "short").slice(0, limit);
}

// ───────── Playlists ─────────
export function playlistItems(playlistId: string) {
  const ids = db()
    .playlist_items.filter((i) => i.playlist_id === playlistId)
    .sort((a, b) => a.position - b.position)
    .map((i) => i.content_id);
  return getContentsByIds(ids);
}

export function playlistsWithMeta(userId: string | null | undefined): PlaylistWithMeta[] {
  const prog = progressMap(userId);
  return [...db().playlists]
    .sort((a, b) => a.position - b.position)
    .map((p) => {
      const items = playlistItems(p.id);
      return {
        ...p,
        item_count: items.length,
        total_sec: items.reduce((s, c) => s + c.duration_sec, 0),
        completed_count: items.filter((c) => prog[c.id]?.completed).length,
        first_thumb: p.thumbnail_url ?? items[0]?.thumbnail_url ?? null,
      };
    })
    .filter((p) => p.item_count > 0);
}

export function getPlaylist(id: string, userId: string | null | undefined) {
  return playlistsWithMeta(userId).find((p) => p.id === id) ?? null;
}

export function playlistsForContent(contentId: string) {
  return db().playlist_items.filter((i) => i.content_id === contentId).map((i) => i.playlist_id);
}

// ───────── Social ─────────
export function hasLiked(userId: string | null | undefined, contentId: string) {
  return !!userId && db().likes.some((l) => l.user_id === userId && l.content_id === contentId);
}

export function hasSaved(userId: string | null | undefined, contentId: string) {
  return !!userId && db().saved.some((l) => l.user_id === userId && l.content_id === contentId);
}

export function savedIds(userId: string | null | undefined) {
  if (!userId) return [] as string[];
  return db().saved.filter((s) => s.user_id === userId).map((s) => s.content_id);
}

export function likedContent(userId: string) {
  const ids = db()
    .likes.filter((l) => l.user_id === userId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map((l) => l.content_id);
  return getContentsByIds(ids);
}

export function savedContent(userId: string) {
  const ids = db()
    .saved.filter((l) => l.user_id === userId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map((l) => l.content_id);
  return getContentsByIds(ids);
}

export function history(userId: string) {
  const rows = db()
    .watch_progress.filter((p) => p.user_id === userId)
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  const map = new Map(getContentsByIds(rows.map((r) => r.content_id)).map((c) => [c.id, c]));
  return rows
    .filter((r) => map.has(r.content_id))
    .map((r) => ({ content: map.get(r.content_id)!, watched_at: r.updated_at, position_sec: r.position_sec, completed: r.completed }));
}

// ───────── Comments ─────────
function commentView(c: CommentRow, viewerId: string | null): CommentView {
  const d = db();
  const p = d.profiles.find((x) => x.id === c.user_id);
  return {
    ...c,
    author: {
      id: c.user_id,
      display_name: p?.display_name ?? "ผู้ใช้",
      avatar_url: p?.avatar_url ?? null,
      is_creator: p?.role === "admin",
      is_member: p?.role !== "admin" && isMemberUser(c.user_id),
    },
    liked_by_me: !!viewerId && d.comment_likes.some((l) => l.user_id === viewerId && l.comment_id === c.id),
    reply_count: d.comments.filter((r) => r.parent_id === c.id && !r.deleted_at && !r.is_hidden).length,
  };
}

export function listComments(
  contentId: string,
  viewer: Viewer | null,
  opts: { sort?: "top" | "new"; offset?: number; limit?: number } = {},
) {
  const all = db().comments.filter(
    (c) => c.content_id === contentId && !c.parent_id && !c.deleted_at && (!c.is_hidden || viewer?.is_admin),
  );
  const sorted = [...all].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    if (opts.sort === "new") return +new Date(b.created_at) - +new Date(a.created_at);
    return b.like_count - a.like_count || +new Date(b.created_at) - +new Date(a.created_at);
  });
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 20;
  return {
    items: sorted.slice(offset, offset + limit).map((c) => commentView(c, viewer?.id ?? null)),
    total: db().comments.filter((c) => c.content_id === contentId && !c.deleted_at && (!c.is_hidden || viewer?.is_admin)).length,
    hasMore: offset + limit < sorted.length,
  };
}

export function listReplies(parentId: string, viewer: Viewer | null) {
  return db()
    .comments.filter((c) => c.parent_id === parentId && !c.deleted_at && (!c.is_hidden || viewer?.is_admin))
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    .map((c) => commentView(c, viewer?.id ?? null));
}

export function getCommentView(id: string, viewer: Viewer | null) {
  const c = db().comments.find((x) => x.id === id);
  return c ? commentView(c, viewer?.id ?? null) : null;
}

// ───────── Notifications ─────────
export function notificationsFor(userId: string, limit = 30): Notification[] {
  return db()
    .notifications.filter((n) => n.user_id === userId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, limit);
}

// ───────── Home / settings ─────────
export function homeSections() {
  return [...db().home_sections].sort((a, b) => a.position - b.position);
}

export function siteSettings() {
  return db().site_settings;
}

export function paymentsFor(userId: string) {
  return db()
    .payments.filter((p) => p.user_id === userId)
    .sort((a, b) => +new Date(b.paid_at) - +new Date(a.paid_at));
}
