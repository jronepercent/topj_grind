"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageUp, Link2, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { setAutoplayAction, setEmailUpdatesAction, setThemeAction, updateProfileAction } from "@/app/actions";
import { changePasswordAction, logoutAction } from "@/app/(auth)/auth-actions";
import { Avatar, Field, inputClass, MemberBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatNumber, thaiDate } from "@/lib/format";
import { PAYMENT_METHOD_LABEL, planOfPayment, renewalLabel } from "@/lib/plans";
import type { PaymentMethod, ThemePref, Viewer } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PaymentRow {
  id: string;
  paid_at: string;
  amount: number;
  currency: string;
  months: number;
  plan: string | null;
  method: PaymentMethod;
  reference: string;
}

/** "รายปี · บัตรเครดิต/เดบิต" — plan (when known) and how it was paid. */
function paymentSummary(p: PaymentRow) {
  const plan = planOfPayment(p);
  return [plan?.label, PAYMENT_METHOD_LABEL[p.method] ?? p.method].filter(Boolean).join(" · ");
}

const MAX_AVATAR = 1024 * 1024; // 1MB

function Card({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[16px] border border-border bg-surface p-5 sm:p-6", className)} aria-label={title}>
      <h2 className="t-h2">{title}</h2>
      {description && <p className="t-meta mt-1">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function AccountView({
  viewer,
  theme,
  emailUpdates,
  daysLeft,
  firstPaidAt,
  payments,
}: {
  viewer: Viewer;
  theme: ThemePref;
  emailUpdates: boolean;
  daysLeft: number | null;
  firstPaidAt: string | null;
  payments: PaymentRow[];
}) {
  return (
    <div className="mt-6 space-y-4 pb-8">
      <ProfileCard viewer={viewer} />
      <Card title="อีเมล" description="ใช้สำหรับเข้าสู่ระบบและรับลิงก์ยืนยันต่างๆ">
        <input type="email" value={viewer.email} readOnly aria-label="อีเมล" className={cn(inputClass, "cursor-default text-text-2")} />
      </Card>
      <PasswordCard />
      <MembershipCard viewer={viewer} daysLeft={daysLeft} firstPaidAt={firstPaidAt} lastPayment={payments[0] ?? null} />
      <PaymentsCard payments={payments} />
      <PreferencesCard initialTheme={theme} initialAutoplay={viewer.autoplay} initialEmailUpdates={emailUpdates} />
      <LogoutCard />
    </div>
  );
}

// ───────── Profile ─────────

function ProfileCard({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const [name, setName] = React.useState(viewer.display_name);
  const [avatar, setAvatar] = React.useState<string | null>(viewer.avatar_url);
  const [urlMode, setUrlMode] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const dirty = name.trim() !== viewer.display_name || avatar !== viewer.avatar_url;

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return setError("รองรับเฉพาะไฟล์ PNG, JPG, WebP หรือ GIF");
    if (file.size > MAX_AVATAR) return setError("ไฟล์ใหญ่เกิน 1MB ลองย่อขนาดรูปก่อน");
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(String(reader.result));
      setUrlMode(false);
    };
    reader.onerror = () => setError("อ่านไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    reader.readAsDataURL(file);
  };

  const applyUrl = () => {
    const v = url.trim();
    if (!/^https:\/\/\S+$/i.test(v)) return setError("ลิงก์รูปต้องขึ้นต้นด้วย https://");
    setError(null);
    setAvatar(v);
    setUrlMode(false);
    setUrl("");
  };

  const save = () => {
    const n = name.trim();
    if (!n) return setError("กรุณาใส่ชื่อที่แสดง");
    if (n.length > 50) return setError("ชื่อที่แสดงยาวได้ไม่เกิน 50 ตัวอักษร");
    setError(null);
    start(async () => {
      const r = await updateProfileAction({ display_name: n, avatar_url: avatar });
      if (!r.ok) return setError(r.error);
      toast("บันทึกโปรไฟล์แล้ว");
      router.refresh();
    });
  };

  return (
    <Card title="โปรไฟล์" description="ชื่อและรูปนี้จะแสดงเมื่อคุณคอมเมนต์">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex items-center gap-4 sm:flex-col sm:items-center">
          <Avatar src={avatar} name={name || viewer.display_name} size={80} />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <Field label="ชื่อที่แสดง" counter={`${name.length}/50`}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoComplete="nickname"
              className={inputClass}
            />
          </Field>

          <div>
            <span className="mb-1.5 block text-[13px] font-medium">รูปโปรไฟล์</span>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                <ImageUp strokeWidth={1.75} /> อัปโหลดรูป
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setUrlMode((m) => !m)} aria-expanded={urlMode}>
                <Link2 strokeWidth={1.75} /> ใช้ลิงก์รูป
              </Button>
              {avatar && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setAvatar(null)}>
                  <Trash2 strokeWidth={1.75} /> ลบรูป
                </Button>
              )}
            </div>
            <p className="t-caption mt-1.5 text-text-2">PNG, JPG, WebP หรือ GIF ขนาดไม่เกิน 1MB</p>
            {urlMode && (
              <div className="mt-3 flex gap-2">
                <input
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), applyUrl())}
                  placeholder="https://…"
                  aria-label="ลิงก์รูปโปรไฟล์"
                  className={inputClass}
                />
                <Button type="button" variant="inverse" onClick={applyUrl} className="shrink-0">
                  ใช้รูปนี้
                </Button>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="text-[14px] text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setName(viewer.display_name);
                  setAvatar(viewer.avatar_url);
                  setError(null);
                }}
                disabled={pending}
              >
                ยกเลิก
              </Button>
            )}
            <Button type="button" variant="inverse" onClick={save} disabled={!dirty || pending}>
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ───────── Password ─────────

