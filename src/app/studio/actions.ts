"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { adminDb, must } from "@/lib/supabase/clients";
import { HttpError, requireAdmin } from "@/lib/server/auth";
import {
  audit,
  createComment,
  finalizeIfReady,
  manualExtend,
  notifyNewContent,
  publishNowPatch,
  revokeMembership,
  runScheduler,
} from "@/lib/server/mutations";
import { CATALOG_TAG, isLive, isUuid } from "@/lib/server/queries";
import { randomUUID } from "node:crypto";
import { bunnyStreamEnabled, createBunnyUpload, syncBunnyStatus } from "@/lib/server/bunny";
import { PODCAST_BUCKET, removeAudioObjects } from "@/lib/server/media";
import { signImageUpload, storeImage } from "@/lib/server/images";
import { isValidUrl } from "@/lib/richtext";
import { HERO_LIMITS, HERO_MAX_SLIDES, isHeroHref } from "@/lib/hero";
import type { ContentRow, ContentType, HeroSlideRow, HomeSection, MediaStatus, PublishStatus, SiteSettings, Visibility } from "@/lib/types";

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

const nowIso = () => new Date().toISOString();

/** Studio writes that change what visitors see: refresh the cached catalogue and every page. */
function refreshSite(path: string = "/", type: "layout" | "page" = "layout") {
  revalidateTag(CATALOG_TAG);
  revalidatePath(path, type);
}

/** Sample stream for videos when Bunny isn't configured (local dev). Podcasts never use a sample: they are real uploads. */
const DEMO_VIDEO = "https://test-streams.mux.dev/tos_ismc/main.m3u8";

/** New uploads can only be these; existing Short rows stay readable. */
const UPLOADABLE: ContentType[] = ["video", "podcast"];
const AUDIO_EXT = /^[a-z0-9]{1,5}$/;
const MAX_AUDIO_SEC = 24 * 3600;

/** Full row (incl. trash and media locations) — server only. */
async function row(id: string): Promise<ContentRow> {
  if (!isUuid(id)) throw new HttpError(404, "ไม่พบคอนเทนต์");
  const { data, error } = await adminDb().from("content").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`content: ${error.message}`);
  if (!data) throw new HttpError(404, "ไม่พบคอนเทนต์");
  return data as ContentRow;
}

async function updateRow(id: string, patch: Partial<ContentRow>): Promise<ContentRow> {
  return must(
    await adminDb()
      .from("content")
      .update({ ...patch, updated_at: nowIso() })
      .eq("id", id)
      .select("*")
      .single(),
    "update content",
  ) as ContentRow;
}

const uuids = (ids: string[]) => [...new Set(ids.filter(isUuid))];

// ───────── Upload ─────────
export interface UploadTicket {
  id: string;
  mode: "bunny" | "supabase" | "demo";
  tus?: { endpoint: string; videoId: string; libraryId: string; signature: string; expire: number };
  /** Podcast audio: resumable (TUS) upload straight to the private Supabase Storage bucket. */
  supabase?: { bucket: string; objectName: string; endpoint: string };
}

/** A fresh, unguessable object name for one upload of this episode (a re-upload never overwrites the live file). */
function newAudioTicket(id: string, fileName: string): NonNullable<UploadTicket["supabase"]> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
  return {
    bucket: PODCAST_BUCKET,
    objectName: `episodes/${id}/${randomUUID()}.${AUDIO_EXT.test(ext) ? ext : "mp3"}`,
    // Supabase recommends the dedicated storage hostname for large uploads (hosted projects only).
    endpoint: `${base.replace(/^(https:\/\/[a-z0-9]+)\.supabase\.co$/, "$1.storage.supabase.co")}/storage/v1/upload/resumable`,
  };
}

const sanitizeDuration = (d: unknown) => (typeof d === "number" && Number.isFinite(d) && d > 0 ? Math.min(Math.round(d), MAX_AUDIO_SEC) : 0);

