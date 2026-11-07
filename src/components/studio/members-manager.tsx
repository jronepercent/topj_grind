"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CalendarPlus, Check, CircleAlert, Download, Flame, Hourglass, Search, UserPlus, UserX, Users, UsersRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Avatar, EmptyState, Field, inputClass } from "@/components/ui/misc";
import { extendMemberAction, resolvePaymentErrorAction, revokeMemberAction } from "@/app/studio/actions";
import { daysUntil, formatNumber, thaiDate, thaiDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  formatWatch,
  inSegment,
  MEMBER_SEGMENTS,
  MEMBER_STATUS_LABEL,
  ONBOARDING_STAGE_LABEL,
  PLAN_LABEL,
  SEGMENT_LABEL,
  type MemberRow,
  type MemberSegment,
  type MemberStatus,
} from "./types";
import { Card, CardHeader, Dot, StatCard } from "./ui";
import { isoToBkkInput } from "./editor-parts";
import { TimeAgo } from "@/components/ui/time-ago";

export interface AuditEntry {
  id: string;
  admin: string;
  action: string;
  target: string;
  note: string;
  created_at: string;
}

export interface PaymentErrorEntry {
  id: string;
  reason: string;
  payload: string;
  created_at: string;
}

export const ACTION_LABEL: Record<string, string> = {
  "content.create": "สร้างคอนเทนต์",
  "content.published": "เผยแพร่คอนเทนต์",
  "content.scheduled": "ตั้งเวลาเผยแพร่",
  "content.draft": "เปลี่ยนเป็นฉบับร่าง",
  "content.public": "ตั้งเป็นสาธารณะ",
  "content.members": "ตั้งเป็นเฉพาะสมาชิก",
  "content.delete": "ย้ายไปถังขยะ",
  "content.restore": "กู้คืนคอนเทนต์",
  "content.purge": "ลบคอนเทนต์ถาวร",
  "content.reupload": "อัปโหลดไฟล์ใหม่",
  "playlist.create": "สร้าง Playlist",
  "playlist.update": "แก้ไข Playlist",
  "playlist.delete": "ลบ Playlist",
  "home.update": "จัดหน้า Home",
  "home.hero": "แก้ Hero หน้าแรก",
  "settings.update": "แก้ไขการตั้งค่าช่อง",
  "membership.extend": "ต่ออายุสมาชิก",
  "membership.set_date": "กำหนดวันหมดอายุ",
  "membership.revoke": "ยกเลิกสิทธิ์สมาชิก",
  "comment.pin": "ปักหมุดความคิดเห็น",
  "comment.unpin": "เลิกปักหมุดความคิดเห็น",
  "comment.heart": "ให้หัวใจความคิดเห็น",
  "comment.unheart": "เอาหัวใจออก",
  "comment.hide": "ซ่อนความคิดเห็น",
  "comment.unhide": "แสดงความคิดเห็น",
  "comment.delete": "ลบความคิดเห็น",
  "user.ban": "แบนผู้ใช้",
  "user.unban": "ยกเลิกแบนผู้ใช้",
  "content.publish": "เผยแพร่คอนเทนต์",
  "article.create": "สร้างบทความ",
  "article.update": "แก้ไขบทความ",
  "article.delete": "ลบบทความ",
  "article.pin": "ปักหมุดบทความ",
  "article.unpin": "เลิกปักหมุดบทความ",
  "email.broadcast": "ส่งอีเมลถึงสมาชิก",
  "onboarding.update": "แก้เส้นทางเริ่มต้น",
  "post.delete": "ลบโพสต์ชุมชน",
  "post.pin": "ปักหมุดโพสต์ชุมชน",
  "post.unpin": "เลิกปักหมุดโพสต์ชุมชน",
  "post.hide": "ซ่อนโพสต์ชุมชน",
  "post.unhide": "แสดงโพสต์ชุมชน",
  "post_comment.delete": "ลบคอมเมนต์ชุมชน",
  "post_comment.hide": "ซ่อนคอมเมนต์ชุมชน",
  "post_comment.unhide": "แสดงคอมเมนต์ชุมชน",
  "product.create": "สร้างสินค้า",
  "product.update": "แก้ไขสินค้า",
  "product.delete": "ลบสินค้า",
  "product.feature": "ปักหมุดสินค้า",
  "product.unfeature": "เลิกปักหมุดสินค้า",
  "product.grant": "มอบสินค้าให้ผู้ใช้",
  "product.kohort_unlink": "ยกเลิกผูกลิงก์ Kohort",
  "purchase.refund": "คืนเงินคำสั่งซื้อ",
  "member.note": "เพิ่มโน้ตสมาชิก",
  "member.note_delete": "ลบโน้ตสมาชิก",
};

