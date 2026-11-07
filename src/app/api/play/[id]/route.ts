import { NextResponse } from "next/server";
import { getViewer, rateLimit } from "@/lib/server/auth";
import { canPreview, canWatchContent, getContentRow, isLive } from "@/lib/server/queries";
import { playbackFor } from "@/lib/server/media";
import { freePreviewSec } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * The ONLY place a playable media URL is created. Checks membership first,
 * then returns a signed URL: Bunny for video (2 hours), Supabase Storage for podcast audio (6 hours).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const headers = { "Cache-Control": "private, no-store" };

  if (!rateLimit(`play:${viewer?.id ?? "anon"}:${id}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  }
  const c = await getContentRow(id);
  if (!c || (!isLive(c) && !viewer?.is_admin)) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }
  // Guests on "free" content get a teaser: the player cuts it off at preview_sec and asks them to sign in.
  const preview = canPreview(viewer, c);
  if (!preview && !(await canWatchContent(viewer, c))) {
    return NextResponse.json({ error: "members_only" }, { status: viewer ? 403 : 401, headers });
  }
  const pb = await playbackFor(c);
  if (!pb) return NextResponse.json({ error: "media_unavailable" }, { status: 409, headers });
  return NextResponse.json(
    { src: pb.src, type: pb.type, expires_at: pb.expires_at, captions: c.captions_vtt ? `/api/play/${id}/captions` : null, preview_sec: preview ? freePreviewSec(c.duration_sec) : null },
    { headers },
  );
}
