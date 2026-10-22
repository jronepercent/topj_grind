"use client";
import * as React from "react";
import { Loader2, Mail, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Field, inputClass } from "@/components/ui/misc";
import { formatNumber, thaiDateTime } from "@/lib/format";
import type { BroadcastAudience, BroadcastInfo, BroadcastResult, BroadcastSource } from "@/lib/server/broadcast";
import { cn } from "@/lib/utils";

const SUBJECT_MAX = 150;

const AUDIENCES: { value: BroadcastAudience; label: string; hint: string }[] = [
  { value: "all", label: "ทุกคน", hint: "ทุกบัญชีที่ยืนยันอีเมลและเปิดรับอีเมลไว้" },
  { value: "members", label: "เฉพาะสมาชิก", hint: "เฉพาะผู้ที่สมาชิกยังไม่หมดอายุ" },
];

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "form"; info: BroadcastInfo }
  | { name: "sending"; info: BroadcastInfo }
  | { name: "done"; result: BroadcastResult };

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({ error: "เซิร์ฟเวอร์ตอบกลับผิดปกติ ลองใหม่อีกครั้ง" }))) as T & { error?: string };
}

/** Button that opens the send dialog. Disabled (with the reason as tooltip) until the item is live on the site. */
export function SendEmailButton({
  type,
  id,
  title,
  disabledReason,
  size = "sm",
  className,
}: {
  type: BroadcastSource;
  id: string;
  title: string;
  disabledReason?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <span title={disabledReason ?? undefined} className={cn("inline-flex", className)}>
        <Button type="button" variant="secondary" size={size} disabled={!!disabledReason} onClick={() => setOpen(true)}>
          <Mail /> ส่งอีเมลแจ้งเตือน
        </Button>
      </span>
      {open && <SendEmailDialog type={type} id={id} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Why an item cannot be emailed yet, or null when it can. */
export function emailDisabledReason(live: boolean) {
  return live ? null : "ส่งอีเมลได้เมื่อเผยแพร่แล้วเท่านั้น";
}

export function SendEmailDialog({ type, id, title, onClose }: { type: BroadcastSource; id: string; title: string; onClose: () => void }) {
  const [phase, setPhase] = React.useState<Phase>({ name: "loading" });
  const [audience, setAudience] = React.useState<BroadcastAudience>("all");
  const [subject, setSubject] = React.useState("");

  React.useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/studio/email?type=${type}&id=${encodeURIComponent(id)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await readJson<BroadcastInfo>(res);
        if (!res.ok) return setPhase({ name: "error", message: body.error ?? "โหลดข้อมูลไม่สำเร็จ" });
        setSubject(body.defaultSubject);
        setPhase({ name: "form", info: body });
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setPhase({ name: "error", message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง" });
      });
    return () => ctrl.abort();
  }, [type, id]);

  const sending = phase.name === "sending";

  const send = async (info: BroadcastInfo) => {
    setPhase({ name: "sending", info });
    try {
      const res = await fetch("/api/studio/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id, audience, subject }),
      });
      const body = await readJson<BroadcastResult>(res);
      if (!res.ok) {
        // 504 etc.: the send may have partly happened, so say so rather than inviting a blind retry
        const message = res.status === 504 ? "หมดเวลารอผล อาจส่งไปแล้วบางส่วน ตรวจสอบประวัติการส่งก่อนส่งซ้ำ" : (body.error ?? "ส่งไม่สำเร็จ");
        return setPhase({ name: "error", message });
      }
      setPhase({ name: "done", result: body });
    } catch {
      setPhase({ name: "error", message: "การเชื่อมต่อขาดระหว่างส่ง อาจส่งไปแล้วบางส่วน ตรวจสอบประวัติการส่งก่อนส่งซ้ำ" });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-xl" hideClose={sending}>
        <DialogTitle className="pr-8">ส่งอีเมลแจ้งเตือน</DialogTitle>
        <DialogDescription className="mt-1 line-clamp-2 pr-8">{title}</DialogDescription>

        {phase.name === "loading" && (
          <div className="mt-6 space-y-3" aria-busy>
            <div className="skeleton h-16 rounded-[12px]" />
            <div className="skeleton h-10 rounded-[12px]" />
            <div className="skeleton h-24 rounded-[12px]" />
          </div>
        )}

        {phase.name === "error" && (
          <>
            <p role="alert" className="mt-6 rounded-[12px] border border-border bg-surface px-4 py-3 text-[14px] text-danger">
              {phase.message}
            </p>
            <div className="mt-6 flex justify-end">
              <Button variant="ghost" onClick={onClose}>
                ปิด
              </Button>
            </div>
          </>
        )}

        {(phase.name === "form" || phase.name === "sending") && (
          <FormBody
            info={phase.info}
            audience={audience}
            setAudience={setAudience}
            subject={subject}
            setSubject={setSubject}
            sending={sending}
            onCancel={onClose}
            onSend={() => send(phase.info)}
          />
        )}

        {phase.name === "done" && <ResultBody result={phase.result} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function FormBody({
  info,
  audience,
  setAudience,
  subject,
  setSubject,
  sending,
  onCancel,
  onSend,
}: {
  info: BroadcastInfo;
  audience: BroadcastAudience;
  setAudience: (a: BroadcastAudience) => void;
  subject: string;
  setSubject: (s: string) => void;
  sending: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  const count = info.counts[audience === "all" ? "all" : "members"];
  const cleanSubject = subject.trim();

  // Warn when the same people were already emailed: this audience before, or "everyone" (which includes members).
  const earlier = info.previous.find((p) => p.sent > 0 && (p.audience === audience || (audience === "members" && p.audience === "all")));
  const notConfigured = !info.configured;
  const canSend = !notConfigured && count > 0 && cleanSubject.length > 0 && cleanSubject.length <= SUBJECT_MAX && !sending;
  const p = info.preview;

  return (
    <div className="mt-5 space-y-5">
      {notConfigured && (
        <p role="alert" className="rounded-[12px] border border-border bg-surface px-4 py-3 text-[14px] text-danger">
          ระบบอีเมลยังไม่ได้ตั้งค่า ({info.missing.join(", ")})
        </p>
      )}

      <div>
        <span id="email-audience" className="mb-1.5 block text-[13px] font-medium">
          ส่งถึงใคร
        </span>
        <div role="radiogroup" aria-labelledby="email-audience" className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((a) => {
            const active = audience === a.value;
            return (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={sending}
                onClick={() => setAudience(a.value)}
                className={cn(
                  "rounded-[14px] border p-3.5 text-left transition-colors disabled:opacity-60",
                  active ? "border-text bg-hover" : "border-border hover:bg-hover/60",
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-semibold">{a.label}</span>
                  <span className="tnum text-[15px] font-semibold">{formatNumber(info.counts[a.value])} คน</span>
                </span>
                <span className="t-caption mt-1 block text-text-2">{a.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {earlier && (
        <p role="status" className="flex items-start gap-2 rounded-[12px] border border-member/40 bg-member/10 px-3.5 py-3 text-[13px] leading-5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-member" aria-hidden />
          <span>
            เคยส่งรายการนี้ให้{earlier.audience === "all" ? "ทุกคน" : "เฉพาะสมาชิก"}แล้วเมื่อ {thaiDateTime(earlier.created_at)} (สำเร็จ {formatNumber(earlier.sent)} คน)
            {earlier.audience !== audience && " ซึ่งรวมสมาชิกด้วย"} · ส่งซ้ำจะทำให้คนเหล่านั้นได้รับอีเมลอีกฉบับ
          </span>
        </p>
      )}

      <Field label="หัวข้ออีเมล" counter={`${subject.length}/${SUBJECT_MAX}`}>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={SUBJECT_MAX} disabled={sending} className={inputClass} />
      </Field>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium">ตัวอย่างที่ผู้รับจะเห็น</span>
        <div className="overflow-hidden rounded-[14px] border border-border bg-bg">
          {p.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.coverUrl} alt="" className="aspect-video w-full object-cover" />
          )}
          <div className="space-y-1.5 p-4">
            <p className="text-[12px] font-semibold text-accent">{p.kindLabel}</p>
            <p className="text-[16px] font-semibold leading-6">{p.title}</p>
            {p.excerpt && <p className="line-clamp-3 text-[13px] leading-5 text-text-2">{p.excerpt}</p>}
            {p.membersOnly && <p className="text-[12px] font-semibold text-member">สำหรับสมาชิก</p>}
            <p className="pt-1">
              <span className="inline-block rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-on-accent">{p.cta}</span>
            </p>
            <p className="t-caption break-all pt-1 text-text-2">{p.url}</p>
          </div>
        </div>
      </div>

      {sending && (
        <p role="status" className="t-meta">
          กำลังส่ง… อาจใช้เวลาสักครู่ถ้าผู้รับเยอะ อย่าปิดหน้านี้
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={sending}>
          ยกเลิก
        </Button>
        <Button variant="primary" onClick={onSend} disabled={!canSend}>
          {sending ? <Loader2 className="animate-spin" /> : <Mail />}
          {sending ? "กำลังส่ง…" : `ยืนยันส่งถึง ${formatNumber(count)} คน`}
        </Button>
      </div>
    </div>
  );
}

function ResultBody({ result, onClose }: { result: BroadcastResult; onClose: () => void }) {
  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[12px] border border-border bg-surface p-4">
          <p className="t-caption text-text-2">ส่งสำเร็จ</p>
          <p className="tnum mt-1 text-[24px] font-semibold text-success">{formatNumber(result.sent)}</p>
        </div>
        <div className="rounded-[12px] border border-border bg-surface p-4">
          <p className="t-caption text-text-2">ไม่สำเร็จ</p>
          <p className={cn("tnum mt-1 text-[24px] font-semibold", result.failed > 0 && "text-danger")}>{formatNumber(result.failed)}</p>
        </div>
      </div>
      <p className="t-meta tnum mt-3">ผู้รับทั้งหมด {formatNumber(result.recipients)} คน</p>
      {result.error && (
        <p role="alert" className="mt-3 rounded-[12px] border border-border bg-surface px-4 py-3 text-[13px] leading-5 text-danger">
          {result.error}
        </p>
      )}
      <div className="mt-6 flex justify-end">
        <Button variant="inverse" onClick={onClose}>
          เสร็จสิ้น
        </Button>
      </div>
    </div>
  );
}
