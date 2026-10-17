import "server-only";
import { adminDb } from "@/lib/supabase/clients";
import { isActiveUntil } from "@/lib/server/auth";
import { isLive } from "@/lib/server/queries";
import type { CommentRow, ContentRow, PaymentMethod } from "@/lib/types";
import type { DailyPoint, MemberRow, MemberStatus, PickItem, StudioComment, StudioContentRow } from "@/components/studio/types";

export const DAY = 86_400_000;
const BKK_OFFSET = 7 * 3_600_000; // Asia/Bangkok is UTC+7 all year (no DST)
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ───────── Query helpers ─────────
type DbResult = { data: unknown; error: { message: string } | null };

function check<T>(res: DbResult, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

/** PostgREST returns at most 1,000 rows per request — page through everything. Order the query by a unique key. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<DbResult>, what: string, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const rows = check<T[]>(await page(from, from + size - 1), what);
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

/** `.in(ids)` in chunks so long id lists don't overflow the request URL. */
export async function fetchIn<T>(ids: string[], run: (chunk: string[]) => PromiseLike<DbResult>, what: string, size = 100): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += size) out.push(...check<T[]>(await run(unique.slice(i, i + size)), what));
  return out;
}

/** PostgREST list literal for `.not(col, "in", …)` — only for uuids. */
const pgList = (ids: string[]) => `(${ids.join(",")})`;

export async function adminIds(): Promise<Set<string>> {
  const rows = check<{ id: string }[]>(await adminDb().from("profiles").select("id").eq("role", "admin"), "admins");
  return new Set(rows.map((r) => r.id));
}

// ───────── Dates ─────────
/** YYYY-MM-DD of a timestamp in Asia/Bangkok. */
export function bkkDayKey(t: number | string) {
  const ms = typeof t === "string" ? new Date(t).getTime() : t;
  return new Date(ms + BKK_OFFSET).toISOString().slice(0, 10);
}

function dayLabel(key: string) {
  return `${+key.slice(8, 10)} ${TH_MONTHS[+key.slice(5, 7) - 1]}`;
}

/** Start/end (ms, UTC) of the current calendar month in Asia/Bangkok. */
export function bkkMonthRange(now = Date.now()) {
  const local = new Date(now + BKK_OFFSET);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  return { start: Date.UTC(y, m, 1) - BKK_OFFSET, end: Date.UTC(y, m + 1, 1) - BKK_OFFSET };
}

// ───────── Views ─────────
export interface ViewLite {
  content_id: string;
  watched_sec: number;
  created_at: string;
}

/** Views in the last `days` days (filtered in SQL), optionally for one clip. */
export async function recentViews(days = 28, contentId?: string, now = Date.now()): Promise<ViewLite[]> {
  const since = new Date(now - days * DAY).toISOString();
  return fetchAll<ViewLite>((from, to) => {
    let q = adminDb().from("views").select("content_id, watched_sec, created_at").gte("created_at", since);
    if (contentId) q = q.eq("content_id", contentId);
    return q.order("id").range(from, to);
  }, "views");
}

/** Views per Bangkok day for the last `days` days (today included). */
export function dailyFromViews(views: ViewLite[], days = 28, now = Date.now()): DailyPoint[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(bkkDayKey(now - i * DAY));
  const counts = new Map(keys.map((k) => [k, 0]));
  const since = now - days * DAY;
  for (const v of views) {
    const t = new Date(v.created_at).getTime();
    if (t < since) continue;
    const k = bkkDayKey(t);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return keys.map((k) => ({ key: k, label: dayLabel(k), count: counts.get(k)! }));
}

export async function dailyViews(days = 28, contentId?: string, now = Date.now()): Promise<DailyPoint[]> {
  return dailyFromViews(await recentViews(days, contentId, now), days, now);
}

// ───────── Content ─────────
const STUDIO_COLS =
  "id, type, title, thumbnail_url, duration_sec, visibility, status, media_status, publish_when_ready, published_at, scheduled_at, created_at, updated_at, deleted_at, view_count, like_count, comment_count";

type StudioCols = Pick<
  ContentRow,
  | "id"
  | "type"
  | "title"
  | "thumbnail_url"
  | "duration_sec"
  | "visibility"
  | "status"
  | "media_status"
  | "publish_when_ready"
  | "published_at"
  | "scheduled_at"
  | "created_at"
  | "updated_at"
  | "deleted_at"
  | "view_count"
  | "like_count"
  | "comment_count"
>;

export function toStudioRow(c: StudioCols): StudioContentRow {
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    thumbnail_url: c.thumbnail_url,
    duration_sec: c.duration_sec,
    visibility: c.visibility,
    status: c.status,
    media_status: c.media_status,
    publish_when_ready: !!c.publish_when_ready,
    published_at: c.published_at,
    scheduled_at: c.scheduled_at,
    created_at: c.created_at,
    updated_at: c.updated_at,
    deleted_at: c.deleted_at,
    view_count: c.view_count,
    like_count: c.like_count,
    comment_count: c.comment_count,
  };
}

