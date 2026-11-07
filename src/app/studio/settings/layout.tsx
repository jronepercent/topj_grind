import { PageHeader } from "@/components/studio/ui";
import { StudioTabs } from "@/components/studio/studio-tabs";

const TABS = [
  { href: "/studio/settings", label: "ข้อมูลช่อง" },
  { href: "/studio/settings/categories", label: "หมวดหมู่" },
  { href: "/studio/settings/banned-words", label: "คำต้องห้าม" },
  { href: "/studio/settings/paywall", label: "Paywall" },
  { href: "/studio/settings/system", label: "ระบบ" },
];

export default function StudioSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ตั้งค่า" description="ข้อมูลช่อง หมวดหมู่ คำต้องห้าม และข้อความ Paywall" />
      <StudioTabs tabs={TABS} label="หมวดตั้งค่า" />
      {children}
    </div>
  );
}
