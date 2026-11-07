import { notFound } from "next/navigation";
import { ProfileBilling } from "@/components/studio/member-profile";
import { getMemberDetail } from "../../../_lib/data";

export default async function MemberProfileBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getMemberDetail(id);
  if (!d) notFound();
  return <ProfileBilling d={d} />;
}
