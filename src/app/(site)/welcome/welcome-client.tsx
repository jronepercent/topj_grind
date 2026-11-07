"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MemberBadge } from "@/components/ui/misc";
import { Thumb } from "@/components/cards/cards";
import { track } from "@/lib/analytics";
import { contentHref, formatDuration } from "@/lib/format";
import { stageInfo, STAGES, type OnboardingStage } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/lib/types";
import { chooseStageAction, skipOnboardingAction } from "./actions";

export interface PathClip {
  id: string;
  type: ContentType;
  title: string;
  thumbnail_url: string | null;
  duration_sec: number;
  members_only: boolean;
  completed: boolean;
}

export function WelcomeClient({
  stage,
  onboarded,
  path,
  next,
  isMember,
}: {
  stage: OnboardingStage | null;
  onboarded: boolean;
  path: PathClip[];
  next: string;
  isMember: boolean;
}) {
  const router = useRouter();
  const [changing, setChanging] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const asking = !stage || changing;

  React.useEffect(() => {
    if (asking) track("onboarding_viewed", { where: "welcome" });
  }, [asking]);

  const choose = (s: OnboardingStage) => {
    startTransition(async () => {
      const r = await chooseStageAction(s);
      if (!r.ok) return void toast(r.error);
      track("onboarding_answered", { stage: s, where: "welcome" });
      setChanging(false);
      router.refresh();
    });
  };

  const skip = () => {
    startTransition(async () => {
      if (!onboarded) {
        const r = await skipOnboardingAction();
        if (!r.ok) return void toast(r.error);
        track("onboarding_skipped", { where: "welcome" });
      }
      router.push(next);
    });
  };

  if (asking) {
    return (
      <div className="tg-page mx-auto w-full max-w-[640px] px-4 pb-16 pt-8 sm:px-6 sm:pt-14">
        <h1 className="t-display">ตอนนี้คุณอยู่ตรงไหน?</h1>
        <p className="mt-3 text-[16px] leading-7 text-text-2">ตอบ 1 ข้อ เราจะจัดคลิปให้ตรงกับจุดที่คุณอยู่</p>
        <div className="mt-8 grid gap-3" role="group" aria-label="ตอนนี้คุณอยู่ตรงไหน">
          {STAGES.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={pending}
              onClick={() => choose(s.key)}
              aria-pressed={stage === s.key}
              className={cn(
                "w-full rounded-[18px] border bg-surface px-5 py-5 text-left transition-[border-color,background,transform] duration-150 ease-[var(--ease-apple)] hover:border-accent hover:bg-hover active:scale-[0.99] disabled:opacity-60 sm:py-6",
                stage === s.key ? "border-accent" : "border-border",
              )}
            >
              <span className="block text-[18px] font-semibold leading-7">{s.label}</span>
              <span className="mt-1 block text-[14px] leading-6 text-text-2">{s.hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-4">
          <button type="button" onClick={skip} disabled={pending} className="text-[14px] text-text-2 underline underline-offset-4 hover:text-text disabled:opacity-60">
            ข้ามไปก่อน
          </button>
          {changing && (
            <button type="button" onClick={() => setChanging(false)} className="text-[14px] text-text-2 hover:text-text">
              ยกเลิก
            </button>
          )}
        </div>
      </div>
    );
  }

  const info = stageInfo(stage);
  const doneCount = path.filter((c) => c.completed).length;
  const total = path.length + 1; // step 1 = knowing where you are, already done
  const filled = 1 + doneCount;
  const nextClip = path.find((c) => !c.completed);
  const back = next !== "/" && next !== "/welcome" ? next : null;

  const primary = nextClip
    ? { href: contentHref(nextClip), label: doneCount === 0 ? "เริ่มคลิปแรก" : "ดูคลิปถัดไป", position: path.indexOf(nextClip) + 1 }
    : { href: path.length === 0 && next !== "/welcome" ? next : "/", label: "ไปดูคลิปทั้งหมด", position: 0 };

  return (
    <div className="tg-page mx-auto w-full max-w-[720px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <p className="inline-flex items-center gap-2 rounded-full bg-success/15 px-3 py-1 text-[13px] font-semibold text-success">
        <Check className="size-4" strokeWidth={2.5} aria-hidden /> ขั้นที่ 1 เสร็จแล้ว: รู้ว่าตัวเองอยู่ตรงไหน
      </p>

      {path.length > 0 && (
        <div className="mt-4">
          <div
            className="h-2 overflow-hidden rounded-full bg-hover"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={filled}
            aria-label="ความคืบหน้าเส้นทาง"
          >
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(filled / total) * 100}%` }} />
          </div>
          <p className="t-meta tnum mt-1.5">
            {filled}/{total} ขั้น
          </p>
        </div>
      )}

      <h1 className="t-h1 mt-6">{info.pathTitle}</h1>
      <p className="mt-1.5 text-[15px] leading-6 text-text-2">{info.label}</p>

      {path.length > 0 ? (
        <ol className="mt-5 space-y-2">
          {path.map((c, i) => (
            <li key={c.id}>
              <Link
                href={contentHref(c)}
                onClick={() => track("path_clip_clicked", { stage, position: i + 1, where: "welcome" })}
                className="group flex items-center gap-3 rounded-[16px] border border-border bg-surface p-2.5 transition-colors hover:bg-hover"
              >
                <span className={cn("tnum flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold", c.completed ? "bg-success/15 text-success" : "bg-hover text-text-2")}>
                  {c.completed ? <Check className="size-4" strokeWidth={2.5} aria-label="ดูจบแล้ว" /> : i + 1}
                </span>
                <Thumb src={c.thumbnail_url} alt="" sizes="120px" className="w-[112px] shrink-0 sm:w-[136px]">
                  <span className="tnum absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[11px] font-medium leading-4 text-white">{formatDuration(c.duration_sec)}</span>
                </Thumb>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] font-semibold leading-[21px]">{c.title}</span>
                  {c.members_only && <MemberBadge locked={!isMember} className={cn("mt-1", isMember && "bg-member/15")} />}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-5 rounded-[16px] border border-dashed border-border px-4 py-6 text-center text-[14px] text-text-2">เรากำลังเตรียมคลิปสำหรับเส้นทางนี้ ระหว่างนี้ไปดูคลิปทั้งหมดก่อนได้เลย</p>
      )}

      <div className="mt-6 grid gap-3">
        <Button asChild variant="primary" size="lg" className="h-14 w-full text-[17px] font-semibold">
          <Link href={primary.href} onClick={() => primary.position && track("path_clip_clicked", { stage, position: primary.position, where: "welcome" })}>
            {primary.label}
          </Link>
        </Button>
        {back && primary.href !== back && (
          <Link href={back} className="text-center text-[14px] text-text-2 underline underline-offset-4 hover:text-text">
            กลับไปหน้าที่ดูค้างไว้
          </Link>
        )}
      </div>

      <div className="mt-8 border-t border-border pt-4">
        <button type="button" onClick={() => setChanging(true)} className="text-[13px] text-text-2 underline underline-offset-4 hover:text-text">
          เปลี่ยนคำตอบ
        </button>
      </div>
    </div>
  );
}
