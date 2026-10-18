import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/clients";
import { CURRENCY, PLANS, PLAN_LIST, isPaymentMethod, isPlanCode, type PlanCode } from "@/lib/plans";
import type { PaymentMethod } from "@/lib/types";
import { isMemberUser, rateLimit } from "./auth";
import { USER_NOT_FOUND_REASON, applyPayment, applyPurchase, type PaymentPayload } from "./mutations";

/**
 * Kohort (kohort.me) sends payment events from its automation builder, and we don't know its exact field names yet.
 * So this file is deliberately tolerant: it flattens whatever body arrives and looks for the usual names.
 * What comes out is the same PaymentPayload the HMAC webhook uses, so applyPayment() / applyPurchase() do the real work.
 */

// ───────────────────────── Body parsing ─────────────────────────

/** JSON, application/x-www-form-urlencoded or multipart/form-data → a plain object. null = unparseable. */
export async function parseKohortBody(raw: string, contentType: string): Promise<Record<string, unknown> | null> {
  const ct = contentType.toLowerCase();
  const fromJson = (): Record<string, unknown> | null => {
    try {
      let v: unknown = JSON.parse(raw);
      if (Array.isArray(v) && v.length === 1) v = v[0];
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const fromForm = (): Record<string, unknown> | null => {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of new URLSearchParams(raw)) obj[k] = v;
    return Object.keys(obj).length ? obj : null;
  };
  const fromMultipart = async (): Promise<Record<string, unknown> | null> => {
    try {
      const fd = await new Response(raw, { headers: { "content-type": contentType } }).formData();
      const obj: Record<string, unknown> = {};
      fd.forEach((v, k) => {
        if (typeof v === "string") obj[k] = v;
      });
      return Object.keys(obj).length ? obj : null;
    } catch {
      return null;
    }
  };

  if (!raw.trim()) return {}; // everything may be in the URL query
  if (ct.includes("json")) return fromJson();
  if (ct.includes("x-www-form-urlencoded")) return fromForm();
  if (ct.includes("multipart/form-data")) return fromMultipart();
  // text/plain or no content type: Kohort may label a JSON body however it likes.
  return fromJson() ?? (raw.includes("=") ? fromForm() : null);
}

// ───────────────────────── Field lookup ─────────────────────────

type Scalar = string | number | boolean;
interface Leaf {
  key: string;
  parent: string;
  depth: number;
  value: Scalar;
}

const snake = (k: string) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** An unreplaced merge tag such as "{{email}}" means Kohort had no value for it. */
const isPlaceholder = (s: string) => /^\{\{.*\}\}$/.test(s.trim()) || /^\{%.*%\}$/.test(s.trim()) || /^%7B%7B/i.test(s.trim());

function flatten(v: unknown, parent: string, depth: number, out: Leaf[], key = "") {
  if (depth > 5 || out.length > 400) return;
  if (typeof v === "string") {
    const s = v.trim();
    // Some tools put a whole JSON object into one form field.
    if (key && s.startsWith("{") && s.endsWith("}")) {
      try {
        const inner = JSON.parse(s);
        if (inner && typeof inner === "object") return flatten(inner, key, depth + 1, out);
      } catch {
        /* plain string */
      }
    }
    if (key && s && !isPlaceholder(s)) out.push({ key, parent, depth, value: s });
  } else if (typeof v === "number" || typeof v === "boolean") {
    if (key && (typeof v !== "number" || Number.isFinite(v))) out.push({ key, parent, depth, value: v });
  } else if (Array.isArray(v)) {
    v.slice(0, 10).forEach((x) => flatten(x, key || parent, depth + 1, out));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 60)) flatten(x, key || parent, depth + 1, out, snake(k));
  }
}

/**
 * Body fields first (top-level before nested), then the URL query as a fallback — Kohort's webhook action only lets us
 * put merge tags in the URL, so the query is often all we get, but a real body value wins when both exist.
 */
