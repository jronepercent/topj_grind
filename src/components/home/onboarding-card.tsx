"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { chooseStageAction } from "@/app/(site)/welcome/actions";
import { track } from "@/lib/analytics";
import { STAGES, type OnboardingStage } from "@/lib/onboarding";

/** Home: shown to a signed-in person who has not answered or skipped "ตอนนี้คุณอยู่ตรงไหน" yet. */
export function OnboardingCard() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    track("onboarding_viewed", { where: "home" });
  }, []);

  const choose = (s: OnboardingStage) => {
    startTransition(async () => {
      const r = await chooseStageAction(s);
      if (!r.ok) return void toast(r.error);
      track("onboarding_answered", { stage: s, where: "home" });
      router.refresh();
    });
  };

  return (
    <section aria-label="ตอนนี้คุณอยู่ตรงไหน" className="rounded-[18px] border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-[18px] font-semibold leading-7">ตอนนี้คุณอยู่ตรงไหน?</h2>
      <p className="mt-0.5 text-[14px] leading-6 text-text-2">ตอบ 1 ข้อ แล้วเราจัดเส้นทางให้</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={pending}
            onClick={() => choose(s.key)}
            className="rounded-[14px] border border-border bg-bg px-4 py-3 text-left text-[15px] font-semibold leading-6 transition-colors hover:border-accent hover:bg-hover active:scale-[0.99] disabled:opacity-60"
          >
            {s.label}
          </button>
        ))}
      </div>
      <Link href="/welcome" className="mt-3 inline-block text-[13px] text-text-2 underline underline-offset-4 hover:text-text">
        ดูรายละเอียดแต่ละข้อ
      </Link>
    </section>
  );
}
