import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { adminDb } from "@/lib/supabase/clients";
import { HttpError } from "./auth";
import { audit } from "./mutations";
import { isMissingRelation, isUuid } from "./queries";
import { DOWNLOAD_TTL, PRODUCT_BUCKET } from "./shop";
import { FREEBIE_LIMITS, isFreebieUrl, type FreebieAdminFull, type FreebieAdminRow, type FreebieClaimRow, type FreebiePublic } from "@/lib/freebies";
import type { Viewer } from "@/lib/types";

/**
 * ของฟรี data access (0023_freebies.sql). Read with the service role and an EXPLICIT column list: `file_path` is never
 * selected for public pages. Files live in the private `products` bucket under free/<id>/.
 */

export const FREEBIES_TAG = "freebies";

const PUBLIC_COLS = "id, kind, title, subtitle, description, cover_url, file_name, file_size, url, is_featured, status, created_at, updated_at";

type Row = Omit<FreebiePublic, "file_size"> & { file_size: number | string | null };
type DbResult<T> = { data: T | null; error: { code?: string; message: string } | null };

const toPublic = (r: Row): FreebiePublic => ({ ...r, description: r.description ?? "", file_size: r.file_size == null ? null : Number(r.file_size) });

/** If 0023 is not applied yet, behave as if there were no freebies instead of crashing pages. */
function tolerate<T>(res: DbResult<T>, empty: T, what: string): T {
  if (res.error) {
    if (isMissingRelation(res.error)) return empty;
    throw new Error(`${what}: ${res.error.message}`);
  }
  return res.data ?? empty;
}

// ───────────────────────── Public ─────────────────────────
/** Published freebies, featured first then newest. Cached for everyone. */
export const listFreebies = unstable_cache(
  async (): Promise<FreebiePublic[]> => {
    const res = await adminDb()
      .from("freebies")
      .select(PUBLIC_COLS)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });
    return tolerate(res as unknown as DbResult<Row[]>, [], "freebies").map(toPublic);
  },
  ["tg-freebies-v1"],
  { tags: [FREEBIES_TAG], revalidate: 60 },
);

/** One freebie for its page. Drafts are visible to admins only. */
export async function getFreebie(id: string, viewer?: Pick<Viewer, "is_admin"> | null): Promise<FreebiePublic | null> {
  if (!isUuid(id)) return null;
  const res = await adminDb().from("freebies").select(PUBLIC_COLS).eq("id", id).is("deleted_at", null).maybeSingle();
  const row = tolerate(res as unknown as DbResult<Row>, null, "freebie");
  if (!row) return null;
  if (row.status !== "published" && !viewer?.is_admin) return null;
  return toPublic(row);
}

/** Has this person taken it before? (The page says “รับไปแล้ว” and the button reads “โหลดอีกครั้ง”.) */
export async function hasClaimed(userId: string | null | undefined, freebieId: string): Promise<boolean> {
  if (!userId || !isUuid(freebieId)) return false;
  const res = await adminDb().from("freebie_claims").select("id").eq("user_id", userId).eq("freebie_id", freebieId).limit(1);
  return tolerate(res as unknown as DbResult<{ id: string }[]>, [], "freebie claimed").length > 0;
}

/**
 * Take a freebie: returns where to send the browser — a 60-second signed URL for a file, the tool's URL for a tool.
 * Signed-in users only (the route turns guests away first). Drafts are for admins only. Every take is logged to
 * freebie_claims (best effort: a logging error never blocks the file); admin takes are not logged, so testing does not
 * inflate the lead count.
 */
