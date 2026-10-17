import "server-only";
import { db, commit, uid, nowIso } from "./store";
import { HttpError, isMemberUser } from "./auth";
import { isLive, getContentRow } from "./queries";
import { contentHref, thaiDate, daysUntil } from "@/lib/format";
import { COMPLETE_RATIO, viewThresholdSec } from "@/lib/view-rules";
import type { ContentRow, Notification, PaymentMethod, Viewer } from "@/lib/types";

const DAY = 86_400_000;
export const MEMBERSHIP_DAYS = Number(process.env.MEMBERSHIP_DAYS ?? 30);

// ───────── Notifications ─────────
export function notify(n: Omit<Notification, "id" | "read_at" | "created_at">) {
  db().notifications.push({ ...n, id: uid("n-"), read_at: null, created_at: nowIso() });
  commit();
}

export function notifyNewContent(c: ContentRow) {
  for (const p of db().profiles) {
    if (p.role === "admin") continue;
    db().notifications.push({
      id: uid("n-"),
      user_id: p.id,
      type: "new_content",
      title: "คลิปใหม่จาก TOPJ_GRIND",
      body: c.title,
      link: contentHref(c),
      image_url: c.thumbnail_url,
      read_at: null,
      created_at: nowIso(),
    });
  }
  commit();
}

export function markAllRead(userId: string) {
  const t = nowIso();
  for (const n of db().notifications) if (n.user_id === userId && !n.read_at) n.read_at = t;
  commit();
}

/** The single place a clip goes live "now". */
export function publishNow(c: ContentRow) {
  c.status = "published";
  c.published_at = nowIso();
  c.scheduled_at = null;
  c.publish_when_ready = false;
}

/** "เผยแพร่ทันที" chosen before processing finished → publish once media is ready. */
export function finalizeIfReady(c: ContentRow) {
  if (c.media_status !== "ready" || !c.publish_when_ready) return;
  if (c.status === "published") {
    c.publish_when_ready = false;
    return;
  }
  publishNow(c);
  notifyNewContent(c);
}

// ───────── Membership ─────────
function subOf(userId: string) {
  let s = db().subscriptions.find((x) => x.user_id === userId);
  if (!s) {
    s = { user_id: userId, expires_at: null, first_paid_at: null, updated_at: nowIso() };
    db().subscriptions.push(s);
  }
  return s;
}

/** new_expires_at = max(now, current_expires_at) + 30 days × months */
export function extendFrom(current: string | null, days: number, now = Date.now()) {
  const base = Math.max(now, current ? new Date(current).getTime() : 0);
  return new Date(base + days * DAY).toISOString();
}

export interface PaymentPayload {
  user_id?: string;
  email?: string;
  amount: number;
  currency: string;
  months: number;
  method: PaymentMethod;
  reference: string;
  paid_at: string;
}

export type PaymentResult =
  | { status: 200; expires_at: string; duplicate: boolean }
  | { status: 404 | 400; error: string };

export function applyPayment(p: PaymentPayload, raw: unknown): PaymentResult {
  const d = db();
  if (!p || typeof p.reference !== "string" || !p.reference) return { status: 400, error: "missing reference" };
  const months = Math.max(1, Math.floor(Number(p.months) || 1));

  // 1) Idempotent on reference
  const dup = d.payments.find((x) => x.reference === p.reference);
  if (dup) {
    return { status: 200, expires_at: subOf(dup.user_id).expires_at!, duplicate: true };
  }

  const user =
    (p.user_id && d.profiles.find((x) => x.id === p.user_id)) ||
    (p.email && d.profiles.find((x) => x.email.toLowerCase() === String(p.email).toLowerCase()));
  if (!user) {
    d.payment_errors.push({ id: uid("pe-"), payload: raw, reason: "ไม่พบผู้ใช้", resolved: false, created_at: nowIso() });
    commit();
    return { status: 404, error: "user not found" };
  }

  // 2) Record payment
  d.payments.push({
    id: uid("pay-"),
    user_id: user.id,
    amount: Number(p.amount) || 0,
    currency: p.currency || "THB",
    months,
    method: p.method,
    reference: p.reference,
    paid_at: p.paid_at || nowIso(),
    raw,
    created_at: nowIso(),
  });

  // 3) Extend — paying early never loses days
  const s = subOf(user.id);
  s.expires_at = extendFrom(s.expires_at, MEMBERSHIP_DAYS * months);
  s.first_paid_at ??= p.paid_at || nowIso();
  s.updated_at = nowIso();

  // 4) Notify
  notify({
    user_id: user.id,
    type: "payment",
    title: "ชำระเงินสำเร็จ",
    body: `สมาชิกถึงวันที่ ${thaiDate(s.expires_at)}`,
    link: "/account",
    image_url: null,
  });
  commit();
  return { status: 200, expires_at: s.expires_at, duplicate: false };
}

