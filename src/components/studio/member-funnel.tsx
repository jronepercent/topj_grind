"use client";
import * as React from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardHeader } from "./ui";
import { ONBOARDING_STAGE_LABEL, type FunnelWindow, type FunnelWindowKey, type OnboardingStage } from "./types";

const STAGES: OnboardingStage[] = ["idea", "build", "sell"];

/** "Funnel การสมัคร": signup → first view → finished a clip → came back → paid. */
export function MemberFunnel({ windows }: { windows: FunnelWindow[] }) {
  const [key, setKey] = React.useState<FunnelWindowKey>("30");
  const w = windows.find((x) => x.key === key) ?? windows[0];
  const base = w.steps[0]?.count ?? 0;
  const pct = (n: number) => (base ? Math.round((n / base) * 100) : 0);

  return (
    <Card>
      <CardHeader
        title="Funnel การสมัคร"
        className="flex-col sm:flex-row"
        description="คนที่สมัครบัญชีในช่วงเวลานั้น ไปถึงขั้นไหนบ้าง"
        action={
          <div role="tablist" aria-label="ช่วงเวลา" className="flex shrink-0 gap-1 rounded-full border border-border p-0.5">
            {windows.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={key === x.key}
                onClick={() => setKey(x.key)}
                className={cn("h-7 rounded-full px-3 text-[12px] font-medium transition-colors", key === x.key ? "bg-text text-bg" : "text-text-2 hover:text-text")}
              >
                {x.label}
              </button>
            ))}
          </div>
        }
      />
      <ol className="space-y-3 px-5 pb-2 pt-4">
        {w.steps.map((s, i) => {
          const prev = i > 0 ? w.steps[i - 1].count : 0;
          const drop = i > 0 && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
          return (
            <li key={s.label}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                <span className="font-medium">{s.label}</span>
                <span className="tnum text-text-2">
                  <b className="font-semibold text-text">{formatNumber(s.count)}</b> · {pct(s.count)}%
                  {drop !== null && <span className="ml-2">หลุด {drop}%</span>}
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-elevated" role="img" aria-label={`${s.label}: ${formatNumber(s.count)} คน (${pct(s.count)}%)`}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct(s.count)}%`, minWidth: s.count ? 4 : 0 }} />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="t-caption px-5 pt-1 text-text-2">แต่ละขั้นนับแยกกัน (ไม่จำเป็นต้องผ่านขั้นก่อนหน้า) · “จ่ายเงิน” รวมที่แอดมินต่ออายุให้เอง</p>
      <p className="t-meta px-5 pb-5 pt-3">
        ตอบคำถาม onboarding แล้ว <span className="tnum">{formatNumber(w.onboarding.answered)}</span> คน
        {w.onboarding.answered > 0 && (
          <span className="tnum"> · {STAGES.map((s) => `${ONBOARDING_STAGE_LABEL[s]} ${formatNumber(w.onboarding.stages[s])}`).join(" · ")}</span>
        )}
        <span className="t-caption tnum block text-text-2">
          คนที่สมัครหลัง 7 พ.ย. ตอบ {formatNumber(w.onboarding.since.answered)}/{formatNumber(w.onboarding.since.total)}
        </span>
      </p>
    </Card>
  );
}
