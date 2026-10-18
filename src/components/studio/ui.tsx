import * as React from "react";
import { Headphones, Lock } from "lucide-react";
import { formatDuration, formatNumber, TYPE_LABEL, thaiDate, thaiDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentType, MediaStatus, PublishStatus, Visibility } from "@/lib/types";
import type { DailyPoint } from "./types";

/** Studio building blocks — server-safe (no hooks), usable from client components too. */

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="t-h1">{title}</h1>
        {description && <p className="t-meta mt-1.5">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-[16px] border border-border bg-surface", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pb-1 pt-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold leading-6">{title}</h2>
        {description && <p className="t-meta mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: React.ReactNode;
  tone?: "member" | "danger";
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="t-meta">{label}</p>
        {icon && <span className={cn("text-text-2 [&_svg]:size-[18px]", tone === "member" && "text-member", tone === "danger" && "text-danger")}>{icon}</span>}
      </div>
      <p className="tnum mt-3 text-[30px] font-semibold leading-9 tracking-[-0.02em]">
        {typeof value === "number" ? formatNumber(value) : value}
        {unit && <span className="ml-1.5 text-[15px] font-medium text-text-2">{unit}</span>}
      </p>
      {hint && <p className="t-caption mt-1.5 text-text-2">{hint}</p>}
    </Card>
  );
}

/** Thumbnail for Studio lists. Plain <img> so data-URL covers (uploaded in Studio) work too. */
export function StudioThumb({
  src,
  type,
  duration,
  className,
  natural,
}: {
  src: string | null;
  type: ContentType;
  duration?: number;
  className?: string;
  /** true = use the type's own ratio (1:1 podcast); default is a uniform 16:9 frame. */
  natural?: boolean;
}) {
  const ratio = !natural ? "aspect-video" : type === "podcast" ? "aspect-square" : "aspect-video";
  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-[8px] bg-elevated", ratio, className)}>
      <div className="flex size-full items-center justify-center">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : type === "podcast" ? (
          <Headphones className="size-5 text-text-2" strokeWidth={1.75} aria-hidden />
        ) : null}
        {!!duration && (
          <span className="tnum absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px] font-medium leading-4 text-white">
            {formatDuration(duration)}
          </span>
        )}
      </div>
    </div>
  );
}

export function TypeLabel({ type }: { type: ContentType }) {
  return <span className="text-[13px] text-text-2">{TYPE_LABEL[type]}</span>;
}

export function VisibilityLabel({ v }: { v: Visibility }) {
  return v === "members" ? (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-member">
      <Lock className="size-3.5" strokeWidth={2} aria-hidden /> เฉพาะสมาชิก
    </span>
  ) : (
    <span className="text-[13px] text-text-2">สาธารณะ</span>
  );
}

export function Dot({ tone }: { tone: "success" | "danger" | "muted" | "progress" | "member" }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        tone === "success" && "bg-success",
        tone === "danger" && "bg-danger",
        tone === "muted" && "bg-text-2/60",
        tone === "member" && "bg-member",
        tone === "progress" && "animate-pulse bg-text",
      )}
      aria-hidden
    />
  );
}

/** Publish status + media status in one compact cell. */
export function StatusCell({
  status,
  media,
  scheduledAt,
  publishWhenReady,
}: {
  status: PublishStatus;
  media: MediaStatus;
  scheduledAt: string | null;
  publishWhenReady?: boolean;
}) {
  const pub =
    status === "published" ? (
      <span className="inline-flex items-center gap-1.5 text-[13px]">
        <Dot tone="success" /> เผยแพร่แล้ว
      </span>
    ) : status === "scheduled" ? (
      <span className="inline-flex items-center gap-1.5 text-[13px]">
        <Dot tone="muted" /> ตั้งเวลา
        <span className="tnum text-text-2">{thaiDateTime(scheduledAt)}</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-text-2">
        <Dot tone="muted" /> {publishWhenReady ? "รอเผยแพร่เมื่อพร้อม" : "ฉบับร่าง"}
      </span>
    );
  const mediaEl =
    media === "uploading" ? (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-text-2">
        <Dot tone="progress" /> กำลังอัปโหลด
      </span>
    ) : media === "processing" ? (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-text-2">
        <Dot tone="progress" /> กำลังประมวลผล
      </span>
    ) : media === "failed" ? (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-danger">
        <Dot tone="danger" /> ล้มเหลว
      </span>
    ) : null;
  return (
    <div className="flex flex-col gap-0.5">
      {pub}
      {mediaEl}
    </div>
  );
}

export function dateCell(r: { status: PublishStatus; published_at: string | null; scheduled_at: string | null; created_at: string }) {
  if (r.status === "published" && r.published_at) return { label: "เผยแพร่", date: thaiDate(r.published_at) };
  if (r.status === "scheduled" && r.scheduled_at) return { label: "ตั้งเวลา", date: thaiDate(r.scheduled_at) };
  return { label: "อัปโหลด", date: thaiDate(r.created_at) };
}

/**
 * Daily bars — hand-rolled, single accent colour, tabular numbers.
 * Each bar is a list item with an accessible label; a visually hidden table mirrors the data.
 */
export function DailyBars({ data, height = 160, label = "การดูรายวัน" }: { data: DailyPoint[]; height?: number; label?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const nice = niceMax(max);
  const mid = Math.round(data.length / 2) - 1;
  return (
    <figure className="w-full">
      <div className="flex gap-3">
        <div className="tnum flex flex-col justify-between pb-0 text-right text-[11px] leading-none text-text-2" style={{ height }} aria-hidden>
          <span>{formatNumber(nice)}</span>
          <span>{formatNumber(Math.round(nice / 2))}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
            <span className="border-t border-dashed border-border" />
            <span className="border-t border-dashed border-border" />
            <span className="border-t border-border" />
          </div>
          <ul
            role="list"
            aria-label={`${label} ${data.length} วัน รวม ${formatNumber(total)} ครั้ง`}
            className="relative flex items-end gap-[3px] sm:gap-1"
            style={{ height }}
          >
            {data.map((d) => (
              <li
                key={d.key}
                aria-label={`${d.label}: ${formatNumber(d.count)} ครั้ง`}
                className="group relative flex h-full flex-1 items-end"
                tabIndex={0}
              >
                <span
                  className="block w-full rounded-t-[3px] bg-accent opacity-85 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
                  style={{ height: `${Math.max(d.count ? 2 : 0, (d.count / nice) * 100)}%` }}
                  aria-hidden
                />
                <span
                  className="tnum pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-border bg-elevated px-2 py-1 text-[12px] shadow-xl group-hover:block group-focus:block"
                  aria-hidden
                >
                  {d.label} · <b className="font-semibold">{formatNumber(d.count)}</b>
                </span>
              </li>
            ))}
          </ul>
          <div className="t-caption tnum mt-2 flex justify-between text-text-2" aria-hidden>
            <span>{data[0]?.label}</span>
            <span>{data[mid]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

function niceMax(n: number) {
  if (n <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= n)!;
  return step * pow;
}

export const selectClass =
  "h-10 rounded-full border border-border bg-surface pl-4 pr-9 text-[14px] text-text outline-none transition-colors hover:bg-hover focus:border-[var(--border-strong)] appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat";

/** Inline chevron for native <select> (uses currentColor-agnostic grey). */
export const selectStyle: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a1a1a6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};
