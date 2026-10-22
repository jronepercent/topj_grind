import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, FileDown, Headphones, MessageCircle, SquarePlay } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { listContent, paymentsFor, siteSettings } from "@/lib/server/queries";
import { MemberBadge } from "@/components/ui/misc";
import { PlanCard } from "@/components/membership/plan-card";
import { contentHref, daysUntil, formatDuration, formatNumber, thaiDate } from "@/lib/format";
import { PLANS, PLAN_LIST, planOfPayment, renewalLabel, type PlanCode } from "@/lib/plans";
import { PayButton } from "./_components/pay-button";

export const metadata: Metadata = {
  title: "สมัครสมาชิก",
  description: "สมาชิก TOPJ_GRIND ดูได้ทุกคลิป ฟังพอดแคสต์ทุกตอน ดาวน์โหลดไฟล์ประกอบ และคอมเมนต์คุยกับ JR ได้โดยตรง",
};

function safePath(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : undefined;
}

/** `line` is the channel's LINE OA link (Studio → settings → socials), linked from the last answer when set. */
const faq = (line: string | null): { q: string; a: ReactNode }[] => [
  {
    q: "ยกเลิกยังไง?",
    a: "ถ้าจ่ายด้วยบัตร ระบบจะต่ออายุให้อัตโนมัติทุกรอบ และยกเลิกได้ทุกเมื่อก่อนรอบถัดไป สมาชิกยังใช้งานได้จนครบรอบที่จ่ายไปแล้ว ถ้าจ่ายด้วยพร้อมเพย์ ไม่มีการตัดเงินอัตโนมัติ สมาชิกจะหมดอายุเองเมื่อครบรอบ",
  },
  {
    q: "บัตรกับพร้อมเพย์ต่างกันยังไง?",
    a: `บัตรเครดิต/เดบิตคือช่องทางหลัก ต่ออายุอัตโนมัติ ไม่ต้องกลับมาจ่ายเอง ส่วนพร้อมเพย์สแกน QR จ่ายครั้งเดียว ใช้ได้ตามแพ็กเกจที่เลือก (${PLANS.monthly.days} หรือ ${PLANS.yearly.days} วัน) ครบแล้วต้องชำระใหม่เอง`,
  },
  {
    q: "ต่ออายุยังไง?",
    a: "เลือกแพ็กเกจแล้วชำระเงินได้ตลอดเวลา แม้ยังเป็นสมาชิกอยู่ วันใหม่จะต่อจากวันหมดอายุเดิม วันที่เหลืออยู่ไม่หายไปไหน",
  },
  {
    q: "จ่ายแล้วดูได้เลยไหม?",
    a: (
      <>
        ได้ทันทีหลังระบบยืนยันการชำระเงิน ปกติใช้เวลาไม่ถึง 1 นาที ถ้านานกว่านั้นทักเราทาง{" "}
        {line ? (
          <a href={line} target="_blank" rel="noopener noreferrer" className="font-medium text-text underline underline-offset-4">
            LINE OA
          </a>
        ) : (
          "LINE OA"
        )}{" "}
        พร้อมหลักฐานการชำระเงินได้เลย
      </>
    ),
  },
  {
    q: "ขอเงินคืนได้ไหม?",
    a: (
      <>
        ดูเงื่อนไขทั้งหมดได้ที่{" "}
        <Link href="/refund" className="font-medium text-text underline underline-offset-4">
          นโยบายการคืนเงิน
        </Link>
      </>
    ),
  },
];

const BENEFIT_ICONS = [SquarePlay, Headphones, FileDown, MessageCircle];

