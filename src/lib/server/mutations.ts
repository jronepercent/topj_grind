import "server-only";
import { revalidateTag } from "next/cache";
import { adminDb, must, userDb } from "@/lib/supabase/clients";
import { HttpError } from "./auth";
import { CATALOG_TAG, getContentRow, isLive, isUuid } from "./queries";
import { removeAudioObjects } from "@/lib/server/media";
import { contentHref, thaiDate } from "@/lib/format";
import { COMPLETE_RATIO, viewThresholdSec } from "@/lib/view-rules";
import { CURRENCY, PLANS, isPaymentMethod, isPlanCode, type PlanCode } from "@/lib/plans";
import type { ContentRow, Notification, PaymentMethod, Viewer } from "@/lib/types";

const DAY = 86_400_000;
const nowIso = () => new Date().toISOString();

/** Turn database errors from RLS / guard triggers into messages people understand. */
function friendly(err: { code?: string; message: string } | null, fallback: string): never {
  if (err?.code === "42501") throw new HttpError(403, fallback);
  if (err?.code === "22023") throw new HttpError(400, "ข้อความมีคำที่ไม่อนุญาต");
  throw new HttpError(500, err?.message ?? fallback);
}

// ───────────────────────── Notifications ─────────────────────────
export async function notify(n: Omit<Notification, "id" | "read_at" | "created_at">) {
  await adminDb().from("notifications").insert(n);
}

export async function notifyNewContent(c: Pick<ContentRow, "id" | "type" | "title" | "thumbnail_url">) {
  const users = must(await adminDb().from("profiles").select("id").neq("role", "admin"), "profiles");
  if (!users.length) return;
  const rows = users.map((u) => ({
    user_id: u.id,
    type: "new_content",
    title: "คลิปใหม่จาก TOPJ_GRIND",
    body: c.title,
    link: contentHref(c),
    image_url: c.thumbnail_url,
  }));
  for (let i = 0; i < rows.length; i += 500) await adminDb().from("notifications").insert(rows.slice(i, i + 500));
}

export async function markAllRead(userId: string) {
  const db = await userDb();
  await db.from("notifications").update({ read_at: nowIso() }).eq("user_id", userId).is("read_at", null);
}

// ───────────────────────── Publishing ─────────────────────────
/** Fields that make a clip go live "now". */
export function publishNowPatch() {
  return { status: "published" as const, published_at: nowIso(), scheduled_at: null, publish_when_ready: false };
}

/** "เผยแพร่ทันที" chosen before processing finished → publish once media is ready. */
export async function finalizeIfReady(c: ContentRow) {
  if (c.media_status !== "ready" || !c.publish_when_ready) return;
  if (c.status === "published") {
    await adminDb().from("content").update({ publish_when_ready: false }).eq("id", c.id);
    return;
  }
  await adminDb().from("content").update(publishNowPatch()).eq("id", c.id);
  revalidateTag(CATALOG_TAG);
  await notifyNewContent(c);
}

// ───────────────────────── Membership ─────────────────────────
/** new_expires_at = max(now, current_expires_at) + days */
export function extendFrom(current: string | null, days: number, now = Date.now()) {
  const base = Math.max(now, current ? new Date(current).getTime() : 0);
  return new Date(base + days * DAY).toISOString();
}

export interface PaymentPayload {
  user_id?: string;
  email?: string;
  /** Shop purchase: the product that was bought. Sent instead of `plan`; the expected amount is the product's price. */
  product_id?: string;
  amount: number;
  currency: string;
  /** Preferred: which plan was bought. Period and expected amount come from src/lib/plans.ts. */
  plan?: PlanCode;
  /** Legacy: whole months of 30 days, priced at the monthly rate. Ignored when `plan` is sent. */
  months?: number;
  method: PaymentMethod;
  reference: string;
  paid_at: string;
}

export type PaymentResult = { status: 200; expires_at: string; duplicate: boolean } | { status: 404 | 400; error: string };

