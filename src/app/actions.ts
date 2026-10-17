"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { HttpError, rateLimit, requireAdmin, requireUser, getViewer } from "@/lib/server/auth";
import * as M from "@/lib/server/mutations";
import { type FeedQuery, getCommentView, listComments, listReplies, suggest as suggestQuery, listContent, notificationsFor } from "@/lib/server/queries";
import { adminDb, userDb } from "@/lib/supabase/clients";
import type { ThemePref } from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string; status?: number };

async function run<T>(fn: () => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message, status: e.status };
    console.error(e);
    return { ok: false, error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" };
  }
}

function limit(key: string, max: number, windowMs: number) {
  if (!rateLimit(key, max, windowMs)) throw new HttpError(429, "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่");
}

// ───────── Engagement ─────────
export async function toggleLikeAction(contentId: string) {
  return run(async () => {
    const v = await requireUser();
    limit(`like:${v.id}`, 30, 60_000);
    return await M.toggleLike(v, contentId);
  });
}

export async function toggleSaveAction(contentId: string, force?: boolean) {
  return run(async () => {
    const v = await requireUser();
    return await M.toggleSave(v, contentId, force);
  });
}

export async function saveProgressAction(contentId: string, positionSec: number, duration: number) {
  return run(async () => {
    const v = await getViewer();
    if (!v) return;
    await M.saveProgress(v, contentId, positionSec, duration);
  });
}

export async function recordViewAction(contentId: string, sessionId: string, watchedSec: number) {
  return run(async () => {
    const v = await getViewer();
    return await M.recordView(contentId, v?.id ?? null, sessionId, watchedSec);
  });
}

export async function clearHistoryAction(contentId?: string) {
  return run(async () => {
    const v = await requireUser();
    await M.clearHistory(v.id, contentId);
    revalidatePath("/library");
  });
}

export async function setSaveHistoryAction(enabled: boolean) {
  return run(async () => {
    const v = await requireUser();
    await updateOwnProfile(v.id, { save_history: enabled });
  });
}

// ───────── Comments ─────────
export async function loadCommentsAction(contentId: string, sort: "top" | "new", offset: number) {
  return run(async () => listComments(contentId, await getViewer(), { sort, offset, limit: 20 }));
}

export async function loadRepliesAction(parentId: string) {
  return run(async () => listReplies(parentId, await getViewer()));
}

export async function postCommentAction(contentId: string, body: string, parentId: string | null) {
  return run(async () => {
    const v = await requireUser();
    limit(`comment:${v.id}`, 5, 60_000);
    const row = await M.createComment(v, contentId, body, parentId);
    return (await getCommentView(row.id, v))!;
  });
}

export async function editCommentAction(id: string, body: string) {
  return run(async () => {
    const v = await requireUser();
    await M.editComment(v, id, body);
    return (await getCommentView(id, v))!;
  });
}

export async function deleteCommentAction(id: string) {
  return run(async () => await M.deleteComment(await requireUser(), id));
}

export async function likeCommentAction(id: string) {
  return run(async () => {
    const v = await requireUser();
    limit(`clike:${v.id}`, 60, 60_000);
    return await M.toggleCommentLike(v, id);
  });
}

export async function reportCommentAction(id: string, reason: string) {
  return run(async () => await M.reportComment(await requireUser(), id, reason));
}

export async function moderateCommentAction(id: string, action: "pin" | "unpin" | "heart" | "unheart" | "hide" | "unhide") {
  return run(async () => {
    await M.moderateComment(await requireAdmin(), id, action);
    revalidatePath("/studio/comments");
  });
}

export async function banUserAction(userId: string, banned = true) {
  return run(async () => await M.banUser(await requireAdmin(), userId, banned));
}

// ───────── Notifications ─────────
export async function notificationsAction() {
  return run(async () => {
    const v = await requireUser();
    return notificationsFor(v.id);
  });
}

export async function markAllReadAction() {
  return run(async () => {
    const v = await requireUser();
    await M.markAllRead(v.id);
  });
}

// ───────── Search / feed ─────────
export async function suggestAction(q: string) {
  return run(async () => {
    const v = await getViewer();
    limit(`search:${v?.id ?? "anon"}`, 120, 60_000);
    return suggestQuery(q);
  });
}

export async function loadFeedAction(opts: FeedQuery & { offset: number }) {
  return run(async () => listContent({ ...opts, limit: 24 }));
}

// ───────── Preferences ─────────
export async function setThemeAction(theme: ThemePref) {
  const jar = await cookies();
  jar.set("tg_theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const v = await getViewer();
  if (v) await updateOwnProfile(v.id, { theme });
  return { ok: true as const, data: undefined };
}

export async function setAutoplayAction(enabled: boolean) {
  return run(async () => {
    const v = await requireUser();
    await updateOwnProfile(v.id, { autoplay: enabled });
  });
}

export async function updateProfileAction(input: { display_name?: string; avatar_url?: string | null }) {
  return run(async () => {
    const v = await requireUser();
    const patch: { display_name?: string; avatar_url?: string | null } = {};
    if (input.display_name !== undefined) {
      const n = input.display_name.trim();
      if (!n || n.length > 50) throw new HttpError(400, "ชื่อที่แสดงต้องยาว 1–50 ตัวอักษร");
      patch.display_name = n;
    }
    if (input.avatar_url !== undefined) patch.avatar_url = await storeAvatar(v.id, input.avatar_url);
    await updateOwnProfile(v.id, patch);
    revalidatePath("/", "layout");
  });
}

/** Writes as the visitor, so RLS + column grants decide what they may change. */
async function updateOwnProfile(userId: string, patch: Record<string, unknown>) {
  const db = await userDb();
  const { error } = await db.from("profiles").update(patch).eq("id", userId);
  if (error) throw new HttpError(400, "บันทึกไม่สำเร็จ");
}

/** Avatars uploaded as data URLs go to Storage, so profiles stay small (they're loaded with every comment). */
async function storeAvatar(userId: string, value: string | null) {
  if (!value || !value.startsWith("data:")) return value;
  const m = value.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/);
  if (!m) throw new HttpError(400, "รองรับเฉพาะรูป PNG, JPG หรือ WebP");
  const bytes = Buffer.from(m[3], "base64");
  if (bytes.length > 1_000_000) throw new HttpError(400, "รูปใหญ่เกิน 1MB");
  const path = `avatars/${userId}-${Date.now()}.${m[2] === "jpeg" ? "jpg" : m[2]}`;
  const { error } = await adminDb().storage.from("thumbnails").upload(path, bytes, { contentType: m[1], upsert: true });
  if (error) throw new HttpError(500, "อัปโหลดรูปไม่สำเร็จ");
  return adminDb().storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
}

/** Polled by /membership/success until expires_at moves. */
export async function membershipStatusAction() {
  return run(async () => {
    const v = await getViewer();
    return { expires_at: v?.expires_at ?? null, is_member: !!v?.is_member };
  });
}
