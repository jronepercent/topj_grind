import { NextResponse } from "next/server";
import { HttpError, getViewer, rateLimit } from "@/lib/server/auth";
import { downloadUrlFor } from "@/lib/server/shop";

export const dynamic = "force-dynamic";

/**
 * Buyer download: checks ownership (or admin), rate-limits, then 302-redirects to a signed URL that lives for 60 seconds.
 * The storage path itself never leaves the server.
 */
export async function GET(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  const viewer = await getViewer();
  if (!viewer) {
    // A clicked link: send people to sign in, then bring them back to their purchases.
    const login = new URL("/login", req.url);
    login.searchParams.set("next", "/library?tab=purchases");
    return NextResponse.redirect(login, { status: 302, headers });
  }
  if (viewer.is_banned) return NextResponse.json({ error: "banned" }, { status: 403, headers });
  if (!rateLimit(`shop-dl:${viewer.id}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  try {
    const url = await downloadUrlFor(viewer, productId);
    return NextResponse.redirect(url, { status: 302, headers });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    console.error(e);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers });
  }
}