/** Every clip incl. drafts and trash, newest first (Studio columns only — no media locations). */
export async function studioContent(opts: { includeDeleted?: boolean } = {}): Promise<StudioCols[]> {
  return fetchAll<StudioCols>((from, to) => {
    let q = adminDb().from("content").select(STUDIO_COLS);
    if (!opts.includeDeleted) q = q.is("deleted_at", null);
    return q.order("created_at", { ascending: false }).order("id").range(from, to);
  }, "studio content");
}

export async function studioContentRows(): Promise<StudioContentRow[]> {
  return (await studioContent({ includeDeleted: true })).map(toStudioRow);
}

export async function pickItems(): Promise<PickItem[]> {
  return (await studioContent()).map((c) => ({
    id: c.id,
    type: c.type,
    title: c.title,
    thumbnail_url: c.thumbnail_url,
    duration_sec: c.duration_sec,
    visibility: c.visibility,
    live: isLive(c),
  }));
}

// ───────── Comments ─────────
type ProfileLite = { id: string; display_name: string; avatar_url: string | null; is_banned: boolean };
type ContentLite = Pick<ContentRow, "id" | "type" | "title" | "thumbnail_url" | "deleted_at">;

/** For each comment id: the newest non-deleted reply written by an admin. */
async function adminReplies(parentIds: string[], admins: Set<string>) {
  const out = new Map<string, CommentRow>();
  if (!parentIds.length || !admins.size) return out;
  const replies = await fetchIn<CommentRow>(
    parentIds,
    (chunk) =>
      adminDb()
        .from("comments")
        .select("*")
        .in("parent_id", chunk)
        .in("user_id", [...admins])
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
    "admin replies",
  );
  for (const r of replies.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))) {
    if (r.parent_id && !out.has(r.parent_id)) out.set(r.parent_id, r);
  }
  return out;
}

/** Latest top-level comments by non-admins that have no (non-deleted) admin reply yet. */
export async function unansweredComments(limit = 5) {
  const admins = await adminIds();
  const found: CommentRow[] = [];
  const page = 200;
  for (let from = 0; found.length < limit; from += page) {
    let q = adminDb().from("comments").select("*").is("parent_id", null).is("deleted_at", null);
    if (admins.size) q = q.not("user_id", "in", pgList([...admins]));
    const rows = check<CommentRow[]>(await q.order("created_at", { ascending: false }).order("id").range(from, from + page - 1), "unanswered");
    const replied = await adminReplies(
      rows.map((r) => r.id),
      admins,
    );
    found.push(...rows.filter((r) => !replied.has(r.id)));
    if (rows.length < page) break;
  }
  const list = found.slice(0, limit);
  const [authors, contents] = await Promise.all([
    fetchIn<ProfileLite>(list.map((c) => c.user_id), (ids) => adminDb().from("profiles").select("id, display_name, avatar_url, is_banned").in("id", ids), "authors"),
    fetchIn<ContentLite>(list.map((c) => c.content_id), (ids) => adminDb().from("content").select("id, type, title, thumbnail_url, deleted_at").in("id", ids), "content"),
  ]);
  const a = new Map(authors.map((p) => [p.id, p]));
  const ct = new Map(contents.map((c) => [c.id, c]));
  return list.map((c) => ({ c, author: a.get(c.user_id), content: ct.get(c.content_id) }));
}

