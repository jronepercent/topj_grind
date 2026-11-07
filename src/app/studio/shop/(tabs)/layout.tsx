import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/studio/ui";
import { StudioTabs } from "@/components/studio/studio-tabs";

const TABS = [
  { href: "/studio/shop", label: "สินค้า" },
  { href: "/studio/shop/orders", label: "คำสั่งซื้อ" },
];

export default function StudioShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader
        title="ร้านค้า"
        description="ขาย E-book คอร์ส และเทมเพลตแยกจากสมาชิก จ่ายครั้งเดียว ลูกค้าได้ของเข้าคลังทันที"
        action={
          <Button asChild variant="inverse">
            <Link href="/studio/shop/new">
              <Plus /> เพิ่มสินค้า
            </Link>
          </Button>
        }
      />
      <StudioTabs tabs={TABS} label="หมวดร้านค้า" />
      {children}
    </div>
  );
}