export async function claimFreebie(viewer: Pick<Viewer, "id" | "is_admin">, id: string): Promise<string> {
  if (!isUuid(id)) throw new HttpError(404, "ไม่พบของฟรีชิ้นนี้");
  const { data, error } = await adminDb().from("freebies").select("kind, file_path, file_name, url, status, deleted_at").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingRelation(error)) throw new HttpError(404, "ไม่พบของฟรีชิ้นนี้");
    throw new Error(`claim freebie: ${error.message}`);
  }
  if (!data || data.deleted_at || (data.status !== "published" && !viewer.is_admin)) throw new HttpError(404, "ไม่พบของฟรีชิ้นนี้");

  let target: string;
  if (data.kind === "tool") {
    if (!data.url || !isFreebieUrl(data.url as string)) throw new HttpError(404, "เครื่องมือนี้ยังไม่พร้อม");
    target = data.url as string;
  } else {
    if (!data.file_path || !data.file_name) throw new HttpError(404, "ไฟล์นี้ยังไม่พร้อม");
    const signed = await adminDb().storage.from(PRODUCT_BUCKET).createSignedUrl(data.file_path as string, DOWNLOAD_TTL, { download: data.file_name as string });
    if (signed.error || !signed.data?.signedUrl) {
      console.error(`freebie sign: ${signed.error?.message ?? "no url"}`);
      throw new HttpError(404, "ไม่พบไฟล์ กรุณาติดต่อทีมงาน");
    }
    target = signed.data.signedUrl;
  }
  if (!viewer.is_admin) {
    const log = await adminDb().from("freebie_claims").insert({ user_id: viewer.id, freebie_id: id });
    if (log.error) console.error(`freebie log: ${log.error.message}`);
  }
  return target;
}

export async function freebiesSitemap(): Promise<{ id: string; updated_at: string }[]> {
  try {
    return (await listFreebies()).map((f) => ({ id: f.id, updated_at: f.updated_at }));
  } catch (e) {
    console.error(e);
    return [];
  }
}

// ───────────────────────── Studio ─────────────────────────
function refresh(id?: string) {
  revalidateTag(FREEBIES_TAG);
  revalidatePath("/free");
  if (id) revalidatePath(`/free/${id}`);
  revalidatePath("/studio/free");
}

/** freebie id → { takes, distinct people }. */
async function claimCounts(): Promise<Map<string, { claims: number; people: Set<string> }>> {
  const out = new Map<string, { claims: number; people: Set<string> }>();
  for (let from = 0; ; from += 1000) {
    const res = await adminDb().from("freebie_claims").select("freebie_id, user_id").order("created_at").order("id").range(from, from + 999);
    const rows = tolerate(res as unknown as DbResult<{ freebie_id: string; user_id: string }[]>, [], "freebie claims");
    for (const r of rows) {
      const c = out.get(r.freebie_id) ?? { claims: 0, people: new Set<string>() };
      c.claims += 1;
      c.people.add(r.user_id);
      out.set(r.freebie_id, c);
    }
    if (rows.length < 1000) return out;
  }
}

export async function studioFreebies(): Promise<FreebieAdminRow[]> {
  const res = await adminDb().from("freebies").select(PUBLIC_COLS).is("deleted_at", null).order("created_at", { ascending: false });
  const rows = tolerate(res as unknown as DbResult<Row[]>, [], "studio freebies");
  const counts = await claimCounts();
  return rows.map((r) => ({ ...toPublic(r), claims: counts.get(r.id)?.claims ?? 0, people: counts.get(r.id)?.people.size ?? 0 }));
}

export async function studioFreebie(id: string): Promise<FreebieAdminFull | null> {
  if (!isUuid(id)) return null;
  const res = await adminDb().from("freebies").select(`${PUBLIC_COLS}, file_path`).eq("id", id).is("deleted_at", null).maybeSingle();
  const row = tolerate(res as unknown as DbResult<Row & { file_path: string | null }>, null, "studio freebie");
  if (!row) return null;
  const counts = await claimCounts();
  return { ...toPublic(row), file_path: row.file_path, claims: counts.get(id)?.claims ?? 0, people: counts.get(id)?.people.size ?? 0 };
}