export async function studioComments(limit = 300): Promise<StudioComment[]> {
  const db = adminDb();
  const admins = await adminIds();
  const notAdmin = pgList([...admins]);

  // Newest comments, plus every reported one (so the "reported" tab never misses older reports).
  let recentQ = db.from("comments").select("*").is("deleted_at", null);
  if (admins.size) recentQ = recentQ.not("user_id", "in", notAdmin);
  const [recent, reports] = await Promise.all([
    recentQ.order("created_at", { ascending: false }).limit(limit + 50),
    db.from("comment_reports").select("comment_id, reason, created_at").order("created_at", { ascending: false }).limit(1000),
  ]);
  const recentRows = check<CommentRow[]>(recent, "comments");
  const reportRows = check<{ comment_id: string; reason: string | null; created_at: string }[]>(reports, "comment reports");
  const have = new Set(recentRows.map((c) => c.id));
  const missing = [...new Set(reportRows.map((r) => r.comment_id))].filter((id) => !have.has(id));
  const reported = (
    await fetchIn<CommentRow>(missing, (ids) => db.from("comments").select("*").in("id", ids).is("deleted_at", null), "reported comments")
  ).filter((c) => !admins.has(c.user_id));

  const contents = await fetchIn<ContentLite>(
    [...recentRows, ...reported].map((c) => c.content_id),
    (ids) => db.from("content").select("id, type, title, thumbnail_url, deleted_at").in("id", ids),
    "comment content",
  );
  const content = new Map(contents.map((c) => [c.id, c]));
  const onLiveRow = (c: CommentRow) => !!content.get(c.content_id) && !content.get(c.content_id)!.deleted_at;
  const all = [...recentRows.filter(onLiveRow).slice(0, limit), ...reported.filter(onLiveRow)].sort(
    (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
  );

  const userIds = all.map((c) => c.user_id);
  const parentIds = all.map((c) => c.parent_id).filter((x): x is string => !!x);
  const [profiles, subs, parents, replies] = await Promise.all([
    fetchIn<ProfileLite>(userIds, (ids) => db.from("profiles").select("id, display_name, avatar_url, is_banned").in("id", ids), "authors"),
    fetchIn<{ user_id: string; expires_at: string | null }>(userIds, (ids) => db.from("subscriptions").select("user_id, expires_at").in("user_id", ids), "subscriptions"),
    fetchIn<{ id: string; body: string }>(parentIds, (ids) => db.from("comments").select("id, body").in("id", ids), "parents"),
    adminReplies(
      all.filter((c) => !c.parent_id).map((c) => c.id),
      admins,
    ),
  ]);
  const prof = new Map(profiles.map((p) => [p.id, p]));
  const memberUntil = new Map(subs.map((s) => [s.user_id, s.expires_at]));
  const parentBody = new Map(parents.map((p) => [p.id, p.body]));
  const reportsBy = new Map<string, { reason: string; created_at: string }[]>();
  for (const r of reportRows) {
    const list = reportsBy.get(r.comment_id) ?? [];
    list.push({ reason: r.reason ?? "", created_at: r.created_at });
    reportsBy.set(r.comment_id, list);
  }
  const now = Date.now();

  return all.map((c) => {
    const p = prof.get(c.user_id);
    const ct = content.get(c.content_id)!;
    const adminReply = c.parent_id ? null : (replies.get(c.id) ?? null);
    const parent = c.parent_id ? parentBody.get(c.parent_id) : undefined;
    return {
      id: c.id,
      content_id: c.content_id,
      parent_id: c.parent_id,
      body: c.body,
      created_at: c.created_at,
      is_pinned: c.is_pinned,
      creator_hearted: c.creator_hearted,
      is_hidden: c.is_hidden,
      like_count: c.like_count,
      author: {
        id: c.user_id,
        display_name: p?.display_name || "ผู้ใช้",
        avatar_url: p?.avatar_url ?? null,
        is_banned: !!p?.is_banned,
        is_member: isActiveUntil(memberUntil.get(c.user_id), now),
      },
      content: { id: ct.id, type: ct.type, title: ct.title, thumbnail_url: ct.thumbnail_url },
      parent_excerpt: parent !== undefined ? parent.slice(0, 80) : null,
      answered: !!c.parent_id || !!adminReply,
      admin_reply: adminReply?.body ?? null,
      reports: (reportsBy.get(c.id) ?? []).slice().reverse(),
    };
  });
}

// ───────── Members ─────────
export function memberStatus(expires_at: string | null, now = Date.now()): MemberStatus {
  if (!expires_at) return "never";
  if (!isActiveUntil(expires_at, now)) return "expired";
  if (new Date(expires_at).getTime() - now <= 3 * DAY) return "expiring";
  return "active";
}

/** user id → email, from Supabase Auth (profiles has no email). */
export async function authEmails(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await adminDb().auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth users: ${error.message}`);
    for (const u of data.users) out.set(u.id, u.email ?? "");
    if (data.users.length < perPage) return out;
  }
}

export async function memberRows(now = Date.now()): Promise<MemberRow[]> {
  const db = adminDb();
  const [profiles, subs, pays, watches, emails] = await Promise.all([
    fetchAll<ProfileLite>(
      (from, to) => db.from("profiles").select("id, display_name, avatar_url, is_banned").neq("role", "admin").order("id").range(from, to),
      "profiles",
    ),
    fetchAll<{ user_id: string; expires_at: string | null; first_paid_at: string | null }>(
      (from, to) => db.from("subscriptions").select("user_id, expires_at, first_paid_at").order("user_id").range(from, to),
      "subscriptions",
    ),
    fetchAll<{ user_id: string; method: PaymentMethod; paid_at: string }>(
      (from, to) => db.from("payments").select("user_id, method, paid_at").order("paid_at", { ascending: false }).order("id").range(from, to),
      "payments",
    ),
    fetchAll<{ user_id: string; updated_at: string }>(
      (from, to) => db.from("watch_progress").select("user_id, updated_at").order("user_id").order("content_id").range(from, to),
      "watch progress",
    ),
    authEmails(),
  ]);
  const sub = new Map(subs.map((s) => [s.user_id, s]));
  const lastMethod = new Map<string, PaymentMethod>();
  for (const p of pays) if (!lastMethod.has(p.user_id)) lastMethod.set(p.user_id, p.method); // newest first
  const lastWatch = new Map<string, string>();
  for (const w of watches) {
    const prev = lastWatch.get(w.user_id);
    if (!prev || new Date(w.updated_at).getTime() > new Date(prev).getTime()) lastWatch.set(w.user_id, w.updated_at);
  }

  return profiles
    .map((p) => {
      const s = sub.get(p.id);
      const email = emails.get(p.id) ?? "";
      return {
        id: p.id,
        display_name: p.display_name || email.split("@")[0],
        email,
        avatar_url: p.avatar_url,
        is_banned: p.is_banned,
        first_paid_at: s?.first_paid_at ?? null,
        expires_at: s?.expires_at ?? null,
        status: memberStatus(s?.expires_at ?? null, now),
        last_method: lastMethod.get(p.id) ?? null,
        last_watch: lastWatch.get(p.id) ?? null,
      };
    })
    .sort((a, b) => {
      const order = { expiring: 0, active: 1, expired: 2, never: 3 } as const;
      return order[a.status] - order[b.status] || (b.expires_at ?? "").localeCompare(a.expires_at ?? "");
    });
}

export async function memberSummary(rows: MemberRow[], now = Date.now()) {
  const { start, end } = bkkMonthRange(now);
  const active = rows.filter((r) => isActiveUntil(r.expires_at, now));
  const within7 = active.filter((r) => new Date(r.expires_at!).getTime() - now <= 7 * DAY);
  const expiringThisMonth = rows.filter((r) => {
    if (!r.expires_at) return false;
    const t = new Date(r.expires_at).getTime();
    return t >= start && t < end;
  });
  const monthPays = await fetchAll<{ amount: number | string }>(
    (from, to) =>
      adminDb()
        .from("payments")
        .select("amount")
        .gte("paid_at", new Date(start).toISOString())
        .lt("paid_at", new Date(end).toISOString())
        .order("id")
        .range(from, to),
    "month revenue",
  );
  const revenue = monthPays.reduce((s, p) => s + Number(p.amount || 0), 0);
  return { active: active.length, within7: within7.length, expiringThisMonth: expiringThisMonth.length, revenue };
}

/** Active (expires_at > now) and expiring-within-7-days counts, admins excluded. */
export async function membershipCounts(now = Date.now()) {
  const [admins, active] = await Promise.all([
    adminIds(),
    fetchAll<{ user_id: string; expires_at: string }>(
      (from, to) =>
        adminDb().from("subscriptions").select("user_id, expires_at").gt("expires_at", new Date(now).toISOString()).order("user_id").range(from, to),
      "active subscriptions",
    ),
  ]);
  const rows = active.filter((s) => !admins.has(s.user_id) && isActiveUntil(s.expires_at, now));
  return {
    members: rows.length,
    expiring7: rows.filter((s) => new Date(s.expires_at).getTime() - now <= 7 * DAY).length,
  };
}
