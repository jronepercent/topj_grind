"use server";

import { revalidatePath } from "next/cache";
import { HttpError, requireAdmin } from "@/lib/server/auth";
import { db, commit, uid, nowIso } from "@/lib/server/store";
import { audit, finalizeIfReady, publishNow, manualExtend, notifyNewContent, revokeMembership, runScheduler } from "@/lib/server/mutations";
import { isLive } from "@/lib/server/queries";
import { bunnyStreamEnabled, createBunnyUpload } from "@/lib/server/bunny";
import { isValidUrl } from "@/lib/richtext";
import type { ContentRow, ContentType, HomeSection, MediaStatus, PublishStatus, SiteSettings, Visibility } from "@/lib/types";

export type StudioResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function admin<T>(fn: (a: Awaited<ReturnType<typeof requireAdmin>>) => T | Promise<T>): Promise<StudioResult<T>> {
  try {
    const a = await requireAdmin();
    return { ok: true, data: await fn(a) };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" };
  }
}

const DEMO_MEDIA: Record<ContentType, string> = {
  video: "https://test-streams.mux.dev/tos_ismc/main.m3u8",
  short: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  podcast: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
};

function row(id: string) {
  const c = db().content.find((x) => x.id === id);
  if (!c) throw new HttpError(404, "ไม่พบคอนเทนต์");
  return c;
}

// ───────── Upload ─────────
export interface UploadTicket {
  id: string;
  mode: "bunny" | "demo";
  tus?: { endpoint: string; videoId: string; libraryId: string; signature: string; expire: number };
}

/** Step 1 of upload: create a draft row immediately so nothing is ever lost. */
export async function createUploadAction(input: { type: ContentType; fileName: string; width?: number; height?: number; duration?: number }) {
  return admin(async (a) => {
    const id = uid("c-").slice(0, 14);
    const title = input.fileName.replace(/\.[^.]+$/, "").slice(0, 100);
    const now = nowIso();
    const c: ContentRow = {
      id,
      type: input.type,
      title,
      description: "",
      thumbnail_url: null,
      preview_url: null,
      bunny_video_id: null,
      audio_path: null,
      demo_src: null,
      duration_sec: Math.round(input.duration ?? 0),
      width: input.width ?? null,
      height: input.height ?? null,
      visibility: "public",
      status: "draft",
      media_status: "uploading",
      published_at: null,
      scheduled_at: null,
      category_id: null,
      tags: [],
      comments_enabled: true,
      linked_content_id: null,
      linked_start_sec: null,
      captions_vtt: null,
      view_count: 0,
      like_count: 0,
      comment_count: 0,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    };
    const ticket: UploadTicket = { id, mode: "demo" };
    if (input.type !== "podcast" && bunnyStreamEnabled()) {
      const tus = await createBunnyUpload(title);
      c.bunny_video_id = tus.videoId;
      ticket.mode = "bunny";
      ticket.tus = tus;
    }
    db().content.push(c);
    audit(a.id, "content.create", "content", id);
    commit();
    return ticket;
  });
}

/** Called when the browser finishes uploading. Bunny mode then waits for /api/webhooks/bunny. */
export async function uploadFinishedAction(id: string) {
  return admin(() => {
    const c = row(id);
    if (c.bunny_video_id) {
      c.media_status = "processing";
    } else {
      // Demo mode: no real transcoder — mark ready with a sample source after a "processing" step.
      c.media_status = "processing";
      c.demo_src = DEMO_MEDIA[c.type];
      if (!c.duration_sec) c.duration_sec = c.type === "short" ? 15 : c.type === "podcast" ? 420 : 734;
      setTimeout(() => {
        c.media_status = "ready";
        finalizeIfReady(c);
        commit();
      }, 4000);
    }
    c.updated_at = nowIso();
    commit();
    return c.media_status as MediaStatus;
  });
}

export async function mediaStatusAction(id: string) {
  return admin(() => {
    const c = row(id);
    return { media_status: c.media_status, status: c.status, duration_sec: c.duration_sec, thumbnail_url: c.thumbnail_url };
  });
}

