import { siteSettings } from "@/lib/server/queries";
import { PaywallCard } from "@/components/studio/settings-form";

export const metadata = { title: "ตั้งค่า · Paywall" };

export default async function StudioSettingsPaywallPage() {
  const s = await siteSettings();
  return <PaywallCard settings={{ ...s, socials: (s.socials ?? []).map((x) => ({ ...x })), paywall_benefits: [...(s.paywall_benefits ?? [])] }} />;
}
