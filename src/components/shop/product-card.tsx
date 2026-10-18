import Image from "next/image";
import Link from "next/link";
import { Check, ShoppingBag } from "lucide-react";
import { PRODUCT_TYPE_LABEL, discountPercent, formatBaht, productHref, type ProductCardData } from "@/lib/shop";
import { cn } from "@/lib/utils";

/**
 * Product card. No hooks and no "use client", so it works in server components and client components alike.
 *
 *   variant="grid"  fills its grid cell (shop page: 2 columns on phones, 3-4 on desktop)
 *   variant="row"   fixed width (160px, 200px from sm) for horizontal shelves such as the home page
 *
 * `product.owned === true` shows the “เป็นเจ้าของแล้ว” badge (the loaders in src/lib/server/shop.ts set it when given a user id).
 */
export function ProductCard({
  product,
  variant = "grid",
  priority,
  className,
}: {
  product: ProductCardData;
  variant?: "grid" | "row";
  /** true for images above the fold (first cards of the shop page). */
  priority?: boolean;
  className?: string;
}) {
  const p = product;
  const off = discountPercent(p.price_thb, p.compare_at_thb);
  const row = variant === "row";
  return (
    <Link
      href={productHref(p.id)}
      className={cn("group block min-w-0 rounded-[14px]", row ? "w-[160px] shrink-0 sm:w-[200px]" : "w-full", className)}
      aria-label={`${p.title} ${formatBaht(p.price_thb)}${p.owned ? " (เป็นเจ้าของแล้ว)" : ""}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[14px] border border-border bg-surface">
        {p.cover_url ? (
          <Image
            src={p.cover_url}
            alt=""
            fill
            priority={priority}
            sizes={row ? "(max-width:640px) 160px, 200px" : "(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"}
            className="object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-text-2" aria-hidden>
            <ShoppingBag className="size-8" strokeWidth={1.5} />
          </span>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold leading-4 text-white backdrop-blur">
          {PRODUCT_TYPE_LABEL[p.product_type]}
        </span>
        {p.owned && (
          <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold leading-4 text-success backdrop-blur">
            <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> เป็นเจ้าของแล้ว
          </span>
        )}
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-[14px] font-semibold leading-[20px] sm:text-[15px] sm:leading-[21px]">{p.title}</h3>
      {!row && p.subtitle && <p className="t-meta mt-0.5 line-clamp-1">{p.subtitle}</p>}
      <PriceTag price={p.price_thb} compareAt={p.compare_at_thb} className="mt-1.5" />
      {off > 0 && <span className="sr-only">ลด {off}%</span>}
    </Link>
  );
}

/** ฿990 ฿1,290 — price, struck-through compare-at price, and a “-23%” chip. */
export function PriceTag({
  price,
  compareAt,
  size = "sm",
  className,
}: {
  price: number;
  compareAt?: number | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const off = discountPercent(price, compareAt);
  return (
    <p className={cn("tnum flex flex-wrap items-baseline gap-x-2 gap-y-0.5", className)}>
      <span className={cn("font-semibold", size === "lg" ? "text-[28px] leading-9 tracking-[-0.02em]" : "text-[15px]")}>{formatBaht(price)}</span>
      {off > 0 && compareAt && (
        <>
          <s className={cn("text-text-2", size === "lg" ? "text-[17px]" : "text-[13px]")} aria-label={`ราคาปกติ ${formatBaht(compareAt)}`}>
            {formatBaht(compareAt)}
          </s>
          <span aria-hidden className={cn("rounded-full bg-accent/15 font-semibold text-accent", size === "lg" ? "px-2.5 py-0.5 text-[13px]" : "px-1.5 text-[11px] leading-4")}>
            -{off}%
          </span>
        </>
      )}
    </p>
  );
}
