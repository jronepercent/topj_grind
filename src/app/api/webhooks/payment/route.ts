import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { applyPayment, type PaymentPayload } from "@/lib/server/mutations";

export const dynamic = "force-dynamic";
const MAX_BODY = 16 * 1024;

function validSignature(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.trim().replace(/^sha256=/i, "").toLowerCase();
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(got, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Payment Integration Contract (spec §9.1). */
export async function POST(req: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 500 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  if (!validSignature(raw, req.headers.get("x-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: PaymentPayload;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const result = applyPayment(body, body);
  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ expires_at: result.expires_at, duplicate: result.duplicate });
}
