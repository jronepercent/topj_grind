import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { checkoutMode } from "@/lib/server/payments";
import { getProduct } from "@/lib/server/shop";
import { ProductCheckoutForm } from "@/components/shop/product-checkout-form";
import { isSafePath, productHref } from "@/lib/shop";

export const metadata: Metadata = {
  title: "ชำระเงิน",
  robots: { index: false, follow: false },
};

export default async function ProductCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawFrom = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const from = isSafePath(rawFrom) ? rawFrom : undefined;

  const viewer = await getViewer();
  if (!viewer) {
    const self = `/shop/${id}/checkout${from ? `?from=${encodeURIComponent(from)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(self)}`);
  }

  const product = await getProduct(id, viewer);
  if (!product || product.status !== "published") notFound();
  // Already theirs: no second payment, straight to the library.
  if (product.owned) redirect("/library?tab=purchases");

  const mode = checkoutMode();
  return (
    <div className="tg-page mx-auto max-w-[1100px] px-4 pb-32 pt-6 sm:px-6 sm:pt-10 lg:px-8 lg:pb-12">
      <Link href={productHref(id)} className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[14px] text-text-2 hover:bg-hover hover:text-text">
        <ChevronLeft className="size-4" strokeWidth={2} aria-hidden /> กลับไปดูสินค้า
      </Link>
      <h1 className="t-h1 mb-6 mt-3 sm:mb-8">ชำระเงิน</h1>
      <ProductCheckoutForm
        product={{
          id: product.id,
          title: product.title,
          subtitle: product.subtitle,
          cover_url: product.cover_url,
          kind: product.kind,
          product_type: product.product_type,
          price_thb: product.price_thb,
          compare_at_thb: product.compare_at_thb,
          is_featured: product.is_featured,
        }}
        mode={mode}
        from={from ?? null}
        demoEmail={mode === "demo" ? viewer.email : null}
      />
    </div>
  );
}