// ───────── Save (autosave + publish) ─────────
export interface ContentInput {
  title?: string;
  description?: string;
  thumbnail_url?: string | null;
  category_id?: string | null;
  tags?: string[];
  visibility?: Visibility;
  comments_enabled?: boolean;
  linked_content_id?: string | null;
  linked_start_sec?: number | null;
  captions_vtt?: string | null;
  links?: { label: string; url: string }[];
  resources?: { id?: string; file_name: string; size_bytes: number }[];
  playlist_ids?: string[];
  status?: PublishStatus;
  scheduled_at?: string | null;
  type?: ContentType;
}

export async function saveContentAction(id: string, input: ContentInput) {
  return admin(async (a) => {
    const c = row(id);
    const d = db();
    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) throw new HttpError(400, "กรุณาใส่ชื่อ");
      if (t.length > 100) throw new HttpError(400, "ชื่อยาวเกิน 100 ตัวอักษร");
      c.title = t;
    }
    if (input.description !== undefined) {
      if (input.description.length > 5000) throw new HttpError(400, "คำอธิบายยาวเกิน 5,000 ตัวอักษร");
      c.description = input.description;
    }
    if (input.type !== undefined) c.type = input.type;
    if (input.thumbnail_url !== undefined) c.thumbnail_url = input.thumbnail_url;
    if (input.category_id !== undefined) c.category_id = input.category_id;
    if (input.tags !== undefined) {
      c.tags = [...new Set(input.tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean))].slice(0, 10);
    }
    if (input.visibility !== undefined) c.visibility = input.visibility;
    if (input.comments_enabled !== undefined) c.comments_enabled = input.comments_enabled;
    if (input.linked_content_id !== undefined) c.linked_content_id = c.type === "short" ? input.linked_content_id : null;
    if (input.linked_start_sec !== undefined) c.linked_start_sec = input.linked_start_sec;
    if (input.captions_vtt !== undefined) c.captions_vtt = input.captions_vtt;
    if (input.links !== undefined) {
      const links = input.links.filter((l) => l.label.trim() || l.url.trim()).slice(0, 5);
      for (const l of links) if (!isValidUrl(l.url)) throw new HttpError(400, `ลิงก์ไม่ถูกต้อง: ${l.url}`);
      d.content_links = d.content_links.filter((l) => l.content_id !== id);
      links.forEach((l, i) => d.content_links.push({ id: uid("lnk-"), content_id: id, label: l.label.trim(), url: l.url.trim(), position: i }));
    }
    if (input.resources !== undefined) {
      const keep = input.resources;
      d.content_resources = d.content_resources.filter((r) => r.content_id !== id);
      keep.forEach((r, i) =>
        d.content_resources.push({
          id: r.id ?? uid("res-"),
          content_id: id,
          file_name: r.file_name,
          storage_path: `resources/${id}/${r.file_name}`,
          size_bytes: r.size_bytes,
          position: i,
        }),
      );
    }
    if (input.playlist_ids !== undefined) {
      d.playlist_items = d.playlist_items.filter((p) => p.content_id !== id || input.playlist_ids!.includes(p.playlist_id));
      for (const pid of input.playlist_ids) {
        if (!d.playlist_items.some((p) => p.playlist_id === pid && p.content_id === id)) {
          const pos = d.playlist_items.filter((p) => p.playlist_id === pid).length;
          d.playlist_items.push({ playlist_id: pid, content_id: id, position: pos });
        }
      }
    }
    if (input.status !== undefined) {
      const wasLive = isLive(c);
      if (input.status === "published") {
        if (c.media_status === "ready") {
          if (c.status !== "published") publishNow(c);
        } else {
          c.status = "draft";
          c.scheduled_at = null;
          c.publish_when_ready = true;
        }
      } else if (input.status === "scheduled") {
        if (!input.scheduled_at) throw new HttpError(400, "กรุณาเลือกเวลาเผยแพร่");
        if (new Date(input.scheduled_at).getTime() < Date.now() - 60_000) throw new HttpError(400, "เวลาที่ตั้งต้องอยู่ในอนาคต");
        c.status = "scheduled";
        c.scheduled_at = new Date(input.scheduled_at).toISOString();
        c.published_at = null;
        c.publish_when_ready = false;
      } else {
        c.status = "draft";
        c.published_at = null;
        c.scheduled_at = null;
        c.publish_when_ready = false;
      }
      if (!wasLive && isLive(c)) notifyNewContent(c);
      audit(a.id, `content.${input.status}`, "content", id);
    }
    c.updated_at = nowIso();
    commit();
    // Autosaves of drafts don't touch the public site — only revalidate when it matters.
    if (input.status !== undefined || isLive(c)) revalidatePath("/", "layout");
    return { updated_at: c.updated_at, status: c.status, media_status: c.media_status };
  });
}

