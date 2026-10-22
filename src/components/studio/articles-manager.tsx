"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ExternalLink, EllipsisVertical, Mail, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { ConfirmDialog } from "./confirm";
import { SendEmailDialog } from "./send-email-button";
import { Card, Dot, VisibilityLabel } from "./ui";
import { deleteArticleAction, pinArticleAction } from "@/app/studio/community-actions";
import { formatNumber, thaiDate } from "@/lib/format";
import type { StudioArticleRow } from "@/lib/server/community";
import { cn } from "@/lib/utils";

type Filter = "all" | "published" | "draft";

const articleLive = (r: StudioArticleRow) => r.status === "published" && !!r.published_at && new Date(r.published_at).getTime() <= Date.now();

export function ArticlesManager({ rows }: { rows: StudioArticleRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [del, setDel] = React.useState<StudioArticleRow | null>(null);
  const [emailFor, setEmailFor] = React.useState<StudioArticleRow | null>(null);
  const shown = rows.filter((r) => filter === "all" || r.status === filter);
  const counts = { all: rows.length, published: rows.filter((r) => r.status === "published").length, draft: rows.filter((r) => r.status === "draft").length };

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist" aria-label="สถานะบทความ">
        {(
          [
            ["all", "ทั้งหมด"],
            ["published", "เผยแพร่แล้ว"],
            ["draft", "ฉบับร่าง"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={cn(
              "relative px-4 py-3 text-[14px] font-medium transition-colors after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[2px] after:rounded-full",
              filter === k ? "text-text after:bg-text" : "text-text-2 after:bg-transparent hover:text-text",
            )}
          >
            {label} <span className="tnum ml-1 text-text-2">{formatNumber(counts[k])}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          art="bookmark"
          title={rows.length ? "ไม่มีบทความในหมวดนี้" : "ยังไม่มีบทความ"}
          body="เขียนเองหรือให้ AI ร่างให้ แล้วตรวจก่อนเผยแพร่"
          action={
            <Button asChild variant="inverse">
              <Link href="/studio/articles/new">
                <Plus /> เขียนบทความ
              </Link>
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-4 py-3.5">
                <Link href={`/studio/articles/${r.id}/edit`} className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-[8px] bg-elevated sm:w-36" tabIndex={-1} aria-hidden>
                  {r.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-text-2">
                      <BookOpen className="size-5" strokeWidth={1.5} />
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/studio/articles/${r.id}/edit`} className="line-clamp-2 text-[15px] font-semibold leading-[21px] hover:underline">
                    {r.title || "(ไม่มีชื่อ)"}
                  </Link>
                  <p className="t-meta tnum mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1.5">
                      <Dot tone={r.status === "published" ? "success" : "muted"} />
                      {r.status === "published" ? `เผยแพร่ ${thaiDate(r.published_at)}` : `ฉบับร่าง · แก้ล่าสุด ${thaiDate(r.updated_at)}`}
                    </span>
                    <VisibilityLabel v={r.visibility} />
                    <span>อ่าน {r.read_min} นาที</span>
                    <span>{formatNumber(r.comment_count)} ความคิดเห็น</span>
                    {r.is_pinned && (
                      <span className="inline-flex items-center gap-1 font-medium text-text">
                        <Pin className="size-3" /> ปักหมุด
                      </span>
                    )}
                  </p>
                </div>
                <Dropdown>
                  <DropdownTrigger asChild>
                    <button className="rounded-full p-2 text-text-2 hover:bg-hover hover:text-text" aria-label={`ตัวเลือก ${r.title}`}>
                      <EllipsisVertical className="size-5" />
                    </button>
                  </DropdownTrigger>
                  <DropdownContent align="end">
                    <DropdownItem asChild>
                      <Link href={`/studio/articles/${r.id}/edit`}>
                        <Pencil /> แก้ไข
                      </Link>
                    </DropdownItem>
                    <DropdownItem asChild>
                      <Link href={`/community/articles/${r.id}`} target="_blank">
                        <ExternalLink /> ดูหน้าบทความ
                      </Link>
                    </DropdownItem>
                    {r.status === "published" && (
                      <DropdownItem
                        onSelect={async () => {
                          const x = await pinArticleAction(r.id, !r.is_pinned);
                          toast(x.ok ? (r.is_pinned ? "เลิกปักหมุดแล้ว" : "ปักหมุดแล้ว") : x.error);
                          if (x.ok) router.refresh();
                        }}
                      >
                        {r.is_pinned ? <PinOff /> : <Pin />} {r.is_pinned ? "เลิกปักหมุด" : "ปักหมุดไว้บนสุด"}
                      </DropdownItem>
                    )}
                    <DropdownItem
                      disabled={!articleLive(r)}
                      title={articleLive(r) ? undefined : "ส่งอีเมลได้เมื่อเผยแพร่แล้วเท่านั้น"}
                      onSelect={() => setEmailFor(r)}
                    >
                      <Mail /> ส่งอีเมลแจ้งเตือน
                    </DropdownItem>
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

      {emailFor && <SendEmailDialog type="article" id={emailFor.id} title={emailFor.title || "(ไม่มีชื่อ)"} onClose={() => setEmailFor(null)} />}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="ลบบทความนี้?"
        body={del ? `“${del.title || "ไม่มีชื่อ"}” จะหายจากเว็บทันที` : undefined}
        confirmLabel="ลบบทความ"
        onConfirm={async () => {
          if (!del) return;
          const x = await deleteArticleAction(del.id);
          setDel(null);
          toast(x.ok ? "ลบบทความแล้ว" : x.error);
          if (x.ok) router.refresh();
        }}
      />
    </div>
  );
}
