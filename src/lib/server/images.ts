import "server-only";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/supabase/clients";
import { HttpError } from "./auth";

const BUCKET = "thumbnails";
const EXT: Record<string, string> = { png: "png", jpeg: "jpg", webp: "webp" };

/**
 * Studio picks of whole image files go straight from the browser to Storage (no size cap here,
 * and no trip through the Server Action body limit). Returns where to PUT the file and its public URL.
 */
export async function signImageUpload(folder: string, contentType: string) {
  const m = contentType.match(/^image\/(png|jpeg|webp)$/);
  if (!m) throw new HttpError(400, "รองรับเฉพาะรูป PNG, JPG หรือ WebP");
  const path = `${folder}/${randomUUID()}.${EXT[m[1]]}`;
  const bucket = adminDb().storage.from(BUCKET);
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, "เตรียมอัปโหลดรูปไม่สำเร็จ");
  return { uploadUrl: data.signedUrl, publicUrl: bucket.getPublicUrl(path).data.publicUrl };
}

/**
 * Image fields arrive from the browser as data URLs (uploads, captured video frames).
 * They go to Storage and only the public URL is saved — a data URL in a row is copied into
 * every page, the catalogue cache and notifications. Existing http(s) URLs pass through.
 */
export async function storeImage(value: string | null | undefined, folder: string, maxBytes = 2 * 1024 * 1024): Promise<string | null> {
  const v = value?.trim();
  if (!v) return null;
  if (!v.startsWith("data:")) {
    if (!/^https?:\/\//i.test(v)) throw new HttpError(400, "ลิงก์รูปภาพไม่ถูกต้อง");
    return v;
  }
  const m = v.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/);
  if (!m) throw new HttpError(400, "รองรับเฉพาะรูป PNG, JPG หรือ WebP");
  const bytes = Buffer.from(m[3], "base64");
  if (bytes.length > maxBytes) throw new HttpError(400, `รูปใหญ่เกิน ${Math.round(maxBytes / 1024 / 1024)}MB`);
  const path = `${folder}/${randomUUID()}.${EXT[m[2]]}`;
  const { error } = await adminDb().storage.from(BUCKET).upload(path, bytes, { contentType: m[1], upsert: true });
  if (error) throw new HttpError(500, "อัปโหลดรูปไม่สำเร็จ");
  return adminDb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
