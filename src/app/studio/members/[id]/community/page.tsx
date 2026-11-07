import { notFound } from "next/navigation";
import { ProfileCommunity } from "@/components/studio/member-profile";
import { getMemberDetail } from "../../../_lib/data";

export default async function MemberProfileCommunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getMemberDetail(id);
  if (!d) notFound();
  return <ProfileCommunity d={d} />;
}
