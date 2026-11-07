import { notFound } from "next/navigation";
import { PageHeader } from "@/components/studio/ui";
import { FreebieEditor } from "@/components/studio/freebie-editor";
import { studioFreebie, studioFreebieClaims } from "@/lib/server/freebies";

export const metadata = { title: "แก้ไขของฟรี" };

export default async function EditFreebiePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, claims] = await Promise.all([studioFreebie(id), studioFreebieClaims(id)]);
  if (!item) notFound();
  return (
    <div>
      <PageHeader title="แก้ไขของฟรี" />
      <FreebieEditor key={item.id} initial={item} claims={claims} />
    </div>
  );
}