/** Step 1 of upload: create a draft row immediately so nothing is ever lost. */
export async function createUploadAction(input: { type: ContentType; fileName: string; width?: number; height?: number; duration?: number }) {
  return admin(async (a) => {
    if (!UPLOADABLE.includes(input.type)) throw new HttpError(400, "ประเภทไฟล์ไม่ถูกต้อง");
    const title = input.fileName.replace(/\.[^.]+$/, "").slice(0, 100);
    let tus: UploadTicket["tus"];
    if (input.type === "video" && bunnyStreamEnabled()) tus = await createBunnyUpload(title || input.fileName);
    const created = must(
      await adminDb()
        .from("content")
        .insert({
          type: input.type,
          title,
          description: "",
          duration_sec: sanitizeDuration(input.duration),
          width: input.width ? Math.round(input.width) : null,
          height: input.height ? Math.round(input.height) : null,
          visibility: "public",
          status: "draft",
          media_status: "uploading",
          bunny_video_id: tus?.videoId ?? null,
        })
        .select("id")
        .single(),
      "create content",
    ) as { id: string };
    await audit(a.id, "content.create", "content", created.id);
    const ticket: UploadTicket =
      input.type === "podcast"
        ? { id: created.id, mode: "supabase", supabase: newAudioTicket(created.id, input.fileName) }
        : tus
          ? { id: created.id, mode: "bunny", tus }
          : { id: created.id, mode: "demo" };
    return ticket;
  });
}

/** The uploaded audio object must exist in the bucket and not be empty. */
async function audioObjectExists(objectName: string) {
  const slash = objectName.lastIndexOf("/");
  const folder = objectName.slice(0, slash);
  const name = objectName.slice(slash + 1);
  const { data, error } = await adminDb().storage.from(PODCAST_BUCKET).list(folder, { search: name, limit: 10 });
  if (error) throw new Error(`storage: ${error.message}`);
  const found = data?.find((o) => o.name === name);
  const size = Number((found?.metadata as { size?: number } | null)?.size ?? 0);
  return !!found && size > 0;
}

/**
 * Called when the browser finishes uploading. A podcast is ready right here (the file is verified in Storage);
 * Bunny video then waits for the webhook (or status polling).
 */
export async function uploadFinishedAction(id: string, info?: { objectName?: string; duration_sec?: number }) {
  return admin(async () => {
    const c = await row(id);
    if (c.type === "podcast") {
      const objectName = info?.objectName ?? "";
      if (!objectName.startsWith(`episodes/${id}/`) || objectName.includes("..") || objectName.length > 200) {
        throw new HttpError(400, "ไฟล์เสียงไม่ถูกต้อง");
      }
      if (c.media_status === "ready" && c.audio_path === objectName) return "ready" as MediaStatus;
      if (!(await audioObjectExists(objectName))) throw new HttpError(409, "ไม่พบไฟล์เสียงใน Storage กรุณาอัปโหลดใหม่");
      const duration = sanitizeDuration(info?.duration_sec) || c.duration_sec;
      const next = await updateRow(id, { audio_path: objectName, demo_src: null, media_status: "ready", duration_sec: duration });
      // A re-upload replaces the previous file only now that the new one is confirmed.
      if (c.audio_path && c.audio_path !== objectName) await removeAudioObjects([c.audio_path]);
      await finalizeIfReady(next);
      refreshSite();
      return "ready" as MediaStatus;
    }
    if (c.media_status === "ready") return "ready" as MediaStatus;
    if (c.bunny_video_id) {
      await updateRow(id, { media_status: "processing" });
    } else {
      // Bunny not configured (local dev): a sample source, then mediaStatusAction marks it ready.
      await updateRow(id, {
        media_status: "processing",
        demo_src: DEMO_VIDEO,
        duration_sec: c.duration_sec || 734,
      });
    }
    return "processing" as MediaStatus;
  });
}

/** processing → ready for rows without a real transcoder. Only the call that flips the status publishes/notifies. */
async function completeDemoMedia(id: string): Promise<ContentRow | null> {
  const { data } = await adminDb()
    .from("content")
    .update({ media_status: "ready", updated_at: nowIso() })
    .eq("id", id)
    .eq("media_status", "processing")
    .is("bunny_video_id", null)
    .not("demo_src", "is", null)
    .select("*")
    .maybeSingle();
  if (!data) return null;
  const c = data as ContentRow;
  await finalizeIfReady(c);
  revalidateTag(CATALOG_TAG);
  return c;
}

export async function mediaStatusAction(id: string) {
  return admin(async () => {
    let c = await row(id);
    if ((c.media_status === "uploading" || c.media_status === "processing") && c.bunny_video_id && bunnyStreamEnabled()) {
      // On localhost Bunny's webhook can't reach us — polling is how uploads finish there.
      c = await syncBunnyStatus(c);
    } else if (c.media_status === "processing" && !c.bunny_video_id && c.demo_src) {
      c = (await completeDemoMedia(id)) ?? (await row(id));
    }
    return { media_status: c.media_status, status: c.status, duration_sec: c.duration_sec, thumbnail_url: c.thumbnail_url };
  });
}

