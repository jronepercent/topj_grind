"use client";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Download, FlaskConical, GraduationCap, MessageCircle, ShoppingBag } from "lucide-react";
import { productOwnedAction } from "@/app/(site)/shop/actions";
import { SHOP_FROM_KEY } from "@/components/shop/product-checkout-form";
import { Button } from "@/components/ui/button";
import type { CheckoutMethod } from "@/lib/plans";
import { PRODUCT_TYPE_LABEL, type ProductType } from "@/lib/shop";

const INTERVAL = 3_000;
const MAX_WAIT = 120_000;

type Phase = "pending" | "done" | "timeout";

/** Waits for the payment webhook to record the purchase (same idea as the membership success page), then shows the goods. */
export function ProductSuccessPoller({
  product,
  alreadyOwned,
  from,
  lineUrl,
  demoEmail,
  method,
}: {
  product: { id: string; title: string; price_thb: number; cover_url: string | null; product_type: ProductType; has_file: boolean; course_playlist_id: string | null };
  alreadyOwned: boolean;
  from: string | null;
  lineUrl: string | null;
  demoEmail: string | null;
  method: CheckoutMethod;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>(alreadyOwned ? "done" : "pending");
  const [attempt, setAttempt] = React.useState(0);
  const [dest, setDest] = React.useState(from);

  React.useEffect(() => {
    if (from) return;
    try {
      const saved = sessionStorage.getItem(SHOP_FROM_KEY);
      if (saved && saved.startsWith("/") && !saved.startsWith("//")) setDest(saved);
    } catch {}
  }, [from]);

  React.useEffect(() => {
    if (phase !== "pending") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const tick = async () => {
      const r = await productOwnedAction(product.id).catch(() => null);
      if (stopped) return;
      if (r && r.ok && r.owned) {
        setPhase("done");
        router.refresh();
        return;
      }
      if (Date.now() - started >= MAX_WAIT) return setPhase("timeout");
      timer = setTimeout(tick, INTERVAL);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [phase, attempt, product.id, router]);

  // Light celebration; skipped entirely for reduced-motion users.
  React.useEffect(() => {
    if (phase !== "done" || alreadyOwned) return;
    try {
      sessionStorage.removeItem(SHOP_FROM_KEY);
    } catch {}
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const opts = { colors: ["#E8C77A", "#F5F5F7", "#FF4D2E"], disableForReducedMotion: true, ticks: 180, scalar: 0.9 };
      confetti({ ...opts, particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.55 } });
    });
    return () => {
      cancelled = true;
    };
  }, [phase, alreadyOwned]);

  const isCourse = product.product_type === "course" && !!product.course_playlist_id;

  return (
    <section className="mx-auto flex max-w-[480px] flex-col items-center py-20 text-center sm:py-28" aria-live="polite">
      {phase === "pending" && (
        <>
          <span className="relative flex size-20 items-center justify-center" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/15 [animation-duration:2s]" />
            <span className="relative size-14 animate-pulse rounded-full bg-accent/25" />
          </span>
          <h1 className="t-h1 mt-8">กำลังยืนยันการชำระเงิน…</h1>
          <p className="mt-3 text-[15px] font-medium">{product.title}</p>
          <p className="t-meta mt-2 max-w-sm">ปกติใช้เวลาไม่ถึง 1 นาที เปิดหน้านี้ค้างไว้ได้เลย เราจะอัปเดตให้อัตโนมัติ</p>
          <div className="mt-8 w-full max-w-[320px] space-y-2.5" aria-hidden>
            <div className="skeleton h-3 rounded-full" />
            <div className="skeleton mx-auto h-3 w-3/4 rounded-full" />
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <span className="flex size-20 items-center justify-center rounded-full bg-success/15">
            <Check className="size-9 text-success" strokeWidth={2.25} aria-hidden />
          </span>
          <h1 className="t-h1 mt-8 text-balance">ของเข้าคลังแล้ว</h1>
          <div className="mt-5 flex w-full max-w-[380px] items-center gap-4 rounded-[16px] border border-border bg-surface p-3 text-left">
            <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-[10px] bg-elevated">
              {product.cover_url ? (
                <Image src={product.cover_url} alt="" fill sizes="56px" className="object-cover" />
              ) : (
                <span className="flex size-full items-center justify-center text-text-2" aria-hidden>
                  <ShoppingBag className="size-5" strokeWidth={1.5} />
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="t-caption font-medium text-text-2">{PRODUCT_TYPE_LABEL[product.product_type]}</p>
              <p className="line-clamp-2 text-[15px] font-semibold leading-5">{product.title}</p>
            </div>
          </div>
          <p className="t-meta mt-3">
            {isCourse ? "ปลดล็อกทุกตอนของคอร์สแล้ว เรียนได้เลย" : "ดาวน์โหลดได้ทันที และกลับมาโหลดซ้ำได้ทุกเมื่อที่คลังของฉัน"}
          </p>
          <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto">
            {isCourse ? (
              <Button asChild variant="primary" size="lg" className="min-w-[220px]">
                <Link href={`/playlists/${product.course_playlist_id}`}>
                  <GraduationCap /> เข้าเรียน
                </Link>
              </Button>
            ) : product.has_file ? (
              <Button asChild variant="primary" size="lg" className="min-w-[220px]">
                <a href={`/api/shop/download/${product.id}`}>
                  <Download /> ดาวน์โหลดเลย
                </a>
              </Button>
            ) : null}
            <Button asChild variant={isCourse || product.has_file ? "secondary" : "primary"} size="lg">
              <Link href="/library?tab=purchases">เปิดในคลังของฉัน</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href={dest ?? "/shop"}>{dest ? "กลับไปที่เดิม" : "เลือกซื้อสินค้าอื่น"}</Link>
            </Button>
          </div>
        </>
      )}

      {phase === "timeout" && (
        <>
          <span className="flex size-20 items-center justify-center rounded-full bg-hover">
            <Clock className="size-9 text-text-2" strokeWidth={1.75} aria-hidden />
          </span>
          <h1 className="t-h1 mt-8">ยังไม่ได้รับการยืนยัน</h1>
          <p className="t-meta mt-2 max-w-sm">
            บางครั้งระบบชำระเงินใช้เวลานานกว่าปกติ ถ้าชำระแล้วแต่ของยังไม่เข้าคลัง ทักเราทาง LINE OA พร้อมแนบสลิป เราจะรีบตรวจสอบให้
          </p>
          <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="inverse"
              size="lg"
              onClick={() => {
                setPhase("pending");
                setAttempt((a) => a + 1);
              }}
            >
              ตรวจสอบอีกครั้ง
            </Button>
            {lineUrl && (
              <Button asChild variant="outline" size="lg">
                <a href={lineUrl} target="_blank" rel="noopener noreferrer nofollow">
                  <MessageCircle strokeWidth={1.75} /> ติดต่อทาง LINE OA
                </a>
              </Button>
            )}
          </div>
        </>
      )}

      {demoEmail && phase !== "done" && (
        <aside className="mt-10 w-full rounded-[16px] border border-dashed border-border-strong px-5 py-4 text-left text-[13px]">
          <p className="flex items-center gap-1.5 font-semibold text-text-2">
            <FlaskConical className="size-4" strokeWidth={1.75} aria-hidden /> โหมดเดโม
          </p>
          <p className="mt-1.5 text-text-2">จำลองการชำระเงินด้วยคำสั่งนี้ในเทอร์มินัล แล้วหน้านี้จะอัปเดตเอง:</p>
          <code className="mt-2 block select-all overflow-x-auto whitespace-nowrap rounded-[10px] bg-hover px-3 py-2 font-mono text-[12px] text-text">
            npm run webhook:test -- {demoEmail} --product={product.id} --price={product.price_thb} {method}
          </code>
        </aside>
      )}
    </section>
  );
}
