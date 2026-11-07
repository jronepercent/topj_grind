import { NextResponse } from "next/server";
import { HttpError, getViewer, rateLimit } from "@/lib/server/auth";
import { claimFreebie } from "@/lib/server/freebies";
import { isUuid } from "@/lib/server/queries";
import { freebieHref } from "@/lib/freebies";

export const dynamic = "force-dynamic";

/**
 * Take a freebie: any signed-in user. Guests are sent to sign up and come back to the freebie's page; otherwise rate-limits,
 * logs the claim (the lead) and 302-redirects — to a 60-second signed URL for a file, to the tool's URL for a tool.
 * The storage path never leaves the server.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  const viewer = await getViewer();
  if (!viewer) {
    const signup = new URL("/signup", req.url);
    signup.searchParams.set("next", isUuid(id) ? freebieHref(id) : "/free");
    return NextResponse.redirect(signup, { status: 302, headers });
  }
  if (viewer.is_banned) return NextResponse.json({ error: "banned" }, { status: 403, headers });
  if (!rateLimit(`free-claim:${viewer.id}`, 20, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  try {
    const target = await claimFreebie(viewer, id);
    return NextResponse.redirect(new URL(target, req.url), { status: 302, headers });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status, headers });
    console.error(e);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers });
  }
}
