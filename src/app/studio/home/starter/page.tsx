import { OnboardingPaths } from "@/components/studio/onboarding-paths";
import { onboardingSettings } from "@/lib/server/onboarding";
import { homePickItems } from "../_data";

export const metadata = { title: "จัดหน้า Home · เส้นทางเริ่มต้น" };

export default async function StudioHomeStarterPage() {
  const [onboarding, items] = await Promise.all([onboardingSettings(), homePickItems()]);
  return <OnboardingPaths paths={onboarding.paths} items={items} />;
}
