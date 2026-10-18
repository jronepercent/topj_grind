import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { checkoutMode } from "@/lib/server/payments";
import { siteSettings } from "@/lib/server/queries";
import { getProduct } from "@/lib/server/shop";
import { ProductSuccessPoller } from "@/components/shop/product-success-poller";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { isCheckoutMethod } from "@/lib/plans";
import { isSafePath } from "@/lib/shop";

export const metadata: Metadata = {
  title: "ยืนยันการชำระเงิน",
  robots: { index: false, follow: false },
};

export default async function ProductSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[]; demo?: string; method?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <EmptyState
          art="bell"
          className="py-24"
          title="เข้าสู่ระบบเพื่อตรวจสอบสินค้าของคุณ"
          body="ใช้บัญชีเดียวกับที่ใช้ชำระเงิน แล้วเราจะยืนยันให้อัตโนมัติ"
          action={
            <Button asChild variant="inverse" size="lg">
              <Link href={`/login?next=${encodeURIComponent(`/shop/${id}/success`)}`}>เข้าสู่ระบบ</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const product = await getProduct(id, viewer);
  if (!product) notFound();
  const rawFrom = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const method = isCheckoutMethod(sp.method) ? sp.method : "card";
  const line = (await siteSettings()).socials.find((x) => x.key === "line" && /^https?:\/\//i.test(x.url))?.url ?? null;

  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
      <ProductSuccessPoller
        product={{
          id: product.id,
          title: product.title,
          price_thb: product.price_thb,
          cover_url: product.cover_url,
          product_type: product.product_type,
          has_file: product.has_file,
          course_playlist_id: product.course_playlist_id,
        }}
        alreadyOwned={!!product.owned}
        from={isSafePath(rawFrom) ? rawFrom : null}
        lineUrl={line}
        demoEmail={checkoutMode() === "demo" ? viewer.email : null}
        method={method}
      />
    </div>
  );
}
