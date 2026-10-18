"use server";

import { getViewer } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/queries";
import { hasPurchased } from "@/lib/server/shop";

/** Polled by /shop/[id]/success until the payment webhook has recorded the purchase. */
export async function productOwnedAction(productId: string): Promise<{ ok: true; owned: boolean } | { ok: false }> {
  try {
    const v = await getViewer();
    if (!v || !isUuid(productId)) return { ok: false };
    return { ok: true, owned: await hasPurchased(v.id, productId) };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}
