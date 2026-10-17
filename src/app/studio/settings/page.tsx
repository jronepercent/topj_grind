import { adminDb, must } from "@/lib/supabase/clients";
import { siteSettings } from "@/lib/server/queries";
import { PageHeader } from "@/components/studio/ui";
import { SettingsForm } from "@/components/studio/settings-form";
import type { Category } from "@/lib/types";

export const metadata = { title: "ตั้งค่า" };

export default async function StudioSettingsPage() {
  const db = adminDb();
  const [s, cats, words] = await Promise.all([
    siteSettings(),
    db.from("categories").select("id, name, position").order("position"),
    db.from("banned_words").select("word").order("word"),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ตั้งค่า" description="ข้อมูลช่อง หมวดหมู่ คำต้องห้าม และข้อความ Paywall" />
      <SettingsForm
        settings={{ ...s, socials: (s.socials ?? []).map((x) => ({ ...x })), paywall_benefits: [...(s.paywall_benefits ?? [])] }}
        categories={(must(cats, "categories") as Pick<Category, "id" | "name">[]).map((c) => ({ id: c.id, name: c.name }))}
        bannedWords={(must(words, "banned words") as { word: string }[]).map((w) => w.word)}
      />
    </div>
  );
}
