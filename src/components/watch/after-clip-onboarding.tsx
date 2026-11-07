"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { chooseStageAction, skipOnboardingAction } from "@/app/(site)/welcome/actions";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { STAGES, stageInfo, type OnboardingStage } from "@/lib/onboarding";

/** Under the player, once a signed-in person who has not been onboarded finishes a clip: the one question, then the first clip of their path. */
export const AfterClipOnboarding = React.forwardRef<
  HTMLElement,
  { contentId: string; onAnswered: () => void; onSkipped: () => void }
>(function AfterClipOnboarding({ contentId, onAnswered, onSkipped }, ref) {
  const [pending, startTransition] = React.useTransition();
  const [answer, setAnswer] = React.useState<{ stage: OnboardingStage; next: { href: string; title: string } | null } | null>(null);

  React.useEffect(() => {
    track("onboarding_viewed", { where: "after_clip" });
  }, []);

  const choose = (s: OnboardingStage) => {
    startTransition(async () => {
      const r = await chooseStageAction(s, contentId);
      if (!r.ok) return void toast(r.error);
      track("onboarding_answered", { stage: s, where: "after_clip" });
      setAnswer({ stage: s, next: r.next ?? null });
      onAnswered();
    });
  };

  const skip = () => {
    startTransition(async () => {
      const r = await skipOnboardingAction();
      if (!r.ok) return void toast(r.error);
      track("onboarding_skipped", { where: "after_clip" });
      onSkipped();
    });
  };

  if (answer) {
    const info = stageInfo(answer.stage);
    return (
      <section ref={ref} aria-label="จัดเส้นทางให้แล้ว" className="mb-4 rounded-[18px] border border-border bg-surface p-4 sm:p-5">
        <p className="flex items-center gap-2 text-[16px] font-semibold leading-6">
          <Check className="size-5 shrink-0 text-success" strokeWidth={2.5} aria-hidden /> จัดเส้นทางให้แล้ว: {info.pathTitle}
        </p>
        {answer.next ? (
          <Button asChild variant="primary" size="lg" className="mt-3 h-auto min-h-14 w-full whitespace-normal py-3 text-[16px] font-semibold">
            <Link href={answer.next.href} onClick={() => track("path_clip_clicked", { stage: answer.stage, position: 1, where: "after_clip" })}>
              ดูคลิปถัดไป: {answer.next.title}
            </Link>
          </Button>
        ) : (
          <Link href="/welcome" className="mt-3 inline-block text-[14px] font-medium text-text underline underline-offset-4 hover:text-accent">
            ดูเส้นทางของคุณ
          </Link>
        )}
      </section>
    );
  }

  return (
    <section ref={ref} aria-label="ดูจบแล้ว ขอถาม 1 ข้อ" className="mb-4 rounded-[18px] border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-[18px] font-semibold leading-7">ดูจบแล้ว ขอถาม 1 ข้อ</h2>
      <p className="mt-0.5 text-[14px] leading-6 text-text-2">ตอนนี้คุณอยู่ตรงไหน? เราจะจัดคลิปถัดไปให้ตรงกับคุณ</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={pending}
            onClick={() => choose(s.key)}
            className="rounded-[14px] border border-border bg-bg px-4 py-3 text-left transition-colors hover:border-accent hover:bg-hover active:scale-[0.99] disabled:opacity-60"
          >
            <span className="block text-[15px] font-semibold leading-6">{s.label}</span>
            <span className="mt-0.5 block text-[13px] leading-5 text-text-2">{s.hint}</span>
          </button>
        ))}
      </div>
      <button type="button" disabled={pending} onClick={skip} className="mt-3 text-[13px] text-text-2 underline underline-offset-4 hover:text-text disabled:opacity-60">
        ข้าม
      </button>
    </section>
  );
});
