"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarPlus, Check, Clock, Copy, Film, Trash2, Wallet, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import { inputClass } from "@/components/ui/misc";
import { TimeAgo } from "@/components/ui/time-ago";
import { addMemberNoteAction, deleteMemberNoteAction } from "@/app/studio/actions";
import { banUserAction } from "@/app/actions";
import { contentHref, formatNumber, thaiDate, thaiDateTime } from "@/lib/format";
import { MEMBER_TIERS, memberTier } from "@/lib/community";
import { cn } from "@/lib/utils";
import { ACTION_LABEL, ExpiryCell, ExtendDialog, RevokeDialog, StatusPill } from "./members-manager";
import { auditNoteText, FOLLOWUP_LABEL, formatWatch, METHOD_LABEL, ONBOARDING_STAGE_LABEL, PLAN_LABEL, PROVIDER_LABEL, type MemberDetail } from "./types";
import { Card, CardHeader, DailyBars, StatCard, StudioThumb } from "./ui";

const PURCHASE_STATUS: Record<string, string> = { paid: "ชำระแล้ว", refunded: "คืนเงินแล้ว" };
const WELCOME_STEPS = [0, 1, 3, 7] as const;

const excerpt = (s: string, n = 120) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

function Chip({ children, tone }: { children: React.ReactNode; tone?: "danger" | "member" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[12px] font-medium text-text-2",
        tone === "danger" && "border-transparent bg-danger/15 font-semibold text-danger",
        tone === "member" && "border-transparent bg-member/15 font-semibold text-member",
      )}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="t-meta px-5 pb-5 pt-3">{children}</p>;
}

