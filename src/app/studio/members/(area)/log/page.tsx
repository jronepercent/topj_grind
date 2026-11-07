import { AuditLogCard } from "@/components/studio/members-manager";
import { auditEntries } from "../../../_lib/data";

export const metadata = { title: "ประวัติแอดมิน · สมาชิก" };

export default async function MembersLogPage() {
  return <AuditLogCard audit={await auditEntries(50)} />;
}
