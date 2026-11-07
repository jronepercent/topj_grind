import { notFound } from "next/navigation";
import { ProfileWatch } from "@/components/studio/member-profile";
import { getMemberDetail } from "../../../_lib/data";

export default async function MemberProfileWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getMemberDetail(id);
  if (!d) notFound();
  return <ProfileWatch d={d} />;
}
