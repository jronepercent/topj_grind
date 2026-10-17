import "server-only";
import { db } from "@/lib/server/store";
import { isMemberUser } from "@/lib/server/auth";
import { isLive } from "@/lib/server/queries";
import type { ContentRow } from "@/lib/types";
import type { DailyPoint, MemberRow, MemberStatus, PickItem, StudioComment, StudioContentRow } from "@/components/studio/types";

export const DAY = 86_400_000;
const BKK_OFFSET = 7 * 3_600_000; // Asia/Bangkok is UTC+7 all year (no DST)
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

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

/** Views per Bangkok day for the last `days` days (today included). */
export function dailyViews(days = 28, contentId?: string, now = Date.now()): DailyPoint[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(bkkDayKey(now - i * DAY));
  const counts = new Map(keys.map((k) => [k, 0]));
  const since = now - days * DAY;
  for (const v of db().views) {
    if (contentId && v.content_id !== contentId) continue;
    const t = new Date(v.created_at).getTime();
    if (t < since) continue;
    const k = bkkDayKey(t);
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return keys.map((k) => ({ key: k, label: dayLabel(k), count: counts.get(k)! }));
}


export function toStudioRow(c: ContentRow): StudioContentRow {
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

export function studioContentRows(): StudioContentRow[] {
  return [...db().content]
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map(toStudioRow);
}

export function pickItems(): PickItem[] {
  return [...db().content]
    .filter((c) => !c.deleted_at)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map((c) => ({
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
function adminIds() {
  return new Set(db().profiles.filter((p) => p.role === "admin").map((p) => p.id));
}

/** Top-level comments by non-admins that have no (non-deleted) admin reply yet. */
export function isUnanswered(commentId: string, admins = adminIds()) {
  return !db().comments.some((r) => r.parent_id === commentId && !r.deleted_at && admins.has(r.user_id));
}

export function studioComments(limit = 300): StudioComment[] {
  const d = db();
  const admins = adminIds();
  const profiles = new Map(d.profiles.map((p) => [p.id, p]));
  const content = new Map(d.content.map((c) => [c.id, c]));
  const comments = new Map(d.comments.map((c) => [c.id, c]));
  return d.comments
    .filter((c) => !c.deleted_at && !admins.has(c.user_id) && content.get(c.content_id) && !content.get(c.content_id)!.deleted_at)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, limit)
    .map((c) => {
      const p = profiles.get(c.user_id);
      const ct = content.get(c.content_id)!;
      const adminReply = c.parent_id
        ? null
        : [...d.comments]
            .filter((r) => r.parent_id === c.id && !r.deleted_at && admins.has(r.user_id))
            .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0] ?? null;
      const parent = c.parent_id ? comments.get(c.parent_id) : null;
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
          display_name: p?.display_name ?? "ผู้ใช้",
          avatar_url: p?.avatar_url ?? null,
          is_banned: !!p?.is_banned,
          is_member: isMemberUser(c.user_id),
        },
        content: { id: ct.id, type: ct.type, title: ct.title, thumbnail_url: ct.thumbnail_url },
        parent_excerpt: parent ? parent.body.slice(0, 80) : null,
        answered: !!c.parent_id || !!adminReply,
        admin_reply: adminReply?.body ?? null,
        reports: d.comment_reports
          .filter((r) => r.comment_id === c.id)
          .map((r) => ({ reason: r.reason, created_at: r.created_at })),
      };
    });
}

// ───────── Members ─────────
export function memberStatus(expires_at: string | null, now = Date.now()): MemberStatus {
  if (!expires_at) return "never";
  const t = new Date(expires_at).getTime();
  if (t <= now) return "expired";
  if (t - now <= 3 * DAY) return "expiring";
  return "active";
}

export function memberRows(now = Date.now()): MemberRow[] {
  const d = db();
  return d.profiles
    .filter((p) => p.role !== "admin")
    .map((p) => {
      const sub = d.subscriptions.find((s) => s.user_id === p.id);
      const pays = d.payments.filter((x) => x.user_id === p.id).sort((a, b) => +new Date(b.paid_at) - +new Date(a.paid_at));
      const lastWatch = d.watch_progress
        .filter((w) => w.user_id === p.id)
        .reduce<string | null>((m, w) => (!m || w.updated_at > m ? w.updated_at : m), null);
      return {
        id: p.id,
        display_name: p.display_name,
        email: p.email,
        avatar_url: p.avatar_url,
        is_banned: p.is_banned,
        first_paid_at: sub?.first_paid_at ?? null,
        expires_at: sub?.expires_at ?? null,
        status: memberStatus(sub?.expires_at ?? null, now),
        last_method: pays[0]?.method ?? null,
        last_watch: lastWatch,
      };
    })
    .sort((a, b) => {
      const order = { expiring: 0, active: 1, expired: 2, never: 3 } as const;
      return order[a.status] - order[b.status] || (b.expires_at ?? "").localeCompare(a.expires_at ?? "");
    });
}

export function memberSummary(rows: MemberRow[], now = Date.now()) {
  const { start, end } = bkkMonthRange(now);
  const active = rows.filter((r) => r.expires_at && new Date(r.expires_at).getTime() > now);
  const within7 = active.filter((r) => new Date(r.expires_at!).getTime() - now <= 7 * DAY);
  const expiringThisMonth = rows.filter((r) => {
    if (!r.expires_at) return false;
    const t = new Date(r.expires_at).getTime();
    return t >= start && t < end;
  });
  const revenue = db()
    .payments.filter((p) => {
      const t = new Date(p.paid_at).getTime();
      return t >= start && t < end;
    })
    .reduce((s, p) => s + p.amount, 0);
  return { active: active.length, within7: within7.length, expiringThisMonth: expiringThisMonth.length, revenue };
}

export function currentMemberCount(now = Date.now()) {
  return db().profiles.filter((p) => p.role !== "admin" && isMemberUser(p.id, now)).length;
}
