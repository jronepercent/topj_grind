"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { HttpError, rateLimit, requireAdmin, requireUser, getViewer } from "@/lib/server/auth";
import * as M from "@/lib/server/mutations";
import { type FeedQuery, getCommentView, listComments, listReplies, suggest as suggestQuery, listContent, notificationsFor } from "@/lib/server/queries";
import { db, commit } from "@/lib/server/store";
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
    return M.toggleLike(v, contentId);
  });
}

export async function toggleSaveAction(contentId: string, force?: boolean) {
  return run(async () => {
    const v = await requireUser();
    return M.toggleSave(v, contentId, force);
  });
}

export async function saveProgressAction(contentId: string, positionSec: number, duration: number) {
  return run(async () => {
    const v = await getViewer();
    if (!v) return;
    M.saveProgress(v, contentId, positionSec, duration);
  });
}

export async function recordViewAction(contentId: string, sessionId: string, watchedSec: number) {
  return run(async () => {
    const v = await getViewer();
    return M.recordView(contentId, v?.id ?? null, sessionId, watchedSec);
  });
}

export async function clearHistoryAction(contentId?: string) {
  return run(async () => {
    const v = await requireUser();
    M.clearHistory(v.id, contentId);
    revalidatePath("/library");
  });
}

export async function setSaveHistoryAction(enabled: boolean) {
  return run(async () => {
    const v = await requireUser();
    const p = db().profiles.find((x) => x.id === v.id)!;
    p.save_history = enabled;
    commit();
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
    const row = M.createComment(v, contentId, body, parentId);
    return getCommentView(row.id, v)!;
  });
}

export async function editCommentAction(id: string, body: string) {
  return run(async () => {
    const v = await requireUser();
    M.editComment(v, id, body);
    return getCommentView(id, v)!;
  });
}

export async function deleteCommentAction(id: string) {
  return run(async () => M.deleteComment(await requireUser(), id));
}

export async function likeCommentAction(id: string) {
  return run(async () => {
    const v = await requireUser();
    limit(`clike:${v.id}`, 60, 60_000);
    return M.toggleCommentLike(v, id);
  });
}

export async function reportCommentAction(id: string, reason: string) {
  return run(async () => M.reportComment(await requireUser(), id, reason));
}

export async function moderateCommentAction(id: string, action: "pin" | "unpin" | "heart" | "unheart" | "hide" | "unhide") {
  return run(async () => {
    M.moderateComment(await requireAdmin(), id, action);
    revalidatePath("/studio/comments");
  });
}

export async function banUserAction(userId: string, banned = true) {
  return run(async () => M.banUser(await requireAdmin(), userId, banned));
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
    M.markAllRead(v.id);
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
  if (v) {
    const p = db().profiles.find((x) => x.id === v.id);
    if (p) p.theme = theme;
    commit();
  }
  return { ok: true as const, data: undefined };
}

export async function setAutoplayAction(enabled: boolean) {
  return run(async () => {
    const v = await requireUser();
    const p = db().profiles.find((x) => x.id === v.id)!;
    p.autoplay = enabled;
    commit();
  });
}

export async function updateProfileAction(input: { display_name?: string; avatar_url?: string | null }) {
  return run(async () => {
    const v = await requireUser();
    const p = db().profiles.find((x) => x.id === v.id)!;
    if (input.display_name !== undefined) {
      const n = input.display_name.trim();
      if (!n || n.length > 50) throw new HttpError(400, "ชื่อที่แสดงต้องยาว 1–50 ตัวอักษร");
      p.display_name = n;
    }
    if (input.avatar_url !== undefined) p.avatar_url = input.avatar_url;
    commit();
    revalidatePath("/", "layout");
  });
}

/** Polled by /membership/success until expires_at moves. */
export async function membershipStatusAction() {
  return run(async () => {
    const v = await getViewer();
    return { expires_at: v?.expires_at ?? null, is_member: !!v?.is_member };
  });
}
