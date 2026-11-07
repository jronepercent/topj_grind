import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getViewer } from "@/lib/server/auth";
import { EmptyState } from "@/components/ui/misc";
import { PillTabs } from "@/components/ui/pill-tabs";
import { LoginButton } from "@/components/shell/login-button";

export const metadata: Metadata = {
  title: { default: "คลังของฉัน", template: "%s · คลังของฉัน · TOPJ_GRIND" },
  robots: { index: false, follow: false },
};

const TABS = [
  { href: "/library", label: "ภาพรวม" },
  { href: "/library/history", label: "ประวัติการดู" },
  { href: "/library/later", label: "ดูภายหลัง" },
  { href: "/library/liked", label: "ที่ถูกใจ" },
  { href: "/library/courses", label: "Playlist ที่กำลังเรียน" },
  { href: "/library/purchases", label: "ที่ซื้อแล้ว" },
];

export default async function LibraryLayout({ children }: { children: ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <EmptyState
          art="history"
          className="py-24"
          title="เข้าสู่ระบบเพื่อดูคลังของคุณ"
          body="ประวัติการดู คลิปที่บันทึกไว้ คลิปที่ถูกใจ และ Playlist ที่กำลังเรียน จะรวมอยู่ที่นี่"
          action={<LoginButton />}
        />
      </div>
    );
  }
  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <h1 className="t-h1">คลังของฉัน</h1>
      <PillTabs tabs={TABS} label="หมวดในคลัง" className="-mx-4 mt-4 px-4 sm:mx-0 sm:px-0" />
      {children}
    </div>
  );
}
