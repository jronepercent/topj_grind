"use client";
import * as React from "react";
import Link from "next/link";
import { Download, ExternalLink, FileText, Lock } from "lucide-react";
import { RichText } from "@/components/content/rich-text";
import { useViewer } from "@/components/providers";
import { useSubscribeHref } from "@/components/content/paywall";
import { MemberBadge } from "@/components/ui/misc";
import { seekTo } from "@/lib/stores/bus";
import { formatBytes, formatDuration, formatNumber, thaiDate } from "@/lib/format";
import { hostOf } from "@/lib/richtext";
import type { Chapter, Content, ContentLink, ContentResource } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Description, Chapters, Links and Resources — shared by Watch and Podcast "Show notes".
 */
export function DescriptionBox({
  c,
  chapters,
  links,
  resources,
  onTime,
  label = "การดู",
}: {
  c: Content;
  chapters: Chapter[];
  links: ContentLink[];
  resources: Omit<ContentResource, "storage_path">[];
  onTime?: (sec: number) => void;
  label?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [overflows, setOverflows] = React.useState(true);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const jump = onTime ?? ((s: number) => seekTo(s));

  React.useEffect(() => {
    const el = bodyRef.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 2);
  }, [c.description]);

  // Description without the raw chapter list lines? Keep it like YouTube: text stays, chapters also rendered as cards.
  return (
    <div
      className={cn("rounded-[16px] bg-surface p-3 text-[14px] leading-[22px] sm:p-4", !expanded && "cursor-pointer hover:bg-hover")}
      onClick={() => !expanded && setExpanded(true)}
    >
      <p className="font-semibold tnum">
        {label} {formatNumber(c.view_count)} ครั้ง · {thaiDate(c.published_at)}
        {c.tags.slice(0, 3).map((t) => (
          <Link key={t} href={`/search?q=${encodeURIComponent("#" + t)}`} className="ml-2 font-medium text-[#3ea6ff] hover:underline" onClick={(e) => e.stopPropagation()}>
            #{t}
          </Link>
        ))}
      </p>

      <div ref={bodyRef} className={cn("mt-1", !expanded && "line-clamp-3")}>
        <RichText text={c.description} onTime={jump} />
      </div>

      {expanded && (
        <div className="mt-5 space-y-6" onClick={(e) => e.stopPropagation()}>
          {chapters.length > 0 && <ChaptersRow chapters={chapters} thumb={c.thumbnail_url} onJump={jump} />}
          {links.length > 0 && <LinksBlock links={links} />}
          {resources.length > 0 && <ResourcesBlock resources={resources} visibility={c.visibility} />}
        </div>
      )}

      {(overflows || chapters.length > 0 || links.length > 0 || resources.length > 0) && (
        <button
          className="mt-2 font-semibold"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((x) => !x);
          }}
        >
          {expanded ? "แสดงน้อยลง" : "…เพิ่มเติม"}
        </button>
      )}
    </div>
  );
}

function ChaptersRow({ chapters, thumb, onJump }: { chapters: Chapter[]; thumb: string | null; onJump: (s: number) => void }) {
  return (
    <div>
      <h3 className="mb-3 font-semibold">Chapters</h3>
      <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {chapters.map((ch, i) => (
          <button
            key={ch.start_sec}
            onClick={() => onJump(ch.start_sec)}
            className="group w-[168px] shrink-0 overflow-hidden rounded-[12px] border border-border bg-bg text-left transition-colors hover:border-[var(--border-strong)]"
          >
            <div className="relative aspect-video overflow-hidden bg-elevated">
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="size-full object-cover opacity-80 transition-transform group-hover:scale-[1.03]" style={{ objectPosition: `${(i / Math.max(1, chapters.length - 1)) * 100}% 50%` }} loading="lazy" />
              )}
            </div>
            <div className="p-2.5">
              <p className="line-clamp-2 text-[13px] font-semibold leading-[18px]">{ch.title}</p>
              <p className="tnum mt-1 text-[12px] font-medium text-[#3ea6ff]">{formatDuration(ch.start_sec)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LinksBlock({ links }: { links: ContentLink[] }) {
  return (
    <div>
      <h3 className="mb-3 font-semibold">ลิงก์</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {links.map((l) => {
          const host = hostOf(l.url);
          return (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center gap-3 rounded-[12px] border border-border bg-bg p-3 transition-colors hover:border-[var(--border-strong)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" className="size-8 rounded-[8px] bg-surface" loading="lazy" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{l.label}</span>
                <span className="block truncate text-[12px] text-text-2">{host}</span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-text-2" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function ResourcesBlock({ resources, visibility }: { resources: Omit<ContentResource, "storage_path">[]; visibility: Content["visibility"] }) {
  const { viewer } = useViewer();
  const href = useSubscribeHref();
  const locked = !viewer?.is_member;
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        ไฟล์ประกอบ <MemberBadge locked={locked} />
      </h3>
      <div className="space-y-2">
        {resources.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-bg p-3">
            <span className="flex size-9 items-center justify-center rounded-[8px] bg-surface">
              <FileText className="size-[18px] text-text-2" />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[14px] font-medium", locked && "blur-[3px] select-none")}>{r.file_name}</span>
              <span className="tnum block text-[12px] text-text-2">{formatBytes(r.size_bytes)}</span>
            </span>
            {locked ? (
              <Link href={href} className="flex items-center gap-1.5 rounded-full bg-member/15 px-3 py-1.5 text-[13px] font-semibold text-member">
                <Lock className="size-3.5" /> สมาชิก
              </Link>
            ) : (
              <a href={`/api/resources/${r.id}`} className="flex items-center gap-1.5 rounded-full bg-hover px-3 py-1.5 text-[13px] font-semibold hover:bg-[var(--border-strong)]" download>
                <Download className="size-4" /> ดาวน์โหลด
              </a>
            )}
          </div>
        ))}
      </div>
      {locked && visibility === "public" && <p className="t-caption mt-2 text-text-2">คลิปนี้ดูฟรี แต่ไฟล์ประกอบสำหรับสมาชิกเท่านั้น</p>}
    </div>
  );
}