export function audit(adminId: string, action: string, target_type: string, target_id: string, note = "") {
  db().admin_audit_log.push({ id: uid("al-"), admin_id: adminId, action, target_type, target_id, note, created_at: nowIso() });
  commit();
}

export function manualExtend(admin: Viewer, userId: string, opts: { days?: number; until?: string }, note: string) {
  if (!note.trim()) throw new HttpError(400, "ต้องใส่หมายเหตุ");
  const s = subOf(userId);
  if (opts.until) s.expires_at = new Date(opts.until).toISOString();
  else s.expires_at = extendFrom(s.expires_at, opts.days ?? MEMBERSHIP_DAYS);
  s.first_paid_at ??= nowIso();
  s.updated_at = nowIso();
  audit(admin.id, opts.until ? "membership.set_date" : "membership.extend", "user", userId, note);
  notify({ user_id: userId, type: "payment", title: "ต่ออายุสมาชิกแล้ว", body: `สมาชิกถึงวันที่ ${thaiDate(s.expires_at)}`, link: "/account", image_url: null });
  return s.expires_at;
}

export function revokeMembership(admin: Viewer, userId: string, note: string) {
  if (!note.trim()) throw new HttpError(400, "ต้องใส่หมายเหตุ");
  const s = subOf(userId);
  s.expires_at = nowIso();
  s.updated_at = nowIso();
  audit(admin.id, "membership.revoke", "user", userId, note);
}

// ───────── Engagement ─────────
function assertCanEngage(viewer: Viewer, contentId: string) {
  const c = getContentRow(contentId);
  if (!c || (!isLive(c) && !viewer.is_admin)) throw new HttpError(404, "ไม่พบคอนเทนต์");
  if (c.visibility === "members" && !viewer.is_member) throw new HttpError(403, "เฉพาะสมาชิก");
  return c;
}

export function toggleLike(viewer: Viewer, contentId: string) {
  const c = assertCanEngage(viewer, contentId);
  const d = db();
  const i = d.likes.findIndex((l) => l.user_id === viewer.id && l.content_id === contentId);
  if (i >= 0) {
    d.likes.splice(i, 1);
    c.like_count = Math.max(0, c.like_count - 1);
  } else {
    d.likes.push({ user_id: viewer.id, content_id: contentId, created_at: nowIso() });
    c.like_count++;
  }
  commit();
  return { liked: i < 0, count: c.like_count };
}

export function toggleSave(viewer: Viewer, contentId: string, force?: boolean) {
  const d = db();
  const i = d.saved.findIndex((l) => l.user_id === viewer.id && l.content_id === contentId);
  const want = force ?? i < 0;
  if (!want && i >= 0) d.saved.splice(i, 1);
  if (want && i < 0) d.saved.push({ user_id: viewer.id, content_id: contentId, created_at: nowIso() });
  commit();
  return { saved: want };
}

export function saveProgress(viewer: Viewer, contentId: string, positionSec: number, duration: number) {
  const prof = db().profiles.find((p) => p.id === viewer.id);
  if (prof && !prof.save_history) return;
  const c = getContentRow(contentId);
  if (!c) return;
  if (c.visibility === "members" && !viewer.is_member) return;
  const dur = duration || c.duration_sec;
  const completed = dur > 0 && positionSec / dur >= COMPLETE_RATIO;
  const d = db();
  const row = d.watch_progress.find((p) => p.user_id === viewer.id && p.content_id === contentId);
  const pos = completed ? 0 : Math.floor(positionSec);
  if (row) {
    row.position_sec = pos;
    row.completed = row.completed || completed;
    row.updated_at = nowIso();
  } else {
    d.watch_progress.push({ user_id: viewer.id, content_id: contentId, position_sec: pos, completed, updated_at: nowIso() });
  }
  commit();
}

