"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveRestore, ChartColumn, Eye, Globe, Link2, ListPlus, Lock, Mail, Pencil, Search, Trash, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { EmptyState, inputClass } from "@/components/ui/misc";
import { AddToPlaylistDialog } from "@/components/cards/add-to-playlist";
import { bulkContentAction, contentStatsAction } from "@/app/studio/actions";
import { contentHref, formatCount, formatNumber, TYPE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentType, Visibility } from "@/lib/types";
import type { DailyPoint, StudioContentRow } from "./types";
import { ConfirmDialog } from "./confirm";
import { SendEmailDialog } from "./send-email-button";
import { DailyBars, dateCell, selectClass, selectStyle, StatusCell, StudioThumb, VisibilityLabel } from "./ui";

type StatusFilter = "all" | "published" | "scheduled" | "draft" | "processing" | "failed";
const DAY = 86_400_000;

function matchesStatus(r: StudioContentRow, s: StatusFilter) {
  if (s === "all") return true;
  if (s === "processing") return r.media_status === "uploading" || r.media_status === "processing";
  if (s === "failed") return r.media_status === "failed";
  return r.status === s;
}

export function ContentTable({ rows: initial, initialTab }: { rows: StudioContentRow[]; initialTab: "all" | "trash" }) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initial);
  React.useEffect(() => setRows(initial), [initial]);

  const [tab, setTab] = React.useState<"all" | "trash">(initialTab);
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<ContentType | "all">("all");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [vis, setVis] = React.useState<Visibility | "all">("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [playlistFor, setPlaylistFor] = React.useState<string[] | null>(null);
  const [statsFor, setStatsFor] = React.useState<StudioContentRow | null>(null);
  const [emailFor, setEmailFor] = React.useState<StudioContentRow | null>(null);
  const [confirm, setConfirm] = React.useState<null | { ids: string[]; op: "delete" | "purge" }>(null);

  const live = rows.filter((r) => !r.deleted_at);
  const trash = rows.filter((r) => r.deleted_at);
  const source = tab === "trash" ? trash : live;
  const term = q.trim().toLowerCase();
  const list = source.filter(
    (r) =>
      (!term || r.title.toLowerCase().includes(term)) &&
      (tab === "trash" ||
        ((type === "all" || r.type === type) && (vis === "all" || r.visibility === vis) && matchesStatus(r, status))),
  );
  const filtersOn = !!term || type !== "all" || status !== "all" || vis !== "all";

  const switchTab = (t: "all" | "trash") => {
    setTab(t);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allChecked = list.length > 0 && list.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(list.map((r) => r.id)));

  const run = async (ids: string[], op: "public" | "members" | "delete" | "restore" | "purge") => {
    const before = rows;
    const now = new Date().toISOString();
    setRows((rs) =>
      op === "purge"
        ? rs.filter((r) => !ids.includes(r.id))
        : rs.map((r) =>
            !ids.includes(r.id)
              ? r
              : op === "public" || op === "members"
                ? { ...r, visibility: op }
                : op === "delete"
                  ? { ...r, deleted_at: now }
                  : { ...r, deleted_at: null },
          ),
    );
    setSelected(new Set());
    const res = await bulkContentAction(ids, op);
    if (!res.ok) {
      setRows(before);
      toast(res.error);
      return;
    }
    const n = ids.length;
    if (op === "delete")
      toast(`ย้าย ${n} รายการไปถังขยะแล้ว`, {
        action: {
          label: "เลิกทำ",
          onClick: async () => {
            setRows((rs) => rs.map((r) => (ids.includes(r.id) ? { ...r, deleted_at: null } : r)));
            await bulkContentAction(ids, "restore");
            router.refresh();
          },
        },
      });
    else if (op === "restore") toast(`กู้คืน ${n} รายการแล้ว`);
    else if (op === "purge") toast(`ลบถาวร ${n} รายการแล้ว`);
    else toast(op === "members" ? `ตั้งเป็นเฉพาะสมาชิก ${n} รายการแล้ว` : `ตั้งเป็นสาธารณะ ${n} รายการแล้ว`);
    router.refresh();
  };

  const copyLink = async (r: StudioContentRow) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + contentHref(r));
      toast("คัดลอกลิงก์แล้ว");
    } catch {
      toast("คัดลอกไม่สำเร็จ");
    }
  };

  const sel = [...selected].filter((id) => list.some((r) => r.id === id));

  return (
    <div>
      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist" aria-label="มุมมอง">
        {(
          [
            ["all", "คอนเทนต์", live.length],
            ["trash", "ถังขยะ", trash.length],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => switchTab(k)}
            className={cn(
              "relative px-4 py-3 text-[14px] font-medium transition-colors",
              tab === k ? "text-text" : "text-text-2 hover:text-text",
              "after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[2px] after:rounded-full",
              tab === k ? "after:bg-text" : "after:bg-transparent",
            )}
          >
            {label} <span className="tnum ml-1 text-text-2">{formatNumber(n)}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-2" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาจากชื่อ"
            aria-label="ค้นหาคอนเทนต์"
            className={cn(inputClass, "h-10 rounded-full py-0 pl-10")}
          />
        </div>
        {tab === "all" && (
          <>
            <select aria-label="ประเภท" value={type} onChange={(e) => setType(e.target.value as ContentType | "all")} className={selectClass} style={selectStyle}>
              <option value="all">ทุกประเภท</option>
              <option value="video">วิดีโอ</option>
              <option value="podcast">พอดแคสต์</option>
            </select>
            <select aria-label="สถานะ" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectClass} style={selectStyle}>
              <option value="all">ทุกสถานะ</option>
              <option value="published">เผยแพร่แล้ว</option>
              <option value="scheduled">ตั้งเวลา</option>
              <option value="draft">ฉบับร่าง</option>
              <option value="processing">กำลังอัปโหลด/ประมวลผล</option>
              <option value="failed">ล้มเหลว</option>
            </select>
            <select aria-label="การมองเห็น" value={vis} onChange={(e) => setVis(e.target.value as Visibility | "all")} className={selectClass} style={selectStyle}>
              <option value="all">ทุกการมองเห็น</option>
              <option value="public">สาธารณะ</option>
              <option value="members">เฉพาะสมาชิก</option>
            </select>
            {filtersOn && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQ("");
                  setType("all");
                  setStatus("all");
                  setVis("all");
                }}
              >
                ล้างตัวกรอง
              </Button>
            )}
          </>
        )}
      </div>

      {tab === "trash" && (
        <p className="t-meta mb-4 rounded-[12px] border border-border bg-surface px-4 py-3">
          รายการในถังขยะจะถูกลบถาวรอัตโนมัติหลัง 30 วัน กู้คืนได้ก่อนครบกำหนด
        </p>
      )}

      {/* Bulk bar */}
      {sel.length > 0 && (
        <div className="sticky top-[104px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-elevated px-3 py-2 shadow-xl lg:top-[64px]" role="toolbar" aria-label="จัดการรายการที่เลือก">
          <button onClick={() => setSelected(new Set())} className="rounded-full p-1.5 text-text-2 hover:bg-hover hover:text-text" aria-label="ยกเลิกการเลือก">
            <X className="size-4" />
          </button>
          <span className="tnum mr-auto text-[14px] font-medium">เลือก {sel.length} รายการ</span>
          {tab === "all" ? (
            <>
              <Dropdown>
                <DropdownTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <Globe /> เปลี่ยนการมองเห็น
                  </Button>
                </DropdownTrigger>
                <DropdownContent align="end">
                  <DropdownItem onSelect={() => run(sel, "public")}>
                    <Globe /> สาธารณะ
                  </DropdownItem>
                  <DropdownItem onSelect={() => run(sel, "members")}>
                    <Lock className="!text-member" /> เฉพาะสมาชิก
                  </DropdownItem>
                </DropdownContent>
              </Dropdown>
              <Button variant="secondary" size="sm" onClick={() => setPlaylistFor(sel)}>
                <ListPlus /> เพิ่มลง Playlist
              </Button>
              <Button variant="secondary" size="sm" className="text-danger" onClick={() => setConfirm({ ids: sel, op: "delete" })}>
                <Trash /> ลบ
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => run(sel, "restore")}>
                <ArchiveRestore /> กู้คืน
              </Button>
              <Button variant="secondary" size="sm" className="text-danger" onClick={() => setConfirm({ ids: sel, op: "purge" })}>
                <Trash /> ลบถาวร
              </Button>
            </>
          )}
        </div>
      )}

      {list.length === 0 ? (
        tab === "trash" ? (
          <EmptyState art="bookmark" title="ถังขยะว่างเปล่า" body="คอนเทนต์ที่ลบจะอยู่ที่นี่ 30 วันก่อนถูกลบถาวร" />
        ) : filtersOn ? (
          <EmptyState art="search" title="ไม่พบคอนเทนต์ที่ตรงกับตัวกรอง" action={<Button variant="outline" onClick={() => { setQ(""); setType("all"); setStatus("all"); setVis("all"); }}>ล้างตัวกรอง</Button>} />
        ) : (
          <EmptyState
            title="ยังไม่มีคอนเทนต์"
            body="เริ่มอัปโหลดคลิปแรกของช่องได้เลย"
            action={
              <Button asChild variant="inverse">
                <Link href="/studio/upload">อัปโหลดวิดีโอ</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-[16px] border border-border md:block">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface text-[12px] font-medium text-text-2">
                  <th className="w-10 py-3 pl-4">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="เลือกทั้งหมด" className="size-4 accent-[var(--text)]" />
                  </th>
                  <th className="px-3 py-3 font-medium">คอนเทนต์</th>
                  <th className="px-3 py-3 font-medium">ประเภท</th>
                  <th className="px-3 py-3 font-medium">การมองเห็น</th>
                  <th className="px-3 py-3 font-medium">{tab === "trash" ? "ลบเมื่อ" : "สถานะ"}</th>
                  <th className="px-3 py-3 font-medium">วันที่</th>
                  <th className="px-3 py-3 text-right font-medium">การดู</th>
                  <th className="px-3 py-3 text-right font-medium">ไลก์</th>
                  <th className="px-3 py-3 pr-4 text-right font-medium">คอมเมนต์</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const dc = dateCell(r);
                  return (
                    <tr key={r.id} className={cn("group border-b border-border last:border-0 hover:bg-hover/60", selected.has(r.id) && "bg-hover/60")}>
                      <td className="py-3 pl-4 align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          aria-label={`เลือก ${r.title}`}
                          className="mt-1 size-4 accent-[var(--text)]"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-3">
                          <StudioThumb src={r.thumbnail_url} type={r.type} duration={r.duration_sec} className="w-[120px]" />
                          <div className="min-w-0 flex-1">
                            {tab === "trash" ? (
                              <p className="line-clamp-2 text-[14px] font-medium leading-5">{r.title}</p>
                            ) : (
                              <Link href={`/studio/content/${r.id}/edit`} className="line-clamp-2 text-[14px] font-medium leading-5 hover:underline">
                                {r.title}
                              </Link>
                            )}
                            <RowActions r={r} trash={tab === "trash"} onStats={() => setStatsFor(r)} onEmail={() => setEmailFor(r)} onCopy={() => copyLink(r)} onRun={run} onPurge={() => setConfirm({ ids: [r.id], op: "purge" })} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-[13px] text-text-2">{TYPE_LABEL[r.type]}</td>
                      <td className="px-3 py-3 align-top">
                        <VisibilityLabel v={r.visibility} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        {tab === "trash" ? <TrashLeft deletedAt={r.deleted_at!} /> : <StatusCell status={r.status} media={r.media_status} scheduledAt={r.scheduled_at} publishWhenReady={r.publish_when_ready} />}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="tnum text-[13px]">{dc.date}</p>
                        <p className="t-caption text-text-2">{dc.label}</p>
                      </td>
                      <td className="tnum px-3 py-3 text-right align-top text-[13px]">{formatNumber(r.view_count)}</td>
                      <td className="tnum px-3 py-3 text-right align-top text-[13px]">{formatNumber(r.like_count)}</td>
                      <td className="tnum px-3 py-3 pr-4 text-right align-top text-[13px]">{formatNumber(r.comment_count)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden">
            <label className="mb-2 flex items-center gap-2 px-1 text-[13px] text-text-2">
              <input type="checkbox" checked={allChecked} onChange={toggleAll} className="size-4 accent-[var(--text)]" /> เลือกทั้งหมด
            </label>
            <ul className="space-y-2">
              {list.map((r) => {
                const dc = dateCell(r);
                return (
                  <li key={r.id} className={cn("rounded-[16px] border border-border bg-surface p-3", selected.has(r.id) && "border-[var(--border-strong)]")}>
                    <div className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`เลือก ${r.title}`}
                        className="mt-1 size-4 shrink-0 accent-[var(--text)]"
                      />
                      <StudioThumb src={r.thumbnail_url} type={r.type} duration={r.duration_sec} className="w-28" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[14px] font-medium leading-5">{r.title}</p>
                        <p className="t-caption mt-1 text-text-2">
                          {TYPE_LABEL[r.type]} · {dc.label} {dc.date}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pl-7">
                      {tab === "trash" ? <TrashLeft deletedAt={r.deleted_at!} /> : <StatusCell status={r.status} media={r.media_status} scheduledAt={r.scheduled_at} publishWhenReady={r.publish_when_ready} />}
                      <VisibilityLabel v={r.visibility} />
                    </div>
                    <p className="t-caption tnum mt-2 pl-7 text-text-2">
                      การดู {formatCount(r.view_count)} · ไลก์ {formatCount(r.like_count)} · คอมเมนต์ {formatCount(r.comment_count)}
                    </p>
                    <div className="pl-5">
                      <RowActions always r={r} trash={tab === "trash"} onStats={() => setStatsFor(r)} onEmail={() => setEmailFor(r)} onCopy={() => copyLink(r)} onRun={run} onPurge={() => setConfirm({ ids: [r.id], op: "purge" })} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

      {playlistFor && <AddToPlaylistDialog contentIds={playlistFor} onClose={() => setPlaylistFor(null)} />}
      {statsFor && <StatsDialog row={statsFor} onClose={() => setStatsFor(null)} />}
      {emailFor && <SendEmailDialog type="content" id={emailFor.id} title={emailFor.title} onClose={() => setEmailFor(null)} />}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.op === "purge" ? `ลบถาวร ${confirm.ids.length} รายการ?` : `ย้าย ${confirm?.ids.length ?? 0} รายการไปถังขยะ?`}
        body={
          confirm?.op === "purge"
            ? "ลบแล้วกู้คืนไม่ได้ ไฟล์และสถิติของคอนเทนต์นี้จะหายไปทั้งหมด"
            : "คอนเทนต์จะหายจากหน้าเว็บทันที และกู้คืนได้จากถังขยะภายใน 30 วัน"
        }
        confirmLabel={confirm?.op === "purge" ? "ลบถาวร" : "ย้ายไปถังขยะ"}
        onConfirm={async () => {
          if (!confirm) return;
          const c = confirm;
          setConfirm(null);
          await run(c.ids, c.op);
        }}
      />
    </div>
  );
}

function TrashLeft({ deletedAt }: { deletedAt: string }) {
  const left = Math.max(0, 30 - Math.floor((Date.now() - new Date(deletedAt).getTime()) / DAY));
  return <span className="tnum text-[13px] text-text-2">ลบถาวรในอีก {left} วัน</span>;
}

function RowActions({
  r,
  trash,
  always,
  onStats,
  onEmail,
  onCopy,
  onRun,
  onPurge,
}: {
  r: StudioContentRow;
  trash: boolean;
  always?: boolean;
  onStats: () => void;
  onEmail: () => void;
  onCopy: () => void;
  onRun: (ids: string[], op: "restore") => void;
  onPurge: () => void;
}) {
  const btn = "inline-flex size-8 items-center justify-center rounded-full text-text-2 hover:bg-hover hover:text-text [&_svg]:size-[17px]";
  const live = r.type !== "short" && r.status === "published" && r.media_status === "ready" && !!r.published_at && new Date(r.published_at).getTime() <= Date.now();
  const emailTitle = live ? "ส่งอีเมลแจ้งเตือน" : "ส่งอีเมลได้เมื่อเผยแพร่แล้วเท่านั้น";
  return (
    <div
      className={cn(
        "mt-1.5 flex items-center gap-0.5 transition-opacity duration-150",
        !always && "opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100",
      )}
    >
      {trash ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => onRun([r.id], "restore")}>
            <ArchiveRestore /> กู้คืน
          </Button>
          <Button variant="ghost" size="sm" className="text-danger" onClick={onPurge}>
            <Trash /> ลบถาวร
          </Button>
        </>
      ) : (
        <>
          <Link href={`/studio/content/${r.id}/edit`} className={btn} aria-label="แก้ไข" title="แก้ไข">
            <Pencil strokeWidth={1.75} />
          </Link>
          <button type="button" onClick={onStats} className={btn} aria-label="สถิติ" title="สถิติ">
            <ChartColumn strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={live ? onEmail : undefined}
            aria-disabled={!live}
            className={cn(btn, !live && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-text-2")}
            aria-label="ส่งอีเมลแจ้งเตือน"
            title={emailTitle}
          >
            <Mail strokeWidth={1.75} />
          </button>
          <button type="button" onClick={onCopy} className={btn} aria-label="คัดลอกลิงก์" title="คัดลอกลิงก์">
            <Link2 strokeWidth={1.75} />
          </button>
          <a href={contentHref(r)} target="_blank" rel="noopener noreferrer" className={btn} aria-label="ดูบนเว็บ" title="ดูบนเว็บ">
            <Eye strokeWidth={1.75} />
          </a>
        </>
      )}
    </div>
  );
}

type Stats = {
  title: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  views28: number;
  watched_hours28: number;
  daily: DailyPoint[];
};

function StatsDialog({ row, onClose }: { row: StudioContentRow; onClose: () => void }) {
  const [data, setData] = React.useState<Stats | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    contentStatsAction(row.id).then((r) => (r.ok ? setData(r.data) : setError(r.error)));
  }, [row.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="pr-8">สถิติ</DialogTitle>
        <p className="t-meta mt-1 line-clamp-2 pr-8">{row.title}</p>
        {error ? (
          <p className="t-meta mt-6">{error}</p>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["การดูทั้งหมด", data?.view_count],
                  ["การดู 28 วัน", data?.views28],
                  ["ไลก์", data?.like_count],
                  ["คอมเมนต์", data?.comment_count],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="rounded-[12px] border border-border bg-surface p-3">
                  <p className="t-caption text-text-2">{label}</p>
                  {v === undefined ? <div className="skeleton mt-2 h-6 w-14 rounded-md" /> : <p className="tnum mt-1 text-[20px] font-semibold">{formatNumber(v)}</p>}
                </div>
              ))}
            </div>
            <div className="mt-6">
              <p className="mb-3 text-[13px] font-medium">
                การดูรายวัน 28 วัน
                {data && <span className="tnum ml-2 font-normal text-text-2">· เวลาดูรวม {formatNumber(data.watched_hours28)} ชั่วโมง</span>}
              </p>
              {data ? <DailyBars data={data.daily} height={120} label="การดูรายวันของคลิปนี้" /> : <div className="skeleton h-[140px] rounded-[12px]" />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