/** Payment contract §9.1 — the database function apply_payment() does the atomic, idempotent part. */
export async function applyPayment(p: PaymentPayload, raw: unknown): Promise<PaymentResult> {
  if (!p || typeof p.reference !== "string" || !p.reference) return { status: 400, error: "missing reference" };
  const db = adminDb();
  const reject = async (reason: string, error: string): Promise<PaymentResult> => {
    await db.from("payment_errors").insert({ payload: raw, reason });
    return { status: 400, error };
  };

  // What was bought: a plan (exact days) or, for old integrations, N × 30-day months at the monthly price.
  let plan: PlanCode | null = null;
  let months: number;
  let days: number;
  let expected: number;
  if (p.plan !== undefined && p.plan !== null) {
    if (!isPlanCode(p.plan)) return reject(`แพ็กเกจไม่ถูกต้อง: ${String(p.plan).slice(0, 40)}`, "invalid plan");
    plan = p.plan;
    months = PLANS[plan].months;
    days = PLANS[plan].days;
    expected = PLANS[plan].price;
  } else {
    months = Math.min(36, Math.max(1, Math.floor(Number(p.months) || 1)));
    days = PLANS.monthly.days * months;
    expected = PLANS.monthly.price * months;
  }
  if (!isPaymentMethod(p.method)) return reject(`ช่องทางชำระเงินไม่ถูกต้อง: ${String(p.method).slice(0, 40)}`, "invalid method");

  const dup = await db.from("payments").select("user_id").eq("reference", p.reference).maybeSingle();
  const duplicate = !!dup.data;

  // A replay of an already-recorded reference was validated the first time; don't re-judge it.
  if (!duplicate) {
    const amount = Number(p.amount);
    const currency = (p.currency || CURRENCY).toUpperCase();
    if (currency !== CURRENCY || !Number.isFinite(amount) || Math.abs(amount - expected) > 0.005) {
      return reject(`ยอดเงินไม่ตรงกับแพ็กเกจ: ได้รับ ${p.amount} ${p.currency || ""} คาดว่า ${expected} ${CURRENCY} (${plan ?? `${months} เดือน`})`, "amount mismatch");
    }
  }

  let userId: string | null = null;
  if (p.user_id && isUuid(p.user_id)) {
    const { data } = await db.from("profiles").select("id").eq("id", p.user_id).maybeSingle();
    userId = data?.id ?? null;
  }
  if (!userId && p.email) {
    const { data } = await db.rpc("user_id_by_email", { p_email: String(p.email) });
    userId = (data as string | null) ?? null;
  }
  if (!userId && dup.data) userId = dup.data.user_id;
  if (!userId) {
    await db.from("payment_errors").insert({ payload: raw, reason: "ไม่พบผู้ใช้" });
    return { status: 404, error: "user not found" };
  }

  // Legacy payloads call the original 8-argument form, so they keep working before 0010_plans.sql is applied.
  const { data, error } = await db.rpc("apply_payment", {
    p_user_id: userId,
    p_amount: Number(p.amount) || 0,
    p_currency: p.currency || CURRENCY,
    p_months: months,
    p_method: p.method,
    p_reference: p.reference,
    p_paid_at: p.paid_at || nowIso(),
    p_raw: raw as object,
    ...(plan ? { p_days: days, p_plan: plan } : {}),
  });
  if (error) throw new Error(`apply_payment: ${error.message}`);
  return { status: 200, expires_at: data as string, duplicate };
}

export type PurchaseResult = { status: 200; purchase_id: string; duplicate: boolean } | { status: 404 | 400; error: string };

/**
 * Shop purchase confirmed by the payment gateway (webhook payload with `product_id`). Same rules as applyPayment:
 * the amount must equal the product's price in THB, otherwise it is logged to payment_errors and nothing is granted;
 * a replayed reference is a no-op. The apply_purchase() database function does the atomic, idempotent part.
 */
