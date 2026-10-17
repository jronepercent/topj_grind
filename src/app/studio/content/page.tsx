import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/studio/ui";
import { ContentTable } from "@/components/studio/content-table";
import { studioContentRows } from "../_lib/data";

export const metadata = { title: "คอนเทนต์" };

export default async function StudioContentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const rows = studioContentRows();
  return (
    <div>
      <PageHeader
        title="คอนเทนต์"
        description="วิดีโอ Shorts และพอดแคสต์ทั้งหมดของช่อง"
        action={
          <Button asChild variant="inverse">
            <Link href="/studio/upload">
              <Upload /> อัปโหลด
            </Link>
          </Button>
        }
      />
      <ContentTable rows={rows} initialTab={tab === "trash" ? "trash" : "all"} />
    </div>
  );
}
