import Link from "next/link";
import { PaymentErrorsCard } from "@/components/studio/members-manager";
import { METHOD_LABEL, PLAN_LABEL } from "@/components/studio/types";
import { Card, CardHeader } from "@/components/studio/ui";
import { formatNumber, thaiDate } from "@/lib/format";
import { getPaymentErrors, recentPayments } from "../../../_lib/data";

export const metadata = { title: "การชำระเงิน · สมาชิก" };

export default async function MembersPaymentsPage() {
  const [errors, payments] = await Promise.all([getPaymentErrors(), recentPayments(50)]);
  return (
    <div className="space-y-8">
      <PaymentErrorsCard paymentErrors={errors} />
      <Card>
        <CardHeader title="การชำระเงินล่าสุด" description="50 รายการล่าสุด" />
        {payments.length === 0 ? (
          <p className="t-meta px-5 pb-5 pt-2">ยังไม่มีการชำระเงิน</p>
        ) : (
          <div className="overflow-x-auto px-5 pb-4 pt-2">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[12px] text-text-2">
                  <th className="py-2 pr-3 font-medium">วันที่</th>
                  <th className="px-3 py-2 font-medium">ชื่อ</th>
                  <th className="px-3 py-2 font-medium">แผน</th>
                  <th className="px-3 py-2 font-medium">ช่องทาง</th>
                  <th className="py-2 pl-3 text-right font-medium">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="tnum border-b border-border last:border-0">
                    <td className="py-2 pr-3">{thaiDate(p.paid_at)}</td>
                    <td className="px-3 py-2">
                      <Link href={`/studio/members/${p.user_id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{p.plan ? PLAN_LABEL[p.plan] : "—"}</td>
                    <td className="px-3 py-2">{METHOD_LABEL[p.method] ?? p.method}</td>
                    <td className="py-2 pl-3 text-right">฿{formatNumber(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
