import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { myPurchases } from "@/lib/server/shop";
import { PurchasesSection } from "../_components/library-view";

export const metadata: Metadata = { title: "ที่ซื้อแล้ว", robots: { index: false, follow: false } };

export default async function LibraryPurchasesPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  return <PurchasesSection purchases={await myPurchases(viewer.id)} />;
}
