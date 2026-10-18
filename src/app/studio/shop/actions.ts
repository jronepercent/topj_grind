"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/auth";
import { limit, run } from "@/lib/server/action-utils";
import { signImageUpload } from "@/lib/server/images";
import { deleteProduct, grantProduct, newProductObject, PRODUCT_BUCKET, refundPurchase, saveProduct, setProductFeatured, type ProductInput } from "@/lib/server/shop";
import { isUuid } from "@/lib/server/queries";
import { HttpError } from "@/lib/server/auth";

/** Studio-only Server Actions for ร้านค้า. Every one starts with requireAdmin(). */

export interface ProductFileTicket {
  bucket: string;
  objectName: string;
  /** Supabase Storage's resumable (TUS) endpoint. */
  endpoint: string;
}

/** Cover / gallery pictures go to the public `thumbnails` bucket under products/ (same as articles, hero, …). */
export async function signProductImageAction(contentType: string) {
  return run(async () => {
    const v = await requireAdmin();
    limit(`product-image:${v.id}`, 40, 60_000);
    return await signImageUpload("products", String(contentType));
  });
}

/** Step 1 of a file upload: a fresh unguessable object name in the private `products` bucket. */
export async function createProductFileTicketAction(productId: string, fileName: string) {
  return run(async (): Promise<ProductFileTicket> => {
    const v = await requireAdmin();
    limit(`product-file:${v.id}`, 20, 60_000);
    if (!isUuid(productId)) throw new HttpError(400, "รหัสสินค้าไม่ถูกต้อง");
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base) throw new Error("ยังไม่ได้ตั้งค่า Supabase");
    return {
      bucket: PRODUCT_BUCKET,
      objectName: newProductObject(productId, String(fileName ?? "")),
      // Supabase recommends the dedicated storage hostname for large uploads (hosted projects only).
      endpoint: `${base.replace(/^(https:\/\/[a-z0-9]+)\.supabase\.co$/, "$1.storage.supabase.co")}/storage/v1/upload/resumable`,
    };
  });
}

export async function saveProductAction(input: ProductInput) {
  return run(async () => {
    const v = await requireAdmin();
    limit(`product-save:${v.id}`, 60, 60_000);
    return await saveProduct(v, input);
  });
}

export async function deleteProductAction(id: string) {
  return run(async () => {
    await deleteProduct(await requireAdmin(), id);
  });
}

export async function setProductFeaturedAction(id: string, featured: boolean) {
  return run(async () => {
    await setProductFeatured(await requireAdmin(), id, !!featured);
  });
}

/** “ให้สิทธิ์ลูกค้า”: record a manual purchase (no payment) for the customer with this email. */
export async function grantProductAction(productId: string, email: string) {
  return run(async () => {
    const v = await requireAdmin();
    limit(`product-grant:${v.id}`, 30, 60_000);
    return await grantProduct(v, productId, email);
  });
}

export async function refundPurchaseAction(purchaseId: string) {
  return run(async () => {
    await refundPurchase(await requireAdmin(), purchaseId);
    revalidatePath("/library");
  });
}
