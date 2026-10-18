import type { PaymentMethod } from "@/lib/types";

/**
 * Membership plans — the single source of truth for price, period and payment methods.
 * Safe to import from both server and client code. There is deliberately no env var and no
 * Studio setting for the price: changing a price means changing this file (and the gateway product).
 */

export type PlanCode = "monthly" | "yearly";
/** The two methods offered at checkout. (Older rows may also be slip / apple_pay / google_pay / manual.) */
export type CheckoutMethod = "card" | "promptpay";

const DAY = 86_400_000;

export interface Plan {
  code: PlanCode;
  /** Short label: "รายเดือน" */
  label: string;
  /** Product name: "สมาชิกรายเดือน" */
  name: string;
  /** Price in THB (whole baht) */
  price: number;
  /** Exact membership period granted per payment */
  days: number;
  /** Value stored in payments.months (informational) */
  months: number;
  /** "เดือน" | "ปี" — for "990 บาท / เดือน" */
  unit: string;
}

export const PLANS: Record<PlanCode, Plan> = {
  monthly: { code: "monthly", label: "รายเดือน", name: "สมาชิกรายเดือน", price: 990, days: 30, months: 1, unit: "เดือน" },
  yearly: { code: "yearly", label: "รายปี", name: "สมาชิกรายปี", price: 4990, days: 365, months: 12, unit: "ปี" },
};

export const PLAN_LIST: Plan[] = [PLANS.monthly, PLANS.yearly];
/** Used when a link has no (or a bad) ?plan= — the cheaper commitment, so nobody is surprised by the total. */
export const DEFAULT_PLAN: PlanCode = "monthly";
export const CURRENCY = "THB";

export function isPlanCode(v: unknown): v is PlanCode {
  return v === "monthly" || v === "yearly";
}

/** Reads ?plan= (string or array) and falls back to the default. */
export function planFromParam(v: string | string[] | undefined | null): PlanCode {
  const s = Array.isArray(v) ? v[0] : v;
  return isPlanCode(s) ? s : DEFAULT_PLAN;
}

// ───────── Derived numbers (never hard-coded) ─────────

/** What the yearly plan costs per month, rounded to whole baht (4,990 / 12 ≈ 416). */
export function yearlyPerMonth() {
  return Math.round(PLANS.yearly.price / 12);
}

/** Yearly vs paying monthly for 12 months: { base: 11,880, saved: 6,890, percent: 58 } */
export function yearlySavings() {
  const base = PLANS.monthly.price * 12;
  const saved = Math.max(0, base - PLANS.yearly.price);
  return { base, saved, percent: base > 0 ? Math.round((saved / base) * 100) : 0 };
}

/** Membership end date if a payment of `plan` lands now: extends from the current expiry when still active. */
export function expiryAfter(plan: Plan, currentExpiresAt: string | null, now = Date.now()) {
  const base = Math.max(now, currentExpiresAt ? new Date(currentExpiresAt).getTime() : 0);
  return new Date(base + plan.days * DAY).toISOString();
}

// ───────── Payment methods ─────────

export interface MethodInfo {
  code: CheckoutMethod;
  /** Full label used on the checkout page */
  label: string;
  /** Card auto-renews each period; PromptPay is a one-time pass. */
  autoRenew: boolean;
}

export const METHODS: Record<CheckoutMethod, MethodInfo> = {
  card: { code: "card", label: "บัตรเครดิต/เดบิต", autoRenew: true },
  promptpay: { code: "promptpay", label: "พร้อมเพย์ (PromptPay)", autoRenew: false },
};
export const METHOD_LIST: MethodInfo[] = [METHODS.card, METHODS.promptpay];
export const DEFAULT_METHOD: CheckoutMethod = "card";
/** Plain text chips shown on the card option (no brand logos). */
export const CARD_NETWORKS = ["Visa", "Mastercard", "JCB"] as const;

export function isCheckoutMethod(v: unknown): v is CheckoutMethod {
  return v === "card" || v === "promptpay";
}

/** Every value the payments.method column may hold (the webhook rejects anything else). */
export const PAYMENT_METHODS = ["card", "promptpay", "slip", "apple_pay", "google_pay", "manual"] as const satisfies readonly PaymentMethod[];
export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return typeof v === "string" && (PAYMENT_METHODS as readonly string[]).includes(v);
}

/** Labels for the payment history (account page, Studio). */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: "บัตรเครดิต/เดบิต",
  promptpay: "PromptPay",
  slip: "โอนเงิน (แนบสลิป)",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
  manual: "เพิ่มโดยผู้ดูแล",
};

/** "ต่ออายุอัตโนมัติ" for card, "ต้องต่ออายุเอง" for everything else. */
export function renewalLabel(method: PaymentMethod | null | undefined) {
  return method === "card" ? "ต่ออายุอัตโนมัติ" : "ต้องต่ออายุเอง";
}

/** Which plan an existing payment row bought — from its plan column, else guessed from months (older rows). */
export function planOfPayment(p: { plan?: string | null; months: number }): Plan | null {
  if (isPlanCode(p.plan)) return PLANS[p.plan];
  if (p.months >= 12) return PLANS.yearly;
  if (p.months === 1) return PLANS.monthly;
  return null;
}
