import { NextResponse } from "next/server";
import { runScheduler } from "@/lib/server/mutations";

export const dynamic = "force-dynamic";

/** Vercel Cron daily at 02:00 UTC = 09:00 Asia/Bangkok — expiry reminders. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(runScheduler(Date.now(), true));
}