export async function applyPurchase(p: PaymentPayload, raw: unknown): Promise<PurchaseResult> {
  if (!p || typeof p.reference !== "string" || !p.reference || p.reference.length > 200) return { status: 400, error: "missing reference" };
  const db = adminDb();
  const reject = async (reason: string, error: string): Promise<PurchaseResult> => {
    await db.from("payment_errors").insert({ payload: raw, reason });
    return { status: 400, error };
  };
  if (!p.product_id || !isUuid(p.product_id)) return reject("สินค้าไม่ถูกต้อง: ไม่มี product_id ที่ใช้ได้", "invalid product");
  if (!isPaymentMethod(p.method)) return reject(`ช่องทางชำระเงินไม่ถูกต้อง: ${String(p.method).slice(0, 40)}`, "invalid method");

  const prod = await db.from("products").select("id, title, price_thb").eq("id", p.product_id).is("deleted_at", null).maybeSingle();
  if (prod.error) throw new Error(`purchase product: ${prod.error.message}`);
  if (!prod.data) return reject(`ไม่พบสินค้า ${p.product_id}`, "product not found");

  const dup = await db.from("purchases").select("user_id").eq("reference", p.reference).maybeSingle();
  if (dup.error) throw new Error(`purchase reference: ${dup.error.message}`);
  const duplicate = !!dup.data;

  // A replay of an already-recorded reference was validated the first time; don't re-judge it.
  if (!duplicate) {
    const expected = Number(prod.data.price_thb);
    const amount = Number(p.amount);
    const currency = (p.currency || CURRENCY).toUpperCase();
    if (currency !== CURRENCY || !Number.isFinite(amount) || Math.abs(amount - expected) > 0.005) {
      return reject(`ยอดเงินไม่ตรงกับสินค้า (${prod.data.title}): ได้รับ ${p.amount} ${p.currency || ""} คาดว่า ${expected} ${CURRENCY}`, "amount mismatch");
    }
  }

  let userId: string | null = null;
  if (p.user_id && isUuid(p.user_id)) {
    const { data } = await db.from("profiles").select("id").eq("id", p.user_id).maybeSingle();
    userId = data?.id ?? null;
  }
  if (!userId && p.email) {
    const { data } = await db.rpc("user_id_by_email", { p_email: String(p.email) });
    userId = (data as string | null) ?? null;
  }
  if (!userId && dup.data) userId = dup.data.user_id;
  if (!userId) {
    await db.from("payment_errors").insert({ payload: raw, reason: "ไม่พบผู้ใช้" });
    return { status: 404, error: "user not found" };
  }

  const { data, error } = await db.rpc("apply_purchase", {
    p_user_id: userId,
    p_product_id: p.product_id,
    p_amount: Number(p.amount) || 0,
    p_currency: p.currency || CURRENCY,
    p_method: p.method,
    p_reference: p.reference,
    p_paid_at: p.paid_at || nowIso(),
    p_raw: raw as object,
    p_manual: false,
  });
  if (error) throw new Error(`apply_purchase: ${error.message}`);
  return { status: 200, purchase_id: data as string, duplicate };
}

export async function audit(adminId: string, action: string, target_type: string, target_id: string, note = "") {
  await adminDb().from("admin_audit_log").insert({ admin_id: adminId, action, target_type, target_id, note });
}

export async function manualExtend(admin: Viewer, userId: string, opts: { days?: number; until?: string }, note: string) {
  if (!note.trim()) throw new HttpError(400, "ต้องใส่หมายเหตุ");
  const db = adminDb();
  const { data: sub } = await db.from("subscriptions").select("expires_at, first_paid_at").eq("user_id", userId).maybeSingle();
  const expires_at = opts.until ? new Date(opts.until).toISOString() : extendFrom(sub?.expires_at ?? null, opts.days ?? PLANS.monthly.days);
  must(
    await db
      .from("subscriptions")
      .upsert({ user_id: userId, expires_at, first_paid_at: sub?.first_paid_at ?? nowIso(), updated_at: nowIso() }, { onConflict: "user_id" }),
    "extend",
  );
  await audit(admin.id, opts.until ? "membership.set_date" : "membership.extend", "user", userId, note);
  await notify({ user_id: userId, type: "payment", title: "ต่ออายุสมาชิกแล้ว", body: `สมาชิกถึงวันที่ ${thaiDate(expires_at)}`, link: "/account", image_url: null });
  return expires_at;
}

