import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, FileDown, FlaskConical, Headphones, MessageCircle, SquarePlay } from "lucide-react";
import { getViewer, isDemoMode } from "@/lib/server/auth";
import { listContent, siteSettings } from "@/lib/server/queries";
import { Button } from "@/components/ui/button";
import { MemberBadge } from "@/components/ui/misc";
import { contentHref, daysUntil, formatDuration, formatNumber, thaiDate } from "@/lib/format";
import { PayButton } from "./_components/pay-button";

export const metadata: Metadata = {
  title: "สมัครสมาชิก",
  description: "สมาชิก TOPJ_GRIND ดูได้ทุกคลิป ฟังพอดแคสต์ทุกตอน ดาวน์โหลดไฟล์ประกอบ และคอมเมนต์คุยกับ JR ได้โดยตรง",
  robots: { index: false, follow: true },
};

function safePath(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : undefined;
}

const FAQ = [
  {
    q: "ยกเลิกยังไง?",
    a: "ไม่ต้องยกเลิกเลย ระบบไม่มีการตัดเงินอัตโนมัติ สมาชิกจะหมดอายุเองเมื่อครบ 30 วัน ถ้าอยากดูต่อค่อยต่ออายุเอง",
  },
  {
    q: "จ่ายผ่านช่องทางไหนได้บ้าง?",
    a: "บัตรเครดิต/เดบิต, PromptPay QR, Apple Pay, Google Pay หรือโอนเงินแล้วแนบสลิป",
  },
  {
    q: "ต่ออายุยังไง?",
    a: "กด “ต่ออายุล่วงหน้า” แล้วชำระเงินได้ตลอดเวลา วันใหม่จะต่อจากวันหมดอายุเดิม วันที่เหลืออยู่ไม่หายไปไหน",
  },
  {
    q: "จ่ายแล้วดูได้เลยไหม?",
    a: "ได้ทันทีหลังระบบยืนยันการชำระเงิน ปกติใช้เวลาไม่ถึง 1 นาที ถ้านานกว่านั้นทักเราทาง LINE OA พร้อมสลิปได้เลย",
  },
];

const BENEFIT_ICONS = [SquarePlay, Headphones, FileDown, MessageCircle];