export async function bulkContentAction(ids: string[], op: "public" | "members" | "delete" | "restore" | "purge" | "draft") {
  return admin((a) => {
    const d = db();
    for (const id of ids) {
      const c = d.content.find((x) => x.id === id);
      if (!c) continue;
      if (op === "public" || op === "members") c.visibility = op;
      if (op === "draft") {
        c.status = "draft";
        c.published_at = null;
      }
      if (op === "delete") c.deleted_at = nowIso();
      if (op === "restore") c.deleted_at = null;
      c.updated_at = nowIso();
      audit(a.id, `content.${op}`, "content", id);
    }
    if (op === "purge") {
      d.content = d.content.filter((c) => !(ids.includes(c.id) && c.deleted_at));
      d.playlist_items = d.playlist_items.filter((p) => !ids.includes(p.content_id));
    }
    commit();
    revalidatePath("/", "layout");
  });
}

// ───────── Playlists ─────────
export async function listPlaylistsAction(contentIds: string[] = []) {
  return admin(() =>
    [...db().playlists]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        id: p.id,
        title: p.title,
        visibility: p.visibility,
        containsAll: contentIds.length > 0 && contentIds.every((cid) => db().playlist_items.some((i) => i.playlist_id === p.id && i.content_id === cid)),
      })),
  );
}

export async function setPlaylistMembershipAction(playlistId: string, contentIds: string[], include: boolean) {
  return admin(() => {
    const d = db();
    if (include) {
      for (const cid of contentIds) {
        if (d.playlist_items.some((i) => i.playlist_id === playlistId && i.content_id === cid)) continue;
        const pos = d.playlist_items.filter((i) => i.playlist_id === playlistId).length;
        d.playlist_items.push({ playlist_id: playlistId, content_id: cid, position: pos });
      }
    } else {
      d.playlist_items = d.playlist_items.filter((i) => !(i.playlist_id === playlistId && contentIds.includes(i.content_id)));
    }
    commit();
    revalidatePath("/", "layout");
  });
}

export interface PlaylistInput {
  title: string;
  description: string;
  thumbnail_url: string | null;
  visibility: Visibility;
  is_course: boolean;
  content_ids: string[];
}

export async function savePlaylistAction(id: string | null, input: PlaylistInput) {
  return admin((a) => {
    const d = db();
    if (!input.title.trim()) throw new HttpError(400, "กรุณาใส่ชื่อ Playlist");
    let p = id ? d.playlists.find((x) => x.id === id) : undefined;
    if (!p) {
      p = { id: uid("pl-").slice(0, 15), title: "", description: "", thumbnail_url: null, visibility: "public", is_course: false, position: d.playlists.length, created_at: nowIso() };
      d.playlists.push(p);
    }
    p.title = input.title.trim();
    p.description = input.description;
    p.thumbnail_url = input.thumbnail_url;
    p.visibility = input.visibility;
    p.is_course = input.is_course;
    d.playlist_items = d.playlist_items.filter((i) => i.playlist_id !== p!.id);
    input.content_ids.forEach((cid, i) => d.playlist_items.push({ playlist_id: p!.id, content_id: cid, position: i }));
    audit(a.id, id ? "playlist.update" : "playlist.create", "playlist", p.id);
    commit();
    revalidatePath("/", "layout");
    return p.id;
  });
}

export async function deletePlaylistAction(id: string) {
  return admin((a) => {
    const d = db();
    d.playlists = d.playlists.filter((p) => p.id !== id);
    d.playlist_items = d.playlist_items.filter((i) => i.playlist_id !== id);
    audit(a.id, "playlist.delete", "playlist", id);
    commit();
    revalidatePath("/", "layout");
  });
}

export async function reorderPlaylistsAction(ids: string[]) {
  return admin(() => {
    ids.forEach((id, i) => {
      const p = db().playlists.find((x) => x.id === id);
      if (p) p.position = i;
    });
    commit();
    revalidatePath("/", "layout");
  });
}

