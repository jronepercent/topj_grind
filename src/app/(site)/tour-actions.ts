"use server";

import { adminDb } from "@/lib/supabase/clients";
import { getViewer } from "@/lib/server/auth";

/** Site tour finished or skipped: stamp profiles.toured_at the first time only (migration 0026), so it never auto-starts again. */
export async function markTouredAction(): Promise<void> {
  try {
    const viewer = await getViewer();
    if (!viewer) return;
    const { error } = await adminDb().from("profiles").update({ toured_at: new Date().toISOString() }).eq("id", viewer.id).is("toured_at", null);
    if (error) console.error("[tour] mark:", error.message);
  } catch (e) {
    console.error("[tour] mark:", e);
  }
}
