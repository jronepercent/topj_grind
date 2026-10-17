import { NextResponse, type NextRequest } from "next/server";
import { userDb } from "@/lib/supabase/clients";

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
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type)
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "email" | "recovery" | "signup" | "magiclink" })).error;

  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", url.origin));
}
