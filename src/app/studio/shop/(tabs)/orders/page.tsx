import { PurchasesList } from "@/components/studio/purchases-list";
import { studioPurchases } from "@/lib/server/shop";

export const metadata = { title: "ร้านค้า · คำสั่งซื้อ" };

export default async function StudioShopOrdersPage() {
  const purchases = await studioPurchases(100);
  return (
    <section aria-label="คำสั่งซื้อ">
      <p className="t-meta mb-3">รายการสั่งซื้อล่าสุด (สูงสุด 100 รายการ)</p>
      <PurchasesList rows={purchases} />
    </section>
  );
}
