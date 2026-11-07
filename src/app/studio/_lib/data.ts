import "server-only";
import { cache } from "react";
import { adminDb } from "@/lib/supabase/clients";
import { isActiveUntil } from "@/lib/server/auth";
import { isLive, isUuid } from "@/lib/server/queries";
import { timeAgo } from "@/lib/format";
import type { AuditLog, CommentRow, ContentRow, ContentType, PaymentError, PaymentMethod } from "@/lib/types";
import type { AuditEntry, PaymentErrorEntry } from "@/components/studio/members-manager";
import type { PlanCode } from "@/lib/plans";
import type {
  AuthProvider,
  DailyPoint,
  FollowupGroup,
  FollowupItem,
  FollowupKind,
  FunnelWindow,
  FunnelWindowKey,
  MemberDetail,
  MemberRow,
  MemberStatus,
  OnboardingStage,
  PickItem,
  StudioComment,
  StudioContentRow,
} from "@/components/studio/types";
import { FOLLOWUP_HINT, FOLLOWUP_LABEL, isFollowupKind, METHOD_LABEL } from "@/components/studio/types";

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

export interface AuthUserLite {
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  provider: AuthProvider;
  email_confirmed: boolean;
}

type AuthUserRaw = {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string; providers?: string[] } | null;
  identities?: { provider: string }[] | null;
};

export function toAuthLite(u: AuthUserRaw): AuthUserLite {
  const providers = [u.app_metadata?.provider, ...(u.app_metadata?.providers ?? []), ...(u.identities ?? []).map((i) => i.provider)];
  return {
    email: u.email ?? "",
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    provider: providers.includes("google") ? "google" : "email",
    email_confirmed: !!u.email_confirmed_at,
  };
}

