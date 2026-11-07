import { PageHeader } from "@/components/studio/ui";
import { StudioTabs } from "@/components/studio/studio-tabs";

const TABS = [
  { href: "/studio/home", label: "Hero" },
  { href: "/studio/home/starter", label: "เส้นทางเริ่มต้น" },
  { href: "/studio/home/rows", label: "แถบหน้าแรก" },
];

export default function StudioHomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader title="จัดหน้า Home" description="ตั้งค่า Hero และจัดลำดับแถบต่าง ๆ บนหน้าแรก" />
      <StudioTabs tabs={TABS} label="หมวดจัดหน้า Home" />
      {children}
    </div>
  );
}
