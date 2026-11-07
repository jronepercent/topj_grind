import { CommunityComments } from "@/components/studio/community-manager";
import { communityData } from "../_data";

export const metadata = { title: "ชุมชน · ความคิดเห็น" };

export default async function StudioCommunityCommentsPage() {
  const { comments } = await communityData();
  return <CommunityComments comments={comments} />;
}
