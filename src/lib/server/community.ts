import "server-only";
import { adminDb, must, userDb } from "@/lib/supabase/clients";
import { HttpError } from "./auth";
import { mdExcerpt, POST_LIMITS, readMinutes } from "@/lib/community";
import type { ArticleView, FeedPage, PostAuthor, PostCommentView, PostView } from "@/lib/community";
import type { Viewer } from "@/lib/types";

/**
 * ชุมชน (community posts) + บทความ (articles) — one `posts` table, see migration 0011.
 *  - Community reads/writes go through userDb, so RLS is the real gate (sign-in to read, members to post/comment).
 *  - Article listings use adminDb with an explicit column list, because a members-only article must still show
 *    its title / excerpt / lock to non-members. The body is only returned when the viewer may read it.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (id: string) => UUID_RE.test(id);
const nowIso = () => new Date().toISOString();

/** Turn database errors from RLS / guard triggers into messages people understand. */
function friendly(err: { code?: string; message: string } | null, fallback: string): never {
  if (err?.code === "42501") throw new HttpError(403, fallback);
  if (err?.code === "22023") throw new HttpError(400, "ข้อความมีคำที่ไม่อนุญาต");
  if (err?.code === "23514") throw new HttpError(400, "ข้อมูลไม่ถูกต้อง ตรวจสอบความยาวและรูปภาพอีกครั้ง");
  console.error("[community]", err?.message);
  throw new HttpError(500, fallback);
}

async function audit(adminId: string, action: string, targetType: string, targetId: string) {
  await adminDb().from("admin_audit_log").insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId });
}

async function notifyUser(n: { user_id: string; type: string; title: string; body: string; link: string; image_url?: string | null }) {
  await adminDb().from("notifications").insert({ ...n, image_url: n.image_url?.startsWith("data:") ? null : (n.image_url ?? null) });
}

// ───────────────────────── Authors ─────────────────────────
type ProfileEmbed = { id: string; display_name: string | null; avatar_url: string | null; role: string } | null;

async function memberIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await adminDb().from("subscriptions").select("user_id").in("user_id", ids).gt("expires_at", nowIso());
  return new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
}

function toAuthor(p: ProfileEmbed, fallbackId: string, members: Set<string>): PostAuthor {
  const id = p?.id ?? fallbackId;
  const isAdmin = p?.role === "admin";
  return { id, display_name: p?.display_name || "สมาชิก", avatar_url: p?.avatar_url ?? null, is_admin: isAdmin, is_member: !isAdmin && members.has(id) };
}

const PROFILE = "author:profiles!author_id(id, display_name, avatar_url, role)";
const POST_COLS = `id, kind, author_id, body, images, is_pinned, is_hidden, like_count, comment_count, published_at, created_at, ${PROFILE}`;

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  images: string[];
  is_pinned: boolean;
  is_hidden: boolean;
  like_count: number;
  comment_count: number;
  published_at: string;
  created_at: string;
  author: ProfileEmbed;
};

async function hydratePosts(rows: PostRow[], viewerId: string | null): Promise<PostView[]> {
  if (!rows.length) return [];
  const members = await memberIds([...new Set(rows.map((r) => r.author_id))]);
  let liked = new Set<string>();
  if (viewerId) {
    const db = await userDb();
    const { data } = await db.from("post_likes").select("post_id").eq("user_id", viewerId).in("post_id", rows.map((r) => r.id));
    liked = new Set((data ?? []).map((r: { post_id: string }) => r.post_id));
  }
  return rows.map((r) => ({
    id: r.id,
    kind: "community" as const,
    author: toAuthor(r.author, r.author_id, members),
    body: r.body,
    images: r.images ?? [],
    is_pinned: r.is_pinned,
    is_hidden: r.is_hidden,
    like_count: r.like_count,
    comment_count: r.comment_count,
    liked_by_me: liked.has(r.id),
    published_at: r.published_at,
    created_at: r.created_at,
  }));
}

// ───────────────────────── Community feed ─────────────────────────
export const FEED_PAGE = 10;

