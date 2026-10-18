import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { rateLimit } from "@/lib/server/auth";
import { fixProductAmount, logRejectedKohort, logUnmatchedKohort, normalizeKohort, parseKohortBody } from "@/lib/server/kohort";
import { applyPayment, applyPurchase } from "@/lib/server/mutations";

export const dynamic = "force-dynamic";
const MAX_BODY = 32 * 1024;

/** Compare as fixed-length digests so neither the length nor the content of the secret leaks through timing. */
function sameSecret(got: string, secret: string) {
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

/** ?secret=…, x-webhook-secret: …, or Authorization: Bearer … (Kohort can't sign requests, so a shared secret is what we have). */
function suppliedSecrets(req: Request) {
  const out: string[] = [];
  const q = new URL(req.url).searchParams.get("secret");
  if (q) out.push(q);
  const h = req.headers.get("x-webhook-secret");
  if (h) out.push(h.trim());
  const a = req.headers.get("authorization");
  const m = a?.match(/^Bearer\s+(.+)$/i);
  if (m) out.push(m[1].trim());
  return out;
}

/** "ab***@example.com" — enough to recognise a payment in the logs without printing the whole address. */
const maskEmail = (e?: string) => (e ? e.replace(/^(.{1,2}).*@/, "$1***@") : "-");

/** Every ?key=value in the URL except the secret. Kohort's webhook action can only put merge tags here. */
function queryParams(req: Request) {
  const out: Record<string, string> = {};
  for (const [k, v] of new URL(req.url).searchParams) if (k !== "secret" && Object.keys(out).length < 40) out[k.slice(0, 60)] = v.slice(0, 500);
  return out;
}

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Without ?secret: lets the owner paste the URL into a browser to see it is alive (returns nothing about members).
 * With ?secret: handled exactly like POST, in case the webhook action calls the URL with GET.
 */
export function GET(req: Request) {
  if (new URL(req.url).searchParams.has("secret")) return POST(req);
  return new NextResponse("ok", { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
export function HEAD() {
  return new NextResponse(null, { status: 200, headers: { "cache-control": "no-store" } });
}

/**
 * Kohort → membership. See README "Kohort webhook". Fields come from the URL query (merge tags in the URL — all Kohort's
 * "call a webhook" action allows) and/or the body (JSON, form-urlencoded or multipart), with tolerant field names
 * (src/lib/server/kohort.ts). A payload we can't place (no email / plan / amount) is stored whole in payment_errors. Goes through the same applyPayment()/applyPurchase() as /api/webhooks/payment, so the amount
 * must match the plan, and anything that doesn't (wrong amount, unknown email) is logged to payment_errors.
 * Replies 200 { ok, status: "applied" | "duplicate" | "logged" } for everything we understood, so Kohort never retries
 * forever; 400 only when there is a body we can't parse and nothing in the query either; 5xx if our database failed (a retry is wanted then).
 */
export async function POST(req: Request) {
  const secret = process.env.KOHORT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "webhook not configured" }, { status: 503 });

  const ip = clientIp(req);
  if (!rateLimit(`kohort:${ip}`, 120, 60_000)) return NextResponse.json({ ok: false, error: "too many requests" }, { status: 429 });
  const supplied = suppliedSecrets(req);
  if (!supplied.some((s) => sameSecret(s, secret))) {
    console.warn(`kohort webhook: bad secret from ${ip}`);
    // Leave a trace the owner can see in Studio (never the secret itself), at most a few per minute per IP.
    if (rateLimit(`kohort-bad:${ip}`, 5, 60_000)) {
      await logRejectedKohort({
        method: req.method,
        query: queryParams(req),
        contentType: req.headers.get("content-type") ?? "",
        secret_given: supplied.length > 0,
        secret_lengths: supplied.map((s) => s.length),
        expected_length: secret.length,
      }).catch(() => {});
    }
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY) return NextResponse.json({ ok: false, error: "payload too large" }, { status: 413 });

  const contentType = req.headers.get("content-type") ?? "";
  const query = queryParams(req);
  const parsed = await parseKohortBody(text, contentType);
  if (!parsed && !Object.keys(query).length) return NextResponse.json({ ok: false, error: "unparseable body" }, { status: 400 });
  const body = parsed ?? {};

  const { payload, raw, referenceGenerated, unmatched } = normalizeKohort(body, query);
  const summary = `ref=${payload.reference.slice(0, 24)}${referenceGenerated ? "(generated)" : ""} email=${maskEmail(payload.email)} amount=${payload.amount} ${
    payload.product_id ? `product=${payload.product_id}` : `plan=${payload.plan ?? "?"}`
  } method=${payload.method}`;

  try {
    if (unmatched) {
      const why = unmatched;
      await logUnmatchedKohort(why, { body: parsed, query, contentType, text, normalized: raw });
      console.log(`kohort webhook: logged (${why}; full payload stored) ${summary}`);
      return NextResponse.json({ ok: true, status: "logged", reason: why });
    }
    if (payload.product_id) {
      await fixProductAmount(payload);
      raw.amount = Number.isFinite(payload.amount) ? payload.amount : null;
      const r = await applyPurchase(payload, raw);
      if (r.status === 200) {
        const status = r.duplicate ? "duplicate" : "applied";
        console.log(`kohort webhook: ${status} purchase ${summary}`);
        return NextResponse.json({ ok: true, status, purchase_id: r.purchase_id });
      }
      console.log(`kohort webhook: logged (${r.error}) ${summary}`);
      return NextResponse.json({ ok: true, status: "logged", reason: r.error });
    }

    const r = await applyPayment(payload, raw);
    if (r.status === 200) {
      const status = r.duplicate ? "duplicate" : "applied";
      console.log(`kohort webhook: ${status} ${summary} expires=${r.expires_at}`);
      return NextResponse.json({ ok: true, status, expires_at: r.expires_at });
    }
    console.log(`kohort webhook: logged (${r.error}) ${summary}`);
    return NextResponse.json({ ok: true, status: "logged", reason: r.error });
  } catch (e) {
    console.error(`kohort webhook: failed ${summary}`, e);
    return NextResponse.json({ ok: false, error: "server error" }, { status: 500 });
  }
}