function PasswordCard() {
  const [state, action, pending] = React.useActionState(changePasswordAction, undefined);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state?.info) {
      formRef.current?.reset();
      toast(state.info);
    }
  }, [state]);

  const error = localError ?? state?.error;

  return (
    <Card title="เปลี่ยนรหัสผ่าน" description="รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร">
      <form
        ref={formRef}
        action={action}
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget);
          const pw = String(fd.get("password") ?? "");
          if (pw.length < 8) {
            e.preventDefault();
            setLocalError("รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร");
          } else if (pw !== String(fd.get("confirm") ?? "")) {
            e.preventDefault();
            setLocalError("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
          } else setLocalError(null);
        }}
        className="space-y-4"
      >
        <Field label="รหัสผ่านปัจจุบัน">
          <input name="current" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="รหัสผ่านใหม่">
            <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
          </Field>
          <Field label="ยืนยันรหัสผ่านใหม่">
            <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
          </Field>
        </div>
        {error && (
          <p role="alert" className="text-[14px] text-danger">
            {error}
          </p>
        )}
        {!error && state?.info && (
          <p role="status" className="text-[14px] text-success">
            {state.info}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Link href="/reset-password" className="t-meta rounded-md hover:text-text">
            ลืมรหัสผ่านปัจจุบัน?
          </Link>
          <Button type="submit" variant="inverse" disabled={pending}>
            {pending ? "กำลังบันทึก…" : "เปลี่ยนรหัสผ่าน"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ───────── Membership ─────────

function MembershipCard({
  viewer,
  daysLeft,
  firstPaidAt,
  lastPayment,
}: {
  viewer: Viewer;
  daysLeft: number | null;
  firstPaidAt: string | null;
  lastPayment: PaymentRow | null;
}) {
  const renew = "/membership?from=%2Faccount";
  let body: React.ReactNode;
  if (viewer.is_admin) {
    body = <p className="text-[15px]">บัญชีผู้ดูแลช่อง เข้าถึงคอนเทนต์ได้ทั้งหมด</p>;
  } else if (viewer.is_member && viewer.expires_at) {
    const left = Math.max(0, daysLeft ?? 0);
    body = (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <MemberBadge />
          <p className="mt-3 text-[20px] font-semibold">สมาชิกถึงวันที่ {thaiDate(viewer.expires_at)}</p>
          <p className={cn("t-meta tnum mt-1", left <= 3 && "font-medium text-member")}>เหลืออีก {formatNumber(left)} วัน</p>
          {firstPaidAt && <p className="t-meta mt-1">เป็นสมาชิกตั้งแต่ {thaiDate(firstPaidAt)}</p>}
          {lastPayment && (
            <p className="t-meta mt-3">
              <span className="font-medium text-text">{paymentSummary(lastPayment)}</span>
              {" · "}
              <span className={cn(lastPayment.method === "card" ? "text-success" : "text-member")}>{renewalLabel(lastPayment.method)}</span>
            </p>
          )}
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href={renew}>ต่ออายุล่วงหน้า</Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[17px] font-semibold">{viewer.expires_at ? "สมาชิกหมดอายุแล้ว" : "ยังไม่ได้เป็นสมาชิก"}</p>
          <p className="t-meta mt-1">
            {viewer.expires_at ? `หมดอายุเมื่อ ${thaiDate(viewer.expires_at)} · ต่ออายุเพื่อดูคอนเทนต์ทั้งหมด` : "สมัครเพื่อดูได้ทุกคลิป ฟังพอดแคสต์ทุกตอน และโหลดไฟล์ประกอบ"}
          </p>
        </div>
        <Button asChild variant="member" className="shrink-0">
          <Link href={renew}>{viewer.expires_at ? "ต่ออายุสมาชิก" : "สมัครสมาชิก"}</Link>
        </Button>
      </div>
    );
  }
  return <Card title="สมาชิก">{body}</Card>;
}

// ───────── Payments ─────────

function PaymentsCard({ payments }: { payments: PaymentRow[] }) {
  const money = (p: PaymentRow) => `${formatNumber(p.amount)} ${p.currency === "THB" ? "บาท" : p.currency}`;
  return (
    <Card title="ประวัติการชำระเงิน">
      {payments.length === 0 ? (
        <p className="t-meta">ยังไม่มีประวัติการชำระเงิน</p>
      ) : (
        <>
          {/* Mobile: stacked list */}
          <ul className="divide-y divide-border sm:hidden">
            {payments.map((p) => (
              <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-medium">{thaiDate(p.paid_at)}</span>
                  <span className="tnum text-[15px] font-semibold">{money(p)}</span>
                </div>
                <div className="t-meta mt-0.5 flex items-baseline justify-between gap-3">
                  <span>{paymentSummary(p)}</span>
                  <span className="truncate font-mono text-[12px]">{p.reference}</span>
                </div>
              </li>
            ))}
          </ul>
          {/* Desktop: table */}
          <div className="-mx-2 hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="t-caption text-text-2">
                  <th scope="col" className="px-2 pb-2 font-medium">วันที่</th>
                  <th scope="col" className="px-2 pb-2 text-right font-medium">จำนวนเงิน</th>
                  <th scope="col" className="px-2 pb-2 font-medium">ช่องทาง</th>
                  <th scope="col" className="px-2 pb-2 font-medium">เลขอ้างอิง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border border-t border-border">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-2 py-3">{thaiDate(p.paid_at)}</td>
                    <td className="tnum whitespace-nowrap px-2 py-3 text-right font-medium">
                      {money(p)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-text-2">{paymentSummary(p)}</td>
                    <td className="max-w-[200px] truncate px-2 py-3 font-mono text-[12px] text-text-2" title={p.reference}>
                      {p.reference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ───────── Preferences ─────────

const THEMES = [
  { value: "dark", label: "มืด", Icon: Moon },
  { value: "light", label: "สว่าง", Icon: Sun },
  { value: "system", label: "ตามระบบ", Icon: Monitor },
] as const;

function PreferencesCard({
  initialTheme,
  initialAutoplay,
  initialEmailUpdates,
}: {
  initialTheme: ThemePref;
  initialAutoplay: boolean;
  initialEmailUpdates: boolean;
}) {
  const [theme, setTheme] = React.useState<ThemePref>(initialTheme);
  const [autoplay, setAutoplay] = React.useState(initialAutoplay);
  const [emailUpdates, setEmailUpdates] = React.useState(initialEmailUpdates);

  const pickTheme = (t: ThemePref) => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    void setThemeAction(t);
  };

  const toggleAutoplay = async (on: boolean) => {
    setAutoplay(on);
    const r = await setAutoplayAction(on);
    if (!r.ok) {
      setAutoplay(!on);
      toast(r.error);
    }
  };

  const toggleEmailUpdates = async (on: boolean) => {
    setEmailUpdates(on);
    const r = await setEmailUpdatesAction(on);
    if (!r.ok) {
      setEmailUpdates(!on);
      toast(r.error);
    }
  };

  return (
    <Card title="การแสดงผลและการเล่น">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span id="theme-label" className="text-[15px] font-medium">
            ธีม
          </span>
          <div role="radiogroup" aria-labelledby="theme-label" className="grid grid-cols-3 gap-1 rounded-full bg-hover p-1 sm:w-[300px]">
            {THEMES.map(({ value, label, Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pickTheme(value)}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition-colors duration-150",
                    active ? "bg-elevated text-text shadow-sm" : "text-text-2 hover:text-text",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} aria-hidden /> {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="h-px bg-border" />
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-[15px] font-medium">เล่นอัตโนมัติ</span>
            <span className="t-meta mt-0.5 block">เล่นคลิปถัดไปให้เองเมื่อคลิปปัจจุบันจบ</span>
          </span>
          <Switch checked={autoplay} onCheckedChange={toggleAutoplay} aria-label="เล่นอัตโนมัติ" />
        </label>
        <div className="h-px bg-border" />
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span>
            <span className="block text-[15px] font-medium">รับอีเมลเมื่อมีคลิปหรือโพสต์ใหม่</span>
            <span className="t-meta mt-0.5 block">ส่งไปที่อีเมลของบัญชีนี้เฉพาะเมื่อมีคอนเทนต์ใหม่ ปิดได้ทุกเมื่อ</span>
          </span>
          <Switch checked={emailUpdates} onCheckedChange={toggleEmailUpdates} aria-label="รับอีเมลเมื่อมีคลิปหรือโพสต์ใหม่" />
        </label>
      </div>
    </Card>
  );
}

// ───────── Logout ─────────

function LogoutCard() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <div className="flex justify-center pt-4">
      <Button
        variant="outline"
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await logoutAction();
            router.push("/");
            router.refresh();
          })
        }
      >
        <LogOut strokeWidth={1.75} /> {pending ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
      </Button>
    </div>
  );
}
