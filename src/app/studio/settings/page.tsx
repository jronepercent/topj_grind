import { siteSettings } from "@/lib/server/queries";
import { ChannelCard } from "@/components/studio/settings-form";

export const metadata = { title: "ตั้งค่า · ข้อมูลช่อง" };

export default async function StudioSettingsChannelPage() {
  const s = await siteSettings();
  return <ChannelCard settings={{ ...s, socials: (s.socials ?? []).map((x) => ({ ...x })), paywall_benefits: [...(s.paywall_benefits ?? [])] }} />;
}