// ───────── Images (covers, channel art) ─────────
export async function imageUploadAction(folder: "content" | "playlists" | "channel" | "hero", contentType: string) {
  return admin(() => {
    if (!["content", "playlists", "channel", "hero"].includes(folder)) throw new HttpError(400, "ปลายทางไม่ถูกต้อง");
    return signImageUpload(folder, contentType);
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
  /** @deprecated Shorts are gone: still accepted so older editor builds type-check, but ignored. */
  linked_content_id?: string | null;
  /** @deprecated see linked_content_id */
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
    const c = await row(id);
    const db = adminDb();
    const patch: Partial<ContentRow> = {};

    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t) throw new HttpError(400, "กรุณาใส่ชื่อ");
      if (t.length > 100) throw new HttpError(400, "ชื่อยาวเกิน 100 ตัวอักษร");
      patch.title = t;
    }
    if (input.description !== undefined) {
      if (input.description.length > 5000) throw new HttpError(400, "คำอธิบายยาวเกิน 5,000 ตัวอักษร");
      patch.description = input.description;
    }
    if (input.type !== undefined) {
      if (!UPLOADABLE.includes(input.type) && input.type !== c.type) throw new HttpError(400, "ประเภทไม่ถูกต้อง");
      patch.type = input.type;
    }
    if (input.thumbnail_url !== undefined) patch.thumbnail_url = await storeImage(input.thumbnail_url, `content/${id}`);
    if (input.category_id !== undefined) {
      if (input.category_id && !isUuid(input.category_id)) throw new HttpError(400, "หมวดหมู่ไม่ถูกต้อง");
      patch.category_id = input.category_id || null;
    }
    if (input.tags !== undefined) {
      patch.tags = [...new Set(input.tags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean))].slice(0, 10);
    }
    if (input.visibility !== undefined) {
      if (input.visibility !== "public" && input.visibility !== "members") throw new HttpError(400, "การมองเห็นไม่ถูกต้อง");
      patch.visibility = input.visibility;
    }
    if (input.comments_enabled !== undefined) patch.comments_enabled = !!input.comments_enabled;
    if (input.captions_vtt !== undefined) patch.captions_vtt = input.captions_vtt?.trim() ? input.captions_vtt : null;

    if (input.links !== undefined) {
      const links = input.links.filter((l) => l.label.trim() || l.url.trim()).slice(0, 5);
      for (const l of links) if (!isValidUrl(l.url.trim())) throw new HttpError(400, `ลิงก์ไม่ถูกต้อง: ${l.url}`);
      must(await db.from("content_links").delete().eq("content_id", id), "clear links");
      if (links.length) {
        must(
          await db
            .from("content_links")
            .insert(links.map((l, i) => ({ content_id: id, label: l.label.trim(), url: l.url.trim(), position: i }))),
          "save links",
        );
      }
    }

    if (input.resources !== undefined) {
      const existing = must(await db.from("content_resources").select("id").eq("content_id", id), "resources") as { id: string }[];
      const have = new Set(existing.map((r) => r.id));
      const keep = new Set(input.resources.map((r) => r.id).filter((rid): rid is string => !!rid && have.has(rid)));
      const drop = [...have].filter((rid) => !keep.has(rid));
      if (drop.length) must(await db.from("content_resources").delete().in("id", drop), "remove resources");
      const inserts: { content_id: string; file_name: string; storage_path: string; size_bytes: number; position: number }[] = [];
      for (const [i, r] of input.resources.entries()) {
        const size_bytes = Math.max(0, Math.round(r.size_bytes || 0));
        if (r.id && keep.has(r.id)) {
          must(await db.from("content_resources").update({ file_name: r.file_name, size_bytes, position: i }).eq("id", r.id), "update resource");
        } else {
          inserts.push({ content_id: id, file_name: r.file_name, storage_path: `resources/${id}/${r.file_name}`, size_bytes, position: i });
        }
      }
      if (inserts.length) must(await db.from("content_resources").insert(inserts), "add resources");
    }

    if (input.playlist_ids !== undefined) {
      const want = uuids(input.playlist_ids);
      const current = must(await db.from("playlist_items").select("playlist_id").eq("content_id", id), "playlist items") as { playlist_id: string }[];
      const inNow = new Set(current.map((p) => p.playlist_id));
      const remove = [...inNow].filter((pid) => !want.includes(pid));
      if (remove.length) must(await db.from("playlist_items").delete().eq("content_id", id).in("playlist_id", remove), "leave playlists");
      for (const pid of want.filter((p) => !inNow.has(p))) {
        const { count } = await db.from("playlist_items").select("content_id", { count: "exact", head: true }).eq("playlist_id", pid);
        must(await db.from("playlist_items").insert({ playlist_id: pid, content_id: id, position: count ?? 0 }), "join playlist");
      }
    }

    const wasLive = isLive(c);
    if (input.status !== undefined) {
      if (input.status === "published") {
        if (c.media_status === "ready") {
          if (c.status !== "published") Object.assign(patch, publishNowPatch());
          else patch.publish_when_ready = false;
        } else {
          Object.assign(patch, { status: "draft", scheduled_at: null, publish_when_ready: true });
        }
      } else if (input.status === "scheduled") {
        if (!input.scheduled_at) throw new HttpError(400, "กรุณาเลือกเวลาเผยแพร่");
        const at = new Date(input.scheduled_at);
        if (Number.isNaN(at.getTime())) throw new HttpError(400, "เวลาเผยแพร่ไม่ถูกต้อง");
        if (at.getTime() < Date.now() - 60_000) throw new HttpError(400, "เวลาที่ตั้งต้องอยู่ในอนาคต");
        Object.assign(patch, { status: "scheduled", scheduled_at: at.toISOString(), published_at: null, publish_when_ready: false });
      } else {
        Object.assign(patch, { status: "draft", published_at: null, scheduled_at: null, publish_when_ready: false });
      }
    }

    const next = await updateRow(id, patch);
    if (input.status !== undefined) {
      if (!wasLive && isLive(next)) await notifyNewContent(next);
      await audit(a.id, `content.${input.status}`, "content", id);
    }
    // Autosaves of drafts don't touch the public site — only revalidate when it matters.
    if (input.status !== undefined || wasLive || isLive(next) || next.status === "scheduled") refreshSite();
    return { updated_at: next.updated_at, status: next.status, media_status: next.media_status };
  });
}

