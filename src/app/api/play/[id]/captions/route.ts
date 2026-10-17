import { getViewer } from "@/lib/server/auth";
import { canWatch, getContentRow, isLive } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

/** Captions follow the same access rule as the media itself. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const c = await getContentRow(id);
  if (!c || !c.captions_vtt || (!isLive(c) && !viewer?.is_admin)) return new Response("not found", { status: 404 });
  if (!canWatch(viewer, c)) return new Response("members only", { status: 403 });
  return new Response(c.captions_vtt, { headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "private, no-store" } });
}