/** Pinned posts first (first page only), then newest → oldest, cursor-paginated by published_at. */
export async function listFeed(viewer: Viewer | null, cursor: string | null, limit = FEED_PAGE): Promise<FeedPage> {
  if (!viewer) return { items: [], cursor: null, hasMore: false };
  if (cursor && Number.isNaN(Date.parse(cursor))) throw new HttpError(400, "cursor ไม่ถูกต้อง");
  const db = await userDb();
  const base = () =>
    db.from("posts").select(POST_COLS).eq("kind", "community").eq("status", "published").eq("is_hidden", false).is("deleted_at", null).lte("published_at", nowIso());

  let pinned: PostRow[] = [];
  if (!cursor) {
    pinned = must(await base().eq("is_pinned", true).order("published_at", { ascending: false }).limit(5), "pinned posts") as unknown as PostRow[];
  }
  let q = base().eq("is_pinned", false).order("published_at", { ascending: false }).limit(limit + 1);
  if (cursor) q = q.lt("published_at", cursor);
  const rest = must(await q, "feed") as unknown as PostRow[];
  const hasMore = rest.length > limit;
  const page = rest.slice(0, limit);
  const items = await hydratePosts([...pinned, ...page], viewer.id);
  return { items, cursor: page.length ? page[page.length - 1].published_at : null, hasMore };
}

export async function getPost(id: string, viewer: Viewer | null): Promise<PostView | null> {
  if (!viewer || !isId(id)) return null;
  const db = await userDb();
  let q = db.from("posts").select(POST_COLS).eq("id", id).eq("kind", "community").eq("status", "published").is("deleted_at", null);
  if (!viewer.is_admin) q = q.eq("is_hidden", false);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return (await hydratePosts([data as unknown as PostRow], viewer.id))[0];
}

