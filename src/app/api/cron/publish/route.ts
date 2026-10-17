import { NextResponse } from "next/server";
import { runScheduler } from "@/lib/server/mutations";

export const dynamic = "force-dynamic";

/** Manual/backup trigger. Scheduling runs in the database (pg_cron publish-due, every minute). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runScheduler(false));
}
