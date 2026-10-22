"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CreditCard, FlaskConical, Lock, Mail, QrCode } from "lucide-react";
import { startCheckoutAction } from "@/app/(site)/membership/checkout/actions";
import { PAY_FROM_KEY } from "@/app/(site)/membership/_components/pay-button";
import { Button } from "@/components/ui/button";
import { formatNumber, thaiDate } from "@/lib/format";
import {
  CARD_NETWORKS,
  DEFAULT_METHOD,
  METHODS,
  PLANS,
  PLAN_LIST,
  expiryAfter,
  yearlyPerMonth,
  yearlySavings,
  type CheckoutMethod,
  type Plan,
  type PlanCode,
} from "@/lib/plans";
import { cn } from "@/lib/utils";

const baht = (n: number) => `${formatNumber(n)} บาท`;
const focusRing = "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent";

export function CheckoutForm({
  initialPlan,
  currentExpiresAt,
  now,
  mode,
  from,
  demoEmail,
  payEmail,
}: {
  initialPlan: PlanCode;
  /** Current membership end (ISO) — a new payment extends from here while it is still in the future. */
  currentExpiresAt: string | null;
  /** Server time (ms) so server and browser render the same dates. */
  now: number;
  mode: "live" | "demo" | "closed";
  from: string | null;
  demoEmail: string | null;
  /** The signed-in viewer's own email, shown only when paying happens on an external page (which matches the payment to the account by email). */
  payEmail: string | null;
}) {
  const router = useRouter();
  const [planCode, setPlanCode] = React.useState<PlanCode>(initialPlan);
  const [method, setMethod] = React.useState<CheckoutMethod>(DEFAULT_METHOD);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const plan = PLANS[planCode];
  const closed = mode === "closed";
  const active = !!currentExpiresAt && new Date(currentExpiresAt).getTime() > now;
  const endsAt = expiryAfter(plan, currentExpiresAt, now);
  const autoRenew = METHODS[method].autoRenew;
  const save = yearlySavings();

  const choosePlan = (code: PlanCode) => {
    setPlanCode(code);
    setError(null);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("plan", code);
      window.history.replaceState(window.history.state, "", u);
    } catch {}
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || closed) return;
    setBusy(true);
    setError(null);
    const r = await startCheckoutAction(planCode, method, from ?? undefined).catch(() => null);
    if (!r || !r.ok) {
      setError(r?.error ?? "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
      setBusy(false);
      return;
    }
    try {
      if (from) sessionStorage.setItem(PAY_FROM_KEY, from);
      else sessionStorage.removeItem(PAY_FROM_KEY);
    } catch {}
    // Stay "busy" while the browser navigates, so a second tap can't start a second checkout.
    if (r.external) window.location.assign(r.url);
    else router.push(r.url);
  };

  const payLabel = busy ? "กำลังพาไปชำระเงิน…" : `ชำระ ${formatNumber(plan.price)} บาท`;

  return (
    <form id="checkout-form" onSubmit={submit} noValidate className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
      {/* ───────── Order summary ───────── */}
      <section aria-labelledby="summary-h" className="rounded-[20px] border border-border bg-surface p-5 sm:p-7 lg:sticky lg:top-20">
        <h2 id="summary-h" className="t-h2">
          สรุปรายการ
        </h2>

        <fieldset className="mt-5">
          <legend className="sr-only">เลือกแพ็กเกจ</legend>
          <div className="grid grid-cols-2 gap-2">
            {PLAN_LIST.map((p) => (
              <PlanOption key={p.code} plan={p} checked={planCode === p.code} onSelect={() => choosePlan(p.code)} badge={p.code === "yearly" ? `ประหยัด ${save.percent}%` : undefined} />
            ))}
          </div>
        </fieldset>

        <dl className="mt-6 space-y-3 text-[14px]">
          <Row label="แพ็กเกจ" value={plan.name} />
          <Row label="ราคา" value={`${baht(plan.price)} / ${plan.unit}`} />
          <Row label="ระยะเวลา" value={`${formatNumber(plan.days)} วัน`} />
          <Row label="เริ่มนับ" value={active ? `ต่อจากวันหมดอายุเดิม (${thaiDate(currentExpiresAt)})` : "ทันทีหลังชำระเงิน"} />
          <Row label="สมาชิกถึงวันที่" value={thaiDate(endsAt)} />
          <Row
            label="การต่ออายุ"
            value={autoRenew ? `ต่ออายุอัตโนมัติ ${baht(plan.price)} ในวันที่ ${thaiDate(endsAt)}` : "ไม่ต่ออายุอัตโนมัติ"}
            tone={autoRenew ? undefined : "muted"}
          />
        </dl>

        {plan.code === "yearly" && (
          <p className="tnum mt-4 rounded-[12px] bg-member/10 px-3.5 py-2.5 text-[13px] text-member">
            เฉลี่ย ~{formatNumber(yearlyPerMonth())} บาท/เดือน · ประหยัด {baht(save.saved)} เทียบกับรายเดือน 12 เดือน ({baht(save.base)})
          </p>
        )}

        <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-border pt-5">
          <span className="text-[15px] font-medium">ยอดชำระวันนี้</span>
          <span className="tnum text-[28px] font-semibold leading-none tracking-[-0.02em]" aria-live="polite">
            {baht(plan.price)}
          </span>
        </div>
      </section>

      {/* ───────── Payment method ───────── */}
      <div>
        <fieldset>
          <legend className="t-h2">เลือกวิธีชำระเงิน</legend>

          <div className="mt-5 space-y-3">
            {/* Primary: card */}
            <label className="relative block cursor-pointer">
              <input type="radio" name="method" value="card" checked={method === "card"} onChange={() => setMethod("card")} className="peer sr-only" />
              <span
                className={cn(
                  "block rounded-[20px] border bg-surface p-5 transition-colors duration-150 sm:p-6",
                  "border-border hover:border-border-strong peer-checked:border-member peer-checked:bg-elevated peer-checked:shadow-[0_0_0_1px_var(--member)]",
                  focusRing,
                )}
              >
                <span className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-member/15">
                    <CreditCard className="size-5 text-member" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[17px] font-semibold">{METHODS.card.label}</span>
                      <span className="rounded-full bg-member px-2 py-0.5 text-[11px] font-semibold leading-4 text-on-member">แนะนำ</span>
                    </span>
                    <span className="mt-1 block text-[14px] leading-[22px] text-text-2">
                      ต่ออายุอัตโนมัติทุก{plan.unit} ไม่ต้องกลับมาจ่ายเอง ยกเลิกได้ทุกเมื่อ
                    </span>
                    <span className="mt-3 flex flex-wrap gap-1.5" aria-label="รองรับบัตร">
                      {CARD_NETWORKS.map((n) => (
                        <span key={n} className="rounded-md border border-border-strong px-2 py-0.5 text-[12px] font-medium text-text-2">
                          {n}
                        </span>
                      ))}
                    </span>
                  </span>
                  <RadioDot checked={method === "card"} />
                </span>
              </span>
            </label>

            {/* Secondary: PromptPay */}
            <label className="relative block cursor-pointer">
              <input type="radio" name="method" value="promptpay" checked={method === "promptpay"} onChange={() => setMethod("promptpay")} className="peer sr-only" />
              <span
                className={cn(
                  "block rounded-[16px] border bg-surface p-4 transition-colors duration-150 sm:p-5",
                  "border-border hover:border-border-strong peer-checked:border-member peer-checked:bg-elevated peer-checked:shadow-[0_0_0_1px_var(--member)]",
                  focusRing,
                )}
              >
                <span className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-hover">
                    <QrCode className="size-5 text-text-2" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{METHODS.promptpay.label}</span>
                    <span className="mt-0.5 block text-[13px] leading-5 text-text-2">
                      สแกน QR จ่ายครั้งเดียว ใช้ได้ {formatNumber(plan.days)} วัน ไม่ต่ออายุอัตโนมัติ ต้องต่ออายุเอง
                    </span>
                  </span>
                  <RadioDot checked={method === "promptpay"} />
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {/* Fine print that must sit next to the pay button: what exactly happens when you pay */}
        <p className="t-meta mt-4" aria-live="polite">
          {autoRenew
            ? `เมื่อกดชำระเงิน คุณยินยอมให้ตัดบัตร ${baht(plan.price)} ทุก${plan.unit} จนกว่าจะยกเลิก`
            : `จ่ายครั้งเดียว ${baht(plan.price)} สมาชิกหมดอายุเองเมื่อครบ ${formatNumber(plan.days)} วัน`}
        </p>

        {closed && (
          <div role="status" className="mt-4 flex gap-3 rounded-[14px] border border-border-strong bg-surface p-4 text-[14px]">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-text-2" strokeWidth={1.75} aria-hidden />
            <div>
              <p className="font-semibold">ระบบชำระเงินยังไม่เปิด</p>
              <p className="t-meta mt-0.5">เรากำลังเตรียมระบบชำระเงิน กลับมาใหม่เร็วๆ นี้ ยังไม่มีการตัดเงินใดๆ</p>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 flex gap-3 rounded-[14px] border border-danger/40 bg-danger/10 p-4 text-[14px]">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={1.75} aria-hidden />
            <p>{error}</p>
          </div>
        )}

        {payEmail && !closed && (
          <div className="mt-4 flex gap-3 rounded-[14px] border border-member/40 bg-member/10 p-4 text-[14px]">
            <Mail className="mt-0.5 size-5 shrink-0 text-member" strokeWidth={1.75} aria-hidden />
            <p>
              ใช้อีเมลเดียวกับบัญชีนี้ (<strong className="break-all font-semibold">{payEmail}</strong>) ตอนชำระเงิน ระบบจะเปิดสมาชิกให้อัตโนมัติ
            </p>
          </div>
        )}

        {/* Desktop pay button (phones use the sticky bar below) */}
        <Button type="submit" variant="member" size="lg" className="mt-5 hidden h-14 w-full text-[16px] lg:inline-flex" disabled={busy || closed} aria-busy={busy}>
          {payLabel}
        </Button>

        <p className="t-meta mt-4 flex items-start justify-center gap-1.5 text-center">
          <Lock className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          ชำระเงินผ่านระบบที่ปลอดภัย ข้อมูลบัตรไม่ผ่านเซิร์ฟเวอร์ของเรา
        </p>
        <p className="t-meta mt-2 text-center">
          การชำระเงินถือว่าคุณยอมรับ{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-text">
            เงื่อนไขการใช้งาน
          </Link>{" "}
          และ{" "}
          <Link href="/refund" className="underline underline-offset-4 hover:text-text">
            นโยบายการคืนเงิน
          </Link>
        </p>

        {mode === "demo" && demoEmail && (
          <aside className="mt-6 rounded-[16px] border border-dashed border-border-strong px-5 py-4 text-[13px]">
            <p className="flex items-center gap-1.5 font-semibold text-text-2">
              <FlaskConical className="size-4" strokeWidth={1.75} aria-hidden /> โหมดเดโม
            </p>
            <p className="mt-1.5 text-text-2">
              ยังไม่ได้ตั้งค่า <code className="font-mono text-text">PAYMENT_URL</code> ปุ่มชำระเงินจะพาไปหน้ายืนยันโดยตรง จากนั้นจำลองการจ่ายเงินด้วยคำสั่งนี้ในเทอร์มินัล:
            </p>
            <code className="mt-2 block select-all overflow-x-auto whitespace-nowrap rounded-[10px] bg-hover px-3 py-2 font-mono text-[12px] text-text">
              npm run webhook:test -- {demoEmail} {planCode} {method}
            </code>
          </aside>
        )}
      </div>

      {/* Mobile sticky pay bar — sits above the bottom tab bar on phones */}
      <div className="glass tg-vv-bottom fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-border sm:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="tnum truncate text-[17px] font-semibold">{baht(plan.price)}</p>
            <p className="t-meta truncate">
              {plan.label} · {autoRenew ? "ต่ออายุอัตโนมัติ" : "จ่ายครั้งเดียว"}
            </p>
          </div>
          <Button type="submit" variant="member" size="lg" className="shrink-0" disabled={busy || closed} aria-busy={busy}>
            {payLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "muted" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-text-2">{label}</dt>
      <dd className={cn("tnum min-w-0 text-right font-medium", tone === "muted" && "text-text-2")}>{value}</dd>
    </div>
  );
}

/** Visual radio indicator; the real (screen-reader / keyboard) control is the sr-only input before it. */
function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden className={cn("mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border", checked ? "border-member" : "border-border-strong")}>
      {checked && <span className="size-2.5 rounded-full bg-member" />}
    </span>
  );
}

function PlanOption({ plan, checked, onSelect, badge }: { plan: Plan; checked: boolean; onSelect: () => void; badge?: string }) {
  return (
    <label className="relative block cursor-pointer">
      <input type="radio" name="plan" value={plan.code} checked={checked} onChange={onSelect} className="peer sr-only" />
      <span
        className={cn(
          "flex h-full flex-col rounded-[14px] border border-border bg-bg px-3.5 py-3 transition-colors duration-150",
          "hover:border-border-strong peer-checked:border-member peer-checked:bg-elevated peer-checked:shadow-[0_0_0_1px_var(--member)]",
          focusRing,
        )}
      >
        <span className="text-[13px] text-text-2">{plan.label}</span>
        <span className="tnum mt-0.5 text-[17px] font-semibold">{baht(plan.price)}</span>
        <span className="mt-1 h-5">
          {badge && <span className="rounded-full bg-member/15 px-2 py-0.5 text-[11px] font-semibold text-member">{badge}</span>}
        </span>
      </span>
    </label>
  );
}
