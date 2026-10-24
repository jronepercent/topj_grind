import { timeAgo } from "@/lib/format";

/**
 * "5 นาทีที่แล้ว" that is safe inside client components: the server and the browser render it a few
 * seconds apart, so the text may differ by a minute. Without suppressHydrationWarning that mismatch makes
 * React throw away the whole page tree and rebuild it (flash + jump to top).
 */
export function TimeAgo({ iso, className }: { iso: string | null | undefined; className?: string }) {
  if (!iso) return null;
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {timeAgo(iso)}
    </time>
  );
}
