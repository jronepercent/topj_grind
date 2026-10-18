"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EllipsisVertical, ExternalLink, Pencil, Plus, ShoppingBag, Star, StarOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "./confirm";
import { PurchasesList } from "./purchases-list";
import { Card, Dot } from "./ui";
import { deleteProductAction, setProductFeaturedAction } from "@/app/studio/shop/actions";
import { formatNumber } from "@/lib/format";
import { PRODUCT_TYPE_LABEL, discountPercent, formatBaht, type ProductAdminRow, type StudioPurchaseRow } from "@/lib/shop";
import { cn } from "@/lib/utils";

type Filter = "all" | "published" | "draft";

export function ShopManager({ rows, purchases }: { rows: ProductAdminRow[]; purchases: StudioPurchaseRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [del, setDel] = React.useState<ProductAdminRow | null>(null);
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const counts = { all: rows.length, published: rows.filter((r) => r.status === "published").length, draft: rows.filter((r) => r.status === "draft").length };
  const sold = rows.reduce((n, r) => n + r.sales_count, 0);

  return (
    <div className="space-y-10">
      <section aria-label="สินค้า">
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border no-scrollbar" role="tablist" aria-label="สถานะสินค้า">
          {(
            [
              ["all", "ทั้งหมด"],
              ["published", "เผยแพร่แล้ว"],
              ["draft", "ฉบับร่าง"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              className={cn(
                "relative shrink-0 px-4 py-3 text-[14px] font-medium transition-colors after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[2px] after:rounded-full",
                filter === k ? "text-text after:bg-text" : "text-text-2 after:bg-transparent hover:text-text",
              )}
            >
              {label} <span className="tnum ml-1 text-text-2">{formatNumber(counts[k])}</span>
            </button>
          ))}
          <span className="t-meta tnum ml-auto self-center whitespace-nowrap pl-4">ขายแล้ว {formatNumber(sold)} ชิ้น</span>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            art="bookmark"
            title={rows.length ? "ไม่มีสินค้าในหมวดนี้" : "ยังไม่มีสินค้า"}
            body="เพิ่ม E-book คอร์ส หรือเทมเพลตชิ้นแรก แล้วเผยแพร่ให้ลูกค้าซื้อได้เลย"
            action={
              <Button asChild variant="inverse">
                <Link href="/studio/shop/new">
                  <Plus /> เพิ่มสินค้า
                </Link>
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-border">
              {shown.map((r) => {
                const off = discountPercent(r.price_thb, r.compare_at_thb);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
                    <Link href={`/studio/shop/${r.id}/edit`} className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-[8px] bg-elevated sm:w-16" tabIndex={-1} aria-hidden>
                      {r.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.cover_url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-text-2">
                          <ShoppingBag className="size-5" strokeWidth={1.5} />
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/studio/shop/${r.id}/edit`} className="line-clamp-2 text-[15px] font-semibold leading-[21px] hover:underline">
                        {r.title}
                      </Link>
                      <p className="t-meta tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{PRODUCT_TYPE_LABEL[r.product_type]}</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Dot tone={r.status === "published" ? "success" : "muted"} />
                          {r.status === "published" ? "เผยแพร่" : "ฉบับร่าง"}
                        </span>
                        {r.is_featured && (
                          <span className="inline-flex items-center gap-1 font-medium text-text">
                            <Star className="size-3" /> แนะนำ
                          </span>
                        )}
                        <span className="sm:hidden">
                          {formatBaht(r.price_thb)} · ขาย {formatNumber(r.sales_count)}
                        </span>
                      </p>
                    </div>
                    <div className="tnum hidden w-28 shrink-0 text-right sm:block">
                      <p className="text-[15px] font-semibold">{formatBaht(r.price_thb)}</p>
                      {r.compare_at_thb && off > 0 && (
                        <p className="t-meta">
                          <s>{formatBaht(r.compare_at_thb)}</s> -{off}%
                        </p>
                      )}
                    </div>
                    <div className="tnum hidden w-16 shrink-0 text-right sm:block">
                      <p className="text-[15px] font-semibold">{formatNumber(r.sales_count)}</p>
                      <p className="t-meta">ขายแล้ว</p>
                    </div>
                    <Dropdown>
                      <DropdownTrigger asChild>
                        <button className="rounded-full p-2 text-text-2 hover:bg-hover hover:text-text" aria-label={`ตัวเลือก ${r.title}`}>
                          <EllipsisVertical className="size-5" />
                        </button>
                      </DropdownTrigger>
                      <DropdownContent align="end">
                        <DropdownItem asChild>
                          <Link href={`/studio/shop/${r.id}/edit`}>
                            <Pencil /> แก้ไข
                          </Link>
                        </DropdownItem>
                        <DropdownItem asChild>
                          <Link href={`/shop/${r.id}`} target="_blank">
                            <ExternalLink /> ดูหน้าสินค้า
                          </Link>
                        </DropdownItem>
                        {r.status === "published" && (
                          <DropdownItem
                            onSelect={async () => {
                              const x = await setProductFeaturedAction(r.id, !r.is_featured);
                              toast(x.ok ? (r.is_featured ? "เลิกแนะนำแล้ว" : "แนะนำที่หน้าแรกแล้ว") : x.error);
                              if (x.ok) router.refresh();
                            }}
                          >
                            {r.is_featured ? <StarOff /> : <Star />} {r.is_featured ? "เลิกแนะนำที่หน้าแรก" : "แนะนำที่หน้าแรก"}
                          </DropdownItem>
                        )}
                        <DropdownSeparator />
                        <DropdownItem className="text-danger [&_svg]:text-danger" onSelect={() => setDel(r)}>
                          <Trash2 /> ลบ
                        </DropdownItem>
                      </DropdownContent>
                    </Dropdown>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <p className="t-meta mt-3">สินค้าจริง (ต้องจัดส่ง) — เร็วๆ นี้ ตอนนี้ขายได้เฉพาะสินค้าดิจิทัล</p>
      </section>

      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="t-h2 mb-3">
          รายการสั่งซื้อล่าสุด
        </h2>
        <PurchasesList rows={purchases} />
      </section>

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="ลบสินค้านี้?"
        body={del ? `“${del.title}” จะหายจากร้านค้าทันที${del.sales_count ? ` ผู้ซื้อเดิม ${formatNumber(del.sales_count)} คนยังเปิดดูและดาวน์โหลดจากคลังของตัวเองได้` : ""}` : undefined}
        confirmLabel="ลบสินค้า"
        onConfirm={async () => {
          if (!del) return;
          const x = await deleteProductAction(del.id);
          setDel(null);
          toast(x.ok ? "ลบสินค้าแล้ว" : x.error);
          if (x.ok) router.refresh();
        }}
      />
    </div>
  );
}
