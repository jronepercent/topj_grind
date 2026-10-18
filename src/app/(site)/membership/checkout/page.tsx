import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { checkoutMode } from "@/lib/server/payments";
import { CheckoutForm } from "@/components/membership/checkout-form";
import { planFromParam } from "@/lib/plans";

export const metadata: Metadata = {
  title: "ชำระเงิน",
  robots: { index: false, follow: false },
};

function safePath(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : undefined;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[]; from?: string | string[] }>;
}) {
  const sp = await searchParams;
  const plan = planFromParam(sp.plan);
  const from = safePath(sp.from);

  const viewer = await getViewer();
  if (!viewer) {
    const self = `/membership/checkout?plan=${plan}${from ? `&from=${encodeURIComponent(from)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(self)}`);
  }

  const mode = checkoutMode();
  const back = `/membership${from ? `?from=${encodeURIComponent(from)}` : ""}`;

  return (
    <div className="tg-page mx-auto max-w-[1100px] px-4 pb-32 pt-6 sm:px-6 sm:pt-10 lg:px-8 lg:pb-12">
      <Link href={back} className="-ml-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[14px] text-text-2 hover:bg-hover hover:text-text">
        <ChevronLeft className="size-4" strokeWidth={2} aria-hidden /> กลับไปดูแพ็กเกจ
      </Link>
      <h1 className="t-h1 mb-6 mt-3 sm:mb-8">ชำระเงิน</h1>
      <CheckoutForm
        initialPlan={plan}
        currentExpiresAt={viewer.expires_at}
        now={Date.now()}
        mode={mode}
        from={from ?? null}
        demoEmail={mode === "demo" ? viewer.email : null}
        payEmail={mode === "live" ? viewer.email : null}
      />
    </div>
  );
}
