import "server-only";
import { after } from "next/server";
import { adminDb } from "@/lib/supabase/clients";
import { renderPurchaseEmail, sendEmails, siteUrl } from "./email";
import { formatBaht } from "@/lib/shop";

/**
 * “ได้รับสินค้าแล้ว” — the transactional email sent when a purchase is NEWLY granted (webhook, claim, Studio grant).
 * It is a receipt, so it goes out even when the buyer turned off marketing email (profiles.email_updates).
 * Resend's Idempotency-Key is the purchase id, so a retry or a race can never send it twice.
 */

const BUDGET_MS = 4_000;

/** Needs only the sender; the unsubscribe secret is for marketing mail. */
const canSend = () => !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim();

/** Never throws and gives up after ~4s: an email problem must not break (or slow) a grant. */
export async function sendPurchaseEmail(purchaseId: string): Promise<void> {
  try {
    if (!canSend()) return;
    const db = adminDb();
    const { data: pur } = await db.from("purchases").select("user_id, product_id, amount, status").eq("id", purchaseId).maybeSingle();
    if (!pur || pur.status !== "paid") return;
    const [{ data: prod }, { data: prof }, { data: auth }] = await Promise.all([
      db.from("products").select("title").eq("id", pur.product_id).maybeSingle(),
      db.from("profiles").select("display_name").eq("id", pur.user_id).maybeSingle(),
      db.auth.admin.getUserById(pur.user_id),
    ]);
    const email = auth.user?.email?.trim();
    if (!prod || !email) return;
    const amount = Number(pur.amount);
    const { html, text } = renderPurchaseEmail({
      name: (prof?.display_name as string) || email.split("@")[0],
      email,
      title: prod.title as string,
      amountLabel: amount > 0 ? `ชำระแล้ว ${formatBaht(amount)}` : "ได้รับสิทธิ์จากทีมงาน",
      url: siteUrl("/library/purchases"),
    });
    const send = sendEmails([{ to: email, subject: `ได้รับสินค้าแล้ว: ${prod.title as string}`, html, text }], {
      idempotencyPrefix: `purchase-${purchaseId}`,
      deadlineMs: Date.now() + BUDGET_MS,
    });
    const r = await Promise.race([send, new Promise<null>((resolve) => setTimeout(() => resolve(null), BUDGET_MS))]);
    if (!r) console.warn(`purchase email: timed out for ${purchaseId}`);
    else if (r.failed) console.warn(`purchase email: ${r.error ?? "failed"} (${purchaseId})`);
  } catch (e) {
    console.error("purchase email failed", purchaseId, e);
  }
}

/** Fire after the response (so Kohort / the browser never wait for Resend); falls back to fire-and-forget outside a request. */
export function queuePurchaseEmail(purchaseId: string): void {
  try {
    after(() => sendPurchaseEmail(purchaseId));
  } catch {
    void sendPurchaseEmail(purchaseId);
  }
}
