import { freePreviewSec } from "@/lib/access";
import { getViewer } from "@/lib/server/auth";
import { canPreview, canWatchContent, getContentRow, isLive } from "@/lib/server/queries";

export const dynamic = "force-dynamic";

function cueStart(block: string): number {
  const line = block.split("\n").find((l) => l.includes("-->"));
  if (!line) return -1;
  const p = line.split("-->")[0].trim().replace(",", ".").split(":").map(Number);
  return p.some((n) => Number.isNaN(n)) ? -1 : p.reduce((acc, n) => acc * 60 + n, 0);
}

/** Keeps the header/notes and only the cues that start inside the guest preview. */
function trimVtt(vtt: string, untilSec: number): string {
  return vtt
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .filter((block) => {
      const t = cueStart(block);
      return t < 0 || t < untilSec;
    })
    .join("\n\n");
}

/** Captions follow the same access rule as the media itself; guests on "free" content get only the preview part. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const c = await getContentRow(id);
  if (!c || !c.captions_vtt || (!isLive(c) && !viewer?.is_admin)) return new Response("not found", { status: 404 });
  const preview = canPreview(viewer, c);
  if (!preview && !(await canWatchContent(viewer, c))) return new Response("members only", { status: 403 });
  const body = preview ? trimVtt(c.captions_vtt, freePreviewSec(Number(c.duration_sec))) : c.captions_vtt;
  return new Response(body, {
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "private, no-store",
      ...(preview ? { "X-Preview": "1" } : {}),
    },
  });
}
