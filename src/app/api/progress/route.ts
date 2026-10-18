import { NextResponse } from "next/server";
import { getViewer, rateLimit } from "@/lib/server/auth";
import { saveProgress } from "@/lib/server/mutations";

export const dynamic = "force-dynamic";

/**
 * Watch-position save for navigator.sendBeacon: the player calls it when the tab is hidden or closed
 * (screen off, app switched), where a normal server action may never finish. Same rules as saveProgressAction.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return new NextResponse(null, { status: 204 });
  if (!rateLimit(`progress:${viewer.id}`, 120, 60_000)) return new NextResponse(null, { status: 429 });
  let body: { id?: unknown; t?: unknown; d?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const t = Number(body.t);
  const d = Number(body.d);
  if (typeof body.id !== "string" || !Number.isFinite(t) || !Number.isFinite(d) || t < 0 || d < 0) {
    return new NextResponse(null, { status: 400 });
  }
  await saveProgress(viewer, body.id, t, d);
  return new NextResponse(null, { status: 204 });
}