/** Who took this freebie (newest first, one line per person) — the lead list on its Studio page. */
export async function studioFreebieClaims(id: string, max = 200): Promise<FreebieClaimRow[]> {
  if (!isUuid(id)) return [];
  const res = await adminDb().from("freebie_claims").select("user_id, created_at").eq("freebie_id", id).order("created_at", { ascending: false }).limit(2000);
  const rows = tolerate(res as unknown as DbResult<{ user_id: string; created_at: string }[]>, [], "freebie claim list");
  const byUser = new Map<string, { last_at: string; times: number }>();
  for (const r of rows) {
    const c = byUser.get(r.user_id);
    if (c) c.times += 1;
    else byUser.set(r.user_id, { last_at: r.created_at, times: 1 });
  }
  const ids = [...byUser.keys()].slice(0, max);
  if (!ids.length) return [];
  const db = adminDb();
  const [profs, emails] = await Promise.all([
    db.from("profiles").select("id, display_name").in("id", ids),
    Promise.all(ids.map(async (uid) => [uid, (await db.auth.admin.getUserById(uid)).data.user?.email ?? ""] as const)),
  ]);
  const name = new Map((profs.data ?? []).map((p) => [p.id as string, (p.display_name as string) || ""]));
  const email = new Map(emails);
  return ids.map((uid) => ({
    user_id: uid,
    name: name.get(uid) || (email.get(uid) ?? "").split("@")[0] || "ผู้ใช้",
    email: email.get(uid) ?? "",
    ...byUser.get(uid)!,
  }));
}

export interface FreebieInput {
  /** Client-generated uuid, so a file can be uploaded under free/<id>/ before the first save. */
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  description: string;
  cover_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  url: string;
  status: "draft" | "published";
  is_featured: boolean;
}

export const freebieObjectPrefix = (id: string) => `free/${id}/`;
/** A fresh, unguessable object name under this freebie's folder (a re-upload never overwrites the live file). */
export function newFreebieObject(id: string, fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return `${freebieObjectPrefix(id)}${randomUUID()}${/^[a-z0-9]{1,8}$/.test(ext) ? `.${ext}` : ""}`;
}

async function objectSize(objectName: string): Promise<number> {
  const slash = objectName.lastIndexOf("/");
  const { data, error } = await adminDb().storage.from(PRODUCT_BUCKET).list(objectName.slice(0, slash), { search: objectName.slice(slash + 1), limit: 10 });
  if (error) throw new Error(`storage: ${error.message}`);
  const found = data?.find((o) => o.name === objectName.slice(slash + 1));
  return Number((found?.metadata as { size?: number } | null)?.size ?? 0);
}

async function removeObject(path: string | null | undefined) {
  if (!path) return;
  const { error } = await adminDb().storage.from(PRODUCT_BUCKET).remove([path]);
  if (error) console.error(`freebie storage remove: ${error.message}`);
}

function cleanCover(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  if (s.toLowerCase().startsWith("data:") || !/^https?:\/\/\S+$/i.test(s) || s.length > 2000) throw new HttpError(400, "ลิงก์รูปปกไม่ถูกต้อง");
  return s;
}

