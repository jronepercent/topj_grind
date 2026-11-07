import { requireAdmin } from "@/lib/server/auth";
import { CommunityPosts } from "@/components/studio/community-manager";
import { communityData } from "./_data";

export const metadata = { title: "ชุมชน · โพสต์" };

export default async function StudioCommunityPage() {
  const admin = await requireAdmin();
  const { posts } = await communityData();
  return <CommunityPosts posts={posts} viewer={{ display_name: admin.display_name, avatar_url: admin.avatar_url }} />;
}
