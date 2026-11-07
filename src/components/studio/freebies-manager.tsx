"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, EllipsisVertical, ExternalLink, Gift, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "./confirm";
import { Card, Dot } from "./ui";
import { deleteFreebieAction, setFreebieFeaturedAction } from "@/app/studio/free/actions";
import { formatNumber } from "@/lib/format";
import { FREEBIE_KIND_LABEL, freebieHref, type FreebieAdminRow } from "@/lib/freebies";

async function copyLink(path: string) {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    toast("คัดลอกลิงก์แล้ว");
  } catch {
    toast("คัดลอกไม่สำเร็จ");
  }
}

export function FreebiesManager({ rows }: { rows: FreebieAdminRow[] }) {
  const router = useRouter();
  const [del, setDel] = React.useState<FreebieAdminRow | null>(null);
  const takes = rows.reduce((n, r) => n + r.claims, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-border bg-surface px-4 py-3">
        <p className="min-w-0 flex-1 text-[14px]">
          ลิงก์รวมของฟรี: <span className="font-semibold">/free</span> <span className="t-meta">ใส่ใน bio และ CTA ท้ายคลิปได้ลิงก์เดียว</span>
        </p>
        <Button size="sm" variant="secondary" onClick={() => copyLink("/free")}>
          <Copy /> คัดลอกลิงก์
        </Button>
        <span className="t-meta tnum">รับไปแล้วรวม {formatNumber(takes)} ครั้ง</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          art="bookmark"
          title="ยังไม่มีของฟรี"
          body="เพิ่มไฟล์ (PDF, เทมเพลต) หรือลิงก์เครื่องมือชิ้นแรก คนที่อยากได้ต้องสมัครบัญชีก่อน คุณจะได้รายชื่อ lead"
          action={
            <Button asChild variant="inverse">
              <Link href="/studio/free/new">
                <Plus /> เพิ่มของฟรี
              </Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
                <Link href={`/studio/free/${r.id}/edit`} className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-[8px] bg-elevated sm:w-16" tabIndex={-1} aria-hidden>
                  {r.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-text-2">
                      <Gift className="size-5" strokeWidth={1.5} />
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/studio/free/${r.id}/edit`} className="line-clamp-2 text-[15px] font-semibold leading-[21px] hover:underline">
                    {r.title}
                  </Link>
                  <p className="t-meta tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>{FREEBIE_KIND_LABEL[r.kind]}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Dot tone={r.status === "published" ? "success" : "muted"} />
                      {r.status === "published" ? "เผยแพร่" : "ฉบับร่าง"}
                    </span>
                    {r.is_featured && (
                      <span className="inline-flex items-center gap-1 font-medium text-text">
                        <Pin className="size-3" /> ปักหมุด
                      </span>
                    )}
                    <span className="sm:hidden">รับ {formatNumber(r.people)} คน</span>
                  </p>
                </div>
                <div className="tnum hidden w-20 shrink-0 text-right sm:block">
                  <p className="text-[15px] font-semibold">{formatNumber(r.people)}</p>
                  <p className="t-meta">คนรับ</p>
                </div>
                <Dropdown>
                  <DropdownTrigger asChild>
                    <button className="rounded-full p-2 text-text-2 hover:bg-hover hover:text-text" aria-label={`ตัวเลือก ${r.title}`}>
                      <EllipsisVertical className="size-5" />
                    </button>
                  </DropdownTrigger>
                  <DropdownContent align="end">
                    <DropdownItem asChild>
                      <Link href={`/studio/free/${r.id}/edit`}>
                        <Pencil /> แก้ไข
                      </Link>
                    </DropdownItem>
                    <DropdownItem asChild>
                      <Link href={freebieHref(r.id)} target="_blank">
                        <ExternalLink /> ดูหน้านี้
                      </Link>
                    </DropdownItem>
                    <DropdownItem onSelect={() => copyLink(freebieHref(r.id))}>
                      <Copy /> คัดลอกลิงก์ชิ้นนี้
                    </DropdownItem>
                    {r.status === "published" && (
                      <DropdownItem
                        onSelect={async () => {
                          const x = await setFreebieFeaturedAction(r.id, !r.is_featured);
                          toast(x.ok ? (r.is_featured ? "เลิกปักหมุดแล้ว" : "ปักหมุดไว้บนสุดแล้ว") : x.error);
                          if (x.ok) router.refresh();
                        }}
                      >
                        {r.is_featured ? <PinOff /> : <Pin />} {r.is_featured ? "เลิกปักหมุด" : "ปักหมุดไว้บนสุด"}
                      </DropdownItem>
                    )}
                    <DropdownSeparator />
                    <DropdownItem className="text-danger [&_svg]:text-danger" onSelect={() => setDel(r)}>
                      <Trash2 /> ลบ
                    </DropdownItem>
                  </DropdownContent>
                </Dropdown>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="ลบของฟรีชิ้นนี้?"
        body={del ? `“${del.title}” จะหายจากหน้า /free ทันที รายชื่อคนที่เคยรับไปยังเก็บไว้` : undefined}
        confirmLabel="ลบ"
        onConfirm={async () => {
          if (!del) return;
          const x = await deleteFreebieAction(del.id);
          setDel(null);
          toast(x.ok ? "ลบแล้ว" : x.error);
          if (x.ok) router.refresh();
        }}
      />
    </div>
  );
}
