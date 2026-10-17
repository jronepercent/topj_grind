import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/supabase/clients";
import { notify } from "@/lib/server/mutations";
import { syncBunnyStatus } from "@/lib/server/bunny";
import type { ContentRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function secretOk(given: string | null) {
  const secret = process.env.BUNNY_WEBHOOK_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Configure in Bunny as: https://topjgrind.com/api/webhooks/bunny?secret=BUNNY_WEBHOOK_SECRET
 * We don't trust the payload's status code: we re-read the video from Bunny's API.
 */
export async function POST(req: Request) {
  if (!secretOk(new URL(req.url).searchParams.get("secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 8 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  let body: { VideoGuid?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.VideoGuid) return NextResponse.json({ ok: true, ignored: true });

  const { data } = await adminDb().from("content").select("*").eq("bunny_video_id", body.VideoGuid).maybeSingle();
  if (!data) return NextResponse.json({ ok: true, ignored: true });

  const before = data as ContentRow;
  const after = await syncBunnyStatus(before);
  if (after.media_status === "failed" && before.media_status !== "failed") {
    const { data: admins } = await adminDb().from("profiles").select("id").eq("role", "admin");
    for (const a of admins ?? [])
      await notify({ user_id: a.id, type: "new_content", title: "ประมวลผลวิดีโอไม่สำเร็จ", body: `${after.title} — กรุณาอัปโหลดใหม่`, link: `/studio/content/${after.id}/edit`, image_url: null });
  }
  return NextResponse.json({ ok: true, media_status: after.media_status });
}
