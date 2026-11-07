import { PageHeader } from "@/components/studio/ui";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { communityData } from "./_data";

export default async function StudioCommunityLayout({ children }: { children: React.ReactNode }) {
  const { posts, comments } = await communityData();
  return (
    <div>
      <PageHeader title="ชุมชน" description="โพสต์รูปถึงสมาชิก และดูแลโพสต์กับความคิดเห็น ซ่อน ปักหมุด หรือลบได้ทันที" />
      <StudioTabs
        label="หมวดดูแลชุมชน"
        tabs={[
          { href: "/studio/community", label: "โพสต์", count: posts.length },
          { href: "/studio/community/comments", label: "ความคิดเห็น", count: comments.length },
        ]}
      />
      {children}
    </div>
  );
}