/** user id → auth details (email, sign-up / last sign-in time, provider), from Supabase Auth (profiles has none of these). */
export async function authUsers(): Promise<Map<string, AuthUserLite>> {
  const out = new Map<string, AuthUserLite>();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await adminDb().auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth users: ${error.message}`);
    for (const u of data.users) out.set(u.id, toAuthLite(u));
    if (data.users.length < perPage) return out;
  }
}

/** user id → email, from Supabase Auth (profiles has no email). */
export async function authEmails(): Promise<Map<string, string>> {
  return new Map([...(await authUsers())].map(([id, u]) => [id, u.email]));
}

export const maxIso = (...xs: (string | null | undefined)[]) => {
  let best: string | null = null;
  for (const x of xs) if (x && (!best || new Date(x).getTime() > new Date(best).getTime())) best = x;
  return best;
};

export async function memberRows(now = Date.now()): Promise<MemberRow[]> {
  const db = adminDb();
  const [profiles, subs, pays, purchases, watches, views, users, durations] = await Promise.all([
    fetchAll<ProfileLite & { created_at: string; onboarding_stage: OnboardingStage | null; email_updates: boolean | null }>(
      (from, to) =>
        db
          .from("profiles")
          .select("id, display_name, avatar_url, is_banned, created_at, onboarding_stage, email_updates")
          .neq("role", "admin")
          .order("id")
          .range(from, to),
      "profiles",
    ),
    fetchAll<{ user_id: string; expires_at: string | null; first_paid_at: string | null }>(
      (from, to) => db.from("subscriptions").select("user_id, expires_at, first_paid_at").order("user_id").range(from, to),
      "subscriptions",
    ),
    fetchAll<{ user_id: string; method: PaymentMethod; paid_at: string; amount: number | string; plan: PlanCode | null }>(
      (from, to) => db.from("payments").select("user_id, method, paid_at, amount, plan").order("paid_at", { ascending: false }).order("id").range(from, to),
      "payments",
    ),
    fetchAll<{ user_id: string; amount: number | string }>(
      (from, to) => db.from("purchases").select("user_id, amount").eq("status", "paid").order("id").range(from, to),
      "purchases",
    ),
    fetchAll<{ user_id: string; content_id: string; position_sec: number; completed: boolean; updated_at: string }>(
      (from, to) => db.from("watch_progress").select("user_id, content_id, position_sec, completed, updated_at").order("user_id").order("content_id").range(from, to),
      "watch progress",
    ),
    fetchAll<{ user_id: string; content_id: string; created_at: string }>(
      (from, to) => db.from("views").select("user_id, content_id, created_at").not("user_id", "is", null).order("id").range(from, to),
      "views",
    ),
    authUsers(),
    fetchAll<{ id: string; duration_sec: number }>((from, to) => db.from("content").select("id, duration_sec").order("id").range(from, to), "content durations"),
  ]);
  const duration = new Map(durations.map((c) => [c.id, Number(c.duration_sec || 0)]));
  const sub = new Map(subs.map((s) => [s.user_id, s]));
  const lastMethod = new Map<string, PaymentMethod>();
  const lastPlan = new Map<string, PlanCode>();
  const lifetime = new Map<string, number>();
  for (const p of pays) {
    // newest first
    if (!lastMethod.has(p.user_id)) lastMethod.set(p.user_id, p.method);
    if (p.plan && !lastPlan.has(p.user_id)) lastPlan.set(p.user_id, p.plan);
    lifetime.set(p.user_id, (lifetime.get(p.user_id) ?? 0) + Number(p.amount || 0));
  }
  for (const p of purchases) lifetime.set(p.user_id, (lifetime.get(p.user_id) ?? 0) + Number(p.amount || 0));

  // Estimated watch time: finished clips count their full length (position_sec is reset on completion), others their position.
  const since7 = now - 7 * DAY;
  const watch = new Map<string, { started: number; completed: number; last: string | null; sec: number; recentSec: number }>();
  for (const w of watches) {
    const cur = watch.get(w.user_id) ?? { started: 0, completed: 0, last: null, sec: 0, recentSec: 0 };
    const sec = w.completed ? (duration.get(w.content_id) ?? 0) : Number(w.position_sec || 0);
    cur.started++;
    if (w.completed) cur.completed++;
    cur.sec += sec;
    if (new Date(w.updated_at).getTime() >= since7) cur.recentSec += sec;
    cur.last = maxIso(cur.last, w.updated_at);
    watch.set(w.user_id, cur);
  }
  const viewAgg = new Map<string, { last: string | null; recentClips: Set<string>; days: Set<string> }>();
  for (const v of views) {
    const cur = viewAgg.get(v.user_id) ?? { last: null, recentClips: new Set<string>(), days: new Set<string>() };
    cur.last = maxIso(cur.last, v.created_at);
    cur.days.add(bkkDayKey(v.created_at));
    if (new Date(v.created_at).getTime() >= since7) cur.recentClips.add(v.content_id);
    viewAgg.set(v.user_id, cur);
  }

  return profiles
    .map((p): MemberRow => {
      const s = sub.get(p.id);
      const u = users.get(p.id);
      const email = u?.email ?? "";
      const status = memberStatus(s?.expires_at ?? null, now);
      const w = watch.get(p.id);
      const v = viewAgg.get(p.id);
      return {
        id: p.id,
        display_name: p.display_name || email.split("@")[0],
        email,
        avatar_url: p.avatar_url,
        is_banned: p.is_banned,
        first_paid_at: s?.first_paid_at ?? null,
        expires_at: s?.expires_at ?? null,
        status,
        last_method: lastMethod.get(p.id) ?? null,
        last_watch: w?.last ?? null,
        signed_up_at: u?.created_at ?? p.created_at,
        last_sign_in_at: u?.last_sign_in_at ?? null,
        provider: u?.provider ?? "email",
        email_confirmed: u?.email_confirmed ?? false,
        onboarding_stage: p.onboarding_stage,
        email_updates: p.email_updates !== false,
        plan: lastPlan.get(p.id) ?? null,
        lifetime_thb: lifetime.get(p.id) ?? 0,
        clips_started: w?.started ?? 0,
        clips_completed: w?.completed ?? 0,
        watch_sec: w?.sec ?? 0,
        last_active: maxIso(w?.last, v?.last, u?.last_sign_in_at),
        hot: (status === "never" || status === "expired") && ((v?.recentClips.size ?? 0) >= 3 || (w?.recentSec ?? 0) >= 1800),
        view_days: v?.days.size ?? 0,
        recent_clips_7d: v?.recentClips.size ?? 0,
        recent_sec_7d: w?.recentSec ?? 0,
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
  return {
    active: active.length,
    within7: within7.length,
    expiringThisMonth: expiringThisMonth.length,
    revenue,
    total: rows.length,
    free: rows.filter((r) => r.status === "never").length,
    new7: rows.filter((r) => now - new Date(r.signed_up_at).getTime() <= 7 * DAY).length,
    hot: rows.filter((r) => r.hot).length,
  };
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

// ───────── One member (profile page) ─────────
const countOf = (res: { count: number | null; error: { message: string } | null }, what: string) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.count ?? 0;
};

/** Full picture of one member, every query filtered by user id. null = no such profile. */
export async function memberDetail(id: string, now = Date.now()): Promise<MemberDetail | null> {
  const db = adminDb();
  const [profileRes, authRes, subRes] = await Promise.all([
    db.from("profiles").select("id, display_name, avatar_url, is_banned, created_at, onboarding_stage, email_updates").eq("id", id).maybeSingle(),
    db.auth.admin.getUserById(id),
    db.from("subscriptions").select("expires_at, first_paid_at").eq("user_id", id).maybeSingle(),
  ]);
  const profile = check<null | (ProfileLite & { created_at: string; onboarding_stage: OnboardingStage | null; email_updates: boolean | null })>(
    { data: profileRes.data, error: profileRes.error },
    "profile",
  );
  if (!profile) return null;
  const au = authRes.data?.user ? toAuthLite(authRes.data.user) : null;
  const sub = check<null | { expires_at: string | null; first_paid_at: string | null }>({ data: subRes.data, error: subRes.error }, "subscription");

  const sinceViews = now - 30 * DAY;
  const [payRes, purRes, sampleRes, wpRes, views, likes, saved, cmRes, postRes, pcCount, welcomeRes, notesRes, logRes, followRes] = await Promise.all([
    db.from("payments").select("id, paid_at, plan, method, months, amount, reference").eq("user_id", id).order("paid_at", { ascending: false }),
    db.from("purchases").select("id, product_id, amount, status, paid_at").eq("user_id", id).order("paid_at", { ascending: false }),
    db.from("sample_downloads").select("id, product_id, created_at").eq("user_id", id).order("created_at", { ascending: false }),
    db.from("watch_progress").select("content_id, position_sec, completed, updated_at").eq("user_id", id).order("updated_at", { ascending: false }).limit(300),
    fetchAll<{ created_at: string }>(
      (from, to) => db.from("views").select("created_at").eq("user_id", id).order("id").range(from, to),
      "views",
    ),
    db.from("likes").select("content_id", { count: "exact", head: true }).eq("user_id", id),
    db.from("saved").select("content_id", { count: "exact", head: true }).eq("user_id", id),
    db.from("comments").select("id, body, created_at, content_id").eq("user_id", id).is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
    db.from("posts").select("id, body, created_at").eq("author_id", id).eq("kind", "community").is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
    db.from("post_comments").select("id", { count: "exact", head: true }).eq("user_id", id).is("deleted_at", null),
    db.from("welcome_emails").select("step, sent_at").eq("user_id", id).order("step"),
    db.from("member_notes").select("id, body, created_at, author_id").eq("user_id", id).order("created_at", { ascending: false }),
    db
      .from("admin_audit_log")
      .select("id, admin_id, action, note, created_at")
      .eq("target_type", "user")
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    db.from("member_followups").select("kind, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  const lastFollow = !followRes.error ? ((followRes.data ?? []) as { kind: string; created_at: string }[])[0] : undefined;

  const payments = check<{ id: string; paid_at: string; plan: PlanCode | null; method: PaymentMethod; months: number; amount: number | string; reference: string | null }[]>(payRes, "payments");
  const purchases = check<{ id: string; product_id: string; amount: number | string; status: string; paid_at: string | null }[]>(purRes, "purchases");
  const samples = check<{ id: string; product_id: string; created_at: string }[]>(sampleRes, "sample downloads");
  const wps = check<{ content_id: string; position_sec: number; completed: boolean; updated_at: string }[]>(wpRes, "watch progress");
  const comments = check<{ id: string; body: string; created_at: string; content_id: string }[]>(cmRes, "comments");
  const posts = check<{ id: string; body: string; created_at: string }[]>(postRes, "posts");
  const welcome = check<{ step: number; sent_at: string }[]>(welcomeRes, "welcome emails");
  const logs = check<{ id: string; admin_id: string; action: string; note: string | null; created_at: string }[]>(logRes, "audit log");
  const notesAvailable = !notesRes.error;
  const notes = notesAvailable ? ((notesRes.data ?? []) as { id: string; body: string; created_at: string; author_id: string | null }[]) : [];

  const [products, contents, people] = await Promise.all([
    fetchIn<{ id: string; title: string }>([...purchases, ...samples].map((x) => x.product_id), (ids) => db.from("products").select("id, title").in("id", ids), "products"),
    fetchIn<{ id: string; type: ContentType; title: string; thumbnail_url: string | null; duration_sec: number }>(
      [...wps, ...comments].map((x) => x.content_id),
      (ids) => db.from("content").select("id, type, title, thumbnail_url, duration_sec").in("id", ids),
      "content",
    ),
    fetchIn<{ id: string; display_name: string }>(
      [...logs.map((l) => l.admin_id), ...notes.map((n) => n.author_id ?? "")].filter(isUuid),
      (ids) => db.from("profiles").select("id, display_name").in("id", ids),
      "names",
    ),
  ]);
  const productTitle = new Map(products.map((p) => [p.id, p.title]));
  const content = new Map(contents.map((c) => [c.id, c]));
  const name = new Map(people.map((p) => [p.id, p.display_name]));

  // Views per Bangkok day, last 30 days.
  const keys: string[] = [];
  for (let i = 29; i >= 0; i--) keys.push(bkkDayKey(now - i * DAY));
  const viewsByDay = new Map(keys.map((k) => [k, 0]));
  const activeDays = new Set<string>();
  for (const v of views) {
    if (new Date(v.created_at).getTime() < sinceViews) continue;
    const k = bkkDayKey(v.created_at);
    activeDays.add(k);
    if (viewsByDay.has(k)) viewsByDay.set(k, viewsByDay.get(k)! + 1);
  }
  const daily = keys.map((k) => ({ key: k, label: dayLabel(k), count: viewsByDay.get(k)! }));
  // Estimated watch time from progress (finished clips count their full length).
  const watchSec = wps.reduce((s, w) => s + (w.completed ? (content.get(w.content_id)?.duration_sec ?? 0) : Number(w.position_sec || 0)), 0);

  const paidPurchases = purchases.filter((p) => p.status === "paid");
  return {
    id,
    display_name: profile.display_name || (au?.email ?? "").split("@")[0] || "ผู้ใช้",
    avatar_url: profile.avatar_url,
    email: au?.email ?? "",
    is_banned: profile.is_banned,
    signed_up_at: au?.created_at ?? profile.created_at,
    last_sign_in_at: au?.last_sign_in_at ?? null,
    provider: au?.provider ?? "email",
    email_confirmed: au?.email_confirmed ?? false,
    onboarding_stage: profile.onboarding_stage,
    email_updates: profile.email_updates !== false,
    status: memberStatus(sub?.expires_at ?? null, now),
    expires_at: sub?.expires_at ?? null,
    first_paid_at: sub?.first_paid_at ?? null,
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount || 0) })),
    purchases: purchases.map((p) => ({ id: p.id, title: productTitle.get(p.product_id) ?? "สินค้าที่ถูกลบ", amount: Number(p.amount || 0), status: p.status, paid_at: p.paid_at })),
    samples: samples.map((s) => ({ id: s.id, title: productTitle.get(s.product_id) ?? "สินค้าที่ถูกลบ", created_at: s.created_at })),
    watched: wps.flatMap((w) => {
      const c = content.get(w.content_id);
      return c
        ? [{ content_id: w.content_id, type: c.type, title: c.title, thumbnail_url: c.thumbnail_url, duration_sec: c.duration_sec, position_sec: w.position_sec, completed: w.completed, updated_at: w.updated_at }]
        : [];
    }),
    daily,
    active_days_30: activeDays.size,
    watch_sec: watchSec,
    lifetime_thb: payments.reduce((s, p) => s + Number(p.amount || 0), 0) + paidPurchases.reduce((s, p) => s + Number(p.amount || 0), 0),
    clips_started: wps.length,
    clips_completed: wps.filter((w) => w.completed).length,
    likes: countOf(likes, "likes"),
    saved: countOf(saved, "saved"),
    comments: comments.map((c) => {
      const ct = content.get(c.content_id);
      return { id: c.id, body: c.body, created_at: c.created_at, content_id: c.content_id, content_type: ct?.type ?? ("video" as ContentType), content_title: ct?.title ?? "คลิปที่ถูกลบ" };
    }),
    posts,
    post_comment_count: countOf(pcCount, "post comments"),
    welcome,
    notes: notes.map((n) => ({ id: n.id, body: n.body, created_at: n.created_at, author: (n.author_id && name.get(n.author_id)) || "ผู้ดูแล" })),
    notes_available: notesAvailable,
    audit: logs.map((l) => ({ id: l.id, action: l.action, note: l.note ?? "", created_at: l.created_at, admin: name.get(l.admin_id) ?? "ผู้ดูแล" })),
    last_followup: lastFollow && isFollowupKind(lastFollow.kind) ? { kind: lastFollow.kind, created_at: lastFollow.created_at } : null,
  };
}

// ───────── Follow-ups & funnel ─────────
const FOLLOWUP_HIDE_DAYS = 7;

/** "ต้องทำวันนี้": who to contact today, grouped by why. `available` = false when member_followups is not migrated (nothing is hidden then). */
export async function memberFollowups(rows: MemberRow[], now = Date.now()): Promise<{ groups: FollowupGroup[]; available: boolean }> {
  const db = adminDb();
  const since30 = new Date(now - 30 * DAY).toISOString();
  const since7 = new Date(now - FOLLOWUP_HIDE_DAYS * DAY).toISOString();
  const [downloads, purchases, doneRes] = await Promise.all([
    fetchAll<{ user_id: string; product_id: string; created_at: string }>(
      (from, to) => db.from("sample_downloads").select("user_id, product_id, created_at").gte("created_at", since30).order("id").range(from, to),
      "sample downloads",
    ),
    fetchAll<{ user_id: string; product_id: string }>(
      (from, to) => db.from("purchases").select("user_id, product_id").eq("status", "paid").order("id").range(from, to),
      "purchases",
    ),
    db.from("member_followups").select("user_id, kind").gte("created_at", since7).limit(5000),
  ]);
  const available = !doneRes.error;
  const done = new Set(available ? ((doneRes.data ?? []) as { user_id: string; kind: string }[]).map((d) => `${d.user_id}:${d.kind}`) : []);

  const bought = new Set(purchases.map((p) => `${p.user_id}:${p.product_id}`));
  const known = new Set(rows.map((r) => r.id));
  const unbought = downloads.filter((d) => known.has(d.user_id) && !bought.has(`${d.user_id}:${d.product_id}`));
  const products = await fetchIn<{ id: string; title: string }>(unbought.map((d) => d.product_id), (ids) => db.from("products").select("id, title").in("id", ids), "products");
  const productTitle = new Map(products.map((p) => [p.id, p.title]));
  const sampleBy = new Map<string, { newest: { product_id: string; created_at: string }; products: Set<string> }>();
  for (const d of unbought) {
    const cur = sampleBy.get(d.user_id) ?? { newest: d, products: new Set<string>() };
    cur.products.add(d.product_id);
    if (new Date(d.created_at).getTime() > new Date(cur.newest.created_at).getTime()) cur.newest = d;
    sampleBy.set(d.user_id, cur);
  }

  const build = (kind: FollowupKind, pick: (r: MemberRow) => { reason: string; sort: number } | null): FollowupGroup => {
    const items: FollowupItem[] = [];
    for (const r of rows) {
      if (r.is_banned || done.has(`${r.id}:${kind}`)) continue;
      const hit = pick(r);
      if (hit) items.push({ id: r.id, display_name: r.display_name, email: r.email, avatar_url: r.avatar_url, reason: hit.reason, sort: hit.sort });
    }
    items.sort((a, b) => b.sort - a.sort);
    return { kind, title: FOLLOWUP_LABEL[kind], hint: FOLLOWUP_HINT[kind], items };
  };

  const paying = (r: MemberRow) => r.status === "active" || r.status === "expiring";
  const groups: FollowupGroup[] = [
    build("hot", (r) =>
      r.hot ? { reason: `ดู ${r.recent_clips_7d} คลิปใน 7 วัน · ${r.recent_sec_7d >= 60 ? `~${Math.round(r.recent_sec_7d / 60)} นาที` : "< 1 นาที"}`, sort: r.recent_sec_7d } : null,
    ),
    build("sample", (r) => {
      const s = sampleBy.get(r.id);
      if (!s) return null;
      const extra = s.products.size - 1;
      return {
        reason: `โหลด ${productTitle.get(s.newest.product_id) ?? "ไฟล์ตัวอย่าง"} · ${timeAgo(s.newest.created_at, now)}${extra > 0 ? ` +${extra}` : ""}`,
        sort: new Date(s.newest.created_at).getTime(),
      };
    }),
    build("expiring", (r) => {
      if (!paying(r) || !r.expires_at) return null;
      const left = new Date(r.expires_at).getTime() - now;
      if (left > 7 * DAY) return null;
      const method = r.last_method ? ` · ${METHOD_LABEL[r.last_method]}` : "";
      return { reason: `หมดอีก ${Math.max(0, Math.ceil(left / DAY))} วัน${method}${r.last_method !== "card" ? " · ไม่ต่ออัตโนมัติ" : ""}`, sort: -left };
    }),
    build("at_risk", (r) => {
      if (!paying(r)) return null;
      if (!r.last_active) return { reason: "ยังไม่เคยดูคลิป", sort: Number.MAX_SAFE_INTEGER };
      const gone = now - new Date(r.last_active).getTime();
      return gone > 14 * DAY ? { reason: `ไม่ได้เข้ามา ${Math.floor(gone / DAY)} วัน`, sort: gone } : null;
    }),
    build("no_watch", (r) => {
      if (r.clips_started !== 0) return null;
      const age = now - new Date(r.signed_up_at).getTime();
      return age >= DAY && age <= 30 * DAY ? { reason: `สมัคร ${timeAgo(r.signed_up_at, now)}`, sort: -age } : null;
    }),
  ];
  return { groups, available };
}

const ONBOARDING_LAUNCH = new Date("2026-11-07T00:00:00+07:00").getTime();

/** Signup funnel for the last 30 days, 90 days and all time. Every step is counted independently within the cohort. */
export function memberFunnel(rows: MemberRow[], now = Date.now()): FunnelWindow[] {
  const windows: [FunnelWindowKey, string, number][] = [
    ["30", "30 วัน", 30 * DAY],
    ["90", "90 วัน", 90 * DAY],
    ["all", "ทั้งหมด", Infinity],
  ];
  return windows.map(([key, label, span]) => {
    const cohort = rows.filter((r) => now - new Date(r.signed_up_at).getTime() <= span);
    const onboarded = cohort.filter((r) => new Date(r.signed_up_at).getTime() >= ONBOARDING_LAUNCH);
    const stages = { idea: 0, build: 0, sell: 0 };
    let answered = 0;
    for (const r of cohort) {
      if (!r.onboarding_stage) continue;
      answered++;
      stages[r.onboarding_stage]++;
    }
    return {
      key,
      label,
      steps: [
        { label: "สมัครบัญชี", count: cohort.length },
        { label: "ดูคลิปแรก", count: cohort.filter((r) => r.clips_started >= 1).length },
        { label: "ดูจบอย่างน้อย 1 คลิป", count: cohort.filter((r) => r.clips_completed >= 1).length },
        { label: "กลับมาดูอีกวัน", count: cohort.filter((r) => r.view_days >= 2).length },
        { label: "จ่ายเงิน", count: cohort.filter((r) => !!r.first_paid_at || r.lifetime_thb > 0).length },
      ],
      onboarding: { answered, stages, since: { total: onboarded.length, answered: onboarded.filter((r) => r.onboarding_stage).length } },
    };
  });
}

// ───────── Per-request shared fetches (layout + page of the members area share one query) ─────────
export const getMemberRows = cache(() => memberRows(Date.now()));
export const getMemberSummary = cache(async () => memberSummary(await getMemberRows(), Date.now()));
export const getFollowups = cache(async () => memberFollowups(await getMemberRows(), Date.now()));
export const getFunnel = cache(async () => memberFunnel(await getMemberRows(), Date.now()));
export const getMemberDetail = cache((id: string) => (isUuid(id) ? memberDetail(id) : Promise.resolve(null)));

/** Unresolved payment errors, payload trimmed for display. */
export const getPaymentErrors = cache(async (): Promise<PaymentErrorEntry[]> => {
  const rows = check<PaymentError[]>(
    await adminDb().from("payment_errors").select("*").eq("resolved", false).order("created_at", { ascending: false }),
    "payment errors",
  );
  return rows.map((e) => {
    let payload = "";
    try {
      payload = JSON.stringify(e.payload, null, 2) ?? "";
    } catch {
      payload = String(e.payload);
    }
    return { id: e.id, reason: e.reason ?? "", created_at: e.created_at, payload: payload.length > 1200 ? payload.slice(0, 1200) + "\n…" : payload };
  });
});

/** Latest admin actions with names resolved for users / content / playlists. */
export async function auditEntries(limit = 50): Promise<AuditEntry[]> {
  const db = adminDb();
  const log = check<AuditLog[]>(await db.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(limit), "audit log");
  const userIds = [...log.map((a) => a.admin_id), ...log.filter((a) => a.target_type === "user").map((a) => a.target_id)].filter(Boolean);
  const contentIds = log.filter((a) => a.target_type === "content").map((a) => a.target_id);
  const playlistIds = log.filter((a) => a.target_type === "playlist").map((a) => a.target_id);
  const [people, titles, playlists] = await Promise.all([
    fetchIn<{ id: string; display_name: string }>(userIds.filter(isUuid), (ids) => db.from("profiles").select("id, display_name").in("id", ids), "names"),
    fetchIn<{ id: string; title: string }>(contentIds.filter(isUuid), (ids) => db.from("content").select("id, title").in("id", ids), "titles"),
    fetchIn<{ id: string; title: string }>(playlistIds.filter(isUuid), (ids) => db.from("playlists").select("id, title").in("id", ids), "playlists"),
  ]);
  const names = new Map(people.map((p) => [p.id, p.display_name]));
  const titleOf = new Map(titles.map((c) => [c.id, c.title]));
  const playlistOf = new Map(playlists.map((p) => [p.id, p.title]));
  return log.map((a) => ({
    id: a.id,
    admin: names.get(a.admin_id) ?? "ผู้ดูแล",
    action: a.action,
    target:
      a.target_type === "user"
        ? (names.get(a.target_id) ?? a.target_id)
        : a.target_type === "content"
          ? (titleOf.get(a.target_id) ?? a.target_id)
          : a.target_type === "playlist"
            ? (playlistOf.get(a.target_id) ?? a.target_id)
            : "",
    note: a.note ?? "",
    created_at: a.created_at,
  }));
}

export interface PaymentLine {
  id: string;
  user_id: string;
  name: string;
  paid_at: string;
  plan: PlanCode | null;
  method: PaymentMethod;
  amount: number;
}

/** Newest payments across all members. */
export async function recentPayments(limit = 50): Promise<PaymentLine[]> {
  const db = adminDb();
  const rows = check<{ id: string; user_id: string; paid_at: string; plan: PlanCode | null; method: PaymentMethod; amount: number | string }[]>(
    await db.from("payments").select("id, user_id, paid_at, plan, method, amount").order("paid_at", { ascending: false }).limit(limit),
    "payments",
  );
  const people = await fetchIn<{ id: string; display_name: string }>(rows.map((r) => r.user_id), (ids) => db.from("profiles").select("id, display_name").in("id", ids), "names");
  const name = new Map(people.map((p) => [p.id, p.display_name]));
  return rows.map((r) => ({ id: r.id, user_id: r.user_id, name: name.get(r.user_id) || "ผู้ใช้", paid_at: r.paid_at, plan: r.plan, method: r.method, amount: Number(r.amount || 0) }));
}
