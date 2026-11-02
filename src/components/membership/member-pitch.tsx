import Link from "next/link";
import { siteSettings } from "@/lib/server/queries";
import { Button } from "@/components/ui/button";
import { BenefitList, MemberStatChips } from "@/components/membership/benefits";
import { formatNumber } from "@/lib/format";
import { PLANS, yearlyPerMonth } from "@/lib/plans";

/** Home page band for visitors who are not members yet: what membership gives, what it costs, one way in. */
export async function MemberPitch() {
  const s = await siteSettings();

  return (
    <section aria-labelledby="pitch-h" className="rounded-[20px] border border-border bg-surface p-5 sm:p-7 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-10">
      <div>
        <p className="text-[14px] font-semibold text-member">TOPJ_GRIND Membership</p>
        <h2 id="pitch-h" className="t-h1 mt-2">
          เป็นสมาชิกแล้วได้อะไร
        </h2>
        <p className="mt-2 text-[15px] leading-[24px] text-text-2">ข้างนอกบอกว่าต้องทำอะไร ในนี้สอนว่าทำยังไง ทีละขั้น</p>

        <MemberStatChips className="mt-4" />

        <p className="tnum mt-5 text-[15px] font-medium">
          เริ่มเพียง {formatNumber(yearlyPerMonth())} บาท/เดือน เมื่อจ่ายรายปี
        </p>
        <p className="t-meta tnum mt-0.5">หรือรายเดือน {formatNumber(PLANS.monthly.price)} บาท ยกเลิกได้ทุกเมื่อ</p>

        <Button asChild variant="member" size="lg" className="mt-5 w-full sm:w-auto">
          <Link href="/membership">ดูแพ็กเกจสมาชิก</Link>
        </Button>
      </div>

      <BenefitList benefits={s.paywall_benefits} compact className="mt-6 lg:mt-0" />
    </section>
  );
}
