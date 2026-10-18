"use client";
import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertCircle, CreditCard, FlaskConical, Lock, QrCode, ShoppingBag } from "lucide-react";
import { startProductCheckoutAction } from "@/app/(site)/shop/[id]/checkout/actions";
import { Button } from "@/components/ui/button";
import { CARD_NETWORKS, DEFAULT_METHOD, METHODS, type CheckoutMethod } from "@/lib/plans";
import { PRODUCT_TYPE_LABEL, deliveryInfo, discountPercent, formatBaht, type ProductCardData } from "@/lib/shop";
import { cn } from "@/lib/utils";

const focusRing = "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent";

/** Where the success page remembers the “back to” path while the buyer is away at the payment page. */
export const SHOP_FROM_KEY = "tg_shop_from";

/**
 * Checkout for a shop product. Same look as the membership checkout (order summary + card as the primary method,
 * PromptPay as the secondary one) but one-time only: nothing renews, nothing recurs.
 */
export function ProductCheckoutForm({
  product,
  mode,
  from,
  demoEmail,
}: {
  product: ProductCardData;
  mode: "live" | "demo" | "closed";
  from: string | null;
  demoEmail: string | null;
}) {
  const router = useRouter();
  const [method, setMethod] = React.useState<CheckoutMethod>(DEFAULT_METHOD);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const closed = mode === "closed";
  const info = deliveryInfo(product.product_type);
  const off = discountPercent(product.price_thb, product.compare_at_thb);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || closed) return;
    setBusy(true);
    setError(null);
    const r = await startProductCheckoutAction(product.id, method, from ?? undefined).catch(() => null);
    if (!r || !r.ok) {
      setError(r?.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
      setBusy(false);
      return;
    }
    try {
      if (from) sessionStorage.setItem(SHOP_FROM_KEY, from);
      else sessionStorage.removeItem(SHOP_FROM_KEY);
    } catch {}
    // Stay "busy" while the browser navigates, so a second tap can't start a second checkout.
    if (r.external) window.location.assign(r.url);
    else router.push(r.url);
  };

  const payLabel = busy ? "กำลังพาไปชำระเงิน…" : `ชำระ ${formatBaht(product.price_thb)}`;

  return (
    <form id="checkout-form" onSubmit={submit} noValidate className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
      {/* ───────── Order summary ───────── */}
      <section aria-labelledby="summary-h" className="rounded-[20px] border border-border bg-surface p-5 sm:p-7 lg:sticky lg:top-20">
        <h2 id="summary-h" className="t-h2">
          สรุปรายการ
        </h2>

        <div className="mt-5 flex gap-4">
          <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-[12px] border border-border bg-elevated sm:w-24">
            {product.cover_url ? (
              <Image src={product.cover_url} alt="" fill sizes="96px" className="object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-text-2" aria-hidden>
                <ShoppingBag className="size-6" strokeWidth={1.5} />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="t-caption font-medium text-text-2">{PRODUCT_TYPE_LABEL[product.product_type]}</p>
            <h3 className="mt-0.5 line-clamp-3 text-[16px] font-semibold leading-6">{product.title}</h3>
            {product.subtitle && <p className="t-meta mt-1 line-clamp-2">{product.subtitle}</p>}
          </div>
        </div>

        <dl className="mt-6 space-y-3 text-[14px]">
          <Row label="ราคา" value={formatBaht(product.compare_at_thb && off > 0 ? product.compare_at_thb : product.price_thb)} />
          {off > 0 && product.compare_at_thb && <Row label={`ส่วนลด ${off}%`} value={`-${formatBaht(product.compare_at_thb - product.price_thb)}`} tone="success" />}
          <Row label="การชำระ" value="จ่ายครั้งเดียว" />
          <Row label="การต่ออายุ" value="ไม่มี ไม่ตัดเงินซ้ำ" tone="muted" />
        </dl>

        <p className="mt-4 rounded-[12px] bg-hover px-3.5 py-2.5 text-[13px] text-text-2">{info.summary}</p>

        <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-border pt-5">
          <span className="text-[15px] font-medium">ยอดชำระวันนี้</span>
          <span className="tnum text-[28px] font-semibold leading-none tracking-[-0.02em]" aria-live="polite">
            {formatBaht(product.price_thb)}
          </span>
        </div>
      </section>

      {/* ───────── Payment method ───────── */}
      <div>
        <fieldset>
          <legend className="t-h2">เลือกวิธีชำระเงิน</legend>

          <div className="mt-5 space-y-3">
            {/* Primary: card */}
            <label className="relative block cursor-pointer">
              <input type="radio" name="method" value="card" checked={method === "card"} onChange={() => setMethod("card")} className="peer sr-only" />
              <span
                className={cn(
                  "block rounded-[20px] border bg-surface p-5 transition-colors duration-150 sm:p-6",
                  "border-border hover:border-border-strong peer-checked:border-accent peer-checked:bg-elevated peer-checked:shadow-[0_0_0_1px_var(--accent)]",
                  focusRing,
                )}
              >
                <span className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/15">
                    <CreditCard className="size-5 text-accent" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[17px] font-semibold">{METHODS.card.label}</span>
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold leading-4 text-on-accent">แนะนำ</span>
                    </span>
                    <span className="mt-1 block text-[14px] leading-[22px] text-text-2">ตัดบัตรครั้งเดียวตามยอดนี้ ไม่ต่ออายุอัตโนมัติ</span>
                    <span className="mt-3 flex flex-wrap gap-1.5" aria-label="รองรับบัตร">
                      {CARD_NETWORKS.map((n) => (
                        <span key={n} className="rounded-md border border-border-strong px-2 py-0.5 text-[12px] font-medium text-text-2">
                          {n}
                        </span>
                      ))}
                    </span>
                  </span>
                  <RadioDot checked={method === "card"} />
                </span>
              </span>
            </label>

            {/* Secondary: PromptPay */}
            <label className="relative block cursor-pointer">
              <input type="radio" name="method" value="promptpay" checked={method === "promptpay"} onChange={() => setMethod("promptpay")} className="peer sr-only" />
              <span
                className={cn(
                  "block rounded-[16px] border bg-surface p-4 transition-colors duration-150 sm:p-5",
                  "border-border hover:border-border-strong peer-checked:border-accent peer-checked:bg-elevated peer-checked:shadow-[0_0_0_1px_var(--accent)]",
                  focusRing,
                )}
              >
                <span className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-hover">
                    <QrCode className="size-5 text-text-2" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{METHODS.promptpay.label}</span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-text-2">สแกน QR จ่ายครั้งเดียว ได้ของเข้าคลังทันทีหลังยืนยันการชำระเงิน</span>
                  </span>
                  <RadioDot checked={method === "promptpay"} />
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <p className="t-meta mt-4" aria-live="polite">
          เมื่อกดชำระเงิน จะเรียกเก็บ {formatBaht(product.price_thb)} ครั้งเดียว ไม่มีการเรียกเก็บซ้ำ
        </p>

        {closed && (
          <div role="status" className="mt-4 flex gap-3 rounded-[14px] border border-border-strong bg-surface p-4 text-[14px]">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-text-2" strokeWidth={1.75} aria-hidden />
            <div>
              <p className="font-semibold">ระบบชำระเงินยังไม่เปิด</p>
              <p className="t-meta mt-0.5">เรากำลังเตรียมระบบชำระเงิน กลับมาใหม่เร็วๆ นี้ ยังไม่มีการตัดเงินใดๆ</p>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 flex gap-3 rounded-[14px] border border-danger/40 bg-danger/10 p-4 text-[14px]">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
            <p>{error}</p>
          </div>
        )}

        {/* Desktop pay button (phones use the sticky bar below) */}
        <Button type="submit" variant="primary" size="lg" className="mt-5 hidden h-14 w-full text-[16px] lg:inline-flex" disabled={busy || closed} aria-busy={busy}>
          {payLabel}
        </Button>

        <p className="t-meta mt-4 flex items-start justify-center gap-1.5 text-center">
          <Lock className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          ชำระเงินผ่านระบบที่ปลอดภัย ข้อมูลบัตรไม่ผ่านเซิร์ฟเวอร์ของเรา
        </p>

        {mode === "demo" && demoEmail && (
          <aside className="mt-6 rounded-[16px] border border-dashed border-border-strong px-5 py-4 text-[13px]">
            <p className="flex items-center gap-1.5 font-semibold text-text-2">
              <FlaskConical className="size-4" strokeWidth={1.75} aria-hidden /> โหมดเดโม
            </p>
            <p className="mt-1.5 text-text-2">
              ยังไม่ได้ตั้งค่า <code className="font-mono text-text">PAYMENT_URL</code> ปุ่มชำระเงินจะพาไปหน้ายืนยันโดยตรง จากนั้นจำลองการจ่ายเงินด้วยคำสั่งนี้ในเทอร์มินัล:
            </p>
            <code className="mt-2 block select-all overflow-x-auto whitespace-nowrap rounded-[10px] bg-hover px-3 py-2 font-mono text-[12px] text-text">
              npm run webhook:test -- {demoEmail} --product={product.id} --price={product.price_thb} {method}
            </code>
          </aside>
        )}
      </div>

      {/* Mobile sticky pay bar — sits above the bottom tab bar on phones */}
      <div className="glass tg-vv-bottom fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-border sm:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="tnum truncate text-[17px] font-semibold">{formatBaht(product.price_thb)}</p>
            <p className="t-meta truncate">จ่ายครั้งเดียว · {PRODUCT_TYPE_LABEL[product.product_type]}</p>
          </div>
          <Button type="submit" variant="primary" size="lg" className="shrink-0" disabled={busy || closed} aria-busy={busy}>
            {payLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "muted" | "success" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-text-2">{label}</dt>
      <dd className={cn("tnum min-w-0 text-right font-medium", tone === "muted" && "text-text-2", tone === "success" && "text-success")}>{value}</dd>
    </div>
  );
}

/** Visual radio indicator; the real (screen-reader / keyboard) control is the sr-only input before it. */
function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden className={cn("mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border", checked ? "border-accent" : "border-border-strong")}>
      {checked && <span className="size-2.5 rounded-full bg-accent" />}
    </span>
  );
}
