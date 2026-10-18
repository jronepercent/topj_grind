/** Browser-side image helpers for ชุมชน / บทความ uploads. */

export const ACCEPT_IMAGES = "image/png,image/jpeg,image/webp";
const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_EDGE = 2048;
const KEEP_UNDER = 900 * 1024;

export interface PreparedImage {
  blob: Blob;
  contentType: string;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
}

/**
 * Downscale to ≤ 2048px on the long edge and re-encode (WebP, falling back to JPEG).
 * Small files that already fit are uploaded as they are.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!OK_TYPES.includes(file.type)) throw new Error("รองรับเฉพาะรูป JPG, PNG หรือ WebP");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("เปิดรูปนี้ไม่ได้ ลองรูปอื่น");
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= KEEP_UNDER) return { blob: file, contentType: file.type };
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
    ctx.drawImage(bmp, 0, 0, w, h);
    let out = await toBlob(canvas, "image/webp", 0.86);
    if (!out || out.type !== "image/webp") {
      // JPEG has no alpha: flatten onto white first
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      out = await toBlob(canvas, "image/jpeg", 0.86);
    }
    if (!out) throw new Error("ย่อรูปไม่สำเร็จ");
    // never make a small file bigger
    if (scale === 1 && out.size >= file.size) return { blob: file, contentType: file.type };
    return { blob: out, contentType: out.type };
  } finally {
    bmp.close();
  }
}

/** PUT a prepared image to a signed Storage URL (from signImageUpload). */
export async function putImage(uploadUrl: string, img: PreparedImage) {
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": img.contentType, "x-upsert": "false" }, body: img.blob });
  if (!res.ok) throw new Error(res.status === 413 ? "ไฟล์ใหญ่เกินที่ Storage รับได้" : "อัปโหลดรูปไม่สำเร็จ");
}
