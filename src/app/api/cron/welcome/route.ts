import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/clients";
import { emailConfigured } from "@/lib/server/email";
import { sendWelcomeBatch, type WelcomeDueRow } from "@/lib/server/welcome-emails";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily 09:00 Bangkok (vercel.json): sends the welcome email step each person is due for (day 0 catch-up, 1, 3, 7). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) return NextResponse.json({ ok: true, skipped: "email not configured" });

  const { data, error } = await adminDb().rpc("welcome_due");
  if (error) {
    console.error("[cron/welcome] welcome_due:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const result = await sendWelcomeBatch((data ?? []) as WelcomeDueRow[], Date.now() + 50_000);
  return NextResponse.json({ ok: true, ...result });
}
