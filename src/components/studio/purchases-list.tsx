"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm";
import { Card } from "./ui";
import { refundPurchaseAction } from "@/app/studio/shop/actions";
import { thaiDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/plans";
import { formatBaht, type StudioPurchaseRow } from "@/lib/shop";
import { cn } from "@/lib/utils";

/** Latest purchases (all products, or one product's). “ถอนสิทธิ์” marks a purchase refunded — the buyer loses the download / unlock. */
export function PurchasesList({ rows, showProduct = true, empty = "ยังไม่มีรายการสั่งซื้อ" }: { rows: StudioPurchaseRow[]; showProduct?: boolean; empty?: string }) {
  const router = useRouter();
  const [target, setTarget] = React.useState<StudioPurchaseRow | null>(null);

  if (!rows.length) return <p className="t-meta rounded-[12px] border border-dashed border-border px-4 py-6 text-center">{empty}</p>;

  return (
    <>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-[14px] font-semibold">{r.user_name}</p>
                <p className="t-meta truncate">{r.user_email || r.user_id}</p>
              </div>
              {showProduct && <p className="min-w-0 flex-1 basis-48 truncate text-[14px]">{r.product_title}</p>}
              <p className="tnum text-[14px] font-medium">{r.amount > 0 ? formatBaht(r.amount) : "ฟรี"}</p>
              <p className="t-meta">{PAYMENT_METHOD_LABEL[r.method]}</p>
              <p className="t-meta tnum">{thaiDateTime(r.paid_at)}</p>
              {r.status === "refunded" ? (
                <span className={cn("rounded-full bg-hover px-2.5 py-0.5 text-[12px] font-medium text-text-2")}>ถอนสิทธิ์แล้ว</span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setTarget(r)}>
                  ถอนสิทธิ์
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="ถอนสิทธิ์รายการนี้?"
        body={target ? `${target.user_name} จะดาวน์โหลด “${target.product_title}” ไม่ได้อีก (การคืนเงินต้องทำในระบบชำระเงินแยกต่างหาก)` : undefined}
        confirmLabel="ถอนสิทธิ์"
        onConfirm={async () => {
          if (!target) return;
          const x = await refundPurchaseAction(target.id);
          setTarget(null);
          toast(x.ok ? "ถอนสิทธิ์แล้ว" : x.error);
          if (x.ok) router.refresh();
        }}
      />
    </>
  );
}