// ───────── Home curation ─────────
export async function saveHomeSectionsAction(sections: Pick<HomeSection, "id" | "type" | "title" | "content_ids" | "enabled">[]) {
  return admin((a) => {
    const hero = sections.find((s) => s.type === "hero");
    if (hero && hero.content_ids.length > 5) throw new HttpError(400, "Hero เลือกได้สูงสุด 5 รายการ");
    db().home_sections = sections.map((s, i) => ({ ...s, id: s.id || uid("hs-"), position: i }));
    audit(a.id, "home.update", "home", "home");
    commit();
    revalidatePath("/");
  });
}

// ───────── Settings ─────────
export async function saveSettingsAction(input: Partial<SiteSettings>) {
  return admin((a) => {
    const s = db().site_settings;
    Object.assign(s, input);
    audit(a.id, "settings.update", "settings", "site");
    commit();
    revalidatePath("/", "layout");
  });
}

export async function saveCategoriesAction(cats: { id?: string; name: string }[]) {
  return admin(() => {
    db().categories = cats
      .filter((c) => c.name.trim())
      .map((c, i) => ({
        id: c.id ?? uid("cat-").slice(0, 16),
        name: c.name.trim(),
        slug: c.name.trim().toLowerCase().replace(/\s+/g, "-"),
        position: i,
      }));
    commit();
    revalidatePath("/", "layout");
  });
}

export async function saveBannedWordsAction(words: string[]) {
  return admin(() => {
    db().banned_words = [...new Set(words.map((w) => w.trim()).filter(Boolean))].map((word) => ({ id: uid("bw-"), word }));
    commit();
  });
}

// ───────── Members ─────────
export async function extendMemberAction(userId: string, opts: { days?: number; until?: string }, note: string) {
  return admin((a) => {
    const exp = manualExtend({ ...a }, userId, opts, note);
    revalidatePath("/studio/members");
    return exp;
  });
}

export async function revokeMemberAction(userId: string, note: string) {
  return admin((a) => {
    revokeMembership(a, userId, note);
    revalidatePath("/studio/members");
  });
}

export async function resolvePaymentErrorAction(id: string) {
  return admin(() => {
    const e = db().payment_errors.find((x) => x.id === id);
    if (e) e.resolved = true;
    commit();
    revalidatePath("/studio/members");
  });
}

// ───────── Demo helpers ─────────
export async function runSchedulerAction() {
  return admin(() => runScheduler(Date.now(), true));
}

export async function replyAsCreatorAction(contentId: string, parentId: string, body: string) {
  const { createComment } = await import("@/lib/server/mutations");
  return admin((a) => {
    createComment(a, contentId, body, parentId);
    revalidatePath("/studio/comments");
  });
}

// ───────── Studio additions ─────────
/** 📊 Stats dialog on /studio/content: totals + views per Bangkok day for 28 days. */
export async function contentStatsAction(id: string) {
  const { dailyViews } = await import("./_lib/data");
  return admin(() => {
    const c = row(id);
    const daily = dailyViews(28, id);
    const watchedSec = db()
      .views.filter((v) => v.content_id === id && Date.now() - new Date(v.created_at).getTime() <= 28 * 86_400_000)
      .reduce((s, v) => s + v.watched_sec, 0);
    return {
      title: c.title,
      view_count: c.view_count,
      like_count: c.like_count,
      comment_count: c.comment_count,
      views28: daily.reduce((s, d) => s + d.count, 0),
      watched_hours28: Math.round((watchedSec / 3600) * 10) / 10,
      daily,
    };
  });
}

/** "ล้มเหลว — อัปโหลดใหม่": issue a fresh upload ticket for an existing row (keeps all details). */
export async function reuploadAction(id: string) {
  return admin(async (a) => {
    const c = row(id);
    const ticket: UploadTicket = { id, mode: "demo" };
    c.media_status = "uploading";
    c.demo_src = null;
    c.bunny_video_id = null;
    if (c.type !== "podcast" && bunnyStreamEnabled()) {
      const tus = await createBunnyUpload(c.title);
      c.bunny_video_id = tus.videoId;
      ticket.mode = "bunny";
      ticket.tus = tus;
    }
    c.updated_at = nowIso();
    audit(a.id, "content.reupload", "content", id);
    commit();
    return ticket;
  });
}