/** Public URLs we issued for community uploads: <supabase>/storage/v1/object/public/thumbnails/<folder>/… */
function storagePrefix(folder: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/thumbnails/${folder}/`;
}
function assertOwnImages(urls: string[], folder: string) {
  const prefix = storagePrefix(folder);
  for (const u of urls) if (!u.startsWith(prefix)) throw new HttpError(400, "รูปภาพไม่ถูกต้อง อัปโหลดใหม่อีกครั้ง");
}

export async function createCommunityPost(viewer: Viewer, input: { body: string; images: string[] }): Promise<PostView> {
  if (!viewer.is_member) throw new HttpError(403, "โพสต์ได้เฉพาะสมาชิก");
  const body = input.body.trim();
  const images = input.images ?? [];
  if (!body && !images.length) throw new HttpError(400, "เขียนข้อความหรือเพิ่มรูปอย่างน้อย 1 อย่าง");
  if (body.length > POST_LIMITS.caption) throw new HttpError(400, `ข้อความยาวเกิน ${POST_LIMITS.caption.toLocaleString("th-TH")} ตัวอักษร`);
  if (images.length > POST_LIMITS.images) throw new HttpError(400, `แนบรูปได้ไม่เกิน ${POST_LIMITS.images} รูป`);
  assertOwnImages(images, `community/${viewer.id}`);

  const db = await userDb();
  const { data, error } = await db.from("posts").insert({ kind: "community", author_id: viewer.id, body, images }).select("id").single();
  if (error || !data) friendly(error, "โพสต์ไม่สำเร็จ");
  const post = await getPost(data.id, viewer);
  if (!post) throw new HttpError(500, "โพสต์ไม่สำเร็จ");
  return post;
}

export async function togglePostLike(viewer: Viewer, postId: string, force?: boolean) {
  if (!isId(postId)) throw new HttpError(404, "ไม่พบโพสต์");
  const db = await userDb();
  const { data: existing } = await db.from("post_likes").select("post_id").eq("post_id", postId).eq("user_id", viewer.id).maybeSingle();
  const want = force ?? !existing;
  if (want && !existing) {
    const { error } = await db.from("post_likes").insert({ post_id: postId, user_id: viewer.id });
    if (error && error.code !== "23505") friendly(error, "กดถูกใจไม่ได้");
  } else if (!want && existing) {
    const { error } = await db.from("post_likes").delete().eq("post_id", postId).eq("user_id", viewer.id);
    if (error) friendly(error, "ยกเลิกถูกใจไม่ได้");
  }
  const { data: p } = await adminDb().from("posts").select("like_count").eq("id", postId).maybeSingle();
  return { liked: want, like_count: p?.like_count ?? 0 };
}

export async function deletePost(viewer: Viewer, postId: string) {
  if (!isId(postId)) throw new HttpError(404, "ไม่พบโพสต์");
  const { data: p } = await adminDb().from("posts").select("author_id, kind").eq("id", postId).is("deleted_at", null).maybeSingle();
  if (!p || p.kind !== "community") throw new HttpError(404, "ไม่พบโพสต์");
  if (p.author_id !== viewer.id && !viewer.is_admin) throw new HttpError(403, "ลบได้เฉพาะโพสต์ของตัวเอง");
  const db = await userDb();
  const { error } = await db.from("posts").update({ deleted_at: nowIso() }).eq("id", postId); // no .select(): soft-deleted rows are not readable
  if (error) friendly(error, "ลบโพสต์ไม่ได้");
  if (viewer.is_admin && p.author_id !== viewer.id) await audit(viewer.id, "post.delete", "post", postId);
}

export async function moderatePost(admin: Viewer, postId: string, action: "pin" | "unpin" | "hide" | "unhide") {
  if (!isId(postId)) throw new HttpError(404, "ไม่พบโพสต์");
  const patch = { pin: { is_pinned: true }, unpin: { is_pinned: false }, hide: { is_hidden: true }, unhide: { is_hidden: false } }[action];
  const db = await userDb();
  const { error } = await db.from("posts").update(patch).eq("id", postId);
  if (error) friendly(error, "ทำรายการไม่ได้");
  await audit(admin.id, `post.${action}`, "post", postId);
}

// ───────────────────────── Comments (community posts + articles) ─────────────────────────
const COMMENT_COLS = `id, post_id, user_id, parent_id, body, edited_at, created_at, ${PROFILE}`;
type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  body: string;
  edited_at: string | null;
  created_at: string;
  author: ProfileEmbed;
};

function commentView(r: CommentRow, members: Set<string>, replies: PostCommentView[] = []): PostCommentView {
  return {
    id: r.id,
    post_id: r.post_id,
    user_id: r.user_id,
    parent_id: r.parent_id,
    body: r.body,
    edited_at: r.edited_at,
    created_at: r.created_at,
    author: toAuthor(r.author, r.user_id, members),
    replies,
  };
}

export const COMMENT_PAGE = 20;

/** Newest top-level comments first, each with all of its (oldest-first) replies. */
export async function listPostComments(postId: string, offset: number, limit = COMMENT_PAGE) {
  if (!isId(postId)) return { items: [] as PostCommentView[], total: 0, hasMore: false };
  const db = await userDb();
  const { data, count } = await db
    .from("post_comments")
    .select(COMMENT_COLS, { count: "exact" })
    .eq("post_id", postId)
    .is("parent_id", null)
    .is("deleted_at", null)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  const tops = (data ?? []) as unknown as CommentRow[];
  let replies: CommentRow[] = [];
  if (tops.length) {
    const { data: rs } = await db
      .from("post_comments")
      .select(COMMENT_COLS)
      .in("parent_id", tops.map((t) => t.id))
      .is("deleted_at", null)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true })
      .limit(500);
    replies = (rs ?? []) as unknown as CommentRow[];
  }
  const members = await memberIds([...new Set([...tops, ...replies].map((r) => r.user_id))]);
  const byParent = new Map<string, PostCommentView[]>();
  for (const r of replies) byParent.set(r.parent_id!, [...(byParent.get(r.parent_id!) ?? []), commentView(r, members)]);
  const items = tops.map((t) => commentView(t, members, byParent.get(t.id) ?? []));
  return { items, total: count ?? items.length, hasMore: offset + tops.length < (count ?? 0) };
}

export async function createPostComment(viewer: Viewer, postId: string, bodyIn: string, parentId: string | null): Promise<PostCommentView> {
  if (!isId(postId)) throw new HttpError(404, "ไม่พบโพสต์");
  const body = bodyIn.trim();
  if (!body) throw new HttpError(400, "กรุณาพิมพ์ข้อความ");
  if (body.length > POST_LIMITS.comment) throw new HttpError(400, "ข้อความยาวเกิน 1,000 ตัวอักษร");
  if (!viewer.is_member) throw new HttpError(403, "คอมเมนต์ได้เฉพาะสมาชิก");

  const { data: post } = await adminDb()
    .from("posts")
    .select("id, kind, author_id, title, body, cover_url, images, visibility, status, is_hidden, published_at, deleted_at")
    .eq("id", postId)
    .maybeSingle();
  const live = post && !post.deleted_at && post.status === "published" && !post.is_hidden && post.published_at && new Date(post.published_at) <= new Date();
  if (!post || (!live && !viewer.is_admin)) throw new HttpError(404, "ไม่พบโพสต์");

  let parent: { id: string; user_id: string } | null = null;
  if (parentId) {
    if (!isId(parentId)) throw new HttpError(404, "ไม่พบความคิดเห็น");
    const { data } = await adminDb().from("post_comments").select("id, user_id, parent_id, post_id").eq("id", parentId).is("deleted_at", null).maybeSingle();
    if (!data || data.post_id !== postId) throw new HttpError(404, "ไม่พบความคิดเห็น");
    parent = { id: data.id, user_id: data.user_id };
    if (data.parent_id) {
      // one level deep: replying to a reply attaches to its parent
      const { data: top } = await adminDb().from("post_comments").select("id, user_id").eq("id", data.parent_id).single();
      if (top) parent = top;
    }
  }

  const db = await userDb();
  const { data: row, error } = await db
    .from("post_comments")
    .insert({ post_id: postId, user_id: viewer.id, parent_id: parent?.id ?? null, body })
    .select(COMMENT_COLS)
    .single();
  if (error || !row) friendly(error, "แสดงความคิดเห็นไม่ได้");

  const name = viewer.is_admin ? "JR" : viewer.display_name;
  const link = `${post.kind === "article" ? `/community/articles/${post.id}` : `/community/posts/${post.id}`}#comments`;
  const image = post.kind === "article" ? post.cover_url : (post.images?.[0] ?? null);
  if (parent && parent.user_id !== viewer.id) {
    await notifyUser({ user_id: parent.user_id, type: "reply", title: `${name} ตอบกลับความคิดเห็นของคุณ`, body: body.slice(0, 80), link, image_url: image });
  }
  if (post.author_id !== viewer.id && post.author_id !== parent?.user_id) {
    await notifyUser({
      user_id: post.author_id,
      type: "comment",
      title: `${name} แสดงความคิดเห็นในโพสต์ของคุณ`,
      body: body.slice(0, 80),
      link,
      image_url: image,
    });
  }
  return commentView(row as unknown as CommentRow, new Set(viewer.is_member && !viewer.is_admin ? [viewer.id] : []));
}

