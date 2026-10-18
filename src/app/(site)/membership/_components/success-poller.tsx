"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Clock, FlaskConical, MessageCircle, RefreshCw } from "lucide-react";
import { membershipStatusAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { thaiDate } from "@/lib/format";
import { METHODS, PLANS, type CheckoutMethod, type PlanCode } from "@/lib/plans";
import { PAY_FROM_KEY } from "./pay-button";

const INTERVAL = 3_000;
const MAX_WAIT = 120_000;

type Phase = "pending" | "done" | "timeout";

export function SuccessPoller({
  from,
  justPaid,
  expiresAt,
  isMember,
  lineUrl,
  demoEmail,
  plan,
  method,
}: {
  from: string | null;
  justPaid: boolean;
  expiresAt: string | null;
  isMember: boolean;
  lineUrl: string | null;
  demoEmail: string | null;
  /** From the checkout link — display only. The real plan is whatever the confirmed payment says. */
  plan: PlanCode | null;
  method: CheckoutMethod | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>(justPaid ? "done" : "pending");
  const [expires, setExpires] = React.useState(expiresAt);
  const [attempt, setAttempt] = React.useState(0);
  const [dest, setDest] = React.useState(from ?? "/");
  // Baseline captured on first load — success = expires_at moved later, or membership turned on.
  const base = React.useRef({ expires_at: expiresAt, is_member: isMember });

  React.useEffect(() => {
    if (from) return;
    try {
      const saved = sessionStorage.getItem(PAY_FROM_KEY);
      if (saved && saved.startsWith("/") && !saved.startsWith("//")) setDest(saved);
    } catch {}
  }, [from]);

  React.useEffect(() => {
    if (phase !== "pending") return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    const changed = (s: { expires_at: string | null; is_member: boolean }) => {
      const b = base.current;
      if (!b.is_member && s.is_member) return true;
      if (!s.expires_at) return false;
      return !b.expires_at || new Date(s.expires_at).getTime() > new Date(b.expires_at).getTime();
    };

    const tick = async () => {
      const r = await membershipStatusAction().catch(() => null);
      if (stopped) return;
      if (r?.ok && changed(r.data)) {
        setExpires(r.data.expires_at);
        setPhase("done");
        router.refresh();
        return;
      }
      if (Date.now() - started >= MAX_WAIT) return setPhase("timeout");
      timer = setTimeout(tick, INTERVAL);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [phase, attempt, router]);

  // Light celebration; skipped entirely for reduced-motion users.
  React.useEffect(() => {
    if (phase !== "done") return;
    try {
      sessionStorage.removeItem(PAY_FROM_KEY);
    } catch {}
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const opts = { colors: ["#E8C77A", "#F5F5F7", "#FF4D2E"], disableForReducedMotion: true, ticks: 180, scalar: 0.9 };
      confetti({ ...opts, particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.55 } });
      setTimeout(() => !cancelled && confetti({ ...opts, particleCount: 40, spread: 110, startVelocity: 28, origin: { y: 0.5 } }), 260);
    });
    return () => {
      cancelled = true;
    };
  }, [phase]);

  return (
    <section className="mx-auto flex max-w-[480px] flex-col items-center py-20 text-center sm:py-28" aria-live="polite">
      {phase === "pending" && (
        <>
          <span className="relative flex size-20 items-center justify-center" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-member/15 [animation-duration:2s]" />
            <span className="relative size-14 animate-pulse rounded-full bg-member/25" />
          </span>
          <h1 className="t-h1 mt-8">กำลังยืนยันการชำระเงิน…</h1>
          {plan && <p className="mt-3 text-[15px] font-medium">{PLANS[plan].name} · {PLANS[plan].price.toLocaleString("th-TH")} บาท</p>}
          <p className="t-meta mt-2 max-w-sm">ปกติใช้เวลาไม่ถึง 1 นาที เปิดหน้านี้ค้างไว้ได้เลย เราจะอัปเดตให้อัตโนมัติ</p>
          <div className="mt-8 w-full max-w-[320px] space-y-2.5" aria-hidden>
            <div className="skeleton h-3 rounded-full" />
            <div className="skeleton mx-auto h-3 w-3/4 rounded-full" />
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <span className="flex size-20 items-center justify-center rounded-full bg-member/15">
            <Check className="size-9 text-member" strokeWidth={2.25} aria-hidden />
          </span>
          <h1 className="t-h1 mt-8 text-balance">ยินดีต้อนรับสู่สมาชิก TOPJ_GRIND</h1>
          {expires && (
            <p className="mt-2 text-[17px]">
              สมาชิกถึงวันที่ <span className="font-semibold">{thaiDate(expires)}</span>
            </p>
          )}
          <p className="t-meta mt-2">
            {plan ? `${PLANS[plan].name} · ` : ""}ทุกคลิป ทุกตอน และไฟล์ประกอบ ปลดล็อกแล้ว
          </p>
          {expires && (
            <ul className="mt-6 w-full max-w-[380px] space-y-3 rounded-[16px] border border-border bg-surface p-4 text-left text-[14px]">
              {method === "promptpay" ? (
                <>
                  <li className="flex gap-3">
                    <Bell className="mt-0.5 size-4 shrink-0 text-member" strokeWidth={1.75} aria-hidden />
                    <span>{METHODS.promptpay.label} จ่ายครั้งเดียว ไม่ต่ออายุอัตโนมัติ เราจะแจ้งเตือนก่อนหมดอายุ</span>
                  </li>
                  <li className="flex gap-3">
                    <RefreshCw className="mt-0.5 size-4 shrink-0 text-member" strokeWidth={1.75} aria-hidden />
                    <span>ต่ออายุเองได้ทุกเมื่อ วันที่เหลือจะไม่หาย</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex gap-3">
                    <RefreshCw className="mt-0.5 size-4 shrink-0 text-member" strokeWidth={1.75} aria-hidden />
                    <span>จ่ายด้วยบัตร ระบบจะต่ออายุให้อัตโนมัติในวันที่ {thaiDate(expires)} ไม่ต้องทำอะไรเพิ่ม</span>
                  </li>
                  <li className="flex gap-3">
                    <Bell className="mt-0.5 size-4 shrink-0 text-member" strokeWidth={1.75} aria-hidden />
                    <span>ดูสถานะและประวัติการชำระเงินได้ที่หน้าบัญชี ยกเลิกต่ออายุอัตโนมัติได้ทุกเมื่อ</span>
                  </li>
                </>
              )}
            </ul>
          )}
          <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto">
            <Button asChild variant="member" size="lg" className="min-w-[220px]">
              <Link href={dest}>เริ่มดูเลย</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/account">ดูบัญชีของฉัน</Link>
            </Button>
          </div>
        </>
      )}

      {phase === "timeout" && (
        <>
          <span className="flex size-20 items-center justify-center rounded-full bg-hover">
            <Clock className="size-9 text-text-2" strokeWidth={1.75} aria-hidden />
          </span>
          <h1 className="t-h1 mt-8">ยังไม่ได้รับการยืนยัน</h1>
          <p className="t-meta mt-2 max-w-sm">
            บางครั้งระบบชำระเงินใช้เวลานานกว่าปกติ ถ้าชำระแล้วแต่สถานะยังไม่อัปเดต ทักเราทาง LINE OA พร้อมแนบสลิป เราจะรีบตรวจสอบให้
          </p>
          <div className="mt-8 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              variant="inverse"
              size="lg"
              onClick={() => {
                setPhase("pending");
                setAttempt((a) => a + 1);
              }}
            >
              ตรวจสอบอีกครั้ง
            </Button>
            {lineUrl && (
              <Button asChild variant="outline" size="lg">
                <a href={lineUrl} target="_blank" rel="noopener noreferrer nofollow">
                  <MessageCircle strokeWidth={1.75} /> ติดต่อทาง LINE OA
                </a>
              </Button>
            )}
          </div>
        </>
      )}

      {demoEmail && phase !== "done" && (
        <aside className="mt-10 w-full rounded-[16px] border border-dashed border-border-strong px-5 py-4 text-left text-[13px]">
          <p className="flex items-center gap-1.5 font-semibold text-text-2">
            <FlaskConical className="size-4" strokeWidth={1.75} aria-hidden /> โหมดเดโม
          </p>
          <p className="mt-1.5 text-text-2">จำลองการชำระเงินด้วยคำสั่งนี้ในเทอร์มินัล แล้วหน้านี้จะอัปเดตเอง:</p>
          <code className="mt-2 block select-all overflow-x-auto whitespace-nowrap rounded-[10px] bg-hover px-3 py-2 font-mono text-[12px] text-text">
            npm run webhook:test -- {demoEmail} {plan ?? "monthly"} {method ?? "card"}
          </code>
        </aside>
      )}
    </section>
  );
}
