import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db, commit, nowIso } from "@/lib/server/store";
import { finalizeIfReady, notify } from "@/lib/server/mutations";
import { bunnyPreview, bunnyThumbnail } from "@/lib/server/bunny";

export const dynamic = "force-dynamic";

// Bunny Stream webhook status codes
const FINISHED = 3;
const FAILED = 5;

function secretOk(given: string | null) {
  const secret = process.env.BUNNY_WEBHOOK_SECRET;
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Configure in Bunny as: https://topjgrind.com/api/webhooks/bunny?secret=BUNNY_WEBHOOK_SECRET */
export async function POST(req: Request) {
  if (!secretOk(new URL(req.url).searchParams.get("secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const raw = await req.text();
  if (raw.length > 8 * 1024) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  let body: { VideoLibraryId?: number; VideoGuid?: string; Status?: number };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const c = db().content.find((x) => x.bunny_video_id === body.VideoGuid);
  if (!c) return NextResponse.json({ ok: true, ignored: true });

  if (body.Status === FAILED) {
    c.media_status = "failed";
    const admin = db().profiles.find((p) => p.role === "admin");
    if (admin)
      notify({ user_id: admin.id, type: "new_content", title: "ประมวลผลวิดีโอไม่สำเร็จ", body: `${c.title} — กรุณาอัปโหลดใหม่`, link: `/studio/content/${c.id}/edit`, image_url: null });
  }

  if (body.Status === FINISHED) {
    // Pull final metadata from Bunny
    const lib = process.env.BUNNY_STREAM_LIBRARY_ID;
    const key = process.env.BUNNY_STREAM_API_KEY;
    if (lib && key) {
      try {
        const r = await fetch(`https://video.bunnycdn.com/library/${lib}/videos/${c.bunny_video_id}`, { headers: { AccessKey: key } });
        if (r.ok) {
          const v = (await r.json()) as { length?: number; width?: number; height?: number };
          c.duration_sec = Math.round(v.length ?? c.duration_sec);
          c.width = v.width ?? c.width;
          c.height = v.height ?? c.height;
        }
      } catch {
        // keep going — metadata is a nice-to-have
      }
    }
    c.media_status = "ready";
    c.thumbnail_url ??= bunnyThumbnail(c.bunny_video_id!);
    c.preview_url ??= bunnyPreview(c.bunny_video_id!);
    finalizeIfReady(c);
  }
  c.updated_at = nowIso();
  commit();
  return NextResponse.json({ ok: true });
}