export async function bulkContentAction(ids: string[], op: "public" | "members" | "delete" | "restore" | "purge" | "draft" | "publish") {
  return admin(async (a) => {
    const list = uuids(ids);
    if (!list.length) return;
    const db = adminDb();
    const now = nowIso();
    if (op === "public" || op === "members") {
      must(await db.from("content").update({ visibility: op, updated_at: now }).in("id", list), "visibility");
    } else if (op === "draft") {
      must(
        await db.from("content").update({ status: "draft", published_at: null, scheduled_at: null, publish_when_ready: false, updated_at: now }).in("id", list),
        "draft",
      );
    } else if (op === "publish") {
      // Same rules as the editor's "เผยแพร่ทันที": live now if the media is ready, otherwise as soon as processing finishes.
      const rows = must(await db.from("content").select("*").in("id", list).is("deleted_at", null), "load") as ContentRow[];
      for (const c of rows) {
        if (c.status === "published") continue;
        if (c.media_status !== "ready") {
          await updateRow(c.id, { status: "draft", scheduled_at: null, publish_when_ready: true });
          continue;
        }
        const next = await updateRow(c.id, publishNowPatch());
        if (isLive(next)) await notifyNewContent(next);
      }
    } else if (op === "delete") {
      must(await db.from("content").update({ deleted_at: now, updated_at: now }).in("id", list), "trash");
    } else if (op === "restore") {
      must(await db.from("content").update({ deleted_at: null, updated_at: now }).in("id", list), "restore");
    } else if (op === "purge") {
      // Only rows already in the trash. Links, playlist items, comments… go with them (on delete cascade).
      const gone = must(await db.from("content").delete().in("id", list).not("deleted_at", "is", null).select("audio_path"), "purge") as { audio_path: string | null }[];
      await removeAudioObjects(gone.map((g) => g.audio_path));
    } else {
      throw new HttpError(400, "คำสั่งไม่ถูกต้อง");
    }
    await Promise.all(list.map((id) => audit(a.id, `content.${op}`, "content", id)));
    refreshSite();
  });
}