const STATUS_TONE: Record<MemberStatus, "success" | "member" | "danger" | "muted"> = {
  active: "success",
  expiring: "member",
  expired: "danger",
  never: "muted",
};

type DialogMember = Pick<MemberRow, "id" | "display_name" | "expires_at">;

type SortKey = "lifetime_thb" | "watch_sec" | "last_active" | "signed_up_at" | "expires_at";
type Sort = { key: SortKey; dir: "asc" | "desc" } | null;

function sortValue(m: MemberRow, key: SortKey): number | null {
  if (key === "lifetime_thb" || key === "watch_sec") return m[key];
  const v = m[key];
  return v ? new Date(v).getTime() : null;
}

export function MembersManager({
  rows,
  summary,
  audit,
  paymentErrors,
  initialSegment,
  initialQuery,
}: {
  rows: MemberRow[];
  summary: { active: number; within7: number; expiringThisMonth: number; revenue: number; total: number; free: number; new7: number; hot: number };
  audit: AuditEntry[];
  paymentErrors: PaymentErrorEntry[];
  initialSegment: MemberSegment;
  initialQuery: string;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(initialQuery);
  const [seg, setSeg] = React.useState<MemberSegment>(initialSegment);
  const [sort, setSort] = React.useState<Sort>(null);
  const [now] = React.useState(() => Date.now());
  const [dialog, setDialog] = React.useState<null | { kind: "extend" | "revoke"; m: MemberRow }>(null);
  const [errors, setErrors] = React.useState(paymentErrors);
  React.useEffect(() => setErrors(paymentErrors), [paymentErrors]);

  const term = q.trim().toLowerCase();
  const counts = React.useMemo(() => {
    const out = {} as Record<MemberSegment, number>;
    for (const k of MEMBER_SEGMENTS) out[k] = rows.filter((r) => inSegment(r, k, now)).length;
    return out;
  }, [rows, now]);
  const list = React.useMemo(() => {
    const out = rows.filter(
      (r) => inSegment(r, seg, now) && (!term || r.display_name.toLowerCase().includes(term) || r.email.toLowerCase().includes(term)),
    );
    if (!sort) return out;
    const dir = sort.dir === "asc" ? 1 : -1;
    return out.slice().sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      if (x === null && y === null) return 0;
      if (x === null) return 1; // empty values always last
      if (y === null) return -1;
      return (x - y) * dir;
    });
  }, [rows, seg, term, sort, now]);
  const csvHref = `/api/studio/members?${new URLSearchParams({ ...(term ? { q: term } : {}), seg }).toString()}`;

  const pick = (next: MemberSegment) => {
    setSeg(next);
    router.replace(next === "all" ? "/studio/members" : `/studio/members?seg=${next}`, { scroll: false });
  };
  const toggleSort = (key: SortKey) =>
    setSort((cur) => (!cur || cur.key !== key ? { key, dir: "desc" } : cur.dir === "desc" ? { key, dir: "asc" } : null));
  const th = (key: SortKey, label: string) => (
    <th scope="col" className="px-3 py-3 font-medium" aria-sort={sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-text">
        {label}
        {sort?.key === key ? sort.dir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : null}
      </button>
    </th>
  );

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="สมาชิกปัจจุบัน" value={summary.active} icon={<Users />} tone="member" />
          <StatCard label="ใกล้หมดอายุใน 7 วัน" value={summary.within7} icon={<Hourglass />} />
          <StatCard label="หมดอายุเดือนนี้" value={summary.expiringThisMonth} icon={<UserX />} hint="ทั้งที่หมดแล้วและกำลังจะหมด" />
          <StatCard label="รายได้เดือนนี้" value={`฿${formatNumber(summary.revenue)}`} icon={<Wallet />} hint="จากการชำระเงิน (เวลาประเทศไทย)" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="บัญชีทั้งหมด" value={summary.total} icon={<UsersRound />} />
          <StatCard label="บัญชีฟรี" value={summary.free} icon={<Users />} hint="ยังไม่เคยจ่ายเงิน" />
          <StatCard label="สมัครใหม่ 7 วัน" value={summary.new7} icon={<UserPlus />} />
          <StatCard label="Lead ร้อน" value={summary.hot} icon={<Flame />} tone="danger" hint="ยังไม่จ่าย แต่ดูหนักใน 7 วัน" />
        </div>
      </div>

      {errors.length > 0 && (
        <Card id="payment-errors" className="scroll-mt-28 border-danger/30">
          <CardHeader
            title={`การชำระเงินที่ต้องตรวจสอบ (${errors.length})`}
            description="ระบบรับแจ้งชำระเงินแต่ประมวลผลไม่ได้ ตรวจสอบแล้วต่ออายุให้เองจากตารางด้านล่าง"
          />
          <ul className="space-y-3 px-5 pb-5 pt-3">
            {errors.map((e) => (
              <li key={e.id} className="rounded-[14px] border border-border bg-bg p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold">{e.reason}</p>
                    <p className="t-caption text-text-2">{thaiDateTime(e.created_at)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const before = errors;
                      setErrors((xs) => xs.filter((x) => x.id !== e.id));
                      const r = await resolvePaymentErrorAction(e.id);
                      if (!r.ok) {
                        setErrors(before);
                        toast(r.error);
                      } else {
                        toast("ทำเครื่องหมายว่าแก้แล้ว");
                        router.refresh();
                      }
                    }}
                  >
                    <Check /> ทำเครื่องหมายว่าแก้แล้ว
                  </Button>
                </div>
                <pre className="tnum mt-3 max-h-48 overflow-auto rounded-[10px] bg-surface p-3 text-[12px] leading-5 text-text-2">{e.payload}</pre>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <div role="tablist" aria-label="กลุ่มสมาชิก" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {MEMBER_SEGMENTS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={seg === k}
              onClick={() => pick(k)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors",
                seg === k ? "border-text bg-text text-bg" : "border-border bg-surface hover:bg-hover",
              )}
            >
              {SEGMENT_LABEL[k]}
              <span className={cn("tnum text-[12px]", seg === k ? "opacity-70" : "text-text-2")}>{formatNumber(counts[k])}</span>
            </button>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-2" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อหรืออีเมล" aria-label="ค้นหาสมาชิก" className={cn(inputClass, "h-10 rounded-full py-0 pl-10")} />
          </div>
          <Button asChild variant="outline" className="ml-auto">
            <a href={csvHref} download>
              <Download /> ส่งออก CSV
            </a>
          </Button>
        </div>

        {list.length === 0 ? (
          <EmptyState art="search" title="ไม่พบสมาชิกที่ตรงกับเงื่อนไข" />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-[16px] border border-border lg:block">
              <table className="w-full min-w-[1180px] text-left">
                <thead>
                  <tr className="border-b border-border bg-surface text-[12px] text-text-2">
                    <th scope="col" className="px-4 py-3 font-medium">ชื่อ</th>
                    <th scope="col" className="px-3 py-3 font-medium">สถานะ</th>
                    <th scope="col" className="px-3 py-3 font-medium">แผน</th>
                    {th("expires_at", "วันหมดอายุ")}
                    {th("lifetime_thb", "จ่ายรวม")}
                    <th scope="col" className="px-3 py-3 font-medium">ขั้น</th>
                    {th("watch_sec", "ดูแล้ว")}
                    {th("last_active", "ใช้งานล่าสุด")}
                    {th("signed_up_at", "สมัครบัญชี")}
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      <span className="sr-only">จัดการ</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={m.id} className="border-b border-border text-[13px] last:border-0 hover:bg-hover/60">
                      <td className="px-4 py-3">
                        <Link href={`/studio/members/${m.id}`} className="flex items-center gap-2.5">
                          <Avatar src={m.avatar_url} name={m.display_name} size={32} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium hover:underline">{m.display_name}</span>
                              <MemberBadges m={m} />
                            </span>
                            <span className="t-caption block max-w-[220px] truncate text-text-2">{m.email}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill s={m.status} />
                      </td>
                      <td className="px-3 py-3">{m.plan ? PLAN_LABEL[m.plan] : <span className="text-text-2">—</span>}</td>
                      <td className="tnum px-3 py-3">
                        <ExpiryCell m={m} />
                      </td>
                      <td className="tnum px-3 py-3">{m.lifetime_thb > 0 ? `฿${formatNumber(m.lifetime_thb)}` : <span className="text-text-2">—</span>}</td>
                      <td className="px-3 py-3">{m.onboarding_stage ? ONBOARDING_STAGE_LABEL[m.onboarding_stage] : <span className="text-text-2">—</span>}</td>
                      <td className="tnum px-3 py-3">
                        <WatchCell m={m} />
                      </td>
                      <td className="tnum px-3 py-3 text-text-2">{m.last_active ? <TimeAgo iso={m.last_active} /> : "—"}</td>
                      <td className="tnum px-3 py-3">{thaiDate(m.signed_up_at)}</td>
                      <td className="px-4 py-3">
                        <RowButtons m={m} onOpen={setDialog} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 lg:hidden">
              {list.map((m) => (
                <li key={m.id} className="rounded-[16px] border border-border bg-surface p-4">
                  <Link href={`/studio/members/${m.id}`} className="flex items-center gap-3">
                    <Avatar src={m.avatar_url} name={m.display_name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[14px] font-semibold">
                        <span className="truncate">{m.display_name}</span>
                        <MemberBadges m={m} />
                      </p>
                      <p className="t-caption truncate text-text-2">{m.email}</p>
                    </div>
                    <StatusPill s={m.status} />
                  </Link>
                  <dl className="tnum mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                    <div>
                      <dt className="t-caption text-text-2">แผน</dt>
                      <dd>{m.plan ? PLAN_LABEL[m.plan] : "—"}</dd>
                    </div>
                    <div>
                      <dt className="t-caption text-text-2">วันหมดอายุ</dt>
                      <dd>
                        <ExpiryCell m={m} />
                      </dd>
                    </div>
                    <div>
                      <dt className="t-caption text-text-2">จ่ายรวม</dt>
                      <dd>{m.lifetime_thb > 0 ? `฿${formatNumber(m.lifetime_thb)}` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="t-caption text-text-2">ขั้น</dt>
                      <dd>{m.onboarding_stage ? ONBOARDING_STAGE_LABEL[m.onboarding_stage] : "—"}</dd>
                    </div>
                    <div>
                      <dt className="t-caption text-text-2">ดูแล้ว</dt>
                      <dd>
                        <WatchCell m={m} />
                      </dd>
                    </div>
                    <div>
                      <dt className="t-caption text-text-2">ใช้งานล่าสุด</dt>
                      <dd>{m.last_active ? <TimeAgo iso={m.last_active} /> : "—"}</dd>
                    </div>
                    <div>
                      <dt className="t-caption text-text-2">สมัครบัญชี</dt>
                      <dd>{thaiDate(m.signed_up_at)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 border-t border-border pt-3">
                    <RowButtons m={m} onOpen={setDialog} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Card>
        <CardHeader title="ประวัติการดำเนินการ" description="20 รายการล่าสุดจากผู้ดูแล" />
        {audit.length === 0 ? (
          <p className="t-meta px-5 pb-5 pt-2">ยังไม่มีประวัติ</p>
        ) : (
          <ul className="px-5 pb-4 pt-2">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-border py-2.5 text-[13px] last:border-0">
                <span className="tnum w-28 shrink-0 text-text-2"><TimeAgo iso={a.created_at} /></span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                  {a.target && <span className="text-text-2"> · {a.target}</span>}
                  {a.note && <span className="mt-0.5 block text-text-2">หมายเหตุ: {a.note}</span>}
                </span>
                <span className="t-caption text-text-2">{a.admin}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dialog?.kind === "extend" && <ExtendDialog m={dialog.m} onClose={() => setDialog(null)} onDone={() => router.refresh()} />}
      {dialog?.kind === "revoke" && <RevokeDialog m={dialog.m} onClose={() => setDialog(null)} onDone={() => router.refresh()} />}
    </div>
  );
}

export function MemberBadges({ m }: { m: Pick<MemberRow, "is_banned" | "hot"> }) {
  return (
    <>
      {m.is_banned && <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">ถูกแบน</span>}
      {m.hot && (
        <span className="shrink-0" title="Lead ร้อน" aria-label="Lead ร้อน">
          🔥
        </span>
      )}
    </>
  );
}

function WatchCell({ m }: { m: MemberRow }) {
  if (!m.clips_started && !m.watch_sec) return <span className="text-text-2">—</span>;
  return (
    <span>
      {formatNumber(m.clips_started)} คลิป · <span title="ประมาณจากความคืบหน้า">~{formatWatch(m.watch_sec)}</span>
      {m.clips_completed > 0 && <span className="t-caption block text-text-2">ดูจบ {formatNumber(m.clips_completed)}</span>}
    </span>
  );
}

export function StatusPill({ s }: { s: MemberStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", s === "expiring" && "text-member", s === "never" && "text-text-2")}>
      <Dot tone={STATUS_TONE[s]} /> {MEMBER_STATUS_LABEL[s]}
    </span>
  );
}

export function ExpiryCell({ m }: { m: Pick<MemberRow, "expires_at" | "status"> }) {
  if (!m.expires_at) return <span className="text-text-2">—</span>;
  const left = daysUntil(m.expires_at);
  return (
    <span>
      {thaiDate(m.expires_at)}
      {m.status !== "expired" && <span className="t-caption ml-1.5 text-text-2">(อีก {left} วัน)</span>}
    </span>
  );
}

function RowButtons({ m, onOpen }: { m: MemberRow; onOpen: (d: { kind: "extend" | "revoke"; m: MemberRow }) => void }) {
  const active = m.status === "active" || m.status === "expiring";
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: "extend", m })}>
        <CalendarPlus /> ต่ออายุเอง
      </Button>
      {active && (
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => onOpen({ kind: "revoke", m })}>
          ยกเลิกสิทธิ์
        </Button>
      )}
    </div>
  );
}

export function ExtendDialog({ m, onClose, onDone }: { m: DialogMember; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = React.useState<"days" | "until">("days");
  const base = Math.max(Date.now(), m.expires_at ? new Date(m.expires_at).getTime() : 0);
  const [until, setUntil] = React.useState(isoToBkkInput(new Date(base + 30 * 86_400_000).toISOString()).slice(0, 10));
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const preview = mode === "days" ? new Date(base + 30 * 86_400_000).toISOString() : until ? `${until}T23:59:59+07:00` : null;

  const submit = async () => {
    if (!note.trim()) return void toast("กรุณาใส่หมายเหตุ");
    if (mode === "until" && !until) return void toast("กรุณาเลือกวันที่");
    setBusy(true);
    const r = await extendMemberAction(m.id, mode === "days" ? { days: 30 } : { until: new Date(`${until}T23:59:59+07:00`).toISOString() }, note.trim());
    setBusy(false);
    if (!r.ok) return void toast(r.error);
    toast(`ต่ออายุ ${m.display_name} ถึง ${thaiDate(r.data)} แล้ว`);
    onClose();
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>ต่ออายุเอง</DialogTitle>
        <DialogDescription className="mt-1">
          {m.display_name} · {m.expires_at ? `หมดอายุ ${thaiDate(m.expires_at)}` : "ยังไม่เคยเป็นสมาชิก"}
        </DialogDescription>
        <div className="mt-5 space-y-2" role="radiogroup" aria-label="รูปแบบการต่ออายุ">
          {(
            [
              ["days", "+30 วัน", "นับต่อจากวันหมดอายุเดิม หรือจากวันนี้ถ้าหมดแล้ว"],
              ["until", "กำหนดวันที่", "หมดอายุสิ้นวันที่เลือก (เวลาประเทศไทย)"],
            ] as const
          ).map(([k, t, b]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={mode === k}
              onClick={() => setMode(k)}
              className={cn("flex w-full items-start gap-3 rounded-[14px] border px-4 py-3 text-left", mode === k ? "border-text bg-hover" : "border-border hover:bg-hover")}
            >
              <span className={cn("mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2", mode === k ? "border-text" : "border-[var(--border-strong)]")} aria-hidden>
                {mode === k && <span className="size-2 rounded-full bg-text" />}
              </span>
              <span>
                <span className="block text-[14px] font-semibold">{t}</span>
                <span className="t-meta">{b}</span>
              </span>
            </button>
          ))}
        </div>
        {mode === "until" && (
          <div className="mt-3">
            <Field label="วันหมดอายุใหม่">
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={cn(inputClass, "tnum")} />
            </Field>
          </div>
        )}
        <div className="mt-4">
          <Field label="หมายเหตุ (จำเป็น)" hint="เช่น โอนผ่านธนาคาร ตรวจสลิปแล้ว">
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} className={cn(inputClass, "resize-y")} />
          </Field>
        </div>
        {preview && <p className="t-meta tnum mt-3">หมดอายุใหม่: {thaiDateTime(preview)}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button variant="member" onClick={submit} disabled={busy || !note.trim()}>
            ยืนยันต่ออายุ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeDialog({ m, onClose, onDone }: { m: DialogMember; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>ยกเลิกสิทธิ์สมาชิก</DialogTitle>
        <DialogDescription className="mt-1">{m.display_name} จะหมดสิทธิ์ดูคอนเทนต์สมาชิกทันที</DialogDescription>
        <div className="mt-4">
          <Field label="หมายเหตุ (จำเป็น)" hint="เช่น ขอคืนเงิน">
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} className={cn(inputClass, "resize-y")} autoFocus />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            disabled={busy || !note.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await revokeMemberAction(m.id, note.trim());
              setBusy(false);
              if (!r.ok) return void toast(r.error);
              toast(`ยกเลิกสิทธิ์ ${m.display_name} แล้ว`);
              onClose();
              onDone();
            }}
          >
            ยกเลิกสิทธิ์
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