/** Create or update a freebie. Everything is re-validated here; the editor only suggests. */
export async function saveFreebie(admin: Viewer, input: FreebieInput): Promise<{ id: string }> {
  const id = String(input.id ?? "");
  if (!isUuid(id)) throw new HttpError(400, "รหัสไม่ถูกต้อง");
  const kind = input.kind === "tool" ? "tool" : input.kind === "file" ? "file" : null;
  if (!kind) throw new HttpError(400, "เลือกประเภทของฟรีก่อน");

  const title = String(input.title ?? "").trim();
  if (!title) throw new HttpError(400, "ใส่ชื่อก่อน");
  if (title.length > FREEBIE_LIMITS.title) throw new HttpError(400, `ชื่อยาวเกิน ${FREEBIE_LIMITS.title} ตัวอักษร`);
  const subtitle = String(input.subtitle ?? "").trim();
  if (subtitle.length > FREEBIE_LIMITS.subtitle) throw new HttpError(400, `คำโปรยยาวเกิน ${FREEBIE_LIMITS.subtitle} ตัวอักษร`);
  const description = String(input.description ?? "");
  if (description.length > FREEBIE_LIMITS.description) throw new HttpError(400, "รายละเอียดยาวเกินไป");
  const cover = cleanCover(input.cover_url);

  const db = adminDb();
  const existingRes = await db.from("freebies").select("id, file_path").eq("id", id).maybeSingle();
  if (existingRes.error) {
    if (isMissingRelation(existingRes.error)) throw new HttpError(503, "ยังไม่ได้เปิดใช้ระบบของฟรี (ต้องรัน migration 0023_freebies ก่อน)");
    throw new Error(`freebie lookup: ${existingRes.error.message}`);
  }
  const existing = existingRes.data as { id: string; file_path: string | null } | null;

  // File: only for kind 'file'; must live in this freebie's folder and really exist in the private bucket.
  let filePath = kind === "file" && input.file_path ? String(input.file_path) : null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  if (filePath) {
    if (!filePath.startsWith(freebieObjectPrefix(id)) || filePath.includes("..") || filePath.length > 300) throw new HttpError(400, "ไฟล์ไม่ถูกต้อง");
    fileName = (input.file_name ? String(input.file_name).trim().slice(0, 255) : "") || filePath.split("/").pop() || "file";
    if (filePath !== existing?.file_path) {
      const size = await objectSize(filePath);
      if (!size) throw new HttpError(409, "ไม่พบไฟล์ใน Storage กรุณาอัปโหลดไฟล์ใหม่");
      fileSize = size;
    } else {
      fileSize = input.file_size == null ? null : Math.max(0, Math.round(Number(input.file_size)) || 0);
    }
  } else {
    filePath = null;
  }

  const rawUrl = String(input.url ?? "").trim();
  const url = kind === "tool" && rawUrl ? rawUrl : null;
  if (url && !isFreebieUrl(url)) throw new HttpError(400, "ลิงก์เครื่องมือต้องขึ้นต้นด้วย https:// หรือ / (หน้าในเว็บนี้)");

  const status = input.status === "published" ? "published" : "draft";
  if (status === "published") {
    if (kind === "file" && !filePath) throw new HttpError(400, "อัปโหลดไฟล์ก่อนเผยแพร่");
    if (kind === "tool" && !url) throw new HttpError(400, "ใส่ลิงก์เครื่องมือก่อนเผยแพร่");
  }

  const row = {
    kind,
    title,
    subtitle: subtitle || null,
    description,
    cover_url: cover,
    file_path: filePath,
    file_name: fileName,
    file_size: fileSize,
    url,
    status,
    is_featured: status === "published" && !!input.is_featured,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    const { error } = await db.from("freebies").update(row).eq("id", id);
    if (error) throw new Error(`update freebie: ${error.message}`);
    if (existing.file_path && existing.file_path !== filePath) await removeObject(existing.file_path);
  } else {
    const { error } = await db.from("freebies").insert({ id, ...row });
    if (error) throw new Error(`create freebie: ${error.message}`);
  }
  await audit(admin.id, existing ? "freebie.update" : "freebie.create", "freebie", id, title);
  refresh(id);
  return { id };
}

/** Soft delete: the card and page disappear; the claim log stays (it is the lead history). */
export async function deleteFreebie(admin: Viewer, id: string) {
  if (!isUuid(id)) throw new HttpError(404, "ไม่พบของฟรีชิ้นนี้");
  const { error } = await adminDb().from("freebies").update({ deleted_at: new Date().toISOString(), status: "draft", is_featured: false }).eq("id", id);
  if (error) throw new Error(`delete freebie: ${error.message}`);
  await audit(admin.id, "freebie.delete", "freebie", id);
  refresh(id);
}

export async function setFreebieFeatured(admin: Viewer, id: string, featured: boolean) {
  if (!isUuid(id)) throw new HttpError(404, "ไม่พบของฟรีชิ้นนี้");
  const { data } = await adminDb().from("freebies").select("status").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!data) throw new HttpError(404, "ไม่พบของฟรีชิ้นนี้");
  if (featured && data.status !== "published") throw new HttpError(400, "ต้องเผยแพร่ก่อนจึงจะปักหมุดได้");
  const { error } = await adminDb().from("freebies").update({ is_featured: featured, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`feature freebie: ${error.message}`);
  await audit(admin.id, featured ? "freebie.feature" : "freebie.unfeature", "freebie", id);
  refresh(id);
}
