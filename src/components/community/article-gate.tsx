"use client";
import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { useViewer } from "@/components/providers";
import { useSubscribeHref } from "@/components/content/paywall";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { PLANS } from "@/lib/plans";

/** Shown under the excerpt of a members-only article (same call-to-action as the video paywall). */
export function ArticleGate() {
  const { settings } = useViewer();
  const href = useSubscribeHref();
  return (
    <div className="mx-auto max-w-[420px] rounded-[20px] border border-border bg-surface p-6 text-center sm:p-7">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-member/15">
        <Lock className="size-6 text-member" strokeWidth={1.75} />
      </span>
      <h2 className="t-h2 mt-4 text-balance">บทความนี้สำหรับสมาชิก</h2>
      <ul className="mx-auto mt-4 max-w-[300px] space-y-2 text-left text-[14px]">
        {settings.paywall_benefits.map((b) => (
          <li key={b} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-member" strokeWidth={2.25} />
            {b}
          </li>
        ))}
      </ul>
      <p className="tnum mt-5 text-[15px] leading-[24px] text-text-2">
        เริ่มต้น{" "}
        <span className="text-[22px] font-semibold tracking-[-0.01em] text-text">
          {formatNumber(PLANS.monthly.price)} บาท/{PLANS.monthly.unit}
        </span>
        <br />
        หรือ {formatNumber(PLANS.yearly.price)} บาท/{PLANS.yearly.unit}
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Button asChild variant="member" size="lg">
          <Link href={href}>สมัครสมาชิก</Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/community/articles">ดูบทความอื่น</Link>
        </Button>
      </div>
    </div>
  );
}
