"use client";
import { accessToken } from "@/lib/supabase/browser";
import type { ProductFileTicket } from "@/app/studio/shop/actions";

/** Supabase Storage's resumable endpoint accepts exactly this chunk size. */
const SUPABASE_CHUNK = 6 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000, 30000, 60000];

/** Thai message for a failed TUS request. */
function uploadErrorMessage(err: unknown) {
  const status = (err as { originalResponse?: { getStatus?: () => number } } | null)?.originalResponse?.getStatus?.();
  if (status === 413) return "ไฟล์ใหญ่เกินที่ Storage รับได้ (ตรวจ Upload file size limit ใน Supabase)";
  if (status === 401 || status === 403) return "ไม่มีสิทธิ์อัปโหลด กรุณาเข้าสู่ระบบใหม่";
  if (status === 409) return "มีไฟล์ชื่อนี้อยู่แล้ว ลองอัปโหลดใหม่";
  return "อัปโหลดไม่สำเร็จ";
}

export interface ProductUpload {
  /** Resolves with the object name once every byte is in Storage; rejects with a Thai message. */
  done: Promise<string>;
  abort: () => void;
}

/**
 * Product file → private `products` bucket over the resumable (TUS) endpoint, as the signed-in admin.
 * Same approach as podcast audio (src/components/studio/upload-store.ts): 6 MB chunks, retries, a fresh access token per request.
 */
export function uploadProductFile(file: File, ticket: ProductFileTicket, productId: string, onProgress: (ratio: number) => void): ProductUpload {
  let aborter: (() => void) | null = null;
  let stopped = false;
  let cancel: () => void = () => {};
  const done = new Promise<string>((resolve, reject) => {
    cancel = () => reject(new Error("ยกเลิกการอัปโหลดแล้ว"));
    (async () => {
      const tus = await import("tus-js-client");
      // The object name goes in the metadata; it is swapped for the earlier name below if this file is being resumed.
      const metadata = {
        bucketName: ticket.bucket,
        objectName: ticket.objectName,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      };
      const upload = new tus.Upload(file, {
        endpoint: ticket.endpoint,
        retryDelays: RETRY_DELAYS,
        chunkSize: SUPABASE_CHUNK,
        headers: { "x-upsert": "false" },
        onBeforeRequest: async (req) => {
          req.setHeader("Authorization", `Bearer ${await accessToken()}`);
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata,
        onProgress: (sent, total) => onProgress(total ? sent / total : 0),
        onError: (err) => {
          console.error(err);
          reject(new Error(err instanceof Error && err.message.startsWith("หมดเวลา") ? err.message : uploadErrorMessage(err)));
        },
        onSuccess: () => resolve(metadata.objectName),
      });
      aborter = () => void upload.abort();
      if (stopped) return reject(new Error("ยกเลิกการอัปโหลดแล้ว"));
      // Resume if this exact file was partially uploaded to THIS product before (network drop, tab reload).
      const previous = await upload.findPreviousUploads();
      const resumable = previous.find((p) => p.metadata?.objectName?.startsWith(`${productId}/`) && p.metadata.bucketName === ticket.bucket);
      if (resumable) {
        metadata.objectName = resumable.metadata.objectName;
        upload.resumeFromPreviousUpload(resumable);
      }
      upload.start();
    })().catch((e) => reject(e instanceof Error ? e : new Error("อัปโหลดไม่สำเร็จ")));
  });
  return {
    done,
    abort: () => {
      stopped = true;
      aborter?.();
      cancel();
    },
  };
}
