import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/studio/ui";
import { StudioTabs } from "@/components/studio/studio-tabs";
import { contentRows } from "../_data";

export default async function StudioContentLayout({ children }: { children: React.ReactNode }) {
  const rows = await contentRows();
  const trash = rows.filter((r) => r.deleted_at).length;
  return (
    <div>
      <PageHeader
        title="คอนเทนต์"
        description="วิดีโอและพอดแคสต์ทั้งหมดของช่อง"
        action={
          <Button asChild variant="inverse">
            <Link href="/studio/upload">
              <Upload /> อัปโหลด
            </Link>
          </Button>
        }
      />
      <StudioTabs
        label="มุมมองคอนเทนต์"
        tabs={[
          { href: "/studio/content", label: "ทั้งหมด", count: rows.length - trash },
          { href: "/studio/content/trash", label: "ถังขยะ", count: trash },
        ]}
      />
      {children}
    </div>
  );
}
