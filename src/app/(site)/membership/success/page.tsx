import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/server/auth";
import { checkoutMode } from "@/lib/server/payments";
import { siteSettings } from "@/lib/server/queries";
import { subscriptionFor } from "@/lib/server/queries";
import { isCheckoutMethod, isPlanCode } from "@/lib/plans";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { SuccessPoller } from "../_components/success-poller";

export const metadata: Metadata = {
  title: "ยืนยันการชำระเงิน",
  robots: { index: false, follow: false },
};

function safePath(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : undefined;
}

export default async function MembershipSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; demo?: string; plan?: string; method?: string }>;
}) {
  const sp = await searchParams;
  const from = safePath(sp.from);
  // plan / method come from the link and are only used to word the page; the payment itself decides the membership.
  const plan = isPlanCode(sp.plan) ? sp.plan : null;
  const method = isCheckoutMethod(sp.method) ? sp.method : null;
  const viewer = await getViewer();

  if (!viewer) {
    const self = `/membership/success${from ? `?from=${encodeURIComponent(from)}` : ""}`;
    return (
      <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
        <EmptyState
          art="bell"
          className="py-24"
          title="เข้าสู่ระบบเพื่อตรวจสอบสถานะสมาชิก"
          body="ใช้บัญชีเดียวกับที่ใช้ชำระเงิน แล้วเราจะยืนยันสถานะให้อัตโนมัติ"
          action={
            <Button asChild variant="inverse" size="lg">
              <Link href={`/login?next=${encodeURIComponent(self)}`}>เข้าสู่ระบบ</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // If the webhook already landed in the last few minutes (fast payment), celebrate right away.
  const sub = await subscriptionFor(viewer.id);
  const justPaid =
    viewer.is_member && !!sub?.updated_at && Date.now() - new Date(sub.updated_at).getTime() < 10 * 60_000 && !!sub.expires_at;
  const line = (await siteSettings()).socials.find((x) => x.key === "line" && /^https?:\/\//i.test(x.url))?.url ?? null;

  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
      <SuccessPoller
        from={from ?? null}
        justPaid={justPaid}
        expiresAt={viewer.expires_at}
        isMember={viewer.is_member}
        lineUrl={line}
        demoEmail={checkoutMode() === "demo" ? viewer.email : null}
        plan={plan}
        method={method}
      />
    </div>
  );
}