export async function revokeMembership(admin: Viewer, userId: string, note: string) {
  if (!note.trim()) throw new HttpError(400, "ต้องใส่หมายเหตุ");
  must(await adminDb().from("subscriptions").update({ expires_at: nowIso(), updated_at: nowIso() }).eq("user_id", userId), "revoke");
  await audit(admin.id, "membership.revoke", "user", userId, note);
}

// ───────────────────────── Engagement (as the visitor, RLS applies) ─────────────────────────
async function assertCanEngage(viewer: Viewer, contentId: string) {
  const c = await getContentRow(contentId);
  if (!c || (!isLive(c) && !viewer.is_admin)) throw new HttpError(404, "ไม่พบคอนเทนต์");
  if (c.visibility === "members" && !viewer.is_member) throw new HttpError(403, "เฉพาะสมาชิก");
  return c;
}

export async function toggleLike(viewer: Viewer, contentId: string) {
  await assertCanEngage(viewer, contentId);
  const db = await userDb();
  const { count } = await db.from("likes").select("content_id", { count: "exact", head: true }).eq("user_id", viewer.id).eq("content_id", contentId);
  const liked = !count;
  const res = liked
    ? await db.from("likes").insert({ user_id: viewer.id, content_id: contentId })
    : await db.from("likes").delete().eq("user_id", viewer.id).eq("content_id", contentId);
  if (res.error) friendly(res.error, "เฉพาะสมาชิก");
  const { data } = await adminDb().from("content").select("like_count").eq("id", contentId).single();
  return { liked, count: data?.like_count ?? 0 };
}

export async function toggleSave(viewer: Viewer, contentId: string, force?: boolean) {
  const db = await userDb();
  const { count } = await db.from("saved").select("content_id", { count: "exact", head: true }).eq("user_id", viewer.id).eq("content_id", contentId);
  const want = force ?? !count;
  if (want && !count) {
    await assertCanEngage(viewer, contentId);
    const { error } = await db.from("saved").insert({ user_id: viewer.id, content_id: contentId });
    if (error) friendly(error, "บันทึกได้เฉพาะสมาชิก");
  }
  if (!want && count) await db.from("saved").delete().eq("user_id", viewer.id).eq("content_id", contentId);
  return { saved: want };
}

export async function saveProgress(viewer: Viewer, contentId: string, positionSec: number, duration: number) {
  if (!viewer.save_history || !isUuid(contentId)) return;
  const c = await getContentRow(contentId);
  if (!c) return;
  if (c.visibility === "members" && !viewer.is_member) return;
  const dur = duration || c.duration_sec;
  const completedNow = dur > 0 && positionSec / dur >= COMPLETE_RATIO;
  const db = await userDb();
  const { data: prev } = await db.from("watch_progress").select("completed").eq("user_id", viewer.id).eq("content_id", contentId).maybeSingle();
  await db.from("watch_progress").upsert(
    {
      user_id: viewer.id,
      content_id: contentId,
      position_sec: completedNow ? 0 : Math.floor(positionSec),
      completed: !!prev?.completed || completedNow,
      updated_at: nowIso(),
    },
    { onConflict: "user_id,content_id" },
  );
}

/** 1 view when watched ≥ 30s (or ≥ 50% for Grind), max once per person/clip/hour. */
export async function recordView(contentId: string, userId: string | null, sessionId: string, watchedSec: number) {
  const c = await getContentRow(contentId);
  if (!c || !isLive(c)) return false;
  if (watchedSec < viewThresholdSec(c.type, c.duration_sec)) return false;
  const db = adminDb();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  let recent = db.from("views").select("id", { count: "exact", head: true }).eq("content_id", contentId).gt("created_at", hourAgo);
  recent = userId ? recent.eq("user_id", userId) : recent.eq("session_id", sessionId);
  if (((await recent).count ?? 0) > 0) return false;
  await db.from("views").insert({ content_id: contentId, user_id: userId, session_id: sessionId.slice(0, 64), watched_sec: Math.floor(watchedSec) });
  return true; // view_count is bumped by a database trigger
}