/** 1 view when watched ≥ 30s (or ≥ 50% for Shorts), max once per person/clip/hour. */
export function recordView(contentId: string, userId: string | null, sessionId: string, watchedSec: number) {
  const c = getContentRow(contentId);
  if (!c || !isLive(c)) return false;
  if (watchedSec < viewThresholdSec(c.type, c.duration_sec)) return false;
  const d = db();
  const hourAgo = Date.now() - 3_600_000;
  const recent = d.views.some(
    (v) => v.content_id === contentId && (userId ? v.user_id === userId : v.session_id === sessionId) && +new Date(v.created_at) > hourAgo,
  );
  if (recent) return false;
  d.views.push({ id: uid("vw-"), content_id: contentId, user_id: userId, session_id: sessionId, watched_sec: Math.floor(watchedSec), created_at: nowIso() });
  c.view_count++;
  commit();
  return true;
}

export function clearHistory(userId: string, contentId?: string) {
  const d = db();
  d.watch_progress = d.watch_progress.filter((p) => !(p.user_id === userId && (!contentId || p.content_id === contentId)));
  commit();
}

// ───────── Comments ─────────
export function createComment(viewer: Viewer, contentId: string, body: string, parentId: string | null) {
  const c = getContentRow(contentId);
  if (!c || (!isLive(c) && !viewer.is_admin)) throw new HttpError(404, "ไม่พบคอนเทนต์");
  if (!c.comments_enabled) throw new HttpError(403, "ปิดความคิดเห็นสำหรับคลิปนี้");
  if (c.visibility === "members" && !viewer.is_member) throw new HttpError(403, "คอมเมนต์ได้เฉพาะสมาชิก");
  const text = body.trim();
  if (!text) throw new HttpError(400, "กรุณาพิมพ์ข้อความ");
  if (text.length > 1000) throw new HttpError(400, "ข้อความยาวเกิน 1,000 ตัวอักษร");
  const banned = db().banned_words.find((w) => text.toLowerCase().includes(w.word.toLowerCase()));
  if (banned) throw new HttpError(400, "ข้อความมีคำที่ไม่อนุญาต");
  const d = db();
  let parent = null as null | (typeof d.comments)[number];
  if (parentId) {
    parent = d.comments.find((x) => x.id === parentId) ?? null;
    if (!parent) throw new HttpError(404, "ไม่พบความคิดเห็น");
    if (parent.parent_id) parent = d.comments.find((x) => x.id === parent!.parent_id)!; // one level deep
  }
  const row = {
    id: uid("c-"),
    content_id: contentId,
    user_id: viewer.id,
    parent_id: parent?.id ?? null,
    body: text,
    like_count: 0,
    is_pinned: false,
    creator_hearted: false,
    is_hidden: false,
    edited_at: null,
    deleted_at: null,
    created_at: nowIso(),
  };
  d.comments.push(row);
  c.comment_count++;
  if (parent && parent.user_id !== viewer.id) {
    notify({
      user_id: parent.user_id,
      type: "reply",
      title: `${viewer.is_admin ? "JR" : viewer.display_name} ตอบกลับความคิดเห็นของคุณ`,
      body: text.slice(0, 80),
      link: `${c.type === "podcast" ? "/podcasts" : c.type === "short" ? "/shorts" : "/watch"}/${c.id}#comments`,
      image_url: c.thumbnail_url,
    });
  }
  commit();
  return row;
}

function ownComment(viewer: Viewer, id: string) {
  const c = db().comments.find((x) => x.id === id && !x.deleted_at);
  if (!c) throw new HttpError(404, "ไม่พบความคิดเห็น");
  if (c.user_id !== viewer.id && !viewer.is_admin) throw new HttpError(403, "แก้ไขได้เฉพาะความคิดเห็นของตัวเอง");
  return c;
}

export function editComment(viewer: Viewer, id: string, body: string) {
  const c = db().comments.find((x) => x.id === id && !x.deleted_at);
  if (!c || c.user_id !== viewer.id) throw new HttpError(403, "แก้ไขได้เฉพาะความคิดเห็นของตัวเอง");
  const text = body.trim();
  if (!text || text.length > 1000) throw new HttpError(400, "ข้อความไม่ถูกต้อง");
  c.body = text;
  c.edited_at = nowIso();
  commit();
  return c;
}

export function deleteComment(viewer: Viewer, id: string) {
  const c = ownComment(viewer, id);
  c.deleted_at = nowIso();
  const content = getContentRow(c.content_id);
  if (content) content.comment_count = Math.max(0, content.comment_count - 1);
  if (viewer.is_admin && c.user_id !== viewer.id) audit(viewer.id, "comment.delete", "comment", id);
  commit();
}

