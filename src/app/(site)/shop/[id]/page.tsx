import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Check, ChevronLeft, FileDown, GraduationCap, Pencil } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { getProduct } from "@/lib/server/shop";
import { getPlaylist } from "@/lib/server/queries";
import { ProductGallery } from "@/components/shop/product-gallery";
import { PriceTag } from "@/components/shop/product-card";
import { Markdown } from "@/components/community/markdown";
import { Button } from "@/components/ui/button";
import { formatLongDuration, formatNumber } from "@/lib/format";
import { productJsonLd, productMetadata } from "@/lib/seo";
import { PRODUCT_TYPE_LABEL, SHOP_FAQ, deliveryInfo, discountPercent, formatBaht, formatFileSize, productCheckoutHref } from "@/lib/shop";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await getProduct(id, null);
  return p ? productMetadata(p, `/shop/${id}`) : { title: "ไม่พบสินค้า" };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const viewer = await getViewer();
  const p = await getProduct(id, viewer);
  if (!p) notFound();

  const info = deliveryInfo(p.product_type);
  const playlist = p.product_type === "course" && p.course_playlist_id ? await getPlaylist(p.course_playlist_id, null) : null;
  const images = [...new Set([p.cover_url, ...p.images].filter((u): u is string => !!u))];
  const published = p.status === "published";
  const off = discountPercent(p.price_thb, p.compare_at_thb);
  const gets = [...info.gets];
  if (playlist) gets.unshift(`${formatNumber(playlist.item_count)} ตอน · ${formatLongDuration(playlist.total_sec)}`);

  const buy = p.owned ? (
    <Button asChild variant="inverse" size="lg" className="h-14 w-full text-[16px]">
      <Link href="/library?tab=purchases">
        <Check strokeWidth={2.25} /> เปิดในคลัง
      </Link>
    </Button>
  ) : published ? (
    <Button asChild variant="primary" size="lg" className="h-14 w-full text-[16px]">
      <Link href={productCheckoutHref(p.id)}>ซื้อเลย · {formatBaht(p.price_thb)}</Link>
    </Button>
  ) : null;

  return (
    <div className="tg-page mx-auto max-w-[1200px] px-4 pb-36 pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-16">
      {published && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd(p, `/shop/${id}`)).replace(/</g, "\\u003c") }} />
      )}
      <Link href="/shop" className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[14px] text-text-2 hover:bg-hover hover:text-text">
        <ChevronLeft className="size-4" strokeWidth={2} aria-hidden /> ร้านค้า
      </Link>

      {!published && (
        <p role="status" className="mt-3 rounded-[12px] border border-border-strong bg-surface px-4 py-3 text-[14px]">
          ฉบับร่าง — หน้านี้เห็นเฉพาะคุณ ลูกค้ายังเปิดไม่ได้{" "}
          <Link href={`/studio/shop/${p.id}/edit`} className="font-semibold underline underline-offset-2">
            ไปแก้ไข
          </Link>
        </p>
      )}

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-14">
        <div className="lg:sticky lg:top-[72px] lg:self-start">
          <ProductGallery images={images} title={p.title} />
        </div>

        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-hover px-3 py-1 text-[12px] font-semibold">
            {p.product_type === "course" ? (
              <GraduationCap className="size-3.5" aria-hidden />
            ) : p.product_type === "ebook" ? (
              <BookOpen className="size-3.5" aria-hidden />
            ) : (
              <FileDown className="size-3.5" aria-hidden />
            )}
            {PRODUCT_TYPE_LABEL[p.product_type]}
          </p>
          <h1 className="t-h1 mt-3 text-balance sm:text-[32px] sm:leading-[40px]">{p.title}</h1>
          {p.subtitle && <p className="mt-2 text-[16px] leading-7 text-text-2">{p.subtitle}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PriceTag price={p.price_thb} compareAt={p.compare_at_thb} size="lg" />
            {off > 0 && <span className="text-[13px] font-medium text-accent">ประหยัด {formatBaht((p.compare_at_thb ?? 0) - p.price_thb)}</span>}
          </div>
          <p className="t-meta mt-1">จ่ายครั้งเดียว ไม่ต่ออายุอัตโนมัติ · ไม่ต้องเป็นสมาชิก</p>

          <div className="mt-6 hidden lg:block">{buy}</div>
          {viewer?.is_admin && (
            <Button asChild variant="ghost" size="sm" className="mt-2 hidden lg:inline-flex">
              <Link href={`/studio/shop/${p.id}/edit`}>
                <Pencil /> แก้ไขใน Studio
              </Link>
            </Button>
          )}

          <section aria-labelledby="gets-h" className="mt-8 rounded-[16px] border border-border bg-surface p-5">
            <h2 id="gets-h" className="text-[16px] font-semibold">
              สิ่งที่คุณจะได้รับ
            </h2>
            <ul className="mt-3 space-y-2.5 text-[15px] leading-6">
              {gets.map((g) => (
                <li key={g} className="flex gap-3">
                  <Check className="mt-1 size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                  <span>{g}</span>
                </li>
              ))}
              {p.has_file && p.file_name && p.product_type !== "course" && (
                <li className="flex gap-3 text-text-2">
                  <FileDown className="mt-1 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="min-w-0 break-words">
                    {p.file_name}
                    {p.file_size ? ` · ${formatFileSize(p.file_size)}` : ""}
                  </span>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-14">
        <section aria-labelledby="desc-h" className="min-w-0">
          <h2 id="desc-h" className="t-h2">
            รายละเอียด
          </h2>
          <div className="mt-4 max-w-[720px] text-[16px] leading-[1.8] text-text">
            {p.description.trim() ? <Markdown>{p.description}</Markdown> : <p className="text-text-2">ยังไม่มีรายละเอียดเพิ่มเติม</p>}
          </div>
        </section>

        <section aria-labelledby="faq-h" className="min-w-0">
          <h2 id="faq-h" className="t-h2">
            การรับสินค้า
          </h2>
          <div className="mt-4 divide-y divide-border rounded-[16px] border border-border bg-surface">
            {SHOP_FAQ.map((f) => (
              <details key={f.q} className="px-4 py-3.5">
                <summary className="cursor-pointer text-[15px] font-medium">{f.q}</summary>
                <p className="mt-2 text-[14px] leading-6 text-text-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      {/* Mobile sticky buy bar — sits above the bottom tab bar and follows its hide logic (tg-vv-bottom) */}
      {buy && (
        <div className="glass tg-vv-bottom fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-border sm:bottom-0 lg:hidden">
          <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="tnum truncate text-[17px] font-semibold">{formatBaht(p.price_thb)}</p>
              <p className="t-meta truncate">{p.owned ? "คุณเป็นเจ้าของแล้ว" : "จ่ายครั้งเดียว"}</p>
            </div>
            <Button asChild variant={p.owned ? "inverse" : "primary"} size="lg" className="shrink-0">
              <Link href={p.owned ? "/library?tab=purchases" : productCheckoutHref(p.id)}>{p.owned ? "เปิดในคลัง" : "ซื้อเลย"}</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
