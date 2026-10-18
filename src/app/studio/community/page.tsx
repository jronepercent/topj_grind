import { requireAdmin } from "@/lib/server/auth";
import { studioCommunity } from "@/lib/server/community";
import { PageHeader } from "@/components/studio/ui";
import { CommunityManager } from "@/components/studio/community-manager";

export const metadata = { title: "ชุมชน" };

export default async function StudioCommunityPage() {
  const admin = await requireAdmin();
  const { posts, comments } = await studioCommunity();
  return (
    <div>
      <PageHeader title="ชุมชน" description="โพสต์รูปถึงสมาชิก และดูแลโพสต์กับความคิดเห็น ซ่อน ปักหมุด หรือลบได้ทันที" />
      <CommunityManager posts={posts} comments={comments} viewer={{ display_name: admin.display_name, avatar_url: admin.avatar_url }} />
    </div>
  );
}
