import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { adminDb, userDb } from "@/lib/supabase/clients";
import { claimKohortPayments } from "@/lib/server/kohort";

export const dynamic = "force-dynamic";

function safeNext(n: string | null) {
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

/**
 * First Google sign-in: the profile trigger named the account after the email prefix with no picture.
 * Use the Google name and photo instead, but never overwrite a name or picture the person set themselves.
 */
async function fillProfileFromGoogle(user: User) {
  if (!user.identities?.some((i) => i.provider === "google")) return;
  const meta = user.user_metadata ?? {};
  const name = String(meta.full_name ?? meta.name ?? "").trim().slice(0, 50);
  const picture = String(meta.avatar_url ?? meta.picture ?? "");
  const db = adminDb();
  const { data: p } = await db.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle();
  if (!p) return;
  const patch: { display_name?: string; avatar_url?: string } = {};
  if (name && p.display_name === (user.email ?? "").split("@")[0]) patch.display_name = name;
  if (picture.startsWith("https://") && !p.avatar_url) patch.avatar_url = picture;
  if (Object.keys(patch).length) await db.from("profiles").update(patch).eq("id", user.id);
}

/** Links in Supabase emails (confirm signup, magic link, password reset) and the Google sign-in return land here. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const supabase = await userDb();

  let ok = false;
  let user: User | null = null;
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
  if (ok && user) await fillProfileFromGoogle(user).catch(() => {});

  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", url.origin));
}