export async function clearHistory(userId: string, contentId?: string) {
  const db = await userDb();
  let q = db.from("watch_progress").delete().eq("user_id", userId);
  if (contentId) q = q.eq("content_id", contentId);
  await q;
}

// ───────────────────────── Comments ─────────────────────────
export async function createComment(viewer: Viewer, contentId: string, body: string, parentId: string | null) {
  const c = await getContentRow(contentId);
  if (!c || (!isLive(c) && !viewer.is_admin)) throw new HttpError(404, "ไม่พบคอนเทนต์");
  if (!c.comments_enabled) throw new HttpError(403, "ปิดความคิดเห็นสำหรับคลิปนี้");
  if (c.visibility === "members" && !viewer.is_member) throw new HttpError(403, "คอมเมนต์ได้เฉพาะสมาชิก");
  const text = body.trim();
  if (!text) throw new HttpError(400, "กรุณาพิมพ์ข้อความ");
  if (text.length > 1000) throw new HttpError(400, "ข้อความยาวเกิน 1,000 ตัวอักษร");

  let parent: { id: string; user_id: string; parent_id: string | null } | null = null;
  if (parentId) {
    if (!isUuid(parentId)) throw new HttpError(404, "ไม่พบความคิดเห็น");
    const { data } = await adminDb().from("comments").select("id, user_id, parent_id").eq("id", parentId).maybeSingle();
    if (!data) throw new HttpError(404, "ไม่พบความคิดเห็น");
    parent = data;
    if (parent.parent_id) {
      // one level deep: replying to a reply attaches to its parent
      const { data: top } = await adminDb().from("comments").select("id, user_id, parent_id").eq("id", parent.parent_id).single();
      parent = top;
    }
  }

  const db = await userDb();
  const { data: row, error } = await db
    .from("comments")
    .insert({ content_id: contentId, user_id: viewer.id, parent_id: parent?.id ?? null, body: text })
    .select("*")
    .single();
  if (error) friendly(error, "แสดงความคิดเห็นไม่ได้");

  if (parent && parent.user_id !== viewer.id) {
    await notify({
      user_id: parent.user_id,
      type: "reply",
      title: `${viewer.is_admin ? "JR" : viewer.display_name} ตอบกลับความคิดเห็นของคุณ`,
      body: text.slice(0, 80),
      link: `${contentHref(c)}#comments`,
      image_url: c.thumbnail_url,
    });
  }
  return row as { id: string };
}

export async function editComment(viewer: Viewer, id: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 1000) throw new HttpError(400, "ข้อความไม่ถูกต้อง");
  const db = await userDb();
  const { data, error } = await db.from("comments").update({ body: text }).eq("id", id).eq("user_id", viewer.id).select("*").maybeSingle();
  if (error) friendly(error, "แก้ไขได้เฉพาะความคิดเห็นของตัวเอง");
  if (!data) throw new HttpError(403, "แก้ไขได้เฉพาะความคิดเห็นของตัวเอง");
  return data as { id: string; body: string; edited_at: string | null };
}