export function toggleCommentLike(viewer: Viewer, id: string) {
  const d = db();
  const c = d.comments.find((x) => x.id === id && !x.deleted_at);
  if (!c) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const content = getContentRow(c.content_id);
  if (content?.visibility === "members" && !viewer.is_member) throw new HttpError(403, "เฉพาะสมาชิก");
  const i = d.comment_likes.findIndex((l) => l.user_id === viewer.id && l.comment_id === id);
  if (i >= 0) {
    d.comment_likes.splice(i, 1);
    c.like_count = Math.max(0, c.like_count - 1);
  } else {
    d.comment_likes.push({ user_id: viewer.id, comment_id: id });
    c.like_count++;
  }
  commit();
  return { liked: i < 0, count: c.like_count };
}

export function reportComment(viewer: Viewer, id: string, reason: string) {
  db().comment_reports.push({ id: uid("rep-"), comment_id: id, user_id: viewer.id, reason: reason || "ไม่เหมาะสม", created_at: nowIso() });
  commit();
}

export function moderateComment(admin: Viewer, id: string, action: "pin" | "unpin" | "heart" | "unheart" | "hide" | "unhide") {
  const d = db();
  const c = d.comments.find((x) => x.id === id);
  if (!c) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const content = getContentRow(c.content_id);
  if (action === "pin") {
    for (const o of d.comments) if (o.content_id === c.content_id) o.is_pinned = false;
    c.is_pinned = true;
    if (c.user_id !== admin.id)
      notify({ user_id: c.user_id, type: "pin", title: "JR ปักหมุดความคิดเห็นของคุณ", body: c.body.slice(0, 80), link: `/watch/${c.content_id}#comments`, image_url: content?.thumbnail_url ?? null });
  }
  if (action === "unpin") c.is_pinned = false;
  if (action === "heart") {
    c.creator_hearted = true;
    if (c.user_id !== admin.id)
      notify({ user_id: c.user_id, type: "heart", title: "JR หัวใจความคิดเห็นของคุณ", body: c.body.slice(0, 80), link: `/watch/${c.content_id}#comments`, image_url: content?.thumbnail_url ?? null });
  }
  if (action === "unheart") c.creator_hearted = false;
  if (action === "hide") c.is_hidden = true;
  if (action === "unhide") c.is_hidden = false;
  audit(admin.id, `comment.${action}`, "comment", id);
  commit();
}

export function banUser(admin: Viewer, userId: string, banned = true) {
  const p = db().profiles.find((x) => x.id === userId);
  if (!p || p.role === "admin") throw new HttpError(400, "แบนผู้ใช้นี้ไม่ได้");
  p.is_banned = banned;
  audit(admin.id, banned ? "user.ban" : "user.unban", "user", userId);
  commit();
}

// ───────── Cron ─────────
/** Every minute: publish due scheduled clips. Daily 09:00: expiry reminders. */
export function runScheduler(now = Date.now(), withReminders = false) {
  const d = db();
  const published: string[] = [];
  for (const c of d.content) {
    if (c.status === "scheduled" && c.scheduled_at && +new Date(c.scheduled_at) <= now && c.media_status === "ready" && !c.deleted_at) {
      c.status = "published";
      c.published_at = c.scheduled_at;
      published.push(c.id);
      notifyNewContent(c);
    }
  }
  // Trash: soft-deleted items are purged after 30 days
  const cutoff = now - 30 * DAY;
  const purge = new Set(d.content.filter((c) => c.deleted_at && +new Date(c.deleted_at) < cutoff).map((c) => c.id));
  if (purge.size) {
    d.content = d.content.filter((c) => !purge.has(c.id));
    d.playlist_items = d.playlist_items.filter((p) => !purge.has(p.content_id));
  }
  let reminded = 0;
  if (withReminders) {
    for (const s of d.subscriptions) {
      const left = daysUntil(s.expires_at, now);
      if (left > 0 && left <= 3 && isMemberUser(s.user_id, now)) {
        notify({ user_id: s.user_id, type: "expiring", title: "สมาชิกใกล้หมดอายุ", body: `สมาชิกของคุณจะหมดอายุใน ${left} วัน`, link: "/membership", image_url: null });
        reminded++;
      }
    }
  }
  commit();
  return { published, reminded, purged: purge.size };
}
