import { NextResponse } from "next/server";
import { HttpError, getViewer, rateLimit } from "@/lib/server/auth";
import { sampleUrlFor } from "@/lib/server/shop";
import { isUuid } from "@/lib/server/queries";
import { productHref } from "@/lib/shop";

export const dynamic = "force-dynamic";

/**
 * Free sample download: any signed-in user (no purchase). Guests are sent to sign in and come back to the product page;
 * otherwise rate-limits, then 302-redirects to a signed URL that lives for 60 seconds. The storage path never leaves the server.
 */
export async function GET(req: Request, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  const viewer = await getViewer();
  if (!viewer) {
    // A clicked link: sign in, then land back on the product page (not the library).
    const login = new URL("/login", req.url);
    login.searchParams.set("next", isUuid(productId) ? productHref(productId) : "/shop");
    return NextResponse.redirect(login, { status: 302, headers });
  }
  if (viewer.is_banned) return NextResponse.json({ error: "banned" }, { status: 403, headers });
  if (!rateLimit(`shop-sample:${viewer.id}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  try {
    const url = await sampleUrlFor(viewer, productId);
    return NextResponse.redirect(url, { status: 302, headers });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    console.error(e);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers });
  }
}