// ───────── Playlists ─────────
export async function listPlaylistsAction(contentIds: string[] = []) {
  return admin(async () => {
    const db = adminDb();
    const ids = uuids(contentIds);
    const [pls, items] = await Promise.all([
      db.from("playlists").select("id, title, visibility, position").order("position"),
      ids.length ? db.from("playlist_items").select("playlist_id, content_id").in("content_id", ids) : Promise.resolve({ data: [], error: null }),
    ]);
    const playlists = must(pls, "playlists") as { id: string; title: string; visibility: Visibility }[];
    const pairs = new Set((must(items, "playlist items") as { playlist_id: string; content_id: string }[]).map((i) => `${i.playlist_id}:${i.content_id}`));
    return playlists.map((p) => ({
      id: p.id,
      title: p.title,
      visibility: p.visibility,
      containsAll: ids.length > 0 && ids.every((cid) => pairs.has(`${p.id}:${cid}`)),
    }));
  });
}

export async function setPlaylistMembershipAction(playlistId: string, contentIds: string[], include: boolean) {
  return admin(async () => {
    if (!isUuid(playlistId)) throw new HttpError(404, "ไม่พบ Playlist");
    const db = adminDb();
    const ids = uuids(contentIds);
    if (!ids.length) return;
    if (include) {
      const items = must(await db.from("playlist_items").select("content_id").eq("playlist_id", playlistId), "playlist items") as { content_id: string }[];
      const have = new Set(items.map((i) => i.content_id));
      const add = ids.filter((cid) => !have.has(cid)).map((cid, i) => ({ playlist_id: playlistId, content_id: cid, position: items.length + i }));
      if (add.length) must(await db.from("playlist_items").insert(add), "add to playlist");
    } else {
      must(await db.from("playlist_items").delete().eq("playlist_id", playlistId).in("content_id", ids), "remove from playlist");
    }
    refreshSite();
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
  return admin(async (a) => {
    const db = adminDb();
    const title = input.title.trim();
    if (!title) throw new HttpError(400, "กรุณาใส่ชื่อ Playlist");
    const fields = {
      title,
      description: input.description ?? "",
      thumbnail_url: await storeImage(input.thumbnail_url, "playlists"),
      visibility: input.visibility === "members" ? "members" : "public",
      is_course: !!input.is_course,
    };
    let pid: string | null = null;
    if (id && isUuid(id)) {
      const { data } = await db.from("playlists").update(fields).eq("id", id).select("id").maybeSingle();
      pid = (data as { id: string } | null)?.id ?? null;
    }
    const created = !pid;
    if (!pid) {
      const { count } = await db.from("playlists").select("id", { count: "exact", head: true });
      pid = (must(await db.from("playlists").insert({ ...fields, position: count ?? 0 }).select("id").single(), "create playlist") as { id: string }).id;
    }
    must(await db.from("playlist_items").delete().eq("playlist_id", pid), "clear playlist");
    const items = uuids(input.content_ids).map((cid, i) => ({ playlist_id: pid!, content_id: cid, position: i }));
    if (items.length) must(await db.from("playlist_items").insert(items), "save playlist items");
    await audit(a.id, created ? "playlist.create" : "playlist.update", "playlist", pid);
    refreshSite();
    return pid;
  });
}

export async function deletePlaylistAction(id: string) {
  return admin(async (a) => {
    if (!isUuid(id)) throw new HttpError(404, "ไม่พบ Playlist");
    must(await adminDb().from("playlists").delete().eq("id", id), "delete playlist"); // items cascade
    await audit(a.id, "playlist.delete", "playlist", id);
    refreshSite();
  });
}

export async function reorderPlaylistsAction(ids: string[]) {
  return admin(async () => {
    const db = adminDb();
    const results = await Promise.all(uuids(ids).map((id, i) => db.from("playlists").update({ position: i }).eq("id", id)));
    for (const r of results) must(r, "reorder playlists");
    refreshSite();
  });
}

// ───────── Home curation ─────────
/** Home rows below the Hero. The hero row (its on/off switch) is saved by saveHeroAction. */
export async function saveHomeSectionsAction(sections: Pick<HomeSection, "id" | "type" | "title" | "content_ids" | "enabled">[]) {
  return admin(async (a) => {
    const db = adminDb();
    const rows = sections
      .filter((s) => s.type !== "hero")
      .map((s, i) => ({
        ...(s.id && isUuid(s.id) ? { id: s.id } : {}),
        type: s.type,
        title: s.title ?? "",
        content_ids: uuids(s.content_ids ?? []),
        enabled: !!s.enabled,
        position: i + 1,
      }));
    // Write the new set first, then drop whatever isn't in it — the Home page is never left empty on an error.
    const keep: string[] = [];
    const withId = rows.filter((r) => "id" in r);
    const fresh = rows.filter((r) => !("id" in r));
    if (withId.length) {
      const saved = must(await db.from("home_sections").upsert(withId, { onConflict: "id" }).select("id"), "save home sections") as { id: string }[];
      keep.push(...saved.map((r) => r.id));
    }
    if (fresh.length) {
      const saved = must(await db.from("home_sections").insert(fresh).select("id"), "add home sections") as { id: string }[];
      keep.push(...saved.map((r) => r.id));
    }
    let del = db.from("home_sections").delete().neq("type", "hero");
    if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
    must(await del, "remove home sections");
    await audit(a.id, "home.update", "home", "home");
    refreshSite("/", "page");
  });
}

export type HeroSlideInput = Omit<HeroSlideRow, "position">;

const STORAGE_PUBLIC = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;

function heroImage(v: string | null | undefined, what: string) {
  const url = v?.trim();
  if (!url) return null;
  if (!url.startsWith(STORAGE_PUBLIC)) throw new HttpError(400, `${what}: กรุณาอัปโหลดรูปจากปุ่มอัปโหลด`);
  return url;
}

function heroTime(v: string | null | undefined, what: string) {
  if (!v) return null;
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) throw new HttpError(400, `${what}ไม่ถูกต้อง`);
  return t.toISOString();
}

/** Replace the Hero: switch + slides in order. */
export async function saveHeroAction(enabled: boolean, slides: HeroSlideInput[]) {
  return admin(async (a) => {
    if (slides.length > HERO_MAX_SLIDES) throw new HttpError(400, `Hero มีได้สูงสุด ${HERO_MAX_SLIDES} สไลด์`);
    const db = adminDb();
    const clipIds = uuids(slides.map((s) => s.content_id ?? ""));
    const found = clipIds.length
      ? (must(await db.from("content").select("id").in("id", clipIds).is("deleted_at", null), "hero clips") as { id: string }[]).map((r) => r.id)
      : [];
    const rows = slides.map((s, i) => {
      const n = i + 1;
      const content_id = s.content_id && isUuid(s.content_id) ? s.content_id : null;
      if (content_id && !found.includes(content_id)) throw new HttpError(400, `สไลด์ ${n}: ไม่พบคลิปที่ผูกไว้`);
      const title = (s.title ?? "").trim();
      const subtitle = (s.subtitle ?? "").trim();
      const cta_label = (s.cta_label ?? "").trim();
      const cta_href = (s.cta_href ?? "").trim();
      if (title.length > HERO_LIMITS.title) throw new HttpError(400, `สไลด์ ${n}: หัวข้อยาวเกิน ${HERO_LIMITS.title} ตัวอักษร`);
      if (subtitle.length > HERO_LIMITS.subtitle) throw new HttpError(400, `สไลด์ ${n}: คำโปรยยาวเกิน ${HERO_LIMITS.subtitle} ตัวอักษร`);
      if (cta_label.length > HERO_LIMITS.cta_label) throw new HttpError(400, `สไลด์ ${n}: ข้อความปุ่มยาวเกิน ${HERO_LIMITS.cta_label} ตัวอักษร`);
      if (cta_href.length > HERO_LIMITS.cta_href || !isHeroHref(cta_href)) throw new HttpError(400, `สไลด์ ${n}: ลิงก์ปุ่มต้องขึ้นต้นด้วย / หรือ https://`);
      const image_url = heroImage(s.image_url, `สไลด์ ${n}`);
      const mobile_image_url = heroImage(s.mobile_image_url, `สไลด์ ${n}`);
      if (!content_id && (!title || !cta_href || !(image_url || mobile_image_url)))
        throw new HttpError(400, `สไลด์ ${n}: แบนเนอร์ที่ไม่ผูกคลิปต้องมีรูป หัวข้อ และลิงก์ปุ่ม`);
      const starts_at = heroTime(s.starts_at, `สไลด์ ${n}: เวลาเริ่ม`);
      const ends_at = heroTime(s.ends_at, `สไลด์ ${n}: เวลาสิ้นสุด`);
      if (starts_at && ends_at && ends_at <= starts_at) throw new HttpError(400, `สไลด์ ${n}: เวลาสิ้นสุดต้องหลังเวลาเริ่ม`);
      return {
        ...(isUuid(s.id) ? { id: s.id } : {}),
        position: i,
        enabled: !!s.enabled,
        content_id,
        title,
        subtitle,
        image_url,
        mobile_image_url,
        cta_label,
        cta_href,
        starts_at,
        ends_at,
        updated_at: nowIso(),
      };
    });

    const keep: string[] = [];
    const withId = rows.filter((r) => "id" in r);
    const fresh = rows.filter((r) => !("id" in r));
    if (withId.length) keep.push(...(must(await db.from("hero_slides").upsert(withId, { onConflict: "id" }).select("id"), "save hero") as { id: string }[]).map((r) => r.id));
    if (fresh.length) keep.push(...(must(await db.from("hero_slides").insert(fresh).select("id"), "add hero") as { id: string }[]).map((r) => r.id));
    let del = db.from("hero_slides").delete();
    del = keep.length ? del.not("id", "in", `(${keep.join(",")})`) : del.not("id", "is", null);
    must(await del, "remove hero slides");

    const hero = must(await db.from("home_sections").select("id").eq("type", "hero").maybeSingle(), "hero section") as { id: string } | null;
    if (hero) must(await db.from("home_sections").update({ enabled: !!enabled }).eq("id", hero.id), "hero switch");
    else must(await db.from("home_sections").insert({ type: "hero", title: "Hero", enabled: !!enabled, position: 0 }), "hero switch");

    await audit(a.id, "home.hero", "home", "hero");
    refreshSite("/", "page");
  });
}

// ───────── Settings ─────────
const SETTING_KEYS: (keyof SiteSettings)[] = [
  "channel_name",
  "tagline",
  "about",
  "avatar_url",
  "banner_url",
  "socials",
  "paywall_title",
  "paywall_benefits",
];

export async function saveSettingsAction(input: Partial<SiteSettings>) {
  return admin(async (a) => {
    const db = adminDb();
    const { data, error } = await db.from("site_settings").select("value").eq("key", "site").maybeSingle();
    if (error) throw new Error(`settings: ${error.message}`);
    const value: Record<string, unknown> = { ...((data?.value as Record<string, unknown>) ?? {}) };
    for (const k of SETTING_KEYS) if (input[k] !== undefined) value[k] = input[k];
    for (const k of ["avatar_url", "banner_url"] as const) {
      if (input[k] !== undefined) value[k] = (await storeImage(input[k], "channel")) ?? "";
    }
    must(await db.from("site_settings").upsert({ key: "site", value }, { onConflict: "key" }), "save settings");
    await audit(a.id, "settings.update", "settings", "site");
    refreshSite();
  });
}

const slugify = (name: string) => name.trim().toLowerCase().replace(/\s+/g, "-");

export async function saveCategoriesAction(cats: { id?: string; name: string }[]) {
  return admin(async () => {
    const db = adminDb();
    const existing = must(await db.from("categories").select("id, slug"), "categories") as { id: string; slug: string }[];
    const existingIds = new Set(existing.map((c) => c.id));
    const idBySlug = new Map(existing.map((c) => [c.slug, c.id]));

    const seen = new Set<string>();
    const wanted = cats
      .filter((c) => c.name.trim())
      .map((c, i) => {
        const name = c.name.trim();
        const base = slugify(name);
        let slug = base;
        for (let n = 2; seen.has(slug); n++) slug = `${base}-${n}`;
        seen.add(slug);
        return { id: c.id && existingIds.has(c.id) ? c.id : undefined, name, slug, position: i };
      });
    // A new row whose name matches an existing category keeps that category (and the clips filed under it).
    const used = new Set(wanted.map((w) => w.id).filter(Boolean));
    for (const w of wanted) {
      if (w.id) continue;
      const match = idBySlug.get(w.slug);
      if (match && !used.has(match)) {
        w.id = match;
        used.add(match);
      }
    }

    // Removed categories go first (content.category_id → null via on delete set null).
    const remove = existing.filter((c) => !used.has(c.id)).map((c) => c.id);
    if (remove.length) must(await db.from("categories").delete().in("id", remove), "remove categories");

    const kept = wanted.filter((w): w is typeof w & { id: string } => !!w.id);
    const slugOf = new Map(existing.map((c) => [c.id, c.slug]));
    // Renames can swap slugs (unique) — park changed ones on a temporary slug first.
    const renamed = kept.filter((w) => slugOf.get(w.id) !== w.slug);
    for (const w of renamed) must(await db.from("categories").update({ slug: `tmp-${w.id}` }).eq("id", w.id), "rename categories");
    if (kept.length) must(await db.from("categories").upsert(kept, { onConflict: "id" }), "save categories");

    const fresh = wanted.filter((w) => !w.id).map(({ name, slug, position }) => ({ name, slug, position }));
    if (fresh.length) must(await db.from("categories").insert(fresh), "add categories");
    refreshSite();
  });
}

export async function saveBannedWordsAction(words: string[]) {
  return admin(async () => {
    const db = adminDb();
    const want = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
    const existing = must(await db.from("banned_words").select("id, word"), "banned words") as { id: string; word: string }[];
    const drop = existing.filter((w) => !want.includes(w.word)).map((w) => w.id);
    if (drop.length) must(await db.from("banned_words").delete().in("id", drop), "remove banned words");
    const have = new Set(existing.map((w) => w.word));
    const add = want.filter((w) => !have.has(w)).map((word) => ({ word }));
    if (add.length) must(await db.from("banned_words").upsert(add, { onConflict: "word", ignoreDuplicates: true }), "add banned words");
  });
}

// ───────── Members ─────────
export async function extendMemberAction(userId: string, opts: { days?: number; until?: string }, note: string) {
  return admin(async (a) => {
    if (!isUuid(userId)) throw new HttpError(404, "ไม่พบผู้ใช้");
    if (opts.until && Number.isNaN(new Date(opts.until).getTime())) throw new HttpError(400, "วันที่ไม่ถูกต้อง");
    const exp = await manualExtend(a, userId, opts, note);
    revalidatePath("/studio/members");
    return exp;
  });
}

export async function revokeMemberAction(userId: string, note: string) {
  return admin(async (a) => {
    if (!isUuid(userId)) throw new HttpError(404, "ไม่พบผู้ใช้");
    await revokeMembership(a, userId, note);
    revalidatePath("/studio/members");
  });
}

export async function resolvePaymentErrorAction(id: string) {
  return admin(async () => {
    if (!isUuid(id)) throw new HttpError(404, "ไม่พบรายการ");
    must(await adminDb().from("payment_errors").update({ resolved: true }).eq("id", id), "resolve payment error");
    revalidatePath("/studio/members");
  });
}

// ───────── Scheduler / comments ─────────
export async function runSchedulerAction() {
  return admin(async () => {
    // expiry_reminders() notifies everyone whose membership ends within 3 days — count them for the summary.
    const now = Date.now();
    const { count } = await adminDb()
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .gt("expires_at", new Date(now).toISOString())
      .lte("expires_at", new Date(now + 3 * 86_400_000).toISOString());
    const r = await runScheduler(true);
    if (r.published.length || r.purged) revalidatePath("/", "layout");
    return { published: r.published as string[], reminded: count ?? 0 };
  });
}

export async function replyAsCreatorAction(contentId: string, parentId: string, body: string) {
  return admin(async (a) => {
    if (!isUuid(contentId) || !isUuid(parentId)) throw new HttpError(404, "ไม่พบความคิดเห็น");
    await createComment(a, contentId, body, parentId);
    revalidatePath("/studio/comments");
  });
}

// ───────── Studio additions ─────────
/** 📊 Stats dialog on /studio/content: totals + views per Bangkok day for 28 days. */
export async function contentStatsAction(id: string) {
  const { dailyFromViews, recentViews } = await import("./_lib/data");
  return admin(async () => {
    const c = await row(id);
    const now = Date.now();
    const views = await recentViews(28, id, now);
    const daily = dailyFromViews(views, 28, now);
    const watchedSec = views.reduce((s, v) => s + (v.watched_sec || 0), 0);
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
export async function reuploadAction(id: string, fileName = "") {
  return admin(async (a) => {
    const c = await row(id);
    const wasLive = isLive(c);
    if (c.type === "podcast") {
      // audio_path keeps pointing at the current file until uploadFinishedAction confirms the new one.
      const supabase = newAudioTicket(id, fileName);
      await updateRow(id, { media_status: "uploading", demo_src: null });
      await audit(a.id, "content.reupload", "content", id);
      if (wasLive) refreshSite();
      const ticket: UploadTicket = { id, mode: "supabase", supabase };
      return ticket;
    }
    let tus: UploadTicket["tus"];
    if (bunnyStreamEnabled()) tus = await createBunnyUpload(c.title || "untitled");
    await updateRow(id, { media_status: "uploading", demo_src: null, bunny_video_id: tus?.videoId ?? null });
    await audit(a.id, "content.reupload", "content", id);
    if (wasLive) refreshSite();
    const ticket: UploadTicket = tus ? { id, mode: "bunny", tus } : { id, mode: "demo" };
    return ticket;
  });
}
