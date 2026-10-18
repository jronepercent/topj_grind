import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { listFeed } from "@/lib/server/community";
import { CommunityFeed } from "@/components/community/feed";

export const metadata: Metadata = {
  title: "ชุมชน",
  description: "พื้นที่คุยของสมาชิก TOPJ_GRIND — โพสต์รูป แชร์ความคืบหน้า และคุยกับ JR",
  alternates: { canonical: "/community" },
};

export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const viewer = await getViewer();
  const initial = await listFeed(viewer, null);
  return (
    <div className="mx-auto max-w-[600px]">
      <CommunityFeed initial={initial} />
    </div>
  );
}
