import { MembersList } from "@/components/studio/members-manager";
import { parseSegment } from "@/components/studio/types";
import { getMemberRows } from "../../../_lib/data";

export const metadata = { title: "รายชื่อ · สมาชิก" };

export default async function MembersListPage({ searchParams }: { searchParams: Promise<{ seg?: string; status?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await getMemberRows();
  return <MembersList rows={rows} initialSegment={parseSegment(sp.seg ?? sp.status)} initialQuery={sp.q ?? ""} />;
}
