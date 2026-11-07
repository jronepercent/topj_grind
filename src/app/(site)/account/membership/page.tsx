import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { paymentsFor, subscriptionFor } from "@/lib/server/queries";
import { daysUntil } from "@/lib/format";
import { MembershipCard, PaymentsCard, PurchasesLink } from "../_components/account-view";

export const metadata: Metadata = { title: "สมาชิก", robots: { index: false, follow: false } };

export default async function AccountMembershipPage() {
  const viewer = await getViewer();
  if (!viewer) return null;
  const [sub, rows] = await Promise.all([subscriptionFor(viewer.id), paymentsFor(viewer.id)]);
  const payments = rows.map((p) => ({
    id: p.id,
    paid_at: p.paid_at,
    amount: p.amount,
    currency: p.currency,
    months: p.months,
    plan: p.plan ?? null,
    method: p.method,
    reference: p.reference,
  }));
  return (
    <>
      <MembershipCard
        viewer={viewer}
        daysLeft={viewer.expires_at ? daysUntil(viewer.expires_at) : null}
        firstPaidAt={sub?.first_paid_at ?? null}
        lastPayment={payments[0] ?? null}
      />
      <PaymentsCard payments={payments} />
      <PurchasesLink />
    </>
  );
}