export function MemberHeader({ d }: { d: MemberDetail }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<null | "extend" | "revoke" | "ban">(null);
  const active = d.status === "active" || d.status === "expiring";
  const refresh = () => router.refresh();
  const dm = { id: d.id, display_name: d.display_name, expires_at: d.expires_at };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(d.email);
      toast("คัดลอกอีเมลแล้ว");
    } catch {
      toast("คัดลอกไม่สำเร็จ");
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/studio/members/list" className="t-meta inline-flex items-center gap-1 hover:text-text">
        ← สมาชิกทั้งหมด
      </Link>

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar src={d.avatar_url} name={d.display_name} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="t-h1 break-words">{d.display_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="t-meta break-all">{d.email || "ไม่มีอีเมล"}</span>
              {d.email && (
                <Button size="sm" variant="ghost" onClick={copyEmail} aria-label="คัดลอกอีเมล">
                  <Copy /> คัดลอก
                </Button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-2.5 py-0.5">
                <StatusPill s={d.status} />
              </span>
              {d.first_paid_at && <Chip tone="member">{MEMBER_TIERS[memberTier(d.first_paid_at)].label}</Chip>}
              {d.is_banned && <Chip tone="danger">ถูกแบน</Chip>}
              <Chip>{PROVIDER_LABEL[d.provider]}</Chip>
              {!d.email_confirmed && <Chip>ยังไม่ยืนยันอีเมล</Chip>}
              {d.last_followup && (
                <Chip>
                  ทักแล้วเมื่อ&nbsp;<TimeAgo iso={d.last_followup.created_at} />&nbsp;({FOLLOWUP_LABEL[d.last_followup.kind]})
                </Chip>
              )}
            </div>
            <dl className="tnum mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
              <Meta label="สมัครเมื่อ" value={thaiDateTime(d.signed_up_at)} />
              <Meta label="ล็อกอินล่าสุด" value={d.last_sign_in_at ? thaiDateTime(d.last_sign_in_at) : "—"} />
              <Meta label="ขั้น onboarding" value={d.onboarding_stage ? ONBOARDING_STAGE_LABEL[d.onboarding_stage] : "ยังไม่ได้ตอบ"} />
              <Meta label="รับอีเมลข่าวสาร" value={d.email_updates ? "เปิด" : "ปิด"} />
              <Meta label="หมดอายุ" value={d.expires_at ? <ExpiryCell m={d} /> : "—"} />
            </dl>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={() => setDialog("extend")}>
            <CalendarPlus /> ต่ออายุเอง
          </Button>
          {active && (
            <Button variant="ghost" className="text-danger" onClick={() => setDialog("revoke")}>
              ยกเลิกสิทธิ์
            </Button>
          )}
          <Button variant="ghost" className={cn(!d.is_banned && "text-danger")} onClick={() => setDialog("ban")}>
            <Ban /> {d.is_banned ? "ยกเลิกแบน" : "แบน"}
          </Button>
        </div>
      </Card>

      {dialog === "extend" && <ExtendDialog m={dm} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === "revoke" && <RevokeDialog m={dm} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog === "ban" && <BanDialog d={d} onClose={() => setDialog(null)} onDone={refresh} />}
    </div>
  );
}

export function ProfileOverview({ d }: { d: MemberDetail }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="จ่ายรวม" value={`฿${formatNumber(d.lifetime_thb)}`} icon={<Wallet />} tone="member" />
        <StatCard label="ดูแล้ว" value={d.clips_started} unit="คลิป" icon={<Film />} hint={`ดูจบ ${formatNumber(d.clips_completed)} คลิป`} />
        <StatCard label="เวลาดูรวม (โดยประมาณ)" value={formatWatch(d.watch_sec)} icon={<Clock />} hint="ประมาณจากความคืบหน้า" />
        <StatCard label="เข้ามาดูใน 30 วัน" value={d.active_days_30} unit="วัน" icon={<CalendarDays />} />
      </div>

      <Card>
        <CardHeader title="จำนวนครั้งที่ดู 30 วันล่าสุด" description="นับตามวัน (เวลาประเทศไทย)" />
        <div className="px-5 pb-5 pt-4">
          <DailyBars data={d.daily} label="จำนวนครั้งที่ดู" />
        </div>
      </Card>

      <Notes d={d} onChange={refresh} />
    </div>
  );
}

export function ProfileBilling({ d }: { d: MemberDetail }) {
  return (
    <div className="space-y-6">
      {/* Money */}
      <Card>
        <CardHeader title="การเงิน" description="การชำระค่าสมาชิก การซื้อสินค้า และไฟล์ตัวอย่างที่ดาวน์โหลด" />
        <h3 className="px-5 pb-1 pt-4 text-[13px] font-semibold">ค่าสมาชิก</h3>
        {d.payments.length === 0 ? (
          <Empty>ยังไม่มีการชำระเงิน</Empty>
        ) : (
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[12px] text-text-2">
                  <th className="py-2 pr-3 font-medium">วันที่</th>
                  <th className="px-3 py-2 font-medium">แผน</th>
                  <th className="px-3 py-2 font-medium">ช่องทาง</th>
                  <th className="px-3 py-2 font-medium">เดือน</th>
                  <th className="px-3 py-2 text-right font-medium">ยอด</th>
                  <th className="py-2 pl-3 font-medium">อ้างอิง</th>
                </tr>
              </thead>
              <tbody>
                {d.payments.map((p) => (
                  <tr key={p.id} className="tnum border-b border-border last:border-0">
                    <td className="py-2 pr-3">{thaiDate(p.paid_at)}</td>
                    <td className="px-3 py-2">{p.plan ? PLAN_LABEL[p.plan] : "—"}</td>
                    <td className="px-3 py-2">{METHOD_LABEL[p.method] ?? p.method}</td>
                    <td className="px-3 py-2">{p.months}</td>
                    <td className="px-3 py-2 text-right">฿{formatNumber(p.amount)}</td>
                    <td className="t-caption max-w-[180px] truncate py-2 pl-3 text-text-2">{p.reference || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="border-t border-border px-5 pb-1 pt-4 text-[13px] font-semibold">สินค้าที่ซื้อ</h3>
        {d.purchases.length === 0 ? (
          <Empty>ยังไม่เคยซื้อสินค้า</Empty>
        ) : (
          <ul className="px-5 pb-4">
            {d.purchases.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-b border-border py-2 text-[13px] last:border-0">
                <span className="min-w-0 flex-1 font-medium">{p.title}</span>
                <span className="tnum">฿{formatNumber(p.amount)}</span>
                <span className={cn("t-caption", p.status === "refunded" ? "text-danger" : "text-text-2")}>{PURCHASE_STATUS[p.status] ?? p.status}</span>
                <span className="tnum t-caption text-text-2">{p.paid_at ? thaiDate(p.paid_at) : "—"}</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="border-t border-border px-5 pb-1 pt-4 text-[13px] font-semibold">ไฟล์ตัวอย่างที่ดาวน์โหลด</h3>
        {d.samples.length === 0 ? (
          <Empty>ยังไม่เคยโหลดไฟล์ตัวอย่าง</Empty>
        ) : (
          <ul className="px-5 pb-4">
            {d.samples.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-border py-2 text-[13px] last:border-0">
                <span className="min-w-0 flex-1 font-medium">{s.title}</span>
                <span className="tnum t-caption text-text-2">{thaiDate(s.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ProfileWatch({ d }: { d: MemberDetail }) {
  return (
    <div className="space-y-6">
      {/* Watched */}
      <Card>
        <CardHeader title="คลิปที่ดู" description={`กดไลก์ ${formatNumber(d.likes)} · บันทึกไว้ ${formatNumber(d.saved)}`} />
        {d.watched.length === 0 ? (
          <Empty>ยังไม่เคยดูคลิป</Empty>
        ) : (
          <ul className="max-h-[560px] overflow-y-auto px-5 pb-4 pt-2">
            {d.watched.map((w) => {
              const pct = w.completed ? 100 : w.duration_sec > 0 ? Math.min(100, Math.round((w.position_sec / w.duration_sec) * 100)) : 0;
              return (
                <li key={w.content_id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                  <StudioThumb src={w.thumbnail_url} type={w.type} duration={w.duration_sec} className="w-24 sm:w-28" />
                  <div className="min-w-0 flex-1">
                    <Link href={contentHref({ id: w.content_id, type: w.type })} target="_blank" className="line-clamp-2 text-[13px] font-medium hover:underline">
                      {w.title}
                    </Link>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-elevated" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="ความคืบหน้า">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tnum t-caption text-text-2">{pct}%</span>
                      {w.completed && <Chip tone="member">ดูจบ</Chip>}
                    </div>
                  </div>
                  <TimeAgo iso={w.updated_at} className="tnum t-caption shrink-0 text-text-2" />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ProfileCommunity({ d }: { d: MemberDetail }) {
  return (
    <div className="space-y-6">
      {/* Community */}
      <Card>
        <CardHeader title="ชุมชนและคอมเมนต์" description={`คอมเมนต์ในโพสต์ชุมชน ${formatNumber(d.post_comment_count)} รายการ`} />
        <h3 className="px-5 pb-1 pt-4 text-[13px] font-semibold">โพสต์ชุมชน</h3>
        {d.posts.length === 0 ? (
          <Empty>ยังไม่เคยโพสต์</Empty>
        ) : (
          <ul className="px-5 pb-4">
            {d.posts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-b border-border py-2 text-[13px] last:border-0">
                <Link href={`/community/posts/${p.id}`} target="_blank" className="min-w-0 flex-1 break-words hover:underline">
                  {excerpt(p.body) || "(โพสต์รูปภาพ)"}
                </Link>
                <span className="tnum t-caption text-text-2">{thaiDate(p.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="border-t border-border px-5 pb-1 pt-4 text-[13px] font-semibold">คอมเมนต์ใต้คลิป</h3>
        {d.comments.length === 0 ? (
          <Empty>ยังไม่เคยคอมเมนต์</Empty>
        ) : (
          <ul className="px-5 pb-4">
            {d.comments.map((c) => (
              <li key={c.id} className="border-b border-border py-2 text-[13px] last:border-0">
                <p className="break-words">{excerpt(c.body)}</p>
                <p className="t-caption mt-0.5 text-text-2">
                  <Link href={contentHref({ id: c.content_id, type: c.content_type })} target="_blank" className="hover:underline">
                    {c.content_title}
                  </Link>{" "}
                  · <span className="tnum">{thaiDate(c.created_at)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ProfileLog({ d }: { d: MemberDetail }) {
  return (
    <div className="space-y-6">
      {/* Welcome emails */}
      <Card>
        <CardHeader title="อีเมลต้อนรับ" description="ระบบส่งอัตโนมัติ 4 ครั้งหลังสมัคร" />
        <ul className="grid grid-cols-2 gap-3 px-5 pb-5 pt-4 sm:grid-cols-4">
          {WELCOME_STEPS.map((step) => {
            const sent = d.welcome.find((w) => w.step === step);
            return (
              <li key={step} className="rounded-[12px] border border-border bg-bg p-3">
                <p className="t-caption text-text-2">วันที่ {step}</p>
                <p className={cn("tnum mt-1 flex items-center gap-1 text-[13px]", !sent && "text-text-2")}>
                  {sent ? (
                    <>
                      <Check className="size-3.5 text-success" aria-hidden /> {thaiDate(sent.sent_at)}
                    </>
                  ) : (
                    "ยังไม่ส่ง"
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="ประวัติแอดมินกับคนนี้" description="20 รายการล่าสุด" />
        {d.audit.length === 0 ? (
          <Empty>ยังไม่มีประวัติ</Empty>
        ) : (
          <ul className="px-5 pb-4 pt-2">
            {d.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border py-2.5 text-[13px] last:border-0">
                <span className="tnum w-28 shrink-0 text-text-2">
                  <TimeAgo iso={a.created_at} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                  {a.note && <span className="mt-0.5 block break-words text-text-2">หมายเหตุ: {auditNoteText(a.action, a.note)}</span>}
                </span>
                <span className="t-caption text-text-2">{a.admin}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="t-caption text-text-2">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function BanDialog({ d, onClose, onDone }: { d: MemberDetail; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const unban = d.is_banned;
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{unban ? "ยกเลิกแบนผู้ใช้" : "แบนผู้ใช้"}</DialogTitle>
        <DialogDescription className="mt-1">
          {unban ? `${d.display_name} จะกลับมาคอมเมนต์และโพสต์ได้อีกครั้ง` : `${d.display_name} จะคอมเมนต์และโพสต์ไม่ได้ ยืนยันที่จะแบน?`}
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button
            variant={unban ? "secondary" : "danger"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await banUserAction(d.id, !unban);
              setBusy(false);
              if (!r.ok) return void toast(r.error);
              toast(unban ? "ยกเลิกแบนแล้ว" : "แบนผู้ใช้แล้ว");
              onClose();
              onDone();
            }}
          >
            {unban ? "ยกเลิกแบน" : "ยืนยันแบน"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Notes({ d, onChange }: { d: MemberDetail; onChange: () => void }) {
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [del, setDel] = React.useState<null | string>(null);

  const save = async () => {
    setBusy(true);
    const r = await addMemberNoteAction(d.id, body);
    setBusy(false);
    if (!r.ok) return void toast(r.error);
    setBody("");
    toast("บันทึกโน้ตแล้ว");
    onChange();
  };

  return (
    <Card>
      <CardHeader title="โน้ตของทีม" description="เห็นเฉพาะผู้ดูแล สมาชิกไม่เห็น" />
      {!d.notes_available ? (
        <Empty>ยังไม่ได้ apply migration 0021</Empty>
      ) : (
        <div className="px-5 pb-5 pt-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="เช่น คุยทาง LINE แล้ว สนใจแพ็กเกจรายปี"
            aria-label="โน้ตใหม่"
            className={cn(inputClass, "resize-y")}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="tnum t-caption text-text-2">{body.length}/2000</span>
            <Button variant="secondary" onClick={save} disabled={busy || !body.trim()}>
              บันทึก
            </Button>
          </div>
          {d.notes.length === 0 ? (
            <p className="t-meta mt-4">ยังไม่มีโน้ต</p>
          ) : (
            <ul className="mt-4">
              {d.notes.map((n) => (
                <li key={n.id} className="flex items-start gap-3 border-t border-border py-3 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="t-caption text-text-2">
                      {n.author} · <TimeAgo iso={n.created_at} />
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words">{n.body}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-danger" aria-label="ลบโน้ต" onClick={() => setDel(n.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {del && (
        <Dialog open onOpenChange={(o) => !o && setDel(null)}>
          <DialogContent className="max-w-sm">
            <DialogTitle>ลบโน้ตนี้?</DialogTitle>
            <DialogDescription className="mt-1">ลบแล้วกู้คืนไม่ได้</DialogDescription>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDel(null)}>
                ยกเลิก
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const id = del;
                  setDel(null);
                  const r = await deleteMemberNoteAction(id);
                  if (!r.ok) return void toast(r.error);
                  toast("ลบโน้ตแล้ว");
                  onChange();
                }}
              >
                ลบ
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
