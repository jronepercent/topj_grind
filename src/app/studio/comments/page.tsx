import { PageHeader } from "@/components/studio/ui";
import { CommentsInbox } from "@/components/studio/comments-inbox";
import { studioComments } from "../_lib/data";

export const metadata = { title: "ความคิดเห็น" };

export default async function StudioCommentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const initialTab = tab === "unanswered" || tab === "reported" ? tab : "all";
  return (
    <div>
      <PageHeader title="ความคิดเห็น" description="ความคิดเห็นจากทุกคลิปรวมไว้ที่เดียว ตอบกลับ ปักหมุด ซ่อน หรือแบนได้ทันที" />
      <CommentsInbox comments={studioComments()} initialTab={initialTab} />
    </div>
  );
}
