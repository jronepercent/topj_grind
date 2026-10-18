import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { listProducts } from "@/lib/server/shop";
import { ProductCard } from "@/components/shop/product-card";
import { EmptyState } from "@/components/ui/misc";
import { PRODUCT_TYPES, PRODUCT_TYPE_LABEL, isProductType } from "@/lib/shop";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "ร้านค้า",
  description: "E-book คอร์สเรียน และเทมเพลตจาก TOPJ_GRIND จ่ายครั้งเดียว ได้ของเข้าคลังทันที ไม่ต้องเป็นสมาชิก",
  alternates: { canonical: "/shop" },
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ type?: string | string[] }> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const type = isProductType(raw) ? raw : undefined;
  const viewer = await getViewer();
  const all = await listProducts({ userId: viewer?.id });
  const shown = type ? all.filter((p) => p.product_type === type) : all;
  // Only offer chips for types that actually have products.
  const types = PRODUCT_TYPES.filter((t) => all.some((p) => p.product_type === t));

  return (
    <div className="tg-page mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <header>
        <h1 className="t-h1">ร้านค้า</h1>
        <p className="t-meta mt-1.5 max-w-xl">E-book คอร์สเรียน และเทมเพลต จ่ายครั้งเดียว ได้ของเข้า “คลังของฉัน” ทันที ไม่ต้องเป็นสมาชิก</p>
      </header>

      {types.length > 1 && (
        <nav aria-label="หมวดสินค้า" className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Chip href="/shop" active={!type}>
            ทั้งหมด
          </Chip>
          {types.map((t) => (
            <Chip key={t} href={`/shop?type=${t}`} active={type === t}>
              {PRODUCT_TYPE_LABEL[t]}
            </Chip>
          ))}
        </nav>
      )}

      {shown.length === 0 ? (
        <EmptyState
          art="bookmark"
          className="py-20"
          title={all.length ? "ยังไม่มีสินค้าในหมวดนี้" : "ร้านค้ากำลังเตรียมสินค้า"}
          body={all.length ? "ลองดูหมวดอื่น" : "กลับมาใหม่เร็วๆ นี้ สินค้าชุดแรกใกล้เปิดแล้ว"}
        />
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-4 md:grid-cols-3 xl:grid-cols-4">
          {shown.map((p, i) => (
            <li key={p.id} className="min-w-0">
              <ProductCard product={p} priority={i < 4} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[14px] font-medium transition-colors",
        active ? "bg-text text-bg" : "bg-hover text-text hover:bg-[var(--border-strong)]",
      )}
    >
      {children}
    </Link>
  );
}
