import { ShopManager } from "@/components/studio/shop-manager";
import { hasGeneralPaymentUrl } from "@/lib/server/payments";
import { studioProducts } from "@/lib/server/shop";

export const metadata = { title: "ร้านค้า · สินค้า" };

export default async function StudioShopPage() {
  const rows = await studioProducts();
  return <ShopManager rows={rows} hasFallbackPaymentUrl={hasGeneralPaymentUrl()} />;
}
