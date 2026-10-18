import "server-only";
import { isDemoMode, rateLimit } from "./auth";
import type { CheckoutMethod, PlanCode } from "@/lib/plans";

/**
 * Gateway-neutral checkout seam.
 *
 * The site never touches card data: "start checkout" asks a gateway adapter for a URL and the browser goes there.
 * Confirmation comes back separately through POST /api/webhooks/payment (HMAC signed, see applyPayment()).
 *
 * To add a real gateway (Stripe Checkout, Omise, …): write a `PaymentGateway` that creates a hosted checkout
 * session for { plan | product, method } with the user id as client reference, return its URL, and select it in `resolveGateway()`.
 * Two things can be bought: a membership plan (kind "plan", the default) or a shop product (kind "product", one-off).
 * Then point that gateway's webhook at our endpoint (or translate its event into our payload there).
 */

interface CheckoutBase {
  /** Only the id leaves the server — never email or other personal data. */
  userId: string;
  method: CheckoutMethod;
  /** Same-origin path to return to after paying (already validated). */
  from?: string;
}

/** Membership plan (the original shape — `kind` may be left out) or a one-off shop product. */
export type CheckoutInput =
  | (CheckoutBase & { kind?: "plan"; plan: PlanCode })
  | (CheckoutBase & { kind: "product"; productId: string });

export interface CheckoutSession {
  url: string;
  /** true = leaves our site (use a full navigation), false = same-origin path */
  external: boolean;
}

export interface PaymentGateway {
  readonly id: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutSession>;
}

export type CheckoutResult =
  | ({ ok: true } & CheckoutSession)
  | { ok: false; error: string; reason: "unavailable" | "rate_limited" };

export const CHECKOUT_UNAVAILABLE = "ระบบชำระเงินยังไม่เปิด";

// ───────── Adapters ─────────

/** Demo: skip the gateway and land on the success page, which waits for `npm run webhook:test`. */
const demoGateway: PaymentGateway = {
  id: "demo",
  async createCheckout(input) {
    const q = new URLSearchParams({ demo: "1", method: input.method });
    if (input.kind === "product") {
      if (input.from) q.set("from", input.from);
      return { url: `/shop/${encodeURIComponent(input.productId)}/success?${q}`, external: false };
    }
    q.set("plan", input.plan);
    if (input.from) q.set("from", input.from);
    return { url: `/membership/success?${q}`, external: false };
  },
};

/** A configured payment URL (http/https only), or null when unset / malformed. */
function parseUrl(raw: string | undefined) {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/**
 * Which hosted page a purchase goes to. Most specific first:
 *   PAYMENT_URL_<PLAN>_PROMPTPAY  (e.g. Kohort's one-time "ลูกค้าต่ออายุเอง" product, PromptPay buyers only)
 *   PAYMENT_URL_<PLAN>            (the plan's link — Kohort's auto-renewing card product)
 *   PAYMENT_URL                   (one link for everything)
 * Products always use PAYMENT_URL.
 */
function paymentUrlFor(input: CheckoutInput) {
  const general = parseUrl(process.env.PAYMENT_URL);
  if (input.kind === "product") return general;
  const plan = input.plan === "yearly" ? "YEARLY" : "MONTHLY";
  const perMethod = input.method === "promptpay" ? parseUrl(process.env[`PAYMENT_URL_${plan}_PROMPTPAY`]) : null;
  return perMethod ?? parseUrl(process.env[`PAYMENT_URL_${plan}`]) ?? general;
}

/** Generic hosted payment page. It gets only an opaque user id, the plan (or product id) and the method (hosts like Kohort ignore unknown params). */
const redirectGateway: PaymentGateway = {
  id: "redirect",
  async createCheckout(input) {
    const base = paymentUrlFor(input);
    if (!base) throw new Error(`no payment URL configured for ${input.kind === "product" ? "products" : input.plan}`);
    const u = new URL(base);
    u.searchParams.set("uid", input.userId);
    if (input.kind === "product") u.searchParams.set("product", input.productId);
    else u.searchParams.set("plan", input.plan);
    u.searchParams.set("method", input.method);
    return { url: u.toString(), external: true };
  },
};

/** Any payment URL env var wins over demo mode (as before), so a configured production site can never fall into the demo flow. */
export function resolveGateway(): PaymentGateway | null {
  const vars = [
    process.env.PAYMENT_URL,
    process.env.PAYMENT_URL_MONTHLY,
    process.env.PAYMENT_URL_YEARLY,
    process.env.PAYMENT_URL_MONTHLY_PROMPTPAY,
    process.env.PAYMENT_URL_YEARLY_PROMPTPAY,
  ];
  if (vars.some((v) => v?.trim())) return vars.some((v) => parseUrl(v)) ? redirectGateway : null;
  return isDemoMode() ? demoGateway : null;
}

/** For the UI: is paying possible at all, and is it the demo flow? */
export function checkoutMode(): "live" | "demo" | "closed" {
  const g = resolveGateway();
  return !g ? "closed" : g.id === "demo" ? "demo" : "live";
}

// ───────── Entry point ─────────

/** Rate-limited: a handful of attempts per minute per user is plenty for a human. */
export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!rateLimit(`checkout:${input.userId}`, 10, 60_000)) {
    return { ok: false, reason: "rate_limited", error: "ทำรายการถี่เกินไป รอสักครู่แล้วลองใหม่" };
  }
  const gateway = resolveGateway();
  if (!gateway) return { ok: false, reason: "unavailable", error: CHECKOUT_UNAVAILABLE };
  try {
    return { ok: true, ...(await gateway.createCheckout(input)) };
  } catch (e) {
    console.error(`checkout via ${gateway.id} failed`, e);
    return { ok: false, reason: "unavailable", error: "เริ่มชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}
