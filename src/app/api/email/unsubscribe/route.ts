import { adminDb } from "@/lib/supabase/clients";
import { verifyUnsubscribeToken } from "@/lib/server/email";

/** One-click unsubscribe (RFC 8058): mail clients POST here when the user taps "Unsubscribe" next to the sender. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const q = new URL(req.url).searchParams;
  const u = q.get("u") ?? "";
  const t = q.get("t") ?? "";
  if (!verifyUnsubscribeToken(u, t)) return Response.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 });
  const { error } = await adminDb().from("profiles").update({ email_updates: false }).eq("id", u);
  if (error) {
    console.error("[unsubscribe]", error.message);
    return Response.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
