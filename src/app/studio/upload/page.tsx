import { PageHeader } from "@/components/studio/ui";
import { UploadDropzone } from "@/components/studio/upload-dropzone";
import type { ContentType } from "@/lib/types";

export const metadata = { title: "อัปโหลด" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const t: ContentType = type === "short" || type === "podcast" ? type : "video";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="อัปโหลด" description="เลือกไฟล์แล้วกรอกรายละเอียดได้ทันทีระหว่างที่ไฟล์กำลังอัปโหลด" />
      <UploadDropzone defaultType={t} />
    </div>
  );
}
