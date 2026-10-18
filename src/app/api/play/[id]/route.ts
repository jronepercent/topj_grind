import { NextResponse } from "next/server";
import { getViewer, rateLimit } from "@/lib/server/auth";
import { canWatch, getContentRow, isLive } from "@/lib/server/queries";
import { playbackFor } from "@/lib/server/media";

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
  if (!canWatch(viewer, c)) {
    return NextResponse.json({ error: "members_only" }, { status: viewer ? 403 : 401, headers });
  }
  const pb = await playbackFor(c);
  if (!pb) return NextResponse.json({ error: "media_unavailable" }, { status: 409, headers });
  return NextResponse.json(
    { src: pb.src, type: pb.type, expires_at: pb.expires_at, captions: c.captions_vtt ? `/api/play/${id}/captions` : null },
    { headers },
  );
}
