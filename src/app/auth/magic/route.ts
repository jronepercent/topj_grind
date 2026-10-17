import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createSession } from "@/lib/server/auth";
import { commit, db } from "@/lib/server/store";

export const dynamic = "force-dynamic";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

/** One-time sign-in link: /auth/magic?token=…&next=… */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const d = db();
  const link = token ? d.magic_links.find((m) => m.token === token && m.purpose === "login") : undefined;
  if (!link) redirect("/login?error=link");

  // Single use: burn the token whatever happens next.
  d.magic_links = d.magic_links.filter((m) => m.token !== token);
  commit();

  if (new Date(link.expires_at).getTime() < Date.now()) redirect("/login?error=link");
  const profile = d.profiles.find((p) => p.email.toLowerCase() === link.email.toLowerCase());
  if (!profile || profile.is_banned) redirect("/login?error=link");

  await createSession(profile.id);
  redirect(next);
}