export async function editPostComment(viewer: Viewer, id: string, bodyIn: string) {
  if (!isId(id)) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const body = bodyIn.trim();
  if (!body || body.length > POST_LIMITS.comment) throw new HttpError(400, "ข้อความไม่ถูกต้อง");
  const db = await userDb();
  const { data, error } = await db.from("post_comments").update({ body }).eq("id", id).eq("user_id", viewer.id).select("id, body, edited_at").maybeSingle();
  if (error) friendly(error, "แก้ไขได้เฉพาะความคิดเห็นของตัวเอง");
  if (!data) throw new HttpError(403, "แก้ไขได้เฉพาะความคิดเห็นของตัวเอง");
  return data as { id: string; body: string; edited_at: string | null };
}

export async function deletePostComment(viewer: Viewer, id: string) {
  if (!isId(id)) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const { data: c } = await adminDb().from("post_comments").select("user_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) throw new HttpError(404, "ไม่พบความคิดเห็น");
  if (c.user_id !== viewer.id && !viewer.is_admin) throw new HttpError(403, "ลบได้เฉพาะความคิดเห็นของตัวเอง");
  const db = await userDb();
  const { error } = await db.from("post_comments").update({ deleted_at: nowIso() }).eq("id", id);
  if (error) friendly(error, "ลบไม่ได้");
  if (viewer.is_admin && c.user_id !== viewer.id) await audit(viewer.id, "post_comment.delete", "post_comment", id);
}

export async function moderatePostComment(admin: Viewer, id: string, hide: boolean) {
  if (!isId(id)) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const db = await userDb();
  const { error } = await db.from("post_comments").update({ is_hidden: hide }).eq("id", id);
  if (error) friendly(error, "ทำรายการไม่ได้");
  await audit(admin.id, hide ? "post_comment.hide" : "post_comment.unhide", "post_comment", id);
}

// ───────────────────────── Articles ─────────────────────────
export const ARTICLE_PAGE = 12;
const ARTICLE_META = `id, title, excerpt, cover_url, visibility, status, is_pinned, is_hidden, like_count, comment_count, read_min, published_at, updated_at, author_id, ${PROFILE}`;

type ArticleRow = {
  id: string;
  title: string | null;
  excerpt: string | null;
  cover_url: string | null;
  visibility: "public" | "members";
  status: "draft" | "published";
  is_pinned: boolean;
  is_hidden: boolean;
  like_count: number;
  comment_count: number;
  read_min: number;
  published_at: string | null;
  updated_at: string;
  author_id: string;
  body?: string;
  author: ProfileEmbed;
};

function articleView(r: ArticleRow, members: Set<string>, canReadBody: boolean): ArticleView {
  return {
    id: r.id,
    title: r.title ?? "",
    excerpt: r.excerpt ?? "",
    cover_url: r.cover_url,
    visibility: r.visibility,
    status: r.status,
    is_pinned: r.is_pinned,
    is_hidden: r.is_hidden,
    like_count: r.like_count,
    comment_count: r.comment_count,
    published_at: r.published_at,
    updated_at: r.updated_at,
    author: toAuthor(r.author, r.author_id, members),
    read_min: r.read_min,
    body: canReadBody ? (r.body ?? "") : null,
  };
}

function liveArticles() {
  return adminDb().from("posts").select(ARTICLE_META, { count: "exact" }).eq("kind", "article").eq("status", "published").eq("is_hidden", false).is("deleted_at", null).lte("published_at", nowIso());
}

export async function listArticles(page = 1, limit = ARTICLE_PAGE) {
  const from = (Math.max(1, page) - 1) * limit;
  const { data, count } = await liveArticles()
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .range(from, from + limit - 1);
  const rows = (data ?? []) as unknown as ArticleRow[];
  const members = await memberIds([...new Set(rows.map((r) => r.author_id))]);
  return { items: rows.map((r) => articleView(r, members, false)), total: count ?? rows.length, page, pages: Math.max(1, Math.ceil((count ?? 0) / limit)) };
}

export async function latestArticles(limit = 6) {
  return (await listArticles(1, limit)).items;
}

export async function searchArticles(q: string, limit = 12) {
  const term = q.replace(/[%,()*\\]/g, " ").trim();
  if (!term) return [];
  const { data } = await liveArticles()
    .or(`title.ilike.%${term}%,excerpt.ilike.%${term}%`)
    .order("published_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as unknown as ArticleRow[];
  const members = await memberIds([...new Set(rows.map((r) => r.author_id))]);
  return rows.map((r) => articleView(r, members, false));
}

export async function articleSitemap() {
  const { data } = await adminDb().from("posts").select("id, updated_at").eq("kind", "article").eq("status", "published").eq("visibility", "public").eq("is_hidden", false).is("deleted_at", null).lte("published_at", nowIso()).order("published_at", { ascending: false }).limit(500);
  return (data ?? []) as { id: string; updated_at: string }[];
}

/** One article. Drafts / hidden ones are visible to admins only. The body is returned only if the viewer may read it. */
export async function getArticle(id: string, viewer: Viewer | null): Promise<ArticleView | null> {
  if (!isId(id)) return null;
  const { data } = await adminDb().from("posts").select(`${ARTICLE_META}, body, deleted_at`).eq("id", id).eq("kind", "article").maybeSingle();
  const r = data as unknown as (ArticleRow & { deleted_at: string | null }) | null;
  if (!r || r.deleted_at) return null;
  const live = r.status === "published" && !r.is_hidden && !!r.published_at && new Date(r.published_at) <= new Date();
  if (!live && !viewer?.is_admin) return null;
  const members = await memberIds([r.author_id]);
  const canRead = r.visibility === "public" || !!viewer?.is_member;
  return articleView(r, members, canRead);
}

// ───────────────────────── Studio ─────────────────────────
export interface ArticleInput {
  id?: string;
  title: string;
  excerpt: string;
  body: string;
  cover_url: string | null;
  visibility: "public" | "members";
  status: "draft" | "published";
  published_at: string | null;
}

export async function saveArticle(admin: Viewer, input: ArticleInput) {
  const title = input.title.trim();
  if (!title) throw new HttpError(400, "กรุณาใส่ชื่อบทความ");
  if (title.length > POST_LIMITS.title) throw new HttpError(400, `ชื่อบทความยาวเกิน ${POST_LIMITS.title} ตัวอักษร`);
  const body = input.body;
  if (body.length > POST_LIMITS.article) throw new HttpError(400, "เนื้อหายาวเกินไป (สูงสุด 60,000 ตัวอักษร)");
  if (input.status === "published" && !body.trim()) throw new HttpError(400, "เขียนเนื้อหาก่อนเผยแพร่");
  const excerpt = (input.excerpt.trim() || mdExcerpt(body, 200)).slice(0, POST_LIMITS.excerpt);
  let cover = input.cover_url?.trim() || null;
  if (cover) {
    if (!cover.startsWith(storagePrefix("articles"))) throw new HttpError(400, "รูปปกไม่ถูกต้อง อัปโหลดใหม่อีกครั้ง");
  } else cover = null;
  let publishedAt: string | null = null;
  if (input.status === "published") {
    publishedAt = input.published_at && !Number.isNaN(Date.parse(input.published_at)) ? new Date(input.published_at).toISOString() : nowIso();
  }

  const row = {
    title,
    excerpt,
    body,
    cover_url: cover,
    visibility: input.visibility,
    status: input.status,
    published_at: publishedAt,
    read_min: Math.min(999, readMinutes(body)),
  };
  const db = await userDb(); // admin passes RLS via admin_all
  if (input.id) {
    if (!isId(input.id)) throw new HttpError(404, "ไม่พบบทความ");
    const { error } = await db.from("posts").update(row).eq("id", input.id).eq("kind", "article");
    if (error) friendly(error, "บันทึกบทความไม่ได้");
    await audit(admin.id, "article.update", "post", input.id);
    return { id: input.id };
  }
  const { data, error } = await db.from("posts").insert({ ...row, kind: "article", author_id: admin.id }).select("id").single();
  if (error || !data) friendly(error, "บันทึกบทความไม่ได้");
  await audit(admin.id, "article.create", "post", data.id);
  return { id: data.id as string };
}

export async function deleteArticle(admin: Viewer, id: string) {
  if (!isId(id)) throw new HttpError(404, "ไม่พบบทความ");
  const db = await userDb();
  const { error } = await db.from("posts").update({ deleted_at: nowIso() }).eq("id", id).eq("kind", "article");
  if (error) friendly(error, "ลบบทความไม่ได้");
  await audit(admin.id, "article.delete", "post", id);
}

export async function setArticlePinned(admin: Viewer, id: string, pinned: boolean) {
  if (!isId(id)) throw new HttpError(404, "ไม่พบบทความ");
  const db = await userDb();
  const { error } = await db.from("posts").update({ is_pinned: pinned }).eq("id", id).eq("kind", "article");
  if (error) friendly(error, "ทำรายการไม่ได้");
  await audit(admin.id, pinned ? "article.pin" : "article.unpin", "post", id);
}

export interface StudioArticleRow {
  id: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  visibility: "public" | "members";
  status: "draft" | "published";
  is_pinned: boolean;
  comment_count: number;
  read_min: number;
  published_at: string | null;
  updated_at: string;
}

export async function studioArticles(): Promise<StudioArticleRow[]> {
  const rows = must(
    await adminDb()
      .from("posts")
      .select("id, title, excerpt, cover_url, visibility, status, is_pinned, comment_count, read_min, published_at, updated_at")
      .eq("kind", "article")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(300),
    "studio articles",
  ) as unknown as (Omit<StudioArticleRow, "title" | "excerpt"> & { title: string | null; excerpt: string | null })[];
  return rows.map((r) => ({ ...r, title: r.title ?? "", excerpt: r.excerpt ?? "" }));
}

export interface StudioArticleFull extends StudioArticleRow {
  body: string;
}

export async function studioArticle(id: string): Promise<StudioArticleFull | null> {
  if (!isId(id)) return null;
  const { data } = await adminDb()
    .from("posts")
    .select("id, title, excerpt, body, cover_url, visibility, status, is_pinned, comment_count, read_min, published_at, updated_at")
    .eq("id", id)
    .eq("kind", "article")
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return { ...(data as unknown as StudioArticleFull), title: data.title ?? "", excerpt: data.excerpt ?? "" };
}

export interface StudioPostRow {
  id: string;
  body: string;
  images: string[];
  is_pinned: boolean;
  is_hidden: boolean;
  like_count: number;
  comment_count: number;
  published_at: string | null;
  author: PostAuthor;
}
export interface StudioCommentRow {
  id: string;
  post_id: string;
  post_kind: "community" | "article";
  post_label: string;
  body: string;
  is_hidden: boolean;
  created_at: string;
  author: PostAuthor;
}

/** Moderation lists: latest community posts and comments (articles + posts), hidden ones included. */
export async function studioCommunity(): Promise<{ posts: StudioPostRow[]; comments: StudioCommentRow[] }> {
  const posts = must(
    await adminDb()
      .from("posts")
      .select(`id, body, images, is_pinned, is_hidden, like_count, comment_count, published_at, author_id, ${PROFILE}`)
      .eq("kind", "community")
      .is("deleted_at", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(60),
    "studio posts",
  ) as unknown as (PostRow & { published_at: string | null })[];
  const comments = must(
    await adminDb()
      .from("post_comments")
      .select(`id, post_id, user_id, body, is_hidden, created_at, ${PROFILE}, post:posts!post_id(kind, title, body)`)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(80),
    "studio comments",
  ) as unknown as (CommentRow & { post: { kind: "community" | "article"; title: string | null; body: string } | null; is_hidden: boolean })[];
  const members = await memberIds([...new Set([...posts.map((p) => p.author_id), ...comments.map((c) => c.user_id)])]);
  return {
    posts: posts.map((p) => ({
      id: p.id,
      body: p.body,
      images: p.images ?? [],
      is_pinned: p.is_pinned,
      is_hidden: p.is_hidden,
      like_count: p.like_count,
      comment_count: p.comment_count,
      published_at: p.published_at,
      author: toAuthor(p.author, p.author_id, members),
    })),
    comments: comments.map((c) => ({
      id: c.id,
      post_id: c.post_id,
      post_kind: c.post?.kind ?? "community",
      post_label: c.post?.kind === "article" ? (c.post.title ?? "บทความ") : mdExcerpt(c.post?.body ?? "โพสต์รูป", 40) || "โพสต์รูป",
      body: c.body,
      is_hidden: c.is_hidden,
      created_at: c.created_at,
      author: toAuthor(c.author, c.user_id, members),
    })),
  };
}
