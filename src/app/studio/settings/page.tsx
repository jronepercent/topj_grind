import { db } from "@/lib/server/store";
import { PageHeader } from "@/components/studio/ui";
import { SettingsForm } from "@/components/studio/settings-form";

export const metadata = { title: "ตั้งค่า" };

export default async function StudioSettingsPage() {
  const d = db();
  const s = d.site_settings;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ตั้งค่า" description="ข้อมูลช่อง หมวดหมู่ คำต้องห้าม และข้อความ Paywall" />
      <SettingsForm
        settings={{ ...s, socials: s.socials.map((x) => ({ ...x })), paywall_benefits: [...s.paywall_benefits] }}
        categories={[...d.categories].sort((a, b) => a.position - b.position).map((c) => ({ id: c.id, name: c.name }))}
        bannedWords={d.banned_words.map((w) => w.word)}
      />
    </div>
  );
}