function leavesOf(body: Record<string, unknown>, query: Record<string, string>): Leaf[][] {
  const b: Leaf[] = [];
  flatten(body, "", 0, b);
  const q: Leaf[] = [];
  flatten(query, "", 0, q);
  const byDepth = (x: Leaf, y: Leaf) => x.depth - y.depth; // stable
  return [b.sort(byDepth), q.sort(byDepth)];
}

/** Leaves in priority order: body then query; for each candidate name, top-level first, then nested at any depth. */
function* find(groups: Leaf[][], names: string[]) {
  for (const leaves of groups) {
    for (const n of names) {
      for (const l of leaves) if (l.key === n && l.depth === 0) yield l;
      for (const l of leaves) if (l.key === n && l.depth > 0) yield l;
    }
  }
}

// ───────────────────────── Value parsers ─────────────────────────

const EMAIL_RE = /[^\s<>"',;:()]+@[^\s<>"',;:()]+\.[^\s<>"',;:()]+/;
function parseEmail(v: Scalar): string | null {
  const m = String(v).match(EMAIL_RE);
  return m && m[0].length <= 254 ? m[0].toLowerCase() : null;
}

/** "฿990", "990.00", "4,990", "THB 990", 990 → number. */
export function parseAmount(v: Scalar): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const PLAN_PRICES = PLAN_LIST.map((p) => p.price);
const planByPrice = (n: number): PlanCode | null => PLAN_LIST.find((p) => Math.abs(p.price - n) < 0.005)?.code ?? null;

/** Satang / cents: 99000 → 990, but only when that lands exactly on a plan price (or the product price, see below). */
function fixMinorUnits(n: number, prices: number[]) {
  if (prices.some((p) => Math.abs(p - n) < 0.005)) return n;
  const major = n / 100;
  return prices.some((p) => Math.abs(p - major) < 0.005) ? major : n;
}

function planFromText(s: string): PlanCode | null {
  const t = s.toLowerCase();
  if (/ปี|year|annual/.test(t)) return "yearly";
  if (/เดือน|month/.test(t)) return "monthly";
  return null;
}

function parseMethod(v: Scalar | undefined): PaymentMethod {
  const t = String(v ?? "").toLowerCase();
  if (isPaymentMethod(t)) return t;
  if (/promptpay|prompt_pay|พร้อมเพย์|\bqr/.test(t)) return "promptpay";
  if (/slip|bank|transfer|โอน|สลิป/.test(t)) return "slip";
  return "card";
}

function parseDate(v: Scalar, now: number): string | null {
  let ms: number;
  if (typeof v === "number" || (typeof v === "string" && /^\d{9,13}$/.test(v.trim()))) {
    const n = Number(v);
    ms = n < 1e11 ? n * 1000 : n; // unix seconds or milliseconds
  } else {
    ms = Date.parse(String(v));
  }
  if (!Number.isFinite(ms) || ms < Date.UTC(2020, 0, 1) || ms > now + 86_400_000) return null;
  return new Date(ms).toISOString();
}

// ───────────────────────── Normalizing ─────────────────────────

const EMAIL_KEYS = ["email", "customer_email", "buyer_email", "user_email", "payer_email", "member_email"];
// Kohort's own merge tags: {{value}} (amount), {{currency}}, {{product_name}}, {{event_id}}; the rest are guesses for other shapes.
const AMOUNT_KEYS = ["amount", "value", "total", "price", "amount_paid", "amount_total", "paid_amount", "grand_total", "total_amount"];
const REF_KEYS = ["reference", "event_id", "payment_id", "transaction_id", "order_id", "charge_id", "invoice_id", "payment_intent", "ref"];
/** A bare `id` only counts at the top level or inside an object that is clearly the payment itself. */
const ID_PARENTS = new Set(["payment", "transaction", "order", "invoice", "charge", "data", "purchase"]);
const PLAN_TEXT_KEYS = ["plan", "plan_name", "product", "product_name", "product_title", "item", "item_name", "title", "description"];
const TEXT_PARENTS = new Set(["product", "plan", "item", "price", "subscription", "line_item"]);
const METHOD_KEYS = ["method", "payment_method", "payment_method_type", "payment_type", "payment_channel", "channel"];
const DATE_KEYS = ["paid_at", "created_at", "timestamp", "paid_date", "payment_date", "date"];

