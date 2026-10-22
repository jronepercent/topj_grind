"use server";

import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/server/auth";
import { verifyUnsubscribeToken } from "@/lib/server/email";
import { adminDb } from "@/lib/supabase/clients";

/** Confirm button on /unsubscribe. The signed token in the link is the only authorisation, so it is checked again here. */
export async function unsubscribeAction(form: FormData) {
  const u = String(form.get("u") ?? "");
  const t = String(form.get("t") ?? "");
  if (!verifyUnsubscribeToken(u, t)) redirect("/unsubscribe?error=1");
  if (!rateLimit(`unsubscribe:${u}`, 10, 10 * 60_000)) redirect("/unsubscribe?error=1");
  const { error } = await adminDb().from("profiles").update({ email_updates: false }).eq("id", u);
  if (error) {
    console.error("[unsubscribe]", error.message);
    redirect("/unsubscribe?error=1");
  }
  redirect("/unsubscribe?done=1");
}
