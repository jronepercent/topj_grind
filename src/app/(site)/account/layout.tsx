import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getViewer } from "@/lib/server/auth";
import { EmptyState } from "@/components/ui/misc";
import { PillTabs } from "@/components/ui/pill-tabs";
import { LoginButton } from "@/components/shell/login-button";

export const metadata: Metadata = {
  title: { default: "บัญชีของฉัน", template: "%s · บัญชีของฉัน · TOPJ_GRIND" },
  robots: { index: false, follow: false },
};

const TABS = [
  { href: "/account", label: "โปรไฟล์" },
  { href: "/account/membership", label: "สมาชิก" },
  { href: "/account/security", label: "ความปลอดภัย" },
  { href: "/account/preferences", label: "การตั้งค่า" },
];

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <EmptyState
          art="bell"
          className="py-24"
          title="เข้าสู่ระบบเพื่อจัดการบัญชี"
          body="ดูสถานะสมาชิก วันหมดอายุ ประวัติการชำระเงิน และตั้งค่าการใช้งานของคุณ"
          action={<LoginButton />}
        />
      </div>
    );
  }
  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="mx-auto max-w-[760px]">
        <h1 className="t-h1">บัญชีของฉัน</h1>
        <PillTabs tabs={TABS} label="หมวดบัญชี" className="-mx-4 mt-4 px-4 sm:mx-0 sm:px-0" />
        <div className="mt-6 space-y-4 pb-8">{children}</div>
      </div>
    </div>
  );
}