export interface KohortPayment {
  payload: PaymentPayload;
  /** What we store in payment_errors.payload / payments.raw — flat fields (used by the auto-claim) + a slimmed copy of the original. */
  raw: Record<string, unknown>;
  referenceGenerated: boolean;
  paidAtGiven: boolean;
  /** Why we could not tell who paid for what (no email / plan / amount), or null when it looks complete. */
  unmatched: string | null;
}

/** A small, bounded copy of the original body so a payment_errors row stays readable and cheap. */
function slim(v: unknown, depth = 0): unknown {
  if (typeof v === "string") return v.length > 300 ? `${v.slice(0, 300)}…` : v;
  if (v === null || typeof v === "number" || typeof v === "boolean") return v;
  if (depth >= 4) return "[…]";
  if (Array.isArray(v)) return v.slice(0, 10).map((x) => slim(x, depth + 1));
  if (typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 40).map(([k, x]) => [k.slice(0, 60), slim(x, depth + 1)]));
  }
  return String(v).slice(0, 100);
}

export function normalizeKohort(body: Record<string, unknown>, query: Record<string, string> = {}, now = Date.now()): KohortPayment {
  const leaves = leavesOf(body, query);
  const all = leaves.flat();

  let email: string | undefined;
  for (const l of find(leaves, EMAIL_KEYS)) {
    const e = parseEmail(l.value);
    if (e) {
      email = e;
      break;
    }
  }

  // Unknown payload shape: any value anywhere that looks like an email address.
  if (!email) {
    for (const l of all) {
      if (typeof l.value !== "string") continue;
      const e = parseEmail(l.value);
      if (e) {
        email = e;
        break;
      }
    }
  }

  let amount: number | undefined;
  for (const l of find(leaves, AMOUNT_KEYS)) {
    const n = parseAmount(l.value);
    if (n !== null) {
      amount = n;
      break;
    }
  }

  if (amount === undefined) {
    for (const l of all) {
      if (!/amount|total|price/.test(l.key) || /tax|discount|fee|count|vat|currency/.test(l.key)) continue;
      const n = parseAmount(l.value);
      if (n !== null) {
        amount = n;
        break;
      }
    }
  }

  let reference: string | undefined;
  for (const l of find(leaves, REF_KEYS)) {
    reference = String(l.value).trim().slice(0, 200);
    break;
  }
  if (!reference) {
    const id = all.find((l) => l.key === "id" && (l.depth === 0 || ID_PARENTS.has(l.parent)));
    if (id) reference = String(id.value).trim().slice(0, 200);
  }
  if (!reference) {
    const id = all.find((l) => /^(payment|transaction|order|invoice|charge|purchase|receipt)(_?(id|no|number))?$/.test(l.key));
    if (id) reference = String(id.value).trim().slice(0, 200);
  }

  const productRaw = [...find(leaves, ["product_id"])].map((l) => String(l.value).trim())[0];
  const product_id = productRaw && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productRaw) ? productRaw : undefined;

  // Plan: an explicit monthly/yearly, else words in the product text, else the amount.
  let plan: PlanCode | undefined;
  if (!product_id) {
    const explicit = [...find(leaves, ["plan"])].map((l) => String(l.value).trim().toLowerCase()).find(isPlanCode);
    plan = explicit as PlanCode | undefined;
    if (!plan) {
      for (const l of find(leaves, PLAN_TEXT_KEYS)) {
        const p = planFromText(String(l.value));
        if (p) {
          plan = p;
          break;
        }
      }
      if (!plan) {
        for (const l of all) {
          if (l.key === "name" && TEXT_PARENTS.has(l.parent)) {
            const p = planFromText(String(l.value));
            if (p) {
              plan = p;
              break;
            }
          }
        }
      }
    }
    if (amount !== undefined) {
      amount = fixMinorUnits(amount, PLAN_PRICES);
      if (!plan) plan = planByPrice(amount) ?? undefined;
    }
  }

  // Kohort sends no payment-method tag, so fall back to the product name: the one-time ("ลูกค้าต่ออายุเอง" /
  // พร้อมเพย์) products are PromptPay passes, the auto-renewing ones are card subscriptions.
  const methodField = [...find(leaves, METHOD_KEYS)][0]?.value;
  const productText = [...find(leaves, PLAN_TEXT_KEYS)].map((l) => String(l.value)).join(" ");
  const method =
    methodField !== undefined && String(methodField).trim()
      ? parseMethod(methodField)
      : /ต่ออายุเอง|พร้อมเพย์|promptpay|จ่ายครั้งเดียว|one[- ]?time/i.test(productText)
        ? "promptpay"
        : "card";

  let paid_at: string | null = null;
  for (const l of find(leaves, DATE_KEYS)) {
    paid_at = parseDate(l.value, now);
    if (paid_at) break;
  }
  const paidAtGiven = !!paid_at;
  paid_at ??= new Date(now).toISOString();

  const cur = [...find(leaves, ["currency"])].map((l) => String(l.value).trim())[0];
  // Only THB is accepted: "THB" / "฿" / "บาท" → THB, anything else is passed on as-is so applyPayment logs the mismatch.
  const currency = !cur || /^(thb|baht|฿|บาท)$/i.test(cur) ? CURRENCY : cur.toUpperCase().slice(0, 10);

  // No reference from Kohort → a stable one, so a retried delivery of the same payment can't grant twice.
  // paid_at is rounded to the minute; if Kohort sent no timestamp we only have "now", so the bucket is an hour.
  let referenceGenerated = false;
  if (!reference) {
    referenceGenerated = true;
    const step = paidAtGiven ? 60_000 : 3_600_000;
    const bucket = Math.floor(new Date(paid_at).getTime() / step);
    const digest = createHash("sha256").update([email ?? "", amount ?? "", plan ?? product_id ?? "", bucket].join("|")).digest("hex");
    reference = `kohort:${digest}`;
  }

  const payload: PaymentPayload = {
    ...(email ? { email } : {}),
    ...(product_id ? { product_id } : plan ? { plan } : {}),
    amount: amount ?? NaN,
    currency,
    method,
    reference,
    paid_at,
  };
  const raw = {
    source: "kohort",
    email: email ?? null,
    amount: amount ?? null,
    currency,
    plan: plan ?? null,
    product_id: product_id ?? null,
    method,
    reference,
    paid_at,
    reference_generated: referenceGenerated,
    original: slim(body),
    ...(Object.keys(query).length ? { query: slim(query) } : {}),
  };
  const unmatched = !email ? "ไม่พบอีเมลในข้อมูล" : !(plan || product_id) ? "ไม่พบแพ็กเกจที่ตรงกัน (ชื่อสินค้า/ยอดเงินไม่ตรงแพ็กเกจใดเลย)" : amount === undefined ? "ไม่พบยอดเงินในข้อมูล" : null;
  return { payload, raw, referenceGenerated, paidAtGiven, unmatched };
}

