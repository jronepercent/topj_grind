import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/studio/ui";
import { FreebiesManager } from "@/components/studio/freebies-manager";
import { studioFreebies } from "@/lib/server/freebies";

export const metadata = { title: "ของฟรี" };

export default async function StudioFreePage() {
  const rows = await studioFreebies();
  return (
    <div>
      <PageHeader
        title="ของฟรี"
        description="แจกไฟล์และเครื่องมือฟรีที่หน้า /free คนรับต้องสมัครบัญชีก่อน ทุกครั้งที่มีคนรับ คุณได้รายชื่อ lead"
        action={
          <Button asChild variant="inverse">
            <Link href="/studio/free/new">
              <Plus /> เพิ่มของฟรี
            </Link>
          </Button>
        }
      />
      <FreebiesManager rows={rows} />
    </div>
  );
}