export default async function MembershipPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from: rawFrom } = await searchParams;
  const from = safePath(rawFrom);
  const viewer = await getViewer();
  const s = await siteSettings();

  let samples = await listContent({ visibility: "members", types: ["video", "podcast"], limit: 8 });
  if (!samples.length) samples = await listContent({ visibility: "members", limit: 8 });

  const isMember = !!viewer?.is_member;
  const hasExpiry = isMember && !!viewer?.expires_at;
  const left = hasExpiry ? Math.max(0, daysUntil(viewer!.expires_at)) : 0;
  const lastPayment = hasExpiry ? (await paymentsFor(viewer!.id).catch(() => []))[0] : undefined;
  const lastPlan = lastPayment ? planOfPayment(lastPayment) : null;

  const self = `/membership${from ? `?from=${encodeURIComponent(from)}` : ""}`;
  const checkoutHref = (plan: PlanCode) => `/membership/checkout?plan=${plan}${from ? `&from=${encodeURIComponent(from)}` : ""}`;
  // Guests sign up first and come straight back to the checkout for the plan they picked.
  const ctaHref = (plan: PlanCode) => (viewer ? checkoutHref(plan) : `/signup?next=${encodeURIComponent(checkoutHref(plan))}`);
  const ctaLabel = (plan: PlanCode) => (viewer ? `${isMember ? "ต่ออายุ" : "สมัคร"}${PLANS[plan].label}` : "สมัครและชำระเงิน");

  return (
    <div className="tg-page mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8">
      {/* ── Hero ── */}
      <section className="mx-auto max-w-[860px] pb-12 pt-12 text-center sm:pt-20">
        <p className="text-[14px] font-semibold text-member">TOPJ_GRIND Membership</p>
        <h1 className="mt-3 text-balance text-[34px] font-semibold leading-[42px] tracking-[-0.03em] sm:text-[56px] sm:leading-[64px]">
          ปลดล็อกทุกคลิป
          <br />
          เรียนครบในที่เดียว
        </h1>
        <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-[27px] text-text-2">
          วิดีโอเต็ม พอดแคสต์ บทความ และไฟล์ประกอบจาก JR ดูได้ไม่จำกัด เลือกรายเดือน {formatNumber(PLANS.monthly.price)} บาท หรือรายปี{" "}
          {formatNumber(PLANS.yearly.price)} บาท
        </p>

        {isMember && (
          <div className="mx-auto mt-8 max-w-[420px] rounded-[16px] border border-border bg-surface p-6">
            <MemberBadge label="คุณเป็นสมาชิกอยู่แล้ว" />
            {hasExpiry ? (
              <>
                <p className="mt-3 text-[20px] font-semibold">สมาชิกถึงวันที่ {thaiDate(viewer!.expires_at)}</p>
                <p className="t-meta tnum mt-1">เหลืออีก {formatNumber(left)} วัน · ต่ออายุล่วงหน้าได้ วันจะต่อจากวันหมดอายุเดิม</p>
                {lastPayment && (
                  <p className="t-meta mt-3 border-t border-border pt-3">
                    {lastPlan ? `แพ็กเกจ${lastPlan.label} · ` : ""}
                    {renewalLabel(lastPayment.method)}
                    {lastPayment.method === "card" && " ไม่ต้องชำระซ้ำ"}
                  </p>
                )}
              </>
            ) : (
              <p className="t-meta mt-3">บัญชีผู้ดูแลช่องเข้าถึงคอนเทนต์ได้ทั้งหมด</p>
            )}
          </div>
        )}

        {!viewer && (
          <p className="t-meta mt-6">
            มีบัญชีแล้ว?{" "}
            <Link href={`/login?next=${encodeURIComponent(self)}`} className="font-medium text-text underline-offset-4 hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>
        )}
      </section>

      {/* ── Plans (the channel owner's own account has full access, so nothing to sell there) ── */}
      {(!isMember || hasExpiry) && (
        <section className="mx-auto max-w-[900px]" aria-labelledby="plans-h">
          <h2 id="plans-h" className="t-h1 mb-8 text-center">
            {isMember ? "ต่ออายุล่วงหน้า" : "เลือกแพ็กเกจ"}
          </h2>
          <div className="grid gap-6 md:grid-cols-2 md:gap-5">
            {PLAN_LIST.map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                highlighted={plan.code === "yearly"}
                // Best value first when stacked on a phone, on the right on wider screens.
                className={plan.code === "yearly" ? "order-first md:order-last" : undefined}
                cta={
                  <PayButton href={ctaHref(plan.code)} from={from} variant={plan.code === "yearly" ? "member" : "outline"} className="w-full">
                    {ctaLabel(plan.code)}
                  </PayButton>
                }
              />
            ))}
          </div>
          <p className="t-meta mt-5 text-center">
            ชำระด้วยบัตรเครดิต/เดบิต (ต่ออายุอัตโนมัติ ยกเลิกได้ทุกเมื่อ) หรือพร้อมเพย์ (จ่ายครั้งเดียว ไม่ต่ออัตโนมัติ)
          </p>
        </section>
      )}

      {/* ── Sample content strip ── */}
      {samples.length > 0 && (
        <section className="mx-auto mt-16 max-w-[1200px]" aria-labelledby="samples-h">
          <h2 id="samples-h" className="t-h2 mb-4 text-center">
            ตัวอย่างคอนเทนต์สำหรับสมาชิก
          </h2>
          <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6">
            {samples.map((c) => (
              <li key={c.id} className="w-[64vw] shrink-0 snap-start sm:w-[260px]">
                <Link href={contentHref(c)} className="group block rounded-[12px]">
                  <span className="relative block aspect-video overflow-hidden rounded-[12px] bg-surface">
                    {c.thumbnail_url && (
                      <Image
                        src={c.thumbnail_url}
                        alt=""
                        fill
                        sizes="(max-width:640px) 64vw, 260px"
                        className="object-cover transition-transform duration-150 group-hover:scale-[1.02]"
                      />
                    )}
                    <MemberBadge locked={!isMember} className="absolute left-2 top-2 bg-black/60 backdrop-blur" />
                    <span className="tnum absolute bottom-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
                      {formatDuration(c.duration_sec)}
                    </span>
                  </span>
                  <span className="mt-2 line-clamp-2 block text-[14px] font-medium leading-5">{c.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Benefits ── */}
      <section className="mx-auto mt-16 max-w-[980px]" aria-labelledby="benefits-h">
        <h2 id="benefits-h" className="t-h1 text-center">
          สมาชิกได้อะไรบ้าง
        </h2>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {s.paywall_benefits.map((b, i) => {
            const Icon = BENEFIT_ICONS[i] ?? Check;
            return (
              <li key={b} className="flex items-start gap-4 rounded-[16px] border border-border bg-surface p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-member/15">
                  <Icon className="size-5 text-member" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="pt-2 text-[15px] font-medium">{b}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto mt-16 max-w-[760px] pb-8" aria-labelledby="faq-h">
        <h2 id="faq-h" className="t-h1 text-center">
          คำถามที่พบบ่อย
        </h2>
        <div className="mt-8 divide-y divide-border border-y border-border">
          {faq(s.socials.find((x) => x.key === "line" && /^https?:\/\//i.test(x.url))?.url ?? null).map((f) => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-5 text-[16px] font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown
                  className="size-5 shrink-0 text-text-2 transition-transform duration-200 ease-[var(--ease-apple)] group-open:rotate-180"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </summary>
              <p className="pb-5 pr-9 text-[15px] leading-[24px] text-text-2">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