/**
 * Kohort's default payload is unknown until the first real event, so when we cannot place a payment we keep EVERYTHING we
 * received (the parsed body, the query without the secret, the content type and a bit of the raw text) in payment_errors.
 * Studio → สมาชิก shows these rows; the shape tells us which field names to map. Nothing is granted.
 */
export async function logUnmatchedKohort(
  reason: string,
  info: { body: Record<string, unknown> | null; query: Record<string, string>; contentType: string; text: string; normalized: Record<string, unknown> },
) {
  const payload = {
    source: "kohort_unmatched",
    reason,
    guessed: info.normalized,
    body: info.body,
    query: info.query,
    content_type: info.contentType,
    ...(info.body && Object.keys(info.body).length ? {} : { raw_text: info.text.slice(0, 8000) }),
  };
  const { error } = await adminDb().from("payment_errors").insert({ payload, reason: `Kohort: ${reason}` });
  if (error) throw new Error(`payment_errors: ${error.message}`);
}

/** A rejected call (wrong / missing secret), so a mis-pasted Kohort URL shows up in Studio instead of failing silently. */
export async function logRejectedKohort(info: Record<string, unknown>) {
  const { error } = await adminDb()
    .from("payment_errors")
    .insert({ payload: { source: "kohort_rejected", ...info }, reason: "Kohort: secret ไม่ตรง" });
  if (error) throw new Error(`payment_errors: ${error.message}`);
}