export async function deleteComment(viewer: Viewer, id: string) {
  if (!isUuid(id)) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const { data: c } = await adminDb().from("comments").select("user_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) throw new HttpError(404, "ไม่พบความคิดเห็น");
  if (c.user_id !== viewer.id && !viewer.is_admin) throw new HttpError(403, "ลบได้เฉพาะความคิดเห็นของตัวเอง");
  const db = await userDb(); // admin passes RLS via admin_all
  const { error } = await db.from("comments").update({ deleted_at: nowIso() }).eq("id", id);
  if (error) friendly(error, "ลบไม่ได้");
  if (viewer.is_admin && c.user_id !== viewer.id) await audit(viewer.id, "comment.delete", "comment", id);
}

export async function toggleCommentLike(viewer: Viewer, id: string) {
  if (!isUuid(id)) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const { data: c } = await adminDb().from("comments").select("content_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!c) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const content = await getContentRow(c.content_id);
  if (content?.visibility === "members" && !viewer.is_member) throw new HttpError(403, "เฉพาะสมาชิก");
  const db = await userDb();
  const { count } = await db.from("comment_likes").select("comment_id", { count: "exact", head: true }).eq("user_id", viewer.id).eq("comment_id", id);
  const liked = !count;
  const res = liked
    ? await db.from("comment_likes").insert({ user_id: viewer.id, comment_id: id })
    : await db.from("comment_likes").delete().eq("user_id", viewer.id).eq("comment_id", id);
  if (res.error) friendly(res.error, "ถูกใจไม่ได้");
  const { data } = await adminDb().from("comments").select("like_count").eq("id", id).single();
  return { liked, count: data?.like_count ?? 0 };
}

export async function reportComment(viewer: Viewer, id: string, reason: string) {
  const db = await userDb();
  await db.from("comment_reports").insert({ comment_id: id, user_id: viewer.id, reason: reason || "ไม่เหมาะสม" });
}

export async function moderateComment(admin: Viewer, id: string, action: "pin" | "unpin" | "heart" | "unheart" | "hide" | "unhide") {
  const db = adminDb();
  const { data: c } = await db.from("comments").select("id, user_id, content_id, body").eq("id", id).maybeSingle();
  if (!c) throw new HttpError(404, "ไม่พบความคิดเห็น");
  const content = await getContentRow(c.content_id);
  const link = content ? `${contentHref(content)}#comments` : null;
  if (action === "pin") {
    await db.from("comments").update({ is_pinned: false }).eq("content_id", c.content_id).eq("is_pinned", true);
    await db.from("comments").update({ is_pinned: true }).eq("id", id);
    if (c.user_id !== admin.id)
      await notify({ user_id: c.user_id, type: "pin", title: "JR ปักหมุดความคิดเห็นของคุณ", body: c.body.slice(0, 80), link, image_url: content?.thumbnail_url ?? null });
  }
  if (action === "unpin") await db.from("comments").update({ is_pinned: false }).eq("id", id);
  if (action === "heart") {
    await db.from("comments").update({ creator_hearted: true }).eq("id", id);
    if (c.user_id !== admin.id)
      await notify({ user_id: c.user_id, type: "heart", title: "JR หัวใจความคิดเห็นของคุณ", body: c.body.slice(0, 80), link, image_url: content?.thumbnail_url ?? null });
  }
  if (action === "unheart") await db.from("comments").update({ creator_hearted: false }).eq("id", id);
  if (action === "hide") await db.from("comments").update({ is_hidden: true }).eq("id", id);
  if (action === "unhide") await db.from("comments").update({ is_hidden: false }).eq("id", id);
  await audit(admin.id, `comment.${action}`, "comment", id);
}

export async function banUser(admin: Viewer, userId: string, banned = true) {
  const db = adminDb();
  const { data: p } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!p || p.role === "admin") throw new HttpError(400, "แบนผู้ใช้นี้ไม่ได้");
  await db.from("profiles").update({ is_banned: banned }).eq("id", userId);
  await audit(admin.id, banned ? "user.ban" : "user.unban", "user", userId);
}

// ───────────────────────── Cron ─────────────────────────
/** Every minute: publish due scheduled clips. Daily 09:00: expiry reminders. (pg_cron does the same in the DB.) */
export async function runScheduler(withReminders = false) {
  const db = adminDb();
  const due = must(
    await db.from("content").select("id").eq("status", "scheduled").eq("media_status", "ready").is("deleted_at", null).lte("scheduled_at", nowIso()),
    "due",
  );
  if (due.length) {
    must(await db.rpc("publish_due"), "publish_due");
    revalidateTag(CATALOG_TAG);
  }
  if (withReminders) must(await db.rpc("expiry_reminders"), "expiry_reminders");
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString();
  const purged = must(await db.from("content").delete().lt("deleted_at", cutoff).select("id, audio_path"), "purge") as { id: string; audio_path: string | null }[];
  // Best-effort: drop the podcast files of the purged rows too (removeAudioObjects logs and never throws).
  await removeAudioObjects(purged.map((p) => p.audio_path)).catch((e) => console.error("purge audio cleanup:", e));
  return { published: due.map((d) => d.id), purged: purged.length, reminders: withReminders };
}
