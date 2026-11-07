"use server";

import { HttpError, requireAdmin } from "@/lib/server/auth";
import { limit, run } from "@/lib/server/action-utils";
import { signImageUpload } from "@/lib/server/images";
import { PRODUCT_BUCKET } from "@/lib/server/shop";
import { deleteFreebie, newFreebieObject, saveFreebie, setFreebieFeatured, type FreebieInput } from "@/lib/server/freebies";
import { isUuid } from "@/lib/server/queries";
import type { ProductFileTicket } from "@/app/studio/shop/actions";

/** Studio-only Server Actions for ของฟรี. Every one starts with requireAdmin(). */

/** Cover pictures go to the public `thumbnails` bucket under free/ (same as products, articles, …). */
export async function signFreebieImageAction(contentType: string) {
  return run(async () => {
    const v = await requireAdmin();
    limit(`freebie-image:${v.id}`, 40, 60_000);
    return await signImageUpload("free", String(contentType));
  });
}

/** Step 1 of a file upload: a fresh unguessable object name under free/<id>/ in the private `products` bucket. */
export async function createFreebieFileTicketAction(id: string, fileName: string) {
  return run(async (): Promise<ProductFileTicket> => {
    const v = await requireAdmin();
    limit(`freebie-file:${v.id}`, 20, 60_000);
    if (!isUuid(id)) throw new HttpError(400, "รหัสไม่ถูกต้อง");
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
    return {
      bucket: PRODUCT_BUCKET,
      objectName: newFreebieObject(id, String(fileName ?? "")),
      endpoint: `${base.replace(/^(https:\/\/[a-z0-9]+)\.supabase\.co$/, "$1.storage.supabase.co")}/storage/v1/upload/resumable`,
    };
  });
}

export async function saveFreebieAction(input: FreebieInput) {
  return run(async () => {
    const v = await requireAdmin();
    limit(`freebie-save:${v.id}`, 60, 60_000);
    return await saveFreebie(v, input);
  });
}

export async function deleteFreebieAction(id: string) {
  return run(async () => {
    await deleteFreebie(await requireAdmin(), id);
  });
}

export async function setFreebieFeaturedAction(id: string, featured: boolean) {
  return run(async () => {
    await setFreebieFeatured(await requireAdmin(), id, !!featured);
  });
}