/** A product purchase may be sent in satang too; compare against that product's price (one cheap lookup). */
export async function fixProductAmount(p: PaymentPayload): Promise<void> {
  if (!p.product_id || !Number.isFinite(p.amount)) return;
  const { data } = await adminDb().from("products").select("price_thb").eq("id", p.product_id).is("deleted_at", null).maybeSingle();
  if (data) p.amount = fixMinorUnits(p.amount, [Number(data.price_thb)]);
}

// ───────────────────────── Auto-claim ─────────────────────────

/**
 * People can pay on Kohort before (or without) having an account here. Those payments sit in payment_errors with
 * reason "ไม่พบผู้ใช้" and source "kohort". When the same email signs up / signs in, grant them now.
 * Idempotent: apply_payment()/apply_purchase() dedupe by reference, so running twice (or racing the webhook) is harmless.
 * Only unresolved, user-not-found rows qualify — amount mismatches stay for a human to look at.
 * Never throws: a failure here must not break signing in.
 */
export async function claimKohortPayments(userId: string, email: string | null | undefined): Promise<number> {
  try {
    const mail = email?.trim().toLowerCase();
    if (!mail || !rateLimit(`kohort-claim:${userId}`, 3, 60_000)) return 0;
    if (await isMemberUser(userId)) return 0;

    const db = adminDb();
    const { data: rows, error } = await db
      .from("payment_errors")
      .select("id, payload")
      .eq("resolved", false)
      .eq("reason", USER_NOT_FOUND_REASON)
      .eq("payload->>source", "kohort")
      .eq("payload->>email", mail)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error || !rows?.length) return 0;

    const done = new Set<string>(); // references already applied in this run
    const resolvedIds: string[] = [];
    let applied = 0;
    for (const row of rows as { id: string; payload: Record<string, unknown> | null }[]) {
      const p = row.payload;
      const reference = typeof p?.reference === "string" ? p.reference : "";
      if (!p || !reference) continue;
      if (done.has(reference)) {
        resolvedIds.push(row.id);
        continue;
      }
      const method = isPaymentMethod(p.method) ? p.method : "card";
      const amount = Number(p.amount);
      const base = {
        user_id: userId,
        email: mail,
        amount,
        currency: typeof p.currency === "string" ? p.currency : CURRENCY,
        method,
        reference,
        paid_at: typeof p.paid_at === "string" ? p.paid_at : new Date().toISOString(),
      };
      const raw = { ...p, claimed_by: userId };
      try {
        if (typeof p.product_id === "string" && p.product_id) {
          const r = await applyPurchase({ ...base, product_id: p.product_id }, raw);
          if (r.status !== 200) continue;
        } else if (isPlanCode(p.plan) && Math.abs(amount - PLANS[p.plan].price) < 0.005) {
          const r = await applyPayment({ ...base, plan: p.plan }, raw);
          if (r.status !== 200) continue;
        } else {
          continue; // not a valid plan/amount pair → leave it for the owner
        }
      } catch (e) {
        console.error("kohort claim failed", reference, e);
        continue;
      }
      done.add(reference);
      resolvedIds.push(row.id);
      applied++;
    }
    if (resolvedIds.length) await db.from("payment_errors").update({ resolved: true }).in("id", resolvedIds);
    if (applied) console.log(`kohort claim: applied ${applied} pending payment(s) for user ${userId}`);
    return applied;
  } catch (e) {
    console.error("kohort claim error", e);
    return 0;
  }
}
