import { NextResponse, type NextRequest } from "next/server";
import { userDb } from "@/lib/supabase/clients";
import { claimKohortPayments } from "@/lib/server/kohort";

export const dynamic = "force-dynamic";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

/** Links in Supabase emails (confirm signup, magic link, password reset) land here. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await userDb();

  let ok = false;
  let user: { id: string; email?: string } | null = null;
  if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    ok = !r.error;
    user = r.data?.user ?? null;
  } else if (tokenHash && type) {
    const r = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "email" | "recovery" | "signup" | "magiclink" });
    ok = !r.error;
    user = r.data?.user ?? null;
  }

  // The email is now verified: grant any Kohort payment that was made with it before the account existed.
  if (ok && user?.email) await claimKohortPayments(user.id, user.email);

  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", url.origin));
}
