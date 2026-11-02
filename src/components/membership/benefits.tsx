import { ChartColumn, Check, Headphones, MessageCircle, SquarePlay } from "lucide-react";
import { listContent } from "@/lib/server/queries";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Icons for the member benefits, in the order of the default list (Studio → settings can reorder/replace the text). */
export const BENEFIT_ICONS = [SquarePlay, ChartColumn, Headphones, MessageCircle];

/** What the members area holds right now, from the cached catalogue. Zero counts are left out. */
async function memberStats() {
  const items = await listContent({ visibility: "members", limit: 1000 });
  const videos = items.filter((c) => c.type === "video").length;
  const podcasts = items.filter((c) => c.type === "podcast").length;
  const hours = Math.round(items.reduce((sum, c) => sum + (c.duration_sec ?? 0), 0) / 3600);
  return [
    { n: videos, label: "คลิปเฉพาะสมาชิก" },
    { n: hours, label: "ชั่วโมง" },
    { n: podcasts, label: "ตอนพอดแคสต์" },
  ].filter((s) => s.n > 0);
}

/** Live numbers as small pills, e.g. "24 คลิปเฉพาะสมาชิก". Renders nothing when the members area is empty. */
export async function MemberStatChips({ className }: { className?: string }) {
  const stats = await memberStats();
  if (!stats.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {stats.map((s) => (
        <li key={s.label} className="rounded-full border border-border bg-elevated px-3 py-1 text-[13px] text-text-2">
          <span className="tnum font-semibold text-text">{formatNumber(s.n)}</span> {s.label}
        </li>
      ))}
    </ul>
  );
}

/** The benefits as icon rows. `compact` is the slimmer variant used inside the home page pitch band. */
export function BenefitList({ benefits, compact, className }: { benefits: string[]; compact?: boolean; className?: string }) {
  return (
    <ul className={cn("grid gap-3", compact ? "gap-2.5 sm:grid-cols-2 sm:gap-3" : "sm:grid-cols-2", className)}>
      {benefits.map((b, i) => {
        const Icon = BENEFIT_ICONS[i] ?? Check;
        return (
          <li
            key={b}
            className={cn(
              "flex items-start gap-3.5",
              compact ? "sm:rounded-[14px] sm:border sm:border-border sm:bg-elevated sm:p-4" : "rounded-[16px] border border-border bg-surface p-5 sm:gap-4",
            )}
          >
            <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-member/15", compact ? "size-9" : "size-10")}>
              <Icon className="size-5 text-member" strokeWidth={1.75} aria-hidden />
            </span>
            <span className={cn("text-[14px] leading-[22px]", compact ? "pt-1" : "pt-2 text-[15px] font-medium")}>{b}</span>
          </li>
        );
      })}
    </ul>
  );
}
