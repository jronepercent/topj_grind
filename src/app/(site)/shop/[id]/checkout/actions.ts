"use server";

import { HttpError, requireUser } from "@/lib/server/auth";
import { startCheckout } from "@/lib/server/payments";
import { getProduct } from "@/lib/server/shop";
import { isUuid } from "@/lib/server/queries";
import { isCheckoutMethod } from "@/lib/plans";
import { isSafePath } from "@/lib/shop";

export type StartProductCheckoutResult = { ok: true; url: string; external: boolean } | { ok: false; error: string };

/** Everything is re-validated here — the browser only suggests a product and a method. */
export async function startProductCheckoutAction(productId: string, method: string, from?: string): Promise<StartProductCheckoutResult> {
  try {
    const viewer = await requireUser();
    if (!isUuid(productId) || !isCheckoutMethod(method)) return { ok: false, error: "เลือกช่องทางชำระเงินอีกครั้ง" };
    const product = await getProduct(productId, viewer);
    if (!product || product.status !== "published") return { ok: false, error: "สินค้านี้ไม่พร้อมขายแล้ว" };
    if (product.owned) return { ok: false, error: "คุณเป็นเจ้าของสินค้านี้แล้ว เปิดดูได้ที่คลังของฉัน" };
    const r = await startCheckout({ kind: "product", userId: viewer.id, productId, method, from: isSafePath(from) ? from : undefined });
    return r.ok ? { ok: true, url: r.url, external: r.external } : { ok: false, error: r.error };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" };
  }
}
