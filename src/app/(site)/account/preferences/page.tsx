import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getViewer } from "@/lib/server/auth";
import { adminDb } from "@/lib/supabase/clients";
import type { ThemePref } from "@/lib/types";
import { PreferencesCard } from "../_components/account-view";

export const metadata: Metadata = { title: "การตั้งค่า", robots: { index: false, follow: false } };

export default async function AccountPreferencesPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const cookieTheme = (await cookies()).get("tg_theme")?.value;
  const theme: ThemePref = cookieTheme === "light" || cookieTheme === "system" || cookieTheme === "dark" ? cookieTheme : viewer.theme;
  // Own read (not in getViewer): before migration 0015 the column is missing, and that must not log everyone out.
  const { data: prefs } = await adminDb().from("profiles").select("email_updates").eq("id", viewer.id).maybeSingle<{ email_updates: boolean }>();
  return <PreferencesCard initialTheme={theme} initialAutoplay={viewer.autoplay} initialEmailUpdates={prefs?.email_updates ?? true} />;
}
