import { MemberFollowups } from "@/components/studio/member-followups";
import { getFollowups } from "../../../_lib/data";

export const metadata = { title: "ต้องทำวันนี้ · สมาชิก" };

export default async function MembersTodoPage() {
  const followups = await getFollowups();
  return <MemberFollowups groups={followups.groups} available={followups.available} />;
}
