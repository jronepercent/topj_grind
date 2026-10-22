"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, Mail } from "lucide-react";
import {
  type AuthState,
  loginAction,
  magicLinkAction,
  requestResetAction,
  resetPasswordAction,
  signupAction,
} from "../auth-actions";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

// ───────── Shared pieces ─────────

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-border bg-surface p-6 sm:p-8">
      <h1 className="t-h1 text-balance">{title}</h1>
      {subtitle && <p className="t-meta mt-2">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Message({ state, extraError }: { state: AuthState; extraError?: string | null }) {
  const error = extraError ?? state?.error;
  if (error) {
    return (
      <p role="alert" className="rounded-[12px] bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
        {error}
      </p>
    );
  }
  if (!state?.info) return null;
  return (
    <div role="status" className="space-y-2 rounded-[12px] bg-hover px-3.5 py-3 text-[14px]">
      <p>{state.info}</p>
      {state.devLink && (
        <p className="t-meta">
          <Link href={state.devLink} className="inline-flex items-center gap-1 font-medium text-text underline underline-offset-4">
            ลิงก์ทดสอบ (โหมดเดโม) <ArrowRight className="size-3.5" />
          </Link>
        </p>
      )}
    </div>
  );
}

/** Label is rendered separately (not wrapping) so the show/hide button isn't nested in a <label>. */
function PasswordField({
  label,
  hint,
  name = "password",
  autoComplete,
  minLength,
}: {
  label: string;
  hint?: string;
  name?: string;
  autoComplete: string;
  minLength?: number;
}) {
  const id = React.useId();
  const [show, setShow] = React.useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          className={cn(inputClass, "pr-11")}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-text-2 hover:bg-hover hover:text-text"
          aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          aria-pressed={show}
        >
          {show ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
        </button>
      </div>
      {hint && <span className="t-caption mt-1 block text-text-2">{hint}</span>}
    </div>
  );
}

function Submit({ pending, children, pendingLabel }: { pending: boolean; children: React.ReactNode; pendingLabel: string }) {
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

function withNext(path: string, next: string) {
  return next && next !== "/" ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/* Future: social sign-in (Google / LINE Login) goes here, above the email form.
   <div className="grid gap-2">…provider buttons…</div>
   <Divider label="หรือ" />
   Intentionally not rendered in V1. */

// ───────── Login ─────────

export function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const [mode, setMode] = React.useState<"password" | "magic">("password");
  const [pwState, pwAction, pwPending] = React.useActionState(loginAction, undefined);
  const [mlState, mlAction, mlPending] = React.useActionState(magicLinkAction, undefined);

  return (
    <AuthCard
      title="เข้าสู่ระบบ"
      subtitle={mode === "password" ? "ยินดีต้อนรับกลับมา ดูต่อจากที่ค้างไว้ได้เลย" : "เราจะส่งลิงก์เข้าสู่ระบบไปที่อีเมลของคุณ ไม่ต้องใช้รหัสผ่าน"}
    >
      {linkError && !pwState && !mlState && (
        <p role="alert" className="mb-4 rounded-[12px] bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          ลิงก์เข้าสู่ระบบหมดอายุหรือถูกใช้ไปแล้ว ลองขอลิงก์ใหม่อีกครั้ง
        </p>
      )}

      {mode === "password" ? (
        <form action={pwAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="อีเมล">
            <input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@example.com" className={inputClass} />
          </Field>
          <div>
            <PasswordField label="รหัสผ่าน" autoComplete="current-password" />
            <div className="mt-2 text-right">
              <Link href="/reset-password" className="t-meta rounded-md hover:text-text">
                ลืมรหัสผ่าน?
              </Link>
            </div>
          </div>
          <Message state={pwState} />
          <Submit pending={pwPending} pendingLabel="กำลังเข้าสู่ระบบ…">
            เข้าสู่ระบบ
          </Submit>
        </form>
      ) : (
        <form action={mlAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <Field label="อีเมล">
            <input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@example.com" className={inputClass} />
          </Field>
          <Message state={mlState} />
          <Submit pending={mlPending} pendingLabel="กำลังส่งลิงก์…">
            ส่งลิงก์เข้าสู่ระบบ
          </Submit>
        </form>
      )}

      <div className="my-5 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        <span className="t-caption text-text-2">หรือ</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => setMode((m) => (m === "password" ? "magic" : "password"))}>
        {mode === "password" ? (
          <>
            <Mail strokeWidth={1.75} /> ส่งลิงก์เข้าสู่ระบบทางอีเมล
          </>
        ) : (
          "ใช้อีเมลและรหัสผ่าน"
        )}
      </Button>

      <p className="t-meta mt-6 text-center">
        ยังไม่มีบัญชี?{" "}
        <Link href={withNext("/signup", next)} className="font-medium text-text underline-offset-4 hover:underline">
          สร้างบัญชีใหม่
        </Link>
      </p>
    </AuthCard>
  );
}

// ───────── Signup ─────────

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = React.useActionState(signupAction, undefined);
  const [localError, setLocalError] = React.useState<string | null>(null);

  return (
    <AuthCard title="สร้างบัญชี" subtitle="ฟรี ใช้เวลาไม่ถึงนาที — บันทึกคลิป ถูกใจ และคอมเมนต์ได้ทันที">
      <form
        action={action}
        onSubmit={(e) => {
          const pw = String(new FormData(e.currentTarget).get("password") ?? "");
          if (pw.length < 8) {
            e.preventDefault();
            setLocalError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
          } else setLocalError(null);
        }}
        className="space-y-4"
      >
        <input type="hidden" name="next" value={next} />
        <Field label="ชื่อที่แสดง" hint="คนอื่นจะเห็นชื่อนี้ตอนคุณคอมเมนต์">
          <input name="name" type="text" autoComplete="nickname" required maxLength={50} placeholder="เช่น มายด์" className={inputClass} />
        </Field>
        <Field label="อีเมล">
          <input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@example.com" className={inputClass} />
        </Field>
        <PasswordField label="รหัสผ่าน" hint="อย่างน้อย 8 ตัวอักษร" autoComplete="new-password" minLength={8} />
        <Message state={state} extraError={localError} />
        <Submit pending={pending} pendingLabel="กำลังสร้างบัญชี…">
          สร้างบัญชี
        </Submit>
        <p className="t-meta text-center">
          การสร้างบัญชีถือว่าคุณยอมรับ{" "}
          <Link href="/terms" className="underline underline-offset-4 hover:text-text">
            เงื่อนไขการใช้งาน
          </Link>{" "}
          และ{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-text">
            นโยบายความเป็นส่วนตัว
          </Link>
        </p>
      </form>
      <p className="t-meta mt-6 text-center">
        มีบัญชีอยู่แล้ว?{" "}
        <Link href={withNext("/login", next)} className="font-medium text-text underline-offset-4 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>
    </AuthCard>
  );
}

// ───────── Reset password ─────────

export function ResetRequestForm() {
  const [state, action, pending] = React.useActionState(requestResetAction, undefined);
  return (
    <AuthCard title="ลืมรหัสผ่าน" subtitle="ใส่อีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้">
      <form action={action} className="space-y-4">
        <Field label="อีเมล">
          <input name="email" type="email" autoComplete="email" inputMode="email" required placeholder="you@example.com" className={inputClass} />
        </Field>
        <Message state={state} />
        <Submit pending={pending} pendingLabel="กำลังส่งลิงก์…">
          ส่งลิงก์ตั้งรหัสผ่านใหม่
        </Submit>
      </form>
      <p className="t-meta mt-6 text-center">
        นึกออกแล้ว?{" "}
        <Link href="/login" className="font-medium text-text underline-offset-4 hover:underline">
          กลับไปเข้าสู่ระบบ
        </Link>
      </p>
    </AuthCard>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = React.useActionState(resetPasswordAction, undefined);
  const [localError, setLocalError] = React.useState<string | null>(null);
  return (
    <AuthCard title="ตั้งรหัสผ่านใหม่" subtitle="ตั้งรหัสผ่านที่จำได้ง่ายแต่เดายาก อย่างน้อย 8 ตัวอักษร">
      <form
        action={action}
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget);
          const pw = String(fd.get("password") ?? "");
          if (pw.length < 8) {
            e.preventDefault();
            setLocalError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
          } else if (pw !== String(fd.get("confirm") ?? "")) {
            e.preventDefault();
            setLocalError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
          } else setLocalError(null);
        }}
        className="space-y-4"
      >
        <input type="hidden" name="token" value={token} />
        <PasswordField label="รหัสผ่านใหม่" autoComplete="new-password" minLength={8} />
        <PasswordField label="ยืนยันรหัสผ่านใหม่" name="confirm" autoComplete="new-password" minLength={8} />
        <Message state={state} extraError={localError} />
        {state?.error?.includes("หมดอายุ") && (
          <p className="t-meta">
            <Link href="/reset-password" className="font-medium text-text underline underline-offset-4">
              ขอลิงก์ใหม่
            </Link>
          </p>
        )}
        <Submit pending={pending} pendingLabel="กำลังบันทึก…">
          บันทึกรหัสผ่านใหม่
        </Submit>
      </form>
    </AuthCard>
  );
}
