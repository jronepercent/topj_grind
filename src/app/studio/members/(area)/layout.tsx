import { PageHeader } from "@/components/studio/ui";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { getFollowups, getMemberRows, getPaymentErrors } from "../../_lib/data";

export const metadata = { title: "สมาชิก" };

export default async function MembersAreaLayout({ children }: { children: React.ReactNode }) {
  const [rows, followups, errors] = await Promise.all([getMemberRows(), getFollowups(), getPaymentErrors()]);
  const todo = new Set(followups.groups.flatMap((g) => g.items.map((i) => i.id))).size;
  return (
    <div>
      <PageHeader title="สมาชิก" description="สถานะคำนวณจากวันหมดอายุเท่านั้น · ทุกการแก้ไขถูกบันทึกในประวัติการดำเนินการ" />
      <StudioTabs
        label="หมวดสมาชิก"
        tabs={[
          { href: "/studio/members", label: "ภาพรวม" },
          { href: "/studio/members/todo", label: "ต้องทำวันนี้", count: todo, alert: true },
          { href: "/studio/members/list", label: "รายชื่อ", count: rows.length },
          { href: "/studio/members/payments", label: "การชำระเงิน", count: errors.length, alert: true },
          { href: "/studio/members/log", label: "ประวัติแอดมิน" },
        ]}
      />
      {children}
    </div>
  );
}