export default async function MembershipPage({ searchParams }: { searchParams: Promise<{ from?: string | string[] }> }) {
  const { from: rawFrom } = await searchParams;
  const from = safePath(rawFrom);
  const viewer = await getViewer();
  const s = siteSettings();
  const demo = isDemoMode();
  const paymentUrl = process.env.PAYMENT_URL?.trim();

  let samples = listContent({ visibility: "members", types: ["video", "podcast"], limit: 8 });
  if (!samples.length) samples = listContent({ visibility: "members", limit: 8 });

  // ── Where "ชำระเงิน" goes (built server-side) ──
  const self = `/membership${from ? `?from=${encodeURIComponent(from)}` : ""}`;
  let payHref: string | null;
  let external = false;
  if (!viewer) {
    payHref = `/signup?next=${encodeURIComponent(self)}`;
  } else if (paymentUrl) {
    try {
      const u = new URL(paymentUrl);
      u.searchParams.set("uid", viewer.id);
      u.searchParams.set("email", viewer.email);
      payHref = u.toString();
      external = true;
    } catch {
      payHref = null;
    }
  } else if (demo) {
    payHref = `/membership/success?demo=1${from ? `&from=${encodeURIComponent(from)}` : ""}`;
  } else {
    payHref = null;
  }

  const isMember = !!viewer?.is_member;
  const hasExpiry = isMember && !!viewer?.expires_at;
  const left = hasExpiry ? Math.max(0, daysUntil(viewer!.expires_at)) : 0;
  const ctaLabel = isMember ? "ต่ออายุล่วงหน้า" : "ชำระเงิน";
  const showDemoNote = !!viewer && !paymentUrl && demo;

  const cta = (className?: string) =>
    payHref ? (
      <PayButton href={payHref} from={from} external={external} className={className}>
        {viewer ? ctaLabel : "สมัครและชำระเงิน"}
      </PayButton>
    ) : (
      <Button variant="member" size="lg" disabled className={className}>
        ระบบชำระเงินยังไม่เปิด
      </Button>
    );

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
          วิดีโอเต็ม Shorts พอดแคสต์ และไฟล์ประกอบจาก JR ดูได้ไม่จำกัดตลอด 30 วัน ไม่มีตัดเงินอัตโนมัติ
        </p>

        {isMember ? (
          <div className="mx-auto mt-8 max-w-[420px] rounded-[16px] border border-border bg-surface p-6">
            <MemberBadge label="คุณเป็นสมาชิกอยู่แล้ว" />
            {hasExpiry ? (
              <>
                <p className="mt-3 text-[20px] font-semibold">สมาชิกถึงวันที่ {thaiDate(viewer!.expires_at)}</p>
                <p className="t-meta tnum mt-1">เหลืออีก {formatNumber(left)} วัน · ต่ออายุล่วงหน้าได้ วันจะต่อจากวันหมดอายุเดิม</p>
                <div className="mt-5">{cta("w-full")}</div>
              </>
            ) : (
              <p className="t-meta mt-3">บัญชีผู้ดูแลช่องเข้าถึงคอนเทนต์ได้ทั้งหมด</p>
            )}
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center gap-4">
            <p className="flex items-baseline gap-1.5">
              <span className="tnum text-[48px] font-semibold leading-none tracking-[-0.03em]">{formatNumber(s.price_thb)}</span>
              <span className="text-[17px] text-text-2">บาท/เดือน</span>
            </p>
            {cta()}
            {viewer?.expires_at && <p className="t-meta">สมาชิกของคุณหมดอายุเมื่อ {thaiDate(viewer.expires_at)}</p>}
            {!viewer && (
              <p className="t-meta">
                มีบัญชีแล้ว?{" "}
                <Link href={`/login?next=${encodeURIComponent(self)}`} className="font-medium text-text underline-offset-4 hover:underline">
                  เข้าสู่ระบบ
                </Link>
              </p>
            )}
          </div>
        )}

        {showDemoNote && (
          <aside className="mx-auto mt-6 max-w-[520px] rounded-[16px] border border-dashed border-border-strong px-5 py-4 text-left text-[13px]">
            <p className="flex items-center gap-1.5 font-semibold text-text-2">
              <FlaskConical className="size-4" strokeWidth={1.75} aria-hidden /> โหมดเดโม
            </p>
            <p className="mt-1.5 text-text-2">
              ยังไม่ได้ตั้งค่า <code className="font-mono text-text">PAYMENT_URL</code> ปุ่มชำระเงินจะพาไปหน้ายืนยันการชำระเงินโดยตรง จากนั้นจำลองการจ่ายเงินด้วยคำสั่งนี้ในเทอร์มินัล:
            </p>
            <code className="mt-2 block select-all overflow-x-auto whitespace-nowrap rounded-[10px] bg-hover px-3 py-2 font-mono text-[12px] text-text">
              npm run webhook:test -- {viewer!.email}
            </code>
          </aside>
        )}
      </section>

      {/* ── Sample content strip ── */}
      {samples.length > 0 && (
        <section className="mx-auto max-w-[1200px]" aria-labelledby="samples-h">
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

      {/* ── Price card ── */}
      {!isMember && (
        <section className="mx-auto mt-16 max-w-[460px] rounded-[20px] border border-border bg-surface p-7 text-center sm:p-8">
          <p className="text-[14px] font-semibold text-member">สมาชิกรายเดือน</p>
          <p className="mt-3 flex items-baseline justify-center gap-1.5">
            <span className="tnum text-[44px] font-semibold leading-none tracking-[-0.03em]">{formatNumber(s.price_thb)}</span>
            <span className="text-[15px] text-text-2">บาท / 30 วัน</span>
          </p>
          <ul className="mx-auto mt-5 max-w-[280px] space-y-2 text-left text-[14px]">
            {["ไม่มีตัดเงินอัตโนมัติ", "จ่ายล่วงหน้าได้ วันไม่หาย", "บัตร · PromptPay · Apple Pay · Google Pay · โอน"].map((x) => (
              <li key={x} className="flex gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-member" strokeWidth={2.25} aria-hidden />
                {x}
              </li>
            ))}
          </ul>
          <div className="mt-6">{cta("w-full")}</div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section className="mx-auto mt-16 max-w-[760px] pb-8" aria-labelledby="faq-h">
        <h2 id="faq-h" className="t-h1 text-center">
          คำถามที่พบบ่อย
        </h2>
        <div className="mt-8 divide-y divide-border border-y border-border">
          {FAQ.map((f) => (
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
