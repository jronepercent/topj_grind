import { Check } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { yearlyPerMonth, yearlySavings, type Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** One plan on /membership. The call-to-action is passed in so this stays a plain server component. */
export function PlanCard({ plan, highlighted, cta, className }: { plan: Plan; highlighted?: boolean; cta: React.ReactNode; className?: string }) {
  const yearly = plan.code === "yearly";
  const save = yearlySavings();
  const points = [
    `ดูได้ไม่จำกัดตลอด ${formatNumber(plan.days)} วัน`,
    yearly ? "จ่ายครั้งเดียวต่อปี ไม่ต้องคิดเรื่องต่ออายุทุกเดือน" : "ยืดหยุ่น เริ่มและหยุดได้ตามใจ",
    "บัตร: ต่ออายุอัตโนมัติ · พร้อมเพย์: จ่ายครั้งเดียว",
  ];

  return (
    <article
      aria-labelledby={`plan-${plan.code}`}
      className={cn(
        "relative flex flex-col rounded-[20px] border p-6 sm:p-8",
        highlighted ? "border-member/70 bg-elevated shadow-[0_0_0_1px_var(--member)]" : "border-border bg-surface",
        className,
      )}
    >
      {highlighted && (
        <span className="absolute -top-3 left-6 rounded-full bg-member px-3 py-1 text-[12px] font-semibold leading-4 text-on-member sm:left-8">
          คุ้มที่สุด
        </span>
      )}

      <h3 id={`plan-${plan.code}`} className="text-[15px] font-semibold text-text-2">
        {plan.name}
      </h3>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <span className="tnum text-[44px] font-semibold leading-none tracking-[-0.03em]">{formatNumber(plan.price)}</span>
        <span className="text-[15px] text-text-2">บาท / {plan.unit}</span>
      </p>

      {yearly ? (
        <div className="mt-3 space-y-2">
          <p className="tnum text-[14px] text-text-2">
            เฉลี่ยเพียง ~{formatNumber(yearlyPerMonth())} บาท/เดือน{" "}
            <span className="whitespace-nowrap">
              (เทียบรายเดือน <s>{formatNumber(save.base)}</s> บาท)
            </span>
          </p>
          <p className="tnum inline-block rounded-full bg-member/15 px-2.5 py-1 text-[13px] font-semibold text-member">
            ประหยัด {formatNumber(save.saved)} บาท · {formatNumber(save.percent)}%
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[14px] text-text-2">ต่ออายุทุก {formatNumber(plan.days)} วัน</p>
      )}

      <ul className="mt-6 space-y-2.5 text-[14px]">
        {points.map((x) => (
          <li key={x} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-member" strokeWidth={2.25} aria-hidden />
            {x}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-7">{cta}</div>
    </article>
  );
}
