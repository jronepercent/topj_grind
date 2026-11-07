import { adminDb, must } from "@/lib/supabase/clients";
import { BannedWordsCard } from "@/components/studio/settings-form";

export const metadata = { title: "ตั้งค่า · คำต้องห้าม" };

export default async function StudioSettingsBannedWordsPage() {
  const words = await adminDb().from("banned_words").select("word").order("word");
  return <BannedWordsCard initial={(must(words, "banned words") as { word: string }[]).map((w) => w.word)} />;
}
