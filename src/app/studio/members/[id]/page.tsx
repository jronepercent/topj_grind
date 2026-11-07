import { notFound } from "next/navigation";
import { ProfileOverview } from "@/components/studio/member-profile";
import { getMemberDetail } from "../../_lib/data";

export default async function MemberProfileOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getMemberDetail(id);
  if (!d) notFound();
  return <ProfileOverview d={d} />;
}
