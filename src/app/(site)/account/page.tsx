import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getViewer } from "@/lib/server/auth";
import { paymentsFor } from "@/lib/server/queries";
import { subscriptionFor } from "@/lib/server/queries";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { daysUntil } from "@/lib/format";
import type { ThemePref } from "@/lib/types";
import { AccountView } from "./_components/account-view";

export const metadata: Metadata = {
  title: "บัญชีของฉัน",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <EmptyState
          art="bell"
          className="py-24"
          title="เข้าสู่ระบบเพื่อจัดการบัญชี"
          body="ดูสถานะสมาชิก วันหมดอายุ ประวัติการชำระเงิน และตั้งค่าการใช้งานของคุณ"
          action={
            <Button asChild variant="inverse" size="lg">
              <Link href="/login?next=/account">เข้าสู่ระบบ</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const cookieTheme = (await cookies()).get("tg_theme")?.value;
  const theme: ThemePref = cookieTheme === "light" || cookieTheme === "system" || cookieTheme === "dark" ? cookieTheme : viewer.theme;
  const sub = await subscriptionFor(viewer.id);
  const payments = (await paymentsFor(viewer.id)).map((p) => ({
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
    <div className="tg-page mx-auto max-w-[1800px] px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
      <div className="mx-auto max-w-[760px]">
        <h1 className="t-h1">บัญชีของฉัน</h1>
        <AccountView
          viewer={viewer}
          theme={theme}
          daysLeft={viewer.expires_at ? daysUntil(viewer.expires_at) : null}
          firstPaidAt={sub?.first_paid_at ?? null}
          payments={payments}
        />
      </div>
    </div>
  );
}
