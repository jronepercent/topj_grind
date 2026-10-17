"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { useViewer } from "@/components/providers";
import { demoLoginAction } from "@/app/(auth)/auth-actions";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger } from "@/components/ui/dropdown";

const ROLES = [
  ["guest", "Guest (ไม่ล็อกอิน)"],
  ["free", "Free (ล็อกอิน ไม่จ่าย)"],
  ["expiring", "สมาชิก (เหลือ 2 วัน)"],
  ["member", "สมาชิก"],
  ["admin", "Admin (JR)"],
] as const;

/** Floating switcher shown only in demo mode, to review every permission level quickly. */
export function DemoSwitcher() {
  const { viewer } = useViewer();
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const current = !viewer
    ? "Guest"
    : viewer.is_admin
      ? "Admin"
      : viewer.is_member
        ? "สมาชิก"
        : "Free";
  return (
    <div className="tg-vv-bottom fixed bottom-[76px] left-3 z-[60] sm:bottom-4">
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            className="glass flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-medium shadow-lg"
            aria-label="สลับบัญชีทดสอบ"
          >
            <FlaskConical className="size-3.5 text-accent" />
            DEMO · {pending ? "…" : current}
          </button>
        </DropdownTrigger>
        <DropdownContent side="top" align="start">
          <DropdownLabel>ดูเว็บในมุมมองของ</DropdownLabel>
          {ROLES.map(([role, label]) => (
            <DropdownItem
              key={role}
              onSelect={() =>
                start(async () => {
                  await demoLoginAction(role);
                  router.refresh();
                })
              }
            >
              {label}
            </DropdownItem>
          ))}
        </DropdownContent>
      </Dropdown>
    </div>
  );
}
