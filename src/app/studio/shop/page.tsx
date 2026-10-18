import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/studio/ui";
import { ShopManager } from "@/components/studio/shop-manager";
import { studioProducts, studioPurchases } from "@/lib/server/shop";

export const metadata = { title: "ร้านค้า" };

export default async function StudioShopPage() {
  const [rows, purchases] = await Promise.all([studioProducts(), studioPurchases(30)]);
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
      <ShopManager rows={rows} purchases={purchases} />
    </div>
  );
}
